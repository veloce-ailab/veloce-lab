// Runs a command under the strongest kernel sandbox this host can provide.
//
// The service answers one question for every confined action: which backend is
// usable right now, and if the strongest one turns out to be broken, what is
// next. Detection and probing happen once per process, because a host that
// cannot create a mount namespace will not start being able to in a minute, and
// a command must never wait for a probe it has already paid for.
//
// Falling back is deliberate: bubblewrap is preferred when it works, but a
// container that ships bwrap without user namespaces used to mean "no sandbox at
// all" — now it means Landlock takes over, and only when neither works is the
// command refused.
import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import {
  confinedArgv,
  shellFor,
  staticLaunchers,
  type SandboxBackend,
  type SandboxBackendInfo,
  type ShellInvocation,
} from "./backends.js";
import { landlockLauncher } from "./landlock.js";
import { defaultWritableRoots, sandboxLayout, type SandboxLayout } from "./layout.js";
import { withSandboxHint } from "./refusal.js";

const run = promisify(execFile);
const PROBE_TIMEOUT_MS = 10_000;

export interface SandboxRunRequest {
  /** The session workspace, the only root that is not optional. */
  workspace: string;
  /** Starting directory, resolved inside the workspace. */
  cwd?: string;
  command: string;
  timeoutMs?: number;
  maxBufferBytes?: number;
  /** Extra writable directories for this run, on top of the service's own. */
  writableRoots?: string[];
}

export interface SandboxRunOutcome {
  /** Which backend confined the command; absent when it ran unconfined. */
  backend?: SandboxBackend;
  command: string;
  cwd: string;
  exit_code: number;
  output: string;
  timed_out: boolean;
}

export interface SandboxService {
  /** The backends this host can use right now, strongest first. */
  backends(): Promise<SandboxBackend[]>;
  /** Runs the command confined, or refuses when nothing can confine it. */
  run(request: SandboxRunRequest): Promise<SandboxRunOutcome>;
  /** Directories a confined command may write besides its workspace. */
  writableRoots(): string[];
  /** Whether an unconfined run is allowed when no backend exists at all. */
  allowsUnsandboxed(): boolean;
}

export interface SandboxOptions {
  /** Extra writable directories from configuration. */
  writableRoots?: string[];
  /** Run unconfined on hosts with no kernel backend (deployment decision). */
  allowUnsandboxed?: boolean;
  env?: NodeJS.ProcessEnv;
  platformName?: string;
  /** Where the built-in Landlock launcher is cached. */
  cacheRoot?: string;
  timeoutMs?: number;
  maxBufferBytes?: number;
}

interface Executed {
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  /** Set when the process could not be started at all. */
  spawnError?: string;
}

async function execute(
  file: string,
  args: string[],
  cwd: string,
  timeoutMs: number,
  maxBufferBytes: number,
): Promise<Executed> {
  try {
    const { stdout, stderr } = await run(file, args, {
      cwd,
      timeout: timeoutMs,
      windowsHide: true,
      maxBuffer: maxBufferBytes,
    });
    return { exitCode: 0, stdout, stderr, timedOut: false };
  } catch (error) {
    const failure = error as {
      stdout?: string;
      stderr?: string;
      code?: number | string;
      killed?: boolean;
    };
    return {
      exitCode: typeof failure.code === "number" ? failure.code : 1,
      stdout: String(failure.stdout ?? ""),
      stderr: String(failure.stderr ?? ""),
      timedOut: failure.killed === true,
      spawnError: typeof failure.code === "string" ? failure.code : undefined,
    };
  }
}

const firstLine = (value: string) => String(value ?? "").trim().split("\n")[0]?.trim() ?? "";

/**
 * Whether the launcher itself failed, which is the one case worth handing to the
 * next backend. A command that merely exits non-zero is a result, not a reason
 * to re-run it under something weaker.
 */
export function launcherFailure(
  info: SandboxBackendInfo,
  executed: Executed,
): string | undefined {
  if (executed.spawnError)
    return `${info.backend}: could not start ${info.launcher} (${executed.spawnError})`;
  if (info.backend === "bwrap" && executed.exitCode !== 0 && executed.stderr.startsWith("bwrap: "))
    return `bwrap: ${firstLine(executed.stderr)}`;
  if (info.backend === "landlock" && (executed.exitCode === 125 || executed.stderr.startsWith("landlock-exec: ")))
    return `landlock: ${firstLine(executed.stderr) || `exited ${executed.exitCode}`}`;
  if (info.backend === "sandbox-exec" && executed.stderr.startsWith("sandbox-exec: "))
    return `sandbox-exec: ${firstLine(executed.stderr)}`;
  return undefined;
}

export class Sandbox implements SandboxService {
  private readonly env: NodeJS.ProcessEnv;
  private readonly platformName: string;
  private readonly cacheRoot?: string;
  private readonly extraRoots: string[];
  private readonly unsandboxed: boolean;
  private readonly timeoutMs: number;
  private readonly maxBufferBytes: number;
  private resolution?: Promise<{ usable: SandboxBackendInfo[]; reasons: string[] }>;

  constructor(options: SandboxOptions = {}) {
    this.env = options.env ?? process.env;
    this.platformName = options.platformName ?? process.platform;
    this.cacheRoot = options.cacheRoot;
    this.extraRoots = options.writableRoots ?? [];
    this.unsandboxed = options.allowUnsandboxed === true;
    this.timeoutMs = options.timeoutMs ?? 120_000;
    this.maxBufferBytes = options.maxBufferBytes ?? 800_000;
  }

  writableRoots(): string[] {
    return [...defaultWritableRoots(this.platformName, this.env), ...this.extraRoots];
  }

  allowsUnsandboxed(): boolean {
    return this.unsandboxed;
  }

  async backends(): Promise<SandboxBackend[]> {
    const { usable } = await this.resolve();
    return usable.map((info) => info.backend);
  }

  async run(request: SandboxRunRequest): Promise<SandboxRunOutcome> {
    const command = String(request.command ?? "").trim();
    if (!command) throw Error("command is required");
    // The layout is validated before anything starts: a session without a
    // workspace has no boundary to hold, and must not fall back to the server's
    // own directory as if it had one.
    const layout = sandboxLayout({
      workspace: request.workspace,
      cwd: request.cwd,
      writableRoots: request.writableRoots ?? this.writableRoots(),
      tempDirectory: tmpdir(),
    });
    const shell = shellFor(command, this.platformName, this.env);
    const timeoutMs = request.timeoutMs ?? this.timeoutMs;
    const maxBufferBytes = request.maxBufferBytes ?? this.maxBufferBytes;
    const { usable, reasons } = await this.resolve();
    const failures = [...reasons];
    for (const info of usable) {
      const executed = await execute(
        info.launcher,
        confinedArgv(info, layout, shell),
        layout.cwd,
        timeoutMs,
        maxBufferBytes,
      );
      const failed = launcherFailure(info, executed);
      if (failed) {
        failures.push(failed);
        continue;
      }
      return this.outcome(info.backend, executed, command, layout.cwd);
    }
    if (this.unsandboxed)
      return this.outcome(
        undefined,
        await this.executeUnconfined(shell, layout, timeoutMs, maxBufferBytes),
        command,
        layout.cwd,
      );
    throw Error(
      `Permission denied: no kernel sandbox could confine this command on this host. ${
        failures.length > 0 ? failures.join("; ") : "no backend is available"
      }. Install bubblewrap, or a C compiler so the built-in Landlock launcher can be built, or allow unsandboxed commands in the sandbox settings.`,
    );
  }

  private outcome(
    backend: SandboxBackend | undefined,
    executed: Executed,
    command: string,
    cwd: string,
  ): SandboxRunOutcome {
    const output = [executed.stdout, executed.stderr].filter(Boolean).join("").trim();
    const bounded = output.slice(0, this.maxBufferBytes);
    return {
      ...(backend ? { backend } : {}),
      command,
      cwd,
      exit_code: executed.timedOut ? 124 : executed.exitCode,
      output:
        executed.timedOut && !bounded
          ? `Command timed out after ${this.timeoutMs / 1000} seconds`
          : withSandboxHint(bounded, executed.exitCode, backend),
      timed_out: executed.timedOut,
    };
  }

  private executeUnconfined(
    shell: ShellInvocation,
    layout: SandboxLayout,
    timeoutMs: number,
    maxBufferBytes: number,
  ): Promise<Executed> {
    return execute(shell.file, shell.args, layout.cwd, timeoutMs, maxBufferBytes);
  }

  private resolve(): Promise<{ usable: SandboxBackendInfo[]; reasons: string[] }> {
    this.resolution ??= this.probeAll();
    return this.resolution;
  }

  /**
   * Asks each candidate to run `/bin/true` in a throwaway workspace. A backend
   * that cannot do that here — no user namespaces, no Landlock ABI, a launcher
   * that will not start — is reported and skipped instead of failing the first
   * command the user tries.
   */
  private async probeAll(): Promise<{ usable: SandboxBackendInfo[]; reasons: string[] }> {
    const reasons: string[] = [];
    const candidates = staticLaunchers(this.platformName, this.env);
    const built = await landlockLauncher({
      env: this.env,
      cacheRoot: this.cacheRoot,
      platformName: this.platformName,
    });
    if (built.info) candidates.push(built.info);
    else if (built.reason) reasons.push(`landlock: ${built.reason}`);
    const usable: SandboxBackendInfo[] = [];
    if (candidates.length === 0) return { usable, reasons };
    const probe = await mkdtemp(path.join(this.cacheRoot ?? tmpdir(), "veloce-sandbox-probe-"));
    try {
      const layout = sandboxLayout({ workspace: probe, writableRoots: this.writableRoots() });
      const shell: ShellInvocation = { file: "/bin/true", args: [] };
      for (const info of candidates) {
        const executed = await execute(
          info.launcher,
          confinedArgv(info, layout, shell),
          layout.cwd,
          PROBE_TIMEOUT_MS,
          64 * 1024,
        );
        const failed = launcherFailure(info, executed) ?? (executed.timedOut ? `${info.backend}: probe timed out` : undefined);
        if (failed) reasons.push(failed);
        else if (executed.exitCode !== 0) reasons.push(`${info.backend}: probe exited ${executed.exitCode}`);
        else usable.push(info);
      }
    } finally {
      await rm(probe, { recursive: true, force: true }).catch(() => undefined);
    }
    return { usable, reasons };
  }
}
