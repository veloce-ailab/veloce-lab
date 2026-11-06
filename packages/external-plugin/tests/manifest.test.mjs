import assert from "node:assert/strict";
import { test } from "node:test";
import { parsePluginFiles, readFrontmatter } from "../dist/manifest.js";
import { discoverPluginDirs, readMarketplaceIndex } from "../dist/files.js";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const files = (entries) => new Map(Object.entries(entries));

test("reads a manifest from the plugin directory", () => {
  const parsed = parsePluginFiles(files({
    ".plugin/plugin.json": JSON.stringify({ name: "Weather", version: "1.2.0", description: "Forecasts" }),
  }));
  assert.equal(parsed.manifestPath, ".plugin/plugin.json");
  assert.equal(parsed.name, "Weather");
  assert.equal(parsed.version, "1.2.0");
});

test("prefers the .plugin manifest over a bare one", () => {
  const parsed = parsePluginFiles(files({
    "plugin.json": JSON.stringify({ name: "Bare" }),
    ".plugin/plugin.json": JSON.stringify({ name: "Nested" }),
  }));
  assert.equal(parsed.name, "Nested");
});

test("returns nothing when a directory declares no plugin", () => {
  assert.equal(parsePluginFiles(files({ "README.md": "# hello" })), undefined);
});

test("reads a skill's frontmatter and body", () => {
  const parsed = parsePluginFiles(files({
    "plugin.json": JSON.stringify({ name: "Writer" }),
    "skills/editing/SKILL.md": "---\nname: Editing\ndescription: Tighten prose\n---\n\nUse short sentences.\n",
  }));
  assert.equal(parsed.skills.length, 1);
  const [skill] = parsed.skills;
  assert.equal(skill.id, "editing");
  assert.equal(skill.name, "Editing");
  assert.equal(skill.description, "Tighten prose");
  assert.equal(skill.content, "Use short sentences.");
  assert.equal(skill.path, "skills/editing/SKILL.md");
});

test("falls back to the first heading for a skill title", () => {
  const parsed = parsePluginFiles(files({
    "plugin.json": JSON.stringify({ name: "Writer" }),
    "skills/editing/skill.md": "# Copy editing\n\nCut adverbs.",
  }));
  assert.equal(parsed.skills[0].name, "Copy editing");
  assert.equal(parsed.skills[0].description, "");
});

test("keeps one skill per directory", () => {
  const parsed = parsePluginFiles(files({
    "plugin.json": JSON.stringify({ name: "Writer" }),
    "skills/editing/SKILL.md": "# First",
    "skills/editing/notes.md": "# Not a skill",
  }));
  assert.equal(parsed.skills.length, 1);
});

test("ignores markdown outside skills directories", () => {
  const parsed = parsePluginFiles(files({
    "plugin.json": JSON.stringify({ name: "Writer" }),
    "README.md": "# Docs",
    "docs/guide/SKILL.md": "# Not a skill",
  }));
  assert.deepEqual(parsed.skills, []);
});

test("reads MCP servers from the manifest", () => {
  const parsed = parsePluginFiles(files({
    "plugin.json": JSON.stringify({
      name: "Search",
      mcpServers: { search: { url: "https://mcp.example.com/sse", headers: { Authorization: "Bearer x" } } },
    }),
  }));
  assert.equal(parsed.mcpServers.length, 1);
  assert.equal(parsed.mcpServers[0].id, "search");
  assert.equal(parsed.mcpServers[0].url, "https://mcp.example.com/sse");
  assert.deepEqual(parsed.mcpServers[0].headers, { Authorization: "Bearer x" });
});

test("reads MCP servers from a sibling file when the manifest has none", () => {
  const parsed = parsePluginFiles(files({
    "plugin.json": JSON.stringify({ name: "Search" }),
    ".mcp.json": JSON.stringify({ mcpServers: [{ name: "search", url: "https://mcp.example.com" }] }),
  }));
  assert.equal(parsed.mcpServers.length, 1);
  assert.equal(parsed.mcpServers[0].name, "search");
});

test("skips servers without a URL instead of failing the plugin", () => {
  const parsed = parsePluginFiles(files({
    "plugin.json": JSON.stringify({ name: "Mixed", mcpServers: { local: { command: "npx" }, remote: { url: "https://x.test" } } }),
  }));
  assert.deepEqual(parsed.mcpServers.map((server) => server.id), ["remote"]);
});

test("accepts a manifest written with comments and trailing commas", () => {
  const parsed = parsePluginFiles(files({
    "plugin.json": '{\n  // a note\n  "name": "Loose",\n  "version": "0.1.0",\n}\n',
  }));
  assert.equal(parsed.name, "Loose");
  assert.equal(parsed.version, "0.1.0");
});

test("reports manifest keys it does not act on", () => {
  const parsed = parsePluginFiles(files({
    "plugin.json": JSON.stringify({ name: "Extra", widgets: [], endpoints: [] }),
  }));
  assert.deepEqual(parsed.ignored, ["endpoints", "widgets"]);
});

test("accepts an author object", () => {
  const parsed = parsePluginFiles(files({
    "plugin.json": JSON.stringify({ name: "Authored", author: { name: "Ada" } }),
  }));
  assert.equal(parsed.author, "Ada");
});

test("readFrontmatter leaves text without frontmatter alone", () => {
  const { data, body } = readFrontmatter("# Title\n\nText\n");
  assert.deepEqual(data, {});
  assert.equal(body, "# Title\n\nText");
});

// The shape the curated plugin repositories actually use.
const sentry = new Map(Object.entries({
  ".codex-plugin/plugin.json": JSON.stringify({
    name: "sentry",
    version: "0.1.2",
    description: "Inspect recent issues and events in Sentry from Codex.",
    author: { name: "OpenAI", email: "support@openai.com", url: "https://openai.com/" },
    license: "MIT",
    skills: "./skills/",
    interface: { displayName: "Sentry", shortDescription: "Inspect recent Sentry issues", category: "Developer Tools" },
  }),
  ".mcp.json": JSON.stringify({ mcpServers: { sentry: { type: "http", url: "https://mcp.sentry.dev/mcp" } } }),
  "skills/sentry/SKILL.md": "---\nname: \"sentry\"\ndescription: \"Inspect Sentry issues\"\n---\n\n# Sentry\n\nRead-only queries.\n",
}))

test("reads the .codex-plugin manifest the curated repositories use", () => {
  const parsed = parsePluginFiles(sentry)
  assert.equal(parsed.manifestPath, ".codex-plugin/plugin.json")
  assert.equal(parsed.name, "sentry")
  assert.equal(parsed.displayName, "Sentry")
  assert.equal(parsed.category, "Developer Tools")
  assert.equal(parsed.license, "MIT")
  assert.equal(parsed.author, "OpenAI")
})

test("finds the skill and its MCP server in that layout", () => {
  const parsed = parsePluginFiles(sentry)
  assert.deepEqual(parsed.skills.map((skill) => skill.id), ["sentry"])
  assert.equal(parsed.skills[0].description, "Inspect Sentry issues")
  assert.match(parsed.skills[0].content, /Read-only queries/)
  assert.deepEqual(parsed.mcpServers.map((server) => server.url), ["https://mcp.sentry.dev/mcp"])
})

test("takes the skills directory from the manifest", () => {
  const parsed = parsePluginFiles(new Map(Object.entries({
    ".codex-plugin/plugin.json": JSON.stringify({ name: "Elsewhere", skills: "./capabilities" }),
    "capabilities/writing/SKILL.md": "---\nname: Writing\n---\nBody",
    "skills/writing/SKILL.md": "---\nname: Wrong\n---\nBody",
  })))
  assert.deepEqual(parsed.skills.map((skill) => skill.name), ["Writing"])
})

test("follows a manifest that points at an MCP file", () => {
  const parsed = parsePluginFiles(new Map(Object.entries({
    ".codex-plugin/plugin.json": JSON.stringify({ name: "Pointed", mcpServers: "./.mcp.json" }),
    ".mcp.json": JSON.stringify({ mcpServers: { tools: { url: "https://mcp.example.com/mcp" } } }),
  })))
  assert.deepEqual(parsed.mcpServers.map((server) => server.id), ["tools"])
})

test("reports surfaces it cannot honour instead of silently dropping them", () => {
  const parsed = parsePluginFiles(new Map(Object.entries({
    ".codex-plugin/plugin.json": JSON.stringify({ name: "Hooked", hooks: {}, apps: "./.app.json" }),
    ".app.json": JSON.stringify({ apps: { external: { id: "asdk_app_x" } } }),
  })))
  assert.equal(parsed.unsupported.length, 2)
  assert.ok(parsed.unsupported.some((entry) => entry.startsWith("hooks:")))
  assert.ok(parsed.unsupported.some((entry) => entry.startsWith("app \"external\"")))
})

test("matches an app registration to the MCP server that backs it", () => {
  const parsed = parsePluginFiles(new Map(Object.entries({
    ".codex-plugin/plugin.json": JSON.stringify({ name: "Linear", apps: "./.app.json" }),
    ".app.json": JSON.stringify({ apps: { linear: { id: "asdk_app_x" } } }),
    ".mcp.json": JSON.stringify({
      mcpServers: {
        linear: {
          type: "http",
          url: "https://mcp.linear.app/mcp",
          oauth_resource: "https://mcp.linear.app/mcp",
          scopes: ["read", "write"],
        },
      },
    }),
  })))
  assert.equal(parsed.apps.length, 1)
  assert.equal(parsed.apps[0].name, "linear")
  assert.equal(parsed.apps[0].serverId, "linear")
  assert.equal(parsed.mcpServers[0].oauth.resource, "https://mcp.linear.app/mcp")
  assert.deepEqual(parsed.mcpServers[0].oauth.scopes, ["read", "write"])
  assert.deepEqual(parsed.unsupported, [])
})

test("recognises an OAuth server declared with a client registration", () => {
  const parsed = parsePluginFiles(new Map(Object.entries({
    ".codex-plugin/plugin.json": JSON.stringify({ name: "Slack" }),
    ".mcp.json": JSON.stringify({
      mcpServers: { slack: { type: "http", url: "https://mcp.slack.com/mcp", oauth: { client_id: "1" } } },
    }),
  })))
  assert.ok(parsed.mcpServers[0].oauth)
  assert.deepEqual(parsed.mcpServers[0].oauth.scopes, [])
})

test("falls back to the interface description", () => {
  const parsed = parsePluginFiles(new Map(Object.entries({
    ".codex-plugin/plugin.json": JSON.stringify({ name: "Bare", interface: { displayName: "Bare", shortDescription: "Short words" } }),
  })))
  assert.equal(parsed.description, "Short words")
  assert.equal(parsed.displayName, "Bare")
})

// A directory-style marketplace: most of its plugins live in other repositories.
test("reads a marketplace index that mostly points elsewhere", async () => {
  const root = await mkdtemp(join(tmpdir(), "marketplace-"));
  try {
    await mkdir(join(root, ".claude-plugin"), { recursive: true });
    await writeFile(join(root, ".claude-plugin/marketplace.json"), JSON.stringify({
      name: "official",
      plugins: [
        { name: "in-repo", source: "./plugins/in-repo", category: "tools" },
        {
          name: "elsewhere",
          description: "From its own repository",
          author: { name: "Someone" },
          category: "design",
          source: { source: "git-subdir", url: "https://example.com/a.git", path: "plugins/x", ref: "v1" },
        },
      ],
    }));
    const index = await readMarketplaceIndex(root);
    assert.equal(index.length, 2);
    const local = index.find((entry) => entry.name === "in-repo");
    const remote = index.find((entry) => entry.name === "elsewhere");
    assert.equal(local.path, "plugins/in-repo");
    assert.equal(local.remote, undefined);
    assert.equal(remote.path, "");
    assert.equal(remote.remote.url, "https://example.com/a.git");
    assert.equal(remote.remote.path, "plugins/x");
    assert.equal(remote.remote.ref, "v1");
    // The index alone is enough to describe a plugin that is not here yet.
    assert.equal(remote.description, "From its own repository");
    assert.equal(remote.author, "Someone");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a repository that only holds an index is not itself a plugin", async () => {
  const root = await mkdtemp(join(tmpdir(), "marketplace-"));
  try {
    await mkdir(join(root, ".claude-plugin"), { recursive: true });
    await writeFile(join(root, ".claude-plugin/marketplace.json"), JSON.stringify({ plugins: [] }));
    await mkdir(join(root, "plugins/one/.claude-plugin"), { recursive: true });
    await writeFile(join(root, "plugins/one/.claude-plugin/plugin.json"), JSON.stringify({ name: "one" }));
    const dirs = await discoverPluginDirs(root);
    assert.equal(dirs.length, 1);
    assert.match(dirs[0], /plugins\/one$/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("says which parts of a plugin cannot be offered here", () => {
  const parsed = parsePluginFiles(new Map(Object.entries({
    ".claude-plugin/plugin.json": JSON.stringify({ name: "Rich" }),
    "skills/one/SKILL.md": "---\nname: One\n---\nBody",
    "commands/deploy.md": "# /deploy",
    "agents/reviewer.md": "# reviewer",
    "hooks/hooks.json": "{}",
  })))
  assert.equal(parsed.skills.length, 1)
  assert.equal(parsed.unsupported.length, 3)
  assert.ok(parsed.unsupported.some((entry) => entry.startsWith("hooks:")))
  assert.ok(parsed.unsupported.some((entry) => entry.includes("slash command")))
  assert.ok(parsed.unsupported.some((entry) => entry.includes("subagent")))
})
