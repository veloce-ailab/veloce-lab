// Where a confined command may write, and what counts as a workspace.
//
// Both backends take the same list: the workspace itself, plus the handful of
// places a build genuinely needs (scratch space, the toolchain caches, the
// device nodes a shell writes to without thinking about it). Everything else is
// removed from the command's reach — that is the whole point of the mode — so
// the list is deliberately short and every entry has a reason.
import { realpathSync, statSync } from "node:fs";
import { homedir, platform, tmpdir } from "node:os";
import path from "node:path";

export interface SandboxLayout {
  /** The session workspace: the one root that is not negotiable. */
  workspace: string;
  /** Where the command starts, always inside the workspace. */
  cwd: string;
  /** Every directory that stays writable, workspace first. */
  writableRoots: string[];
  /** A private scratch directory, writable and thrown away with the command. */
  tempDirectory: string;
}

/**
 * Root directories a confined command keeps besides its workspace.
 *
 * The scratch space is not negotiable: builds write temporary files and would
 * fail otherwise, and it is private to the command. The user cache directory is
 * included because toolchain caches live there (Go's build cache, Corepack,
 * Cargo's registry) and it holds no credentials. `/dev` is here for the same
 * reason the bubblewrap backend binds it writable: `command >/dev/null` must not
 * be a sandbox violation.
 */
export function defaultWritableRoots(
  platformName: string = platform(),
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  const roots = [tmpdir()];
  const home = String(env.HOME ?? env.USERPROFILE ?? "").trim() || homedir();
  if (home) roots.push(path.join(home, ".cache"));
  if (platformName !== "win32") roots.push("/dev");
  return roots;
}

/**
 * Resolves and vets the workspace a command is confined to.
 *
 * A workspace that is the filesystem root (or a link to it) is not a boundary
 * at all, and a session without one has nothing to be confined to, so both are
 * refused rather than quietly widened.
 */
export function assertWorkspaceRoot(workspace: string): string {
  const requested = String(workspace ?? "").trim();
  if (!requested)
    throw Error(
      "Sandboxed commands need a workspace folder; none is set for this session",
    );
  const resolved = path.resolve(requested);
  if (!statSync(resolved, { throwIfNoEntry: false })?.isDirectory())
    throw Error(`Folder not found: ${resolved}`);
  const root = path.parse(resolved).root;
  if (resolved === root)
    throw Error(
      `Sandboxed commands need a workspace below the filesystem root, not "${resolved}"`,
    );
  // A workspace that links to the root would hand the machine back while
  // looking confined, so the check follows the link.
  const followed = realpathSync(resolved);
  if (followed === path.parse(followed).root)
    throw Error(
      `Sandboxed commands need a workspace below the filesystem root, not "${resolved}" (which resolves to "${followed}")`,
    );
  return resolved;
}

/** Absolute, existing, de-duplicated directories, in the order given. */
export function distinctExistingRoots(roots: string[]): string[] {
  const seen = new Set<string>();
  const kept: string[] = [];
  for (const candidate of roots) {
    const requested = String(candidate ?? "").trim();
    if (!requested) continue;
    const resolved = path.resolve(requested);
    if (seen.has(resolved)) continue;
    // Binding a path that does not exist would fail the whole launch.
    if (!statSync(resolved, { throwIfNoEntry: false })) continue;
    seen.add(resolved);
    kept.push(resolved);
  }
  return kept;
}

/** The layout one confined run uses, validated before any launcher starts. */
export function sandboxLayout(input: {
  workspace: string;
  cwd?: string;
  writableRoots?: string[];
  tempDirectory?: string;
}): SandboxLayout {
  const workspace = assertWorkspaceRoot(input.workspace);
  const cwd = input.cwd ? path.resolve(workspace, input.cwd) : workspace;
  return {
    workspace,
    cwd,
    writableRoots: distinctExistingRoots([
      workspace,
      ...(input.writableRoots ?? defaultWritableRoots()),
    ]),
    tempDirectory: path.resolve(input.tempDirectory || tmpdir()),
  };
}
