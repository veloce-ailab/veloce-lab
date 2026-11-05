// Walking a checkout on disk.
//
// Everything here is bounded: a marketplace repository is untrusted input, and a
// plugin is a manifest plus markdown. Whatever is not text, and whatever lies
// beyond the caps, is skipped instead of read into memory.
import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { MAX_PLUGIN_BYTES, MAX_PLUGIN_FILES } from "./manifest.js";

// A plugin is a directory holding one of these, and nothing inside them is
// walked: the manifest directory is the plugin's own, not a nested one.
const pluginMarkers = new Set([".codex-plugin", ".plugin", ".claude-plugin"]);
const rootManifests = new Set(["plugin.json", "manifest.json"]);

const skippedDirs = new Set(["node_modules", ".git", "dist", "build", ".next", "target"]);
const textExtensions = new Set([
  ".json",
  ".md",
  ".markdown",
  ".txt",
  ".yaml",
  ".yml",
]);

/**
 * A marker directory only makes a plugin when it holds a manifest.
 *
 * A marketplace repository keeps its own index under `.claude-plugin/`, which
 * would otherwise be mistaken for a plugin and stop the walk at the root.
 */
async function isPluginRoot(dir: string, names: string[]): Promise<boolean> {
  for (const name of names) {
    if (rootManifests.has(name)) return true;
    if (!pluginMarkers.has(name)) continue;
    for (const manifest of rootManifests) {
      try {
        await stat(join(dir, name, manifest));
        return true;
      } catch {
        // Keep looking: another marker may be the real one.
      }
    }
  }
  return false;
}

/** Directories that hold a plugin, at most a few levels below the repository root. */
export async function discoverPluginDirs(root: string): Promise<string[]> {
  const found: string[] = [];
  const walk = async (dir: string, depth: number): Promise<void> => {
    if (depth > 3 || found.length >= 500) return;
    let entries: Array<{ name: string; isDirectory(): boolean }>;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    if (await isPluginRoot(dir, entries.map((entry) => entry.name))) {
      found.push(dir);
      return;
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || skippedDirs.has(entry.name) || pluginMarkers.has(entry.name)) continue;
      await walk(join(dir, entry.name), depth + 1);
    }
  };
  await walk(root, 0);
  return found;
}

export interface MarketEntry {
  name: string;
  /** Directory relative to the repository, blank when the plugin lives elsewhere. */
  path: string;
  category: string;
  /** Set when the plugin is not part of this repository and has to be fetched. */
  remote?: { url: string; path?: string; ref?: string; sha?: string };
  /** What the index itself says, enough to describe a plugin we cannot read yet. */
  description: string;
  author: string;
  homepage: string;
}

/** A remote source is either a whole repository or a directory inside one. */
function readRemote(value: unknown): MarketEntry["remote"] | undefined {
  const row = value as Record<string, unknown>;
  const kind = String(row.source ?? "");
  const url = String(row.url ?? "")
    || (row.repo ? `https://github.com/${String(row.repo).replace(/\.git$/, "")}.git` : "")
    // `github` and `git` both name a repository; `url` and `git-subdir` carry one.
    || "";
  if (!url) return undefined;
  void kind;
  return {
    url,
    path: String(row.path ?? "").replace(/^\.\//, "").replace(/\/+$/, "") || undefined,
    ref: String(row.ref ?? "") || undefined,
    sha: String(row.sha ?? "") || undefined,
  };
}

/**
 * The index a marketplace repository ships to describe its own contents.
 *
 * Two shapes are in circulation and both are read: a list of plugins that live
 * in this repository, and a directory of plugins that mostly live in others.
 * The latter is why a plugin is not always readable at sync time — the entry is
 * recorded and fetched when somebody installs it.
 */
export async function readMarketplaceIndex(root: string): Promise<MarketEntry[]> {
  const entries: MarketEntry[] = [];
  const indexes = [
    ".agents/plugins/marketplace.json",
    ".agents/plugins/api_marketplace.json",
    ".claude-plugin/marketplace.json",
    "marketplace.json",
  ];
  for (const path of indexes) {
    let text: string;
    try {
      text = await readFile(join(root, path), "utf8");
    } catch {
      continue;
    }
    let parsed: any;
    try {
      parsed = JSON.parse(text);
    } catch {
      continue;
    }
    for (const plugin of Array.isArray(parsed?.plugins) ? parsed.plugins : []) {
      const source = plugin?.source;
      // A plain string is a path in this repository. An object either names a
      // repository to fetch or, when it carries no URL, a path here as well —
      // in which case `path` is relative to this repository, not to the remote.
      const remote = typeof source === "object" && source ? readRemote(source) : undefined;
      const local = typeof source === "string"
        ? source
        : remote
          ? ""
          : String((source as any)?.path ?? "");
      if (!local && !remote) continue;
      entries.push({
        name: String(plugin?.name ?? ""),
        path: local.replace(/^\.\//, "").replace(/\/+$/, ""),
        category: String(plugin?.category ?? ""),
        remote,
        description: String(plugin?.description ?? ""),
        author: typeof plugin?.author === "string"
          ? plugin.author
          : String(plugin?.author?.name ?? ""),
        homepage: String(plugin?.homepage ?? ""),
      });
    }
  }
  return entries;
}

/** Reads the text files of one plugin, capped by count and total size. */
export async function collectPluginFiles(root: string): Promise<Map<string, string>> {
  const files = new Map<string, string>();
  let bytes = 0;
  const walk = async (dir: string): Promise<void> => {
    if (files.size >= MAX_PLUGIN_FILES || bytes >= MAX_PLUGIN_BYTES) return;
    let entries: Array<{ name: string; isDirectory(): boolean; isFile(): boolean }>;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (files.size >= MAX_PLUGIN_FILES || bytes >= MAX_PLUGIN_BYTES) return;
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (skippedDirs.has(entry.name)) continue;
        await walk(path);
        continue;
      }
      if (!entry.isFile()) continue;
      const dot = entry.name.lastIndexOf(".");
      const extension = dot >= 0 ? entry.name.slice(dot).toLowerCase() : "";
      if (!textExtensions.has(extension)) continue;
      try {
        const info = await stat(path);
        if (info.size > MAX_PLUGIN_BYTES - bytes) continue;
        const text = await readFile(path, "utf8");
        bytes += text.length;
        files.set(relative(root, path).split(sep).join("/"), text);
      } catch {
        // An unreadable file is not a reason to reject the plugin.
      }
    }
  };
  await walk(root);
  return files;
}
