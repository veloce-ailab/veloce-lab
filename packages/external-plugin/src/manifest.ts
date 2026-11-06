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
  /**
   * Present when the server advertises MCP OAuth. The resource is what the
   * token audience is bound to, and the scopes are what the plugin asks for;
   * both are read from `.mcp.json`, not guessed.
   */
  oauth?: {
    resource?: string;
    scopes: string[];
  };
}

export interface PluginApp {
  /** Key in `.app.json`, which is also the MCP server name in practice. */
  name: string;
  /** The ChatGPT app registration id (`asdk_app_…` or `connector_…`). */
  id: string;
  required: boolean;
  /** Set when this plugin ships a matching MCP server that can back the app. */
  serverId?: string;
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
  /** App registrations from `.app.json`, matched to this plugin's MCP servers. */
  apps: PluginApp[];
  /** Which manifest was read, so the settings page can say where it came from. */
  manifestPath: string;
  /** Top-level manifest keys this build does not act on. */
  ignored: string[];
  /**
   * Surfaces the plugin declares that cannot be honoured here, with the reason.
   * An app that ships no MCP server has nowhere to run, and `hooks` would mean
   * running code from the repository, which this never does.
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

function parseScopes(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(asString).filter(Boolean);
  if (typeof value === "string") return value.split(/[\s,]+/).map((entry) => entry.trim()).filter(Boolean);
  return [];
}

/** `.mcp.json` marks OAuth servers with `oauth_resource` or an `oauth` object. */
function serverOAuth(row: Record<string, unknown>): PluginMcpServer["oauth"] {
  const oauth = record(row.oauth);
  const resource = asString(row.oauth_resource) || asString(row.oauthResource) || asString(oauth.resource);
  const scopes = [...new Set([...parseScopes(row.scopes), ...parseScopes(oauth.scopes)])];
  if (!resource && Object.keys(oauth).length === 0) return undefined;
  return { resource: resource || undefined, scopes };
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
    oauth: serverOAuth(row),
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
 * Reads the app registrations a Codex plugin ships.
 *
 * An app is a ChatGPT/Codex connector registration; its `id` is not a URL and
 * cannot be hosted here on its own. The service behind it is almost always an
 * MCP server in the same plugin, so each app is matched to one by name — that
 * is what lets the settings page say whether the service is reachable.
 */
function parseApps(
  files: Map<string, string>,
  value: unknown,
  servers: PluginMcpServer[],
): PluginApp[] {
  if (value === undefined || value === null || value === "") return [];
  let input: unknown = value;
  if (typeof value === "string") {
    input = readJson(files.get(normalisePath(value)));
  }
  if (input === undefined) {
    input = readJson(files.get(".app.json"));
  }
  if (input === undefined) return [];

  const container = record(input);
  const source = container.apps ?? (Array.isArray(input) ? input : container);
  const rows: Array<Pick<PluginApp, "name" | "id" | "required">> = [];
  if (Array.isArray(source)) {
    for (const entry of source) {
      const row = record(entry);
      const id = asString(row.id) || asString(row.app_id) || asString(row.appId);
      const name = asString(row.name) || asString(row.slug) || id;
      if (id || name) rows.push({ name, id, required: row.required === true });
    }
  } else {
    for (const [name, entry] of Object.entries(record(source))) {
      const row = record(entry);
      const id = asString(row.id) || asString(row.app_id) || asString(row.appId);
      rows.push({ name: asString(row.name) || name, id, required: row.required === true });
    }
  }

  const byId = new Map(servers.map((server) => [server.id.toLowerCase(), server.id]));
  const byName = new Map(servers.map((server) => [server.name.toLowerCase(), server.id]));
  const apps: PluginApp[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const key = `${row.name}\n${row.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const match = [row.id, row.name]
      .filter(Boolean)
      .map((candidate) => candidate.toLowerCase())
      .map((candidate) => byId.get(candidate) || byName.get(candidate))
      .find(Boolean);
    apps.push({ ...row, ...(match ? { serverId: match } : {}) });
  }
  return apps;
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
  const servers = parseServers(serversValue);
  const apps = parseApps(files, row.apps, servers);
  const unsupported: string[] = [];
  for (const app of apps) {
    // A matched app is served by its MCP server; the registration id itself is
    // only meaningful to ChatGPT, which is why it is not advertised as a
    // capability here. An unmatched app has no service to call at all.
    if (!app.serverId) {
      unsupported.push(
        `app "${app.name}"${app.id ? ` (${app.id})` : ""}: a ChatGPT app registration without an MCP endpoint, so this server cannot host it`,
      );
    }
  }
  // Directories the manifest does not mention but a plugin still ships. Slash
  // commands and subagents are the client's own machinery, so they cannot be
  // offered from here, and nothing from a repository is ever executed.
  const countIn = (directory: string) =>
    [...files.keys()].filter((path) => path.startsWith(`${directory}/`)).length;
  const hooksInRepository = countIn("hooks") > 0 || Boolean(row.hooks);
  if (hooksInRepository)
    unsupported.push("hooks: they would run code from the repository, which this never does");
  const commands = countIn("commands");
  if (commands)
    unsupported.push(
      `${commands} slash command${commands === 1 ? "" : "s"}: those belong to the client, not to this server`,
    );
  const agents = countIn("agents");
  if (agents)
    unsupported.push(
      `${agents} subagent${agents === 1 ? "" : "s"}: those belong to the client, not to this server`,
    );

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
    mcpServers: servers,
    apps,
    manifestPath,
    ignored: Object.keys(row).filter((key) => !knownKeys.has(key)).sort(),
    unsupported,
  };
}
