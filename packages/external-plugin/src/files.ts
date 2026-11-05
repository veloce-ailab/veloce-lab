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

const isPluginRoot = (names: string[]) =>
  names.some((name) => pluginMarkers.has(name)) || names.some((name) => rootManifests.has(name));

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
    if (isPluginRoot(entries.map((entry) => entry.name))) {
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
  /** Directory relative to the repository root, as the index declares it. */
  path: string;
  category: string;
  /** False when the index marks the plugin as not installable. */
  available: boolean;
}

/**
 * The index a marketplace repository ships to describe its own contents.
 *
 * Preferred over walking the tree: it names each plugin, where it lives, and
 * what category it belongs to, which no amount of directory guessing recovers.
 */
export async function readMarketplaceIndex(root: string): Promise<MarketEntry[]> {
  const entries: MarketEntry[] = [];
  const indexes = [
    ".agents/plugins/marketplace.json",
    ".agents/plugins/api_marketplace.json",
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
      const location = String(plugin?.source?.path ?? "");
      if (!location) continue;
      entries.push({
        name: String(plugin?.name ?? ""),
        path: location.replace(/^\.\//, "").replace(/\/+$/, ""),
        category: String(plugin?.category ?? ""),
        available: String(plugin?.policy?.installation ?? "AVAILABLE") !== "UNAVAILABLE",
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
