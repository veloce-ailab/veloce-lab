// What the machine running this instance can do for a connector.
//
// Two kinds of path are involved and they are treated differently on purpose:
//
// - browsing (`list_directories`) is meant to walk the whole machine, because
//   that is how a workspace gets chosen, so it accepts any absolute path;
// - working inside a workspace (`read_file`, `write_file`, `replace_text`, git)
//   is confined to `workspace_path` when one is given, so a path coming from a
//   model or a stale session cannot reach outside the folder the user picked.
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { arch, homedir, hostname, platform, release } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);
const MAX_TEXT_BYTES = 2 * 1024 * 1024;
const MAX_DIRECTORY_ENTRIES = 1_000;
const GIT_TIMEOUT_MS = 60_000;

const text = (value: unknown) => String(value ?? "").trim();

/** Every spelling a caller may use for the workspace root. */
const workspaceRoot = (input: Record<string, unknown>) =>
  text(input.workspace_path ?? input.connector_workspace_path ?? input.root);

/**
 * Resolves the folder a caller asked for. With no path the machine's own
 * starting point is used: the drives on Windows, the home folder elsewhere.
 */
export function resolveRequestedPath(
  requested: string,
  workspacePath: string,
): string {
  if (!requested) return workspacePath ? path.resolve(workspacePath) : defaultRoot();
  return path.resolve(requested);
}

/** Where the browser starts when no path is given. */
export function defaultRoot(): string {
  return platform() === "win32" ? "" : homedir();
}

/**
 * Resolves a path for file work, refusing anything that leaves the workspace
 * when the caller supplied one. A relative path starts inside the workspace, so
 * callers never have to know how the process was launched.
 */
export function resolveInsideWorkspace(
  requested: string,
  workspacePath: string,
): string {
  const root = workspacePath ? path.resolve(workspacePath) : process.cwd();
  const target = path.resolve(root, requested);
  if (!workspacePath) return target;
  const relative = path.relative(root, target);
  if (relative === "") return target;
  if (relative.startsWith("..") || path.isAbsolute(relative))
    throw Error(
      `Path "${requested}" is outside the workspace "${workspacePath}"`,
    );
  return target;
}

/** The folder actions work in: the workspace when given, else the process cwd. */
function workingPath(
  input: Record<string, unknown>,
  key = "path",
): { target: string; root: string } {
  const root = workspaceRoot(input);
  const requested = text(input[key]);
  const base = root ? path.resolve(root) : process.cwd();
  if (!requested) return { target: base, root };
  return {
    target: resolveInsideWorkspace(
      path.isAbsolute(requested) ? requested : path.join(base, requested),
      root,
    ),
    root,
  };
}

async function isDirectory(target: string): Promise<boolean> {
  try {
    return (await stat(target)).isDirectory();
  } catch {
    return false;
  }
}

/** Drive letters that exist, so "This PC" has something to show on Windows. */
async function windowsDrives(): Promise<Array<{ name: string; path: string }>> {
  const letters = "CDEFGHIJKLMNOPQRSTUVWXYZAB".split("");
  const found = await Promise.all(
    letters.map(async (letter) => {
      const root = `${letter}:\\`;
      return (await isDirectory(root)) ? { name: root, path: root } : undefined;
    }),
  );
  return found
    .filter((entry): entry is { name: string; path: string } => Boolean(entry))
    .sort((left, right) => left.name.localeCompare(right.name));
}

export interface DirectoryEntry {
  name: string;
  path: string;
}

/**
 * Sub-folders of a folder, which is what the workspace picker renders. Only
 * directories are listed: the picker chooses a folder, not a file.
 */
export async function listDirectories(
  input: Record<string, unknown>,
): Promise<{ path: string; directories: DirectoryEntry[] }> {
  const requested = text(input.path ?? input.workspace_path ?? "");
  if (!requested && platform() === "win32")
    return { path: "", directories: await windowsDrives() };
  const target = resolveRequestedPath(requested, workspaceRoot(input));
  let entries: string[];
  try {
    entries = await readdir(target);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") throw Error(`Folder not found: ${target}`);
    if (code === "EACCES" || code === "EPERM")
      throw Error(`Permission denied: ${target}`);
    throw error;
  }
  const directories: DirectoryEntry[] = [];
  for (const name of entries.sort((left, right) =>
    left.localeCompare(right, undefined, { sensitivity: "base" }),
  )) {
    if (directories.length >= MAX_DIRECTORY_ENTRIES) break;
    const child = path.join(target, name);
    if (await isDirectory(child)) directories.push({ name, path: child });
  }
  return { path: target, directories };
}

export async function listWindowsDrives(): Promise<DirectoryEntry[]> {
  if (platform() !== "win32") return [];
  return windowsDrives();
}

export async function readTextFile(
  input: Record<string, unknown>,
): Promise<{ path: string; content: string }> {
  const { target } = workingPath(input);
  const info = await stat(target).catch(() => undefined);
  if (!info) throw Error(`File not found: ${target}`);
  if (info.isDirectory()) throw Error(`Not a file: ${target}`);
  if (info.size > MAX_TEXT_BYTES)
    throw Error(`File is larger than 2 MiB: ${target}`);
  return { path: target, content: await readFile(target, "utf8") };
}

export async function writeTextFile(
  input: Record<string, unknown>,
): Promise<{ path: string; size: number }> {
  const { target } = workingPath(input);
  const content = String(input.content ?? "");
  if (Buffer.byteLength(content) > MAX_TEXT_BYTES)
    throw Error("Content is larger than 2 MiB");
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, content, "utf8");
  return { path: target, size: Buffer.byteLength(content) };
}

export async function listDirectory(
  input: Record<string, unknown>,
): Promise<{
  path: string;
  entries: Array<{ name: string; path: string; type: string; size: number }>;
}> {
  const { target } = workingPath(input);
  const names = await readdir(target).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") throw Error(`Folder not found: ${target}`);
    throw error;
  });
  const entries = [];
  for (const name of names.slice(0, MAX_DIRECTORY_ENTRIES)) {
    const child = path.join(target, name);
    const info = await stat(child).catch(() => undefined);
    if (!info) continue;
    entries.push({
      name,
      path: child,
      type: info.isDirectory() ? "directory" : "file",
      size: info.size,
    });
  }
  return { path: target, entries };
}

export async function fileSha256(
  input: Record<string, unknown>,
): Promise<{ path: string; sha256: string; size: number }> {
  const { target } = workingPath(input);
  const content = await readFile(target).catch(() => undefined);
  if (!content) throw Error(`File not found: ${target}`);
  return {
    path: target,
    sha256: createHash("sha256").update(content).digest("hex"),
    size: content.byteLength,
  };
}

export async function replaceText(
  input: Record<string, unknown>,
): Promise<{ path: string; replacements: number }> {
  const { target } = workingPath(input);
  const oldText = String(input.old_text ?? "");
  if (!oldText) throw Error("old_text is required");
  const current = await readFile(target, "utf8").catch(() => undefined);
  if (current === undefined) throw Error(`File not found: ${target}`);
  const pieces = current.split(oldText);
  if (pieces.length === 1) return { path: target, replacements: 0 };
  const next = pieces.join(String(input.new_text ?? ""));
  if (Buffer.byteLength(next) > MAX_TEXT_BYTES)
    throw Error("Content is larger than 2 MiB");
  await writeFile(target, next, "utf8");
  return { path: target, replacements: pieces.length - 1 };
}

/** Information the device card shows, so the local device describes the host. */
export async function hostInfo(): Promise<{
  hostname: string;
  os: string;
  arch: string;
  version: string;
}> {
  return {
    hostname: hostname(),
    os: platform(),
    arch: arch(),
    version: release(),
  };
}

const git = async (cwd: string, args: string[]) => {
  try {
    const { stdout } = await run("git", args, {
      cwd,
      timeout: GIT_TIMEOUT_MS,
      windowsHide: true,
      maxBuffer: 8 * 1024 * 1024,
    });
    return stdout;
  } catch (error) {
    const failure = error as { stderr?: string; killed?: boolean; code?: number | string };
    if (failure.code === "ENOENT")
      throw Error("git is not installed on this machine");
    const message = String(failure.stderr ?? "").trim();
    throw Error(message || "git failed");
  }
};

export interface WorkspaceGitFile {
  path: string;
  status: string;
  additions: number;
  deletions: number;
}

/**
 * Branch, branch list and changed files of a workspace, in the shape the chat's
 * git panel reads.
 */
export async function gitStatus(input: Record<string, unknown>): Promise<{
  current_branch: string;
  compare_branch: string;
  branches: string[];
  changed_files: number;
  additions: number;
  deletions: number;
  clean: boolean;
  files: WorkspaceGitFile[];
}> {
  const root = workspaceRoot(input) || text(input.path) || process.cwd();
  const cwd = path.resolve(root);
  const compareBranch = text(input.compare_branch);
  const currentBranch = (
    await git(cwd, ["rev-parse", "--abbrev-ref", "HEAD"])
  ).trim();
  const branches = (await git(cwd, ["branch", "--format=%(refname:short)"]))
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .sort();
  const porcelain = await git(cwd, ["status", "--porcelain"]);
  const numstat = await git(cwd, ["diff", "--numstat", "HEAD"]);
  const counts = new Map<string, { additions: number; deletions: number }>();
  for (const line of numstat.split("\n")) {
    if (!line.trim()) continue;
    const [added, removed, ...rest] = line.split("\t");
    const file = rest.join("\t").trim();
    if (!file) continue;
    counts.set(file, {
      additions: Number.isFinite(Number(added)) ? Number(added) : 0,
      deletions: Number.isFinite(Number(removed)) ? Number(removed) : 0,
    });
  }
  const files: WorkspaceGitFile[] = [];
  for (const line of porcelain.split("\n")) {
    if (!line.trim()) continue;
    const status = line.slice(0, 2).trim() || "??";
    // Renames read `R  old -> new`; the new name is what the user sees.
    const rest = line.slice(3).trim();
    const file = rest.includes(" -> ")
      ? rest.split(" -> ").pop()!.trim()
      : rest;
    const count = counts.get(file) ?? { additions: 0, deletions: 0 };
    files.push({ path: file, status, ...count });
  }
  return {
    current_branch: currentBranch,
    compare_branch: compareBranch,
    branches,
    changed_files: files.length,
    additions: files.reduce((total, file) => total + file.additions, 0),
    deletions: files.reduce((total, file) => total + file.deletions, 0),
    clean: files.length === 0,
    files,
  };
}

/**
 * Runs one git action in a workspace. Staging is part of `commit` because that
 * is what the chat's commit button means; `rollback` restores tracked files to
 * HEAD and deliberately leaves untracked files alone.
 */
export async function gitAction(
  action: string,
  workspacePath: string,
  message: string,
): Promise<{ success: boolean; result: string }> {
  const cwd = path.resolve(workspacePath || process.cwd());
  if (!(await isDirectory(cwd))) throw Error(`Folder not found: ${cwd}`);
  switch (action) {
    case "commit": {
      const trimmed = message.trim();
      if (!trimmed) throw Error("A commit message is required");
      await git(cwd, ["add", "-A"]);
      const output = await git(cwd, ["commit", "-m", trimmed]);
      return { success: true, result: output.trim() || "committed" };
    }
    case "push": {
      const branch = (
        await git(cwd, ["rev-parse", "--abbrev-ref", "HEAD"])
      ).trim();
      const upstream = await git(cwd, [
        "rev-parse",
        "--abbrev-ref",
        "--symbolic-full-name",
        "@{u}",
      ]).catch(() => "");
      const output = upstream.trim()
        ? await git(cwd, ["push"])
        : await git(cwd, ["push", "--set-upstream", "origin", branch]);
      return { success: true, result: output.trim() || "pushed" };
    }
    case "rollback": {
      const output = await git(cwd, ["checkout", "--", "."]);
      return { success: true, result: output.trim() || "rolled back" };
    }
    default:
      throw Error(`Unsupported git action: ${action}`);
  }
}
