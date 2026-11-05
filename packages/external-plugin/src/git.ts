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

export async function syncCheckout(url: string, directory: string): Promise<{ revision: string }> {
  if (!isCloneable(url)) throw Error("Marketplace URL must be an HTTP(S) or SSH git URL");
  const env = {
    ...process.env,
    GIT_TERMINAL_PROMPT: "0",
    GIT_ASKPASS: "true",
    GIT_LFS_SKIP_SMUDGE: "1",
  };
  const options = { timeout: 120_000, env, maxBuffer: 4 << 20 };
  const exists = await run("git", ["-C", directory, "rev-parse", "--is-inside-work-tree"], options)
    .then(() => true)
    .catch(() => false);
  await mkdir(directory, { recursive: true });
  if (!exists) {
    // A failed clone must not leave a half-written tree behind that the next
    // attempt would mistake for a checkout.
    await rm(directory, { recursive: true, force: true });
    await mkdir(directory, { recursive: true });
    await run("git", ["clone", "--depth", "1", "--single-branch", "--", url.trim(), directory], options);
  } else {
    await run("git", ["-C", directory, "fetch", "--depth", "1", "origin", "HEAD"], options);
    await run("git", ["-C", directory, "reset", "--hard", "FETCH_HEAD"], options);
  }
  const { stdout } = await run("git", ["-C", directory, "rev-parse", "--short", "HEAD"], options);
  return { revision: stdout.trim() };
}
