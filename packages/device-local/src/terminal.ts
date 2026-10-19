import { randomUUID } from "node:crypto";
import { stat } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { spawn, type IPty } from "node-pty";

const MAX_BUFFER = 512 * 1024;
const IDLE_MS = 15 * 60_000;
const ACTIONS = new Set(["terminal_open", "terminal_input", "terminal_read", "terminal_resize", "terminal_close"]);

interface TerminalSession {
  owner: string;
  pty: IPty;
  buffer: Buffer;
  offset: number;
  alive: boolean;
  exitCode?: number;
  touched: number;
  wake: Set<() => void>;
}

/** Persistent PTYs owned by a user and device, independent of command tasks. */
export class LocalTerminalManager {
  private sessions = new Map<string, TerminalSession>();
  private pending = new Map<string, number>();
  private disposed = false;
  private timer = setInterval(() => {
    for (const [id, session] of this.sessions) {
      if (Date.now() - session.touched > IDLE_MS) this.close(id, session);
    }
  }, 60_000).unref();

  supports(action: string) { return ACTIONS.has(action); }

  async execute(owner: string, action: string, input: Record<string, unknown>) {
    if (this.disposed) throw Error("Terminal manager is closed");
    if (!this.supports(action)) throw Error("Unsupported connector action");
    if (action === "terminal_open") return this.open(owner, input);
    const id = String(input.terminal_id ?? "");
    const session = this.sessions.get(id);
    if (!session || session.owner !== owner) throw Error("Terminal is not open");
    session.touched = Date.now();
    if (action === "terminal_close") {
      this.close(id, session);
      return { ok: true, terminal_id: id };
    }
    if (action === "terminal_resize") {
      const cols = dimension(input.cols, 120, 500);
      const rows = dimension(input.rows, 30, 200);
      session.pty.resize(cols, rows);
      return { ok: true, terminal_id: id, cols, rows };
    }
    if (action === "terminal_input") {
      if (!session.alive) throw Error("Terminal has exited");
      const data = String(input.data ?? "");
      if (!/^[A-Za-z0-9+/=_-]*$/.test(data)) throw Error("Invalid terminal input");
      const bytes = Buffer.from(data, "base64");
      if (bytes.length > 8192) throw Error("Terminal input is too large");
      session.pty.write(bytes.toString("utf8"));
      return { ok: true, terminal_id: id };
    }
    const offset = Number(input.offset ?? 0);
    if (!Number.isSafeInteger(offset) || offset < 0) throw Error("Invalid terminal offset");
    if (session.alive && offset >= session.offset) {
      await new Promise<void>((resolve) => {
        const done = () => { clearTimeout(timer); session.wake.delete(done); resolve(); };
        const timer = setTimeout(done, 900);
        session.wake.add(done);
      });
    }
    const start = session.offset - session.buffer.length;
    const data = session.buffer.subarray(Math.max(0, Math.min(offset - start, session.buffer.length)));
    const result = { terminal_id: id, data: data.toString("base64"), offset: session.offset, truncated: offset < start, alive: session.alive, exit_code: session.exitCode };
    if (!session.alive) this.close(id, session);
    return result;
  }

  private async open(owner: string, input: Record<string, unknown>) {
    const count = [...this.sessions.values()].filter((s) => s.owner === owner).length;
    if (count + (this.pending.get(owner) ?? 0) >= 8) throw Error("Too many open terminals (limit 8)");
    this.pending.set(owner, (this.pending.get(owner) ?? 0) + 1);
    try {
      const cwd = path.resolve(String(input.workspace_path || input.connector_workspace_path || homedir()));
      if (!(await stat(cwd)).isDirectory()) throw Error("Terminal workspace is not a directory");
      if (this.disposed) throw Error("Terminal manager is closed");
      const shell = selectShell(String(input.shell ?? ""));
      const cols = dimension(input.cols, 120, 500);
      const rows = dimension(input.rows, 30, 200);
      const pty = spawn(shell.file, shell.args, { name: "xterm-256color", cols, rows, cwd, env: { ...process.env, TERM: "xterm-256color" } });
      const id = randomUUID();
      const session: TerminalSession = { owner, pty, buffer: Buffer.alloc(0), offset: 0, alive: true, touched: Date.now(), wake: new Set() };
      this.sessions.set(id, session);
      pty.onData((data) => {
        const bytes = Buffer.from(data, "utf8");
        session.offset += bytes.length;
        session.buffer = Buffer.concat([session.buffer, bytes]).subarray(-MAX_BUFFER);
        for (const wake of session.wake) wake();
      });
      pty.onExit(({ exitCode }) => {
        session.alive = false;
        session.exitCode = exitCode;
        for (const wake of session.wake) wake();
      });
      return { terminal_id: id, shell: shell.file, cwd, os: process.platform, cols, rows, offset: 0 };
    } finally {
      this.pending.set(owner, Math.max(0, (this.pending.get(owner) ?? 1) - 1));
    }
  }

  private close(id: string, session: TerminalSession) {
    this.sessions.delete(id);
    session.alive = false;
    try { session.pty.kill(); } catch { /* Already exited. */ }
    for (const wake of session.wake) wake();
  }

  dispose() {
    this.disposed = true;
    clearInterval(this.timer);
    for (const [id, session] of this.sessions) this.close(id, session);
  }
}

function dimension(value: unknown, fallback: number, max: number) {
  const number = Number(value ?? fallback);
  if (!Number.isInteger(number) || number < 1 || number > max) throw Error("Terminal dimensions are out of range");
  return number;
}

function selectShell(requested: string) {
  const name = requested.trim().toLowerCase();
  if (process.platform === "win32") {
    if (!name || name === "powershell") return { file: "powershell.exe", args: ["-NoLogo"] };
    if (name === "cmd") return { file: process.env.COMSPEC || "cmd.exe", args: [] };
    if (name === "pwsh") return { file: "pwsh.exe", args: ["-NoLogo"] };
  } else {
    if (!name) return { file: process.env.SHELL || "/bin/sh", args: ["-i"] };
    if (["bash", "zsh", "sh"].includes(name)) return { file: name, args: ["-i"] };
  }
  throw Error("Unsupported terminal shell");
}
