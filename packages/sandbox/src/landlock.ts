// The built-in Landlock launcher: source in, executable out.
//
// Landlock has to be applied by the process that is about to be confined, so it
// cannot be called from Node — there is no syscall access here. The launcher is
// a small C program shipped with this package and built on first use with the
// host's own compiler, then cached by the hash of its source. A host that
// provides a prebuilt launcher can skip the build entirely by pointing
// `VELOCE_SANDBOX_LANDLOCK` at it.
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { findExecutable, type SandboxBackendInfo } from "./backends.js";

const run = promisify(execFile);
const COMPILE_TIMEOUT_MS = 60_000;

/**
 * The launcher source. It sits at the package root, one level above both
 * `src/landlock.ts` and the compiled `dist/landlock.js`, so the same relative
 * lookup works whether the plugin was loaded from source or from a build.
 */
export function landlockSourcePath(): string {
  return fileURLToPath(new URL("../landlock-exec.c", import.meta.url));
}

const isExecutable = (candidate: string): boolean => {
  try {
    const info = statSync(candidate);
    return info.isFile() && (info.mode & 0o111) !== 0;
  } catch {
    return false;
  }
};

export interface LandlockBuild {
  info?: SandboxBackendInfo;
  /** Why the launcher could not be built, for the refusal message. */
  reason?: string;
}

/**
 * Resolves a usable Landlock launcher, building it when this host has never run
 * one. The failure reason is returned rather than thrown: a host without a
 * compiler still has to be told, in the end, why nothing could confine the
 * command.
 */
export async function landlockLauncher(
  options: {
    env?: NodeJS.ProcessEnv;
    cacheRoot?: string;
    platformName?: string;
  } = {},
): Promise<LandlockBuild> {
  const env = options.env ?? process.env;
  const platformName = options.platformName ?? process.platform;
  if (platformName !== "linux")
    return { reason: `Landlock is a Linux feature, not available on ${platformName}` };

  const override = String(env.VELOCE_SANDBOX_LANDLOCK ?? "").trim();
  if (override) {
    if (isExecutable(override))
      return { info: { backend: "landlock", launcher: path.resolve(override) } };
    return { reason: `VELOCE_SANDBOX_LANDLOCK does not point at an executable: ${override}` };
  }

  const source = landlockSourcePath();
  let sourceText: string;
  try {
    sourceText = readFileSync(source, "utf8");
  } catch {
    return { reason: `the Landlock launcher source is missing: ${source}` };
  }
  const digest = createHash("sha256").update(sourceText).digest("hex").slice(0, 16);
  const cacheRoot = options.cacheRoot ?? tmpdir();
  const directory = path.join(cacheRoot, `veloce-sandbox-${digest}`);
  const binary = path.join(directory, "landlock-exec");
  if (isExecutable(binary)) return { info: { backend: "landlock", launcher: binary } };

  const compiler = ["cc", "gcc", "clang"]
    .map((name) => findExecutable(name, env))
    .find((found): found is string => Boolean(found));
  if (!compiler)
    return {
      reason: `no C compiler (cc, gcc or clang) to build the Landlock launcher, and VELOCE_SANDBOX_LANDLOCK names no prebuilt one`,
    };

  try {
    mkdirSync(directory, { recursive: true });
  } catch (error) {
    return { reason: `cannot create the launcher cache ${directory}: ${describe(error)}` };
  }
  try {
    await run(compiler, ["-O2", "-std=gnu11", "-o", binary, source], {
      timeout: COMPILE_TIMEOUT_MS,
      windowsHide: true,
      maxBuffer: 1024 * 1024,
    });
  } catch (error) {
    return { reason: `the Landlock launcher failed to build with ${compiler}: ${describe(error)}` };
  }
  if (!isExecutable(binary))
    return { reason: `the Landlock launcher was not produced at ${binary}` };
  try {
    chmodSync(binary, 0o755);
  } catch {
    /* An executable mode the compiler already set is enough. */
  }
  return { info: { backend: "landlock", launcher: binary } };
}

function describe(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const stderr = (error as { stderr?: string }).stderr;
  const detail = String(stderr ?? "").trim().split("\n").slice(0, 3).join(" ");
  return detail ? `${error.message} — ${detail}` : error.message;
}
