// Reading a plugin directory.
//
// The layout follows the plugin-sharing repositories this is meant to consume:
// a `.codex-plugin/plugin.json` manifest, skills under a directory the manifest
// names, and MCP servers either inline or in a file it points at. Only markdown
// and JSON are read; nothing here executes what a repository contains.
//
// Repositories are not written to a schema we control, so the parser is
// forgiving. It looks where a plugin is likely to put things, keeps what it
// understands, and reports what it does not rather than rejecting the plugin.

export interface PluginSkill {
  /** Directory name, stable within the plugin even when the title changes. */
  id: string;
  name: string;
  description: string;
  /** The skill body, handed to the model when it opens the skill. */
  content: string;
  path: string;
}

export interface PluginMcpServer {
  id: string;
  name: string;
  url: string;
  headers: Record<string, string>;
  description?: string;
}

export interface ParsedPlugin {
  name: string;
  /** What to call it in a list; falls back to the directory name. */
  displayName: string;
  version: string;
  description: string;
  author: string;
  homepage: string;
  license: string;
  category: string;
  skills: PluginSkill[];
  mcpServers: PluginMcpServer[];
  /** Which manifest was read, so the settings page can say where it came from. */
  manifestPath: string;
  /** Top-level manifest keys this build does not act on. */
  ignored: string[];
  /**
   * Surfaces the plugin declares that cannot be honoured here, with the reason.
   * `apps` needs a ChatGPT app registration and `hooks` would mean running code
   * from the repository, which this never does.
   */
  unsupported: string[];
}

/** A plugin is documentation and text; anything larger is not one. */
export const MAX_PLUGIN_FILES = 4000;
export const MAX_PLUGIN_BYTES = 8 << 20;

const manifestCandidates = [
  ".codex-plugin/plugin.json",
  ".plugin/plugin.json",
  ".claude-plugin/plugin.json",
  "plugin.json",
  "manifest.json",
];

const mcpCandidates = [".mcp.json", "mcp.json"];

const knownKeys = new Set([
  "name",
  "version",
  "description",
  "author",
  "homepage",
  "repository",
  "license",
  "keywords",
  "skills",
  "mcpServers",
  "mcp_servers",
  "apps",
  "interface",
  "hooks",
  "commands",
  "agents",
]);

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** `author` is either a name or an object with one. */
function authorName(value: unknown): string {
  if (typeof value === "string") return value.trim();
  const row = record(value);
  return asString(row.name) || asString(row.email);
}

/** Manifests write paths as `./skills/`; the file map uses plain relative ones. */
export function normalisePath(value: string): string {
  return value.trim().replace(/^\.\//, "").replace(/^\/+/, "").replace(/\/+$/, "");
}

/** Splits `--- key: value ---` off the top of a markdown file. */
export function readFrontmatter(text: string): { data: Record<string, string>; body: string } {
  const normalised = text.replace(/\r\n/g, "\n");
  if (!normalised.startsWith("---")) return { data: {}, body: normalised.trim() };
  const end = normalised.indexOf("\n---", 3);
  if (end < 0) return { data: {}, body: normalised.trim() };
  const data: Record<string, string> = {};
  for (const line of normalised.slice(3, end).split("\n")) {
    const match = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(line.trim());
    if (!match) continue;
    data[match[1].toLowerCase()] = match[2].replace(/^["']|["']$/g, "").trim();
  }
  return { data, body: normalised.slice(end + 4).trim() };
}

/** The first heading is a decent fallback title when the frontmatter omits one. */
function firstHeading(text: string): string {
  const match = /^#\s+(.+)$/m.exec(text);
  return match ? match[1].trim() : "";
}

function readJson(text: string | undefined): unknown {
  if (text === undefined) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    // Trailing commas and comments show up in hand-written manifests.
    const relaxed = text
      .replace(/\/\/[^\n]*/g, "")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/,(\s*[}\]])/g, "$1");
    try {
      return JSON.parse(relaxed);
    } catch {
      return undefined;
    }
  }
}

function parseSkills(files: Map<string, string>, directory: string): PluginSkill[] {
  const prefix = directory ? `${directory}/` : "";
  const byId = new Map<string, PluginSkill>();
  for (const [path, text] of files) {
    if (prefix && !path.startsWith(prefix)) continue;
    const rest = path.slice(prefix.length);
    // One directory per skill, holding a single markdown file.
    const match = /^([^/]+)\/[^/]+\.md$/i.exec(rest);
    if (!match) continue;
    const id = match[1];
    const { data, body } = readFrontmatter(text);
    const existing = byId.get(id);
    const skill: PluginSkill = {
      id,
      name: asString(data.name) || firstHeading(body) || id,
      description: asString(data.description),
      content: body,
      path,
    };
    // Prefer SKILL.md when a directory also ships notes.
    if (!existing || /^skill\.md$/i.test(path.slice(path.lastIndexOf("/") + 1))) {
      byId.set(id, skill);
    }
  }
  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
}

function normaliseServer(id: string, value: unknown): PluginMcpServer | undefined {
  const row = record(value);
  const url = asString(row.url) || asString(row.endpoint) || asString(row.serverUrl);
  if (!url) return undefined;
  const headers: Record<string, string> = {};
  for (const [key, header] of Object.entries(record(row.headers))) {
    const text = asString(header);
    if (text) headers[key] = text;
  }
  return {
    id,
    name: asString(row.name) || id,
    url,
    headers,
    description: asString(row.description) || undefined,
  };
}

function parseServers(value: unknown): PluginMcpServer[] {
  const servers: PluginMcpServer[] = [];
  if (Array.isArray(value)) {
    value.forEach((entry, index) => {
      const row = record(entry);
      const id = asString(row.id) || asString(row.name) || `server-${index + 1}`;
      const server = normaliseServer(id, entry);
      if (server) servers.push(server);
    });
  } else {
    for (const [id, entry] of Object.entries(record(value))) {
      const server = normaliseServer(id, entry);
      if (server) servers.push(server);
    }
  }
  return servers;
}

/**
 * Reads one plugin directory.
 *
 * `files` maps directory-relative paths to their text, so the same parser runs
 * against a checkout, an archive, or a handful of strings in a test.
 */
export function parsePluginFiles(files: Map<string, string>): ParsedPlugin | undefined {
  const manifestPath = manifestCandidates.find((path) => files.has(path));
  if (!manifestPath) return undefined;
  const manifest = readJson(files.get(manifestPath));
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) return undefined;
  const row = record(manifest);
  const ui = record(row.interface);

  // Servers are declared one of three ways: inline, or as a path to a file,
  // or by the conventional file name beside the manifest.
  let serversValue = row.mcpServers ?? row.mcp_servers;
  if (typeof serversValue === "string") {
    const pointed = normalisePath(serversValue);
    const parsed = readJson(files.get(pointed));
    serversValue = record(parsed).mcpServers ?? record(parsed).servers ?? parsed;
  }
  if (!serversValue) {
    for (const path of mcpCandidates) {
      const parsed = readJson(files.get(path));
      if (!parsed) continue;
      serversValue = record(parsed).mcpServers ?? record(parsed).servers ?? parsed;
      break;
    }
  }

  const skillsField = asString(row.skills);
  const unsupported: string[] = [];
  if (row.apps) unsupported.push("apps: needs a ChatGPT app registration, which this server cannot provide");
  if (row.hooks) unsupported.push("hooks: they would run code from the repository, which this never does");

  return {
    name: asString(row.name),
    displayName: asString(ui.displayName) || asString(row.name),
    version: asString(row.version),
    description: asString(row.description) || asString(ui.shortDescription) || asString(ui.longDescription),
    author: authorName(row.author) || asString(ui.developerName),
    homepage: asString(row.homepage) || asString(row.repository) || asString(ui.websiteURL),
    license: asString(row.license),
    category: asString(ui.category),
    skills: parseSkills(files, normalisePath(skillsField || "skills")),
    mcpServers: parseServers(serversValue),
    manifestPath,
    ignored: Object.keys(row).filter((key) => !knownKeys.has(key)).sort(),
    unsupported,
  };
}
