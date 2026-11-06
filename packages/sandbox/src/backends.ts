// The kernel mechanism that confines a command, per platform.
//
// Three backends, strongest first:
//
//   bwrap         Linux mount namespace: the world is mounted read-only and the
//                 writable roots are bound back in, so a writing command fails
//                 with EROFS
//   sandbox-exec  macOS Seatbelt profile: the same deny/allow shape at the
//                 policy layer
//   landlock      Linux LSM: the process removes its own write rights outside
//                 the roots and keeps no way to get them back, which is what
//                 still works on hosts where namespaces are unavailable
//
// An argv builder is a pure function of the layout, so what a backend allows can
// be read (and tested) without starting anything.
import { statSync } from "node:fs";
import path from "node:path";

export type SandboxBackend = "bwrap" | "sandbox-exec" | "landlock";

export interface SandboxBackendInfo {
  backend: SandboxBackend;
  /** Absolute path of the program that starts the confined command. */
  launcher: string;
}

/** What a shell needs to run one command line. */
export interface ShellInvocation {
  file: string;
  args: string[];
}

const isExecutableFile = (candidate: string): boolean => {
  try {
    const info = statSync(candidate);
    return info.isFile() && (info.mode & 0o111) !== 0;
  } catch {
    return false;
  }
};

/**
 * Resolves one executable the way a shell would: an absolute name as given,
 * anything else searched along `PATH`.
 */
export function findExecutable(
  name: string,
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  if (!name) return undefined;
  if (name.includes("/") || name.includes(path.sep))
    return isExecutableFile(name) ? path.resolve(name) : undefined;
  for (const directory of String(env.PATH ?? "").split(path.delimiter)) {
    if (!directory) continue;
    const candidate = path.join(directory, name);
    if (isExecutableFile(candidate)) return candidate;
  }
  return undefined;
}

/**
 * The shell a confined command runs in, matching what the unconfined path uses
 * so a command does not behave differently depending on the mode.
 */
export function shellFor(
  command: string,
  platformName: string = process.platform,
  env: NodeJS.ProcessEnv = process.env,
): ShellInvocation {
  if (platformName === "win32")
    return {
      file: String(env.ComSpec || "cmd.exe"),
      args: ["/d", "/s", "/c", command],
    };
  return {
    file: String(env.SHELL || "/bin/sh"),
    args: ["-c", command],
  };
}

/** The launchers this platform could use, without asking whether they work. */
export function staticLaunchers(
  platformName: string = process.platform,
  env: NodeJS.ProcessEnv = process.env,
): SandboxBackendInfo[] {
  const found: SandboxBackendInfo[] = [];
  if (platformName === "linux") {
    const bwrap = findExecutable("bwrap", env);
    if (bwrap) found.push({ backend: "bwrap", launcher: bwrap });
  }
  if (platformName === "darwin") {
    const seatbelt = findExecutable("sandbox-exec", env);
    if (seatbelt) found.push({ backend: "sandbox-exec", launcher: seatbelt });
  }
  return found;
}

/**
 * bubblewrap's arguments: the whole filesystem read-only, then the scratch area
 * and every writable root bound back on top of it. Order is load-bearing — the
 * later mounts win, so the writable ones must come after `--ro-bind / /`.
 */
export function bwrapArgv(
  layout: { writableRoots: string[]; tempDirectory: string; cwd: string },
  shell: ShellInvocation,
): string[] {
  const temp = layout.tempDirectory;
  return [
    "--ro-bind",
    "/",
    "/",
    "--dev-bind",
    "/dev",
    "/dev",
    "--proc",
    "/proc",
    "--tmpfs",
    temp,
    ...layout.writableRoots
      .filter((root) => root !== temp)
      .flatMap((root) => ["--bind", root, root]),
    "--unshare-pid",
    "--die-with-parent",
    "--chdir",
    layout.cwd,
    "--setenv",
    "TMPDIR",
    temp,
    "--",
    shell.file,
    ...shell.args,
  ];
}

/** Landlock takes the writable roots, then the command after `--`. */
export function landlockArgv(
  layout: { writableRoots: string[] },
  shell: ShellInvocation,
): string[] {
  return [...layout.writableRoots, "--", shell.file, ...shell.args];
}

/** The Seatbelt profile that denies writes outside the same roots. */
export function seatbeltProfile(writableRoots: string[]): string {
  const allowed = writableRoots
    .map((root) => path.resolve(root).replace(/\\/g, "\\\\").replace(/"/g, '\\"'))
    .flatMap((root) => [`(subpath "${root}")`, `(literal "${root}")`])
    .join(" ");
  return [
    "(version 1)",
    "(allow default)",
    "(deny file-write*)",
    `(allow file-write* ${allowed} (subpath "/dev") (literal "/dev/null")(literal "/dev/stdout")(literal "/dev/stderr")(literal "/dev/dtracehelper"))`,
    "(allow process-exec* file-read*)",
  ].join("\n");
}

/** `sandbox-exec` arguments for one run. */
export function seatbeltArgv(
  layout: { writableRoots: string[] },
  shell: ShellInvocation,
): string[] {
  return ["-p", seatbeltProfile(layout.writableRoots), shell.file, ...shell.args];
}

/** The arguments that start one confined run with `info`. */
export function confinedArgv(
  info: SandboxBackendInfo,
  layout: { writableRoots: string[]; tempDirectory: string; cwd: string },
  shell: ShellInvocation,
): string[] {
  if (info.backend === "bwrap") return bwrapArgv(layout, shell);
  if (info.backend === "landlock") return landlockArgv(layout, shell);
  return seatbeltArgv(layout, shell);
}
