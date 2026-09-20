import { createHash } from "node:crypto";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";

const PROTOCOL_VERSION = "2025-06-18";
const TIMEOUT_MS = 300_000;

type Server = { id?: string; name?: string; command?: string; args?: unknown; env?: unknown; cwd?: string };
type Pending = { resolve: (value: unknown) => void; reject: (reason: Error) => void; timer: NodeJS.Timeout };
type ProcessRecord = { key: string; server: Required<Pick<Server, "name" | "command">> & Server; child: ChildProcessWithoutNullStreams; startedAt: string; initialized: boolean; nextID: number; pending: Map<number, Pending> };

function object(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function strings(value: unknown): string[] { return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []; }
function serverFrom(input: Record<string, unknown>): Required<Pick<Server, "name" | "command">> & Server {
  const source = object(input.server ?? input);
  const command = String(source.command ?? "").trim();
  if (!command) throw Error("MCP command is required");
  return { ...source, command, name: String(source.name ?? source.id ?? command).trim() || command, args: strings(source.args), env: object(source.env), cwd: String(source.cwd ?? input.workspace_path ?? "").trim() || undefined };
}
function keyFor(server: Server): string { return createHash("sha1").update(JSON.stringify({ command: server.command, args: strings(server.args), env: object(server.env), cwd: server.cwd ?? "" })).digest("hex"); }

export class LocalMCPManager {
  private processes = new Map<string, ProcessRecord>();

  async listTools(input: Record<string, unknown>) { const process = await this.get(serverFrom(input)); await this.initialize(process); return this.call(process, "tools/list", {}); }
  async callTool(input: Record<string, unknown>) { const name = String(input.name ?? "").trim(); if (!name) throw Error("MCP tool name is required"); const process = await this.get(serverFrom(input)); await this.initialize(process); return this.call(process, "tools/call", { name, arguments: object(input.arguments) }); }
  listProcesses() { this.clean(); return { processes: [...this.processes.values()].map((process) => ({ key: process.key, id: process.server.id ?? "", name: process.server.name, command: process.server.command, args: strings(process.server.args), cwd: process.server.cwd ?? "", pid: process.child.pid ?? 0, initialized: process.initialized, pending_requests: process.pending.size, started_at: process.startedAt })) }; }
  stop(key: string) { const process = this.processes.get(String(key ?? "").trim()); if (!process) throw Error("MCP process not found"); this.close(process); return { ok: true, key: process.key }; }
  dispose() { for (const process of this.processes.values()) this.close(process); }

  private async get(server: Required<Pick<Server, "name" | "command">> & Server) {
    const key = keyFor(server); const existing = this.processes.get(key); if (existing && !existing.child.killed && existing.child.exitCode === null) return existing;
    if (existing) this.close(existing);
    const child = spawn(server.command, strings(server.args), { cwd: server.cwd || undefined, env: { ...globalThis.process.env, ...Object.fromEntries(Object.entries(object(server.env)).map(([name, value]) => [name, String(value)])) }, stdio: "pipe", windowsHide: true });
    const process: ProcessRecord = { key, server, child, startedAt: new Date().toISOString(), initialized: false, nextID: 0, pending: new Map() };
    this.processes.set(key, process);
    createInterface({ input: child.stdout }).on("line", (line) => this.receive(process, line));
    child.stderr.on("data", () => undefined);
    child.once("exit", () => this.close(process));
    return process;
  }
  private receive(process: ProcessRecord, line: string) { try { const message = JSON.parse(line) as { id?: number; result?: unknown; error?: { message?: string } }; const id = Number(message.id); const pending = process.pending.get(id); if (!pending) return; clearTimeout(pending.timer); process.pending.delete(id); if (message.error) pending.reject(Error(message.error.message || "MCP request failed")); else pending.resolve(message.result); } catch { /* MCP notifications and malformed stdout are ignored */ } }
  private async initialize(process: ProcessRecord) { if (process.initialized) return; await this.call(process, "initialize", { protocolVersion: PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: "veloce-local-connector", version: "1" } }); this.notify(process, "notifications/initialized"); process.initialized = true; }
  private call(process: ProcessRecord, method: string, params: unknown): Promise<unknown> { if (process.child.killed || process.child.exitCode !== null) return Promise.reject(Error("MCP process exited")); const id = ++process.nextID; return new Promise((resolve, reject) => { const timer = setTimeout(() => { process.pending.delete(id); reject(Error(`MCP request timed out: ${method}`)); }, TIMEOUT_MS); process.pending.set(id, { resolve, reject, timer }); this.write(process, { jsonrpc: "2.0", id, method, params }).catch((error) => { clearTimeout(timer); process.pending.delete(id); reject(error); }); }); }
  private notify(process: ProcessRecord, method: string) { void this.write(process, { jsonrpc: "2.0", method }); }
  private async write(process: ProcessRecord, message: unknown) { await new Promise<void>((resolve, reject) => process.child.stdin.write(`${JSON.stringify(message)}\n`, (error) => error ? reject(error) : resolve())); }
  private close(process: ProcessRecord) { if (this.processes.get(process.key) === process) this.processes.delete(process.key); for (const pending of process.pending.values()) { clearTimeout(pending.timer); pending.reject(Error("MCP process exited")); } process.pending.clear(); if (!process.child.killed) process.child.kill(); }
  private clean() { for (const process of this.processes.values()) if (process.child.killed || process.child.exitCode !== null) this.close(process); }
}
