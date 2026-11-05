// Keeping a marketplace checkout up to date.
//
// Only a checkout is ever produced: nothing from a plugin repository is executed
// while it is being read. Git runs without a shell and without a terminal, so a
// URL cannot smuggle arguments and a private repository fails instead of waiting
// for credentials.
import { execFile } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import { promisify } from "node:util";

const run = promisify(execFile);

/** Git over HTTP(S) and SSH only; anything else is not a marketplace to clone. */
export function isCloneable(url: string): boolean {
  return /^(https?:\/\/|ssh:\/\/|git@)[^\s]+$/i.test(url.trim());
}

/**
 * Brings `directory` to `target`, which may be a branch, a tag, or a commit.
 *
 * A commit cannot be given to `clone --branch`, and marketplace entries are
 * pinned to commits as often as to tags, so the checkout is built with `init`
 * and an explicit fetch instead: all three are fetchable by name, and the ones
 * a server refuses fall back to the default branch rather than failing outright.
 */
export async function syncCheckout(
  url: string,
  directory: string,
  target?: string,
): Promise<{ revision: string }> {
  if (!isCloneable(url)) throw Error("Marketplace URL must be an HTTP(S) or SSH git URL");
  const env = {
    ...process.env,
    GIT_TERMINAL_PROMPT: "0",
    GIT_ASKPASS: "true",
    GIT_LFS_SKIP_SMUDGE: "1",
  };
  const options = { timeout: 120_000, env, maxBuffer: 4 << 20 };
  const wanted = target?.trim() || "HEAD";
  const exists = await run("git", ["-C", directory, "rev-parse", "--is-inside-work-tree"], options)
    .then(() => true)
    .catch(() => false);
  await mkdir(directory, { recursive: true });
  try {
    if (!exists) {
      // Whatever a failed attempt left behind must not be mistaken for a checkout.
      await rm(directory, { recursive: true, force: true });
      await mkdir(directory, { recursive: true });
      await run("git", ["-C", directory, "init", "-q"], options);
      await run("git", ["-C", directory, "remote", "add", "origin", url.trim()], options);
    }
    // Strictly what was asked for. Falling back here would hide the fact that a
    // plugin is not the revision the marketplace pinned it to; the caller
    // decides what to try next.
    await run("git", ["-C", directory, "fetch", "--depth", "1", "origin", wanted], options);
    await run("git", ["-C", directory, "reset", "--hard", "FETCH_HEAD"], options);
  } catch (error) {
    await rm(directory, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }
  const { stdout } = await run("git", ["-C", directory, "rev-parse", "--short", "HEAD"], options);
  return { revision: stdout.trim() };
}

