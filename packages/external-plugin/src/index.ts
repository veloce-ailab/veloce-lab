// External plugins.
//
// A different kind of plugin from the ones this server is built out of. Those
// extend the server at boot from code the operator installed; these arrive as
// repositories a user points at, and they contribute text and MCP endpoints to
// that user's chats.
//
// Nothing from a repository is executed while it is read. A plugin is a manifest,
// some markdown, and a list of URLs, so "loading" one means reading its files and
// recording what it declares. That is also why unloading needs no cooperation
// from anyone: enabled is a column, the provider reads it every run, and the
// next run simply does not see the plugin.
import { randomUUID } from "node:crypto";
import { join, relative, sep } from "node:path";
import { Context, Database, Schema, Session } from "yumeri";
import "@velocelab/dashboard";
import "@velocelab/advanced-chat";
import { McpClient } from "@velocelab/mcp";
import { collectPluginFiles, discoverPluginDirs, readMarketplaceIndex, type MarketEntry } from "./files.js";
import { syncCheckout } from "./git.js";
import { parsePluginFiles, type ParsedPlugin } from "./manifest.js";
import { ensureTables } from "./tables.js";
import type { ExternalPlugin, Marketplace } from "./types.js";

export const depend = ["dashboard", "advanced-chat", "database"];
export const provide = ["external-plugin"];

export interface ExternalPluginConfig {
  mcpTimeoutMs: string;
  maxInjectedSkillChars: string;
}

export const config: Schema<ExternalPluginConfig> = Schema.object({
  mcpTimeoutMs: Schema.string("External MCP request timeout")
    .key("external-plugin.config.mcpTimeoutMs")
    .default("30000"),
  maxInjectedSkillChars: Schema.string("Skill text included in the prompt")
    .key("external-plugin.config.maxInjectedSkillChars")
    .default("4000"),
});

/** A readable name so the list does not show nothing until the first sync. */
function marketName(url: string): string {
  const cleaned = url.trim().replace(/[\/]+$/, "").replace(/\.git$/i, "");
  const tail = cleaned.split(/[\/:]/).filter(Boolean).pop() || cleaned;
  return tail.slice(0, 120);
}

const user = (s: Session) =>
  (s.properties.user as { id?: number } | undefined)?.id;

function decode<T>(value: unknown, fallback: T): T {
  try {
    const parsed = JSON.parse(String(value ?? ""));
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

export async function apply(ctx: Context, cfg: ExternalPluginConfig) {
  ctx.component.dashboard.addEntry({
    dev: new URL("../frontend/index.tsx", import.meta.url).pathname,
    prod: new URL("./frontend/external-plugin.js", import.meta.url).pathname,
    plugin: "external-plugin",
  });
  ctx.i18n("external-plugin.title", {
    zh: "外部插件",
    en: "External plugins",
    ja: "外部プラグイン",
  });
  ctx.i18n("external-plugin.config.mcpTimeoutMs", {
    zh: "外部 MCP 请求超时",
    en: "External MCP request timeout",
    ja: "外部 MCP リクエストのタイムアウト",
  });
  ctx.i18n("external-plugin.config.maxInjectedSkillChars", {
    zh: "写入提示词的 skill 字数上限",
    en: "Skill text included in the prompt",
    ja: "プロンプトに含めるスキル本文の上限",
  });
  const db = ctx.component.database as Database;
  await ensureTables(db);
  const root = join(process.cwd(), "data", "external-plugins");
  const requestTimeoutMs = Math.max(1000, Number(cfg.mcpTimeoutMs) || 30_000);
  const skillChars = Math.max(500, Number(cfg.maxInjectedSkillChars) || 4000);

  const marketplaceRow = (row: any, pluginCount: number): Marketplace => ({
    id: String(row.id),
    url: String(row.url ?? ""),
    name: String(row.name ?? ""),
    revision: String(row.revision ?? ""),
    syncedAt: String(row.synced_at ?? ""),
    error: String(row.error_text ?? ""),
    pluginCount,
  });

  const pluginRow = (row: any): ExternalPlugin => ({
    id: String(row.id),
    marketplaceId: String(row.marketplace_id ?? ""),
    slug: String(row.slug ?? ""),
    name: String(row.name ?? ""),
    version: String(row.version ?? ""),
    description: String(row.description ?? ""),
    author: String(row.author ?? ""),
    homepage: String(row.homepage ?? ""),
    license: String(row.license ?? ""),
    manifestPath: String(row.manifest_path ?? ""),
    skills: decode(row.skills, []),
    mcpServers: decode(row.mcp_servers, []),
    ignored: decode(row.ignored, []),
    unsupported: decode(row.unsupported, []),
    category: String(row.category ?? ""),
    source: decode(row.source, null),
    materialized: Number(row.materialized) === 1,
    installed: Number(row.enabled) === 1,
  });

  const pluginsOf = async (userId: number): Promise<ExternalPlugin[]> =>
    (await db.select("external_plugins", { user_id: userId }))
      .map(pluginRow)
      .sort((a, b) => a.name.localeCompare(b.name) || a.slug.localeCompare(b.slug));

  const enabledPlugins = async (userId: number) =>
    (await pluginsOf(userId)).filter((plugin) => plugin.installed);

  const readMarketplace = async (userId: number, id: string) => {
    const row: any = await db.selectOne("external_plugin_marketplaces", {
      id,
      user_id: userId,
    });
    return row;
  };

  /** Reads a checkout into rows, keeping whatever the user had switched on. */
  const absorb = async (userId: number, marketplaceId: string, directory: string) => {
    // The index a marketplace ships is authoritative where it exists: it names
    // each plugin and files it under a category. Walking the tree still matters,
    // because a repository may hold plugins the index does not list.
    const index = await readMarketplaceIndex(directory);
    const hinted = new Map<string, MarketEntry>();
    for (const entry of index) hinted.set(entry.path, entry);
    const roots = new Map<string, MarketEntry | undefined>();
    for (const entry of hinted.values()) roots.set(join(directory, entry.path), entry);
    for (const dir of await discoverPluginDirs(directory)) {
      if (!roots.has(dir)) roots.set(dir, undefined);
    }

    const keep = new Set<string>();
    for (const [dir, hint] of roots) {
      const parsed = parsePluginFiles(await collectPluginFiles(dir));
      if (!parsed) continue;
      const relativePath = relative(directory, dir).split(sep).join("/") || "root";
      const slug = hint?.name || relativePath;
      keep.add(slug);
      const now = new Date().toISOString();
      const existing: any = await db.selectOne("external_plugins", {
        user_id: userId,
        marketplace_id: marketplaceId,
        slug,
      });
      const values = {
        name: parsed.displayName || parsed.name || slug,
        version: parsed.version,
        description: parsed.description,
        author: parsed.author,
        homepage: parsed.homepage,
        license: parsed.license,
        category: parsed.category || hint?.category || "",
        source: "",
        materialized: 1,
        manifest_path: parsed.manifestPath,
        // Server ids are namespaced so a call can name one without also naming
        // the plugin it came from.
        skills: JSON.stringify(parsed.skills),
        mcp_servers: JSON.stringify(
          parsed.mcpServers.map((server) => ({ ...server, id: `${slug}:${server.id}` })),
        ),
        ignored: JSON.stringify(parsed.ignored),
        unsupported: JSON.stringify(parsed.unsupported),
        updated_at: now,
      };
      if (existing) {
        await db.update("external_plugins", { id: String(existing.id) }, values);
      } else {
        await db.create("external_plugins", {
          id: randomUUID(),
          user_id: userId,
          marketplace_id: marketplaceId,
          slug,
          enabled: 0,
          created_at: now,
          ...values,
        });
      }
    }
    // Most plugins in a directory-style marketplace live in their own
    // repository. They are listed from the index alone and fetched when
    // somebody installs one, because fetching three hundred repositories so
    // that a list can be drawn is not a trade worth making.
    for (const entry of index) {
      if (!entry.remote) continue;
      const slug = entry.name;
      if (!slug || keep.has(slug)) continue;
      keep.add(slug);
      const now = new Date().toISOString();
      const existing: any = await db.selectOne("external_plugins", {
        user_id: userId,
        marketplace_id: marketplaceId,
        slug,
      });
      // Only what the index knows. Anything read from the checkout stays put.
      const values = {
        name: entry.name,
        description: entry.description,
        author: entry.author,
        homepage: entry.homepage,
        category: entry.category,
        source: JSON.stringify(entry.remote),
        updated_at: now,
      };
      if (existing) {
        await db.update("external_plugins", { id: String(existing.id) }, values);
      } else {
        await db.create("external_plugins", {
          id: randomUUID(),
          user_id: userId,
          marketplace_id: marketplaceId,
          slug,
          version: "",
          license: "",
          manifest_path: "",
          skills: "[]",
          mcp_servers: "[]",
          ignored: "[]",
          unsupported: "[]",
          materialized: 0,
          enabled: 0,
          created_at: now,
          ...values,
        });
      }
    }

    // A plugin that disappeared from the repository stops existing here too.
    for (const plugin of await pluginsOf(userId)) {
      if (plugin.marketplaceId === marketplaceId && !keep.has(plugin.slug)) {
        await db.remove("external_plugins", { id: plugin.id, user_id: userId });
      }
    }
  };

  const sync = async (userId: number, row: any): Promise<Marketplace> => {
    const directory = join(root, String(row.id));
    const now = new Date().toISOString();
    try {
      const { revision } = await syncCheckout(String(row.url), directory);
      await absorb(userId, String(row.id), directory);
      await db.update(
        "external_plugin_marketplaces",
        { id: String(row.id), user_id: userId },
        { revision, synced_at: now, error_text: "", updated_at: now },
      );
    } catch (error) {
      const message = (error instanceof Error ? error.message : String(error)).slice(0, 2000);
      await db.update(
        "external_plugin_marketplaces",
        { id: String(row.id), user_id: userId },
        { error_text: message, updated_at: now },
      );
      throw Error(message);
    }
    const refreshed: any = await readMarketplace(userId, String(row.id));
    const count = (await pluginsOf(userId)).filter(
      (plugin) => plugin.marketplaceId === String(row.id),
    ).length;
    return marketplaceRow(refreshed ?? row, count);
  };

  /**
   * Fetches a plugin that the marketplace only points at, and reads it.
   *
   * This is the one operation here that reaches the network on a user's behalf,
   * and it happens because that user asked for this specific plugin.
   */
  const materialise = async (userId: number, row: any, source: any): Promise<void> => {
    const marketplace: any = await db.selectOne("external_plugin_marketplaces", {
      id: String(row.marketplace_id),
      user_id: userId,
    });
    if (!marketplace) throw Error("The marketplace this plugin came from is gone");
    const slug = String(row.slug);
    const target = join(root, String(marketplace.directory), "plugins", slug);
    // The commit is the exact pin, a branch or tag is what the marketplace
    // asked to follow, and the default branch is the last resort.
    let failure: unknown;
    for (const candidate of [source.sha, source.ref, undefined]) {
      try {
        await syncCheckout(String(source.url), target, candidate || undefined);
        failure = undefined;
        break;
      } catch (error) {
        failure = error;
      }
    }
    if (failure) {
      const detail = failure instanceof Error ? failure.message : String(failure);
      const line = detail.split("\n").map((entry) => entry.trim()).find(Boolean) ?? detail;
      throw Error(`${source.url} could not be fetched: ${line.replace(/^fatal:\s*/i, "")}`);
    }
    const parsed = parsePluginFiles(
      await collectPluginFiles(source.path ? join(target, String(source.path)) : target),
    );
    if (!parsed) throw Error("Nothing in that repository could be read as a plugin");
    await db.update(
      "external_plugins",
      { id: String(row.id), user_id: userId },
      {
        version: parsed.version,
        description: parsed.description || row.description,
        author: parsed.author || row.author,
        homepage: parsed.homepage || row.homepage,
        license: parsed.license,
        category: parsed.category || row.category,
        manifest_path: parsed.manifestPath,
        skills: JSON.stringify(parsed.skills),
        mcp_servers: JSON.stringify(
          parsed.mcpServers.map((server) => ({ ...server, id: `${slug}:${server.id}` })),
        ),
        ignored: JSON.stringify(parsed.ignored),
        unsupported: JSON.stringify(parsed.unsupported),
        materialized: 1,
        updated_at: new Date().toISOString(),
      },
    );
  };

  const service = {
    async marketplaces(userId: number) {
      const plugins = await pluginsOf(userId);
      return (await db.select("external_plugin_marketplaces", { user_id: userId }))
        .map((row: any) =>
          marketplaceRow(
            row,
            plugins.filter((plugin) => plugin.marketplaceId === String(row.id)).length,
          ),
        )
        .sort((a, b) => a.url.localeCompare(b.url));
    },
    async addMarketplace(userId: number, url: string) {
      const trimmed = url.trim();
      const existing: any = await db.selectOne("external_plugin_marketplaces", {
        user_id: userId,
        url: trimmed,
      });
      if (existing) return sync(userId, existing);
      const id = randomUUID();
      const now = new Date().toISOString();
      await db.create("external_plugin_marketplaces", {
        id,
        user_id: userId,
        url: trimmed,
        name: marketName(trimmed),
        directory: id,
        revision: "",
        synced_at: "",
        error_text: "",
        created_at: now,
        updated_at: now,
      });
      const row: any = await readMarketplace(userId, id);
      return sync(userId, row);
    },
    async syncMarketplace(userId: number, id: string) {
      const row = await readMarketplace(userId, id);
      if (!row) throw Error("Marketplace not found");
      return sync(userId, row);
    },
    async removeMarketplace(userId: number, id: string) {
      const row = await readMarketplace(userId, id);
      if (!row) return false;
      await db.remove("external_plugins", { marketplace_id: id, user_id: userId });
      await db.remove("external_plugin_marketplaces", { id, user_id: userId });
      return true;
    },
    plugins: pluginsOf,
    async setInstalled(userId: number, id: string, installed: boolean) {
      const row: any = await db.selectOne("external_plugins", { id, user_id: userId });
      if (!row) return false;
      if (installed && Number(row.materialized) !== 1) {
        const source = decode(row.source, null);
        if (!source?.url) return false;
        await materialise(userId, row, source);
      }
      // The column is still called `enabled`; it holds exactly this flag.
      await db.update(
        "external_plugins",
        { id, user_id: userId },
        { enabled: installed ? 1 : 0, updated_at: new Date().toISOString() },
      );
      return true;
    },
  };
  ctx.registerComponent("external-plugin", service);

  const chat = ctx.component["advanced-chat"];

  // What an enabled plugin contributes to a run. Skills go in by description and
  // MCP servers by URL, because both are too large to inline and the model can
  // ask for either through the tools below.
  chat.registerContextProvider({
    id: "external-plugin",
    provide: async ({ userId }) => {
      const plugins = await enabledPlugins(userId);
      if (!plugins.length) return undefined;
      const sections: string[] = [];
      for (const plugin of plugins) {
        const lines: string[] = [];
        for (const skill of plugin.skills) {
          lines.push(`- skill \`${skill.id}\`: ${skill.name}${skill.description ? ` — ${skill.description}` : ""}`);
        }
        for (const server of plugin.mcpServers) {
          lines.push(`- mcp \`${server.id}\`: ${server.name} — ${server.url}`);
        }
        if (lines.length) sections.push(`${plugin.name}${plugin.version ? ` (${plugin.version})` : ""}:\n${lines.join("\n")}`);
      }
      if (!sections.length) return undefined;
      return [
        "External plugins the user enabled:",
        ...sections,
        "Open a skill with external_skill_read and call an MCP tool with external_mcp_call.",
      ].join("\n");
    },
  });

  chat.registerTool({
    name: "external_plugin_list",
    description: "List the external plugins the user enabled, with their skills and MCP servers",
    parameters: { type: "object", properties: {} },
    execute: async (_input, context) => {
      const plugins = await enabledPlugins(context.userId);
      return plugins.map((plugin) => ({
        name: plugin.name,
        version: plugin.version,
        description: plugin.description,
        skills: plugin.skills.map((skill) => ({ id: skill.id, name: skill.name, description: skill.description })),
        mcp_servers: plugin.mcpServers.map((server) => ({ id: server.id, name: server.name })),
      }));
    },
  });

  chat.registerTool({
    name: "external_skill_read",
    description: "Read the full text of a skill from an enabled external plugin",
    parameters: {
      type: "object",
      properties: { skill: { type: "string", description: "Skill id as listed" } },
      required: ["skill"],
    },
    execute: async (input, context) => {
      const id = String((input as any)?.skill ?? "").trim();
      for (const plugin of await enabledPlugins(context.userId)) {
        const skill = plugin.skills.find((entry) => entry.id === id);
        if (!skill) continue;
        // Capped, because a skill is a document and the prompt is not free.
        return { plugin: plugin.name, name: skill.name, content: skill.content.slice(0, skillChars) };
      }
      throw Error("Skill not found among the enabled plugins");
    },
  });

  const serverFor = async (userId: number, id: string) => {
    for (const plugin of await enabledPlugins(userId)) {
      const server = plugin.mcpServers.find((entry) => entry.id === id);
      if (server) return server;
    }
    return undefined;
  };

  chat.registerTool({
    name: "external_mcp_list_tools",
    description: "List the tools an enabled external plugin's MCP server offers",
    parameters: {
      type: "object",
      properties: { server: { type: "string", description: "MCP server id as listed" } },
      required: ["server"],
    },
    execute: async (input, context) => {
      const server = await serverFor(context.userId, String((input as any)?.server ?? "").trim());
      if (!server) throw Error("MCP server not found among the enabled plugins");
      const client = new McpClient(server.url, server.headers, requestTimeoutMs);
      await client.initialize();
      return client.listTools();
    },
  });

  chat.registerTool({
    name: "external_mcp_call",
    description: "Call a tool on an enabled external plugin's MCP server",
    parameters: {
      type: "object",
      properties: {
        server: { type: "string" },
        tool: { type: "string" },
        arguments: { type: "object" },
      },
      required: ["server", "tool"],
    },
    execute: async (input, context) => {
      const value = input as any;
      const server = await serverFor(context.userId, String(value?.server ?? "").trim());
      if (!server) throw Error("MCP server not found among the enabled plugins");
      const client = new McpClient(server.url, server.headers, requestTimeoutMs);
      await client.initialize();
      return client.callTool(String(value?.tool ?? ""), (value?.arguments ?? {}) as Record<string, unknown>);
    },
  });

  /**
   * Answers exactly once, whatever happens below.
   *
   * A handler that throws leaves the framework to respond after something has
   * already been written, which takes the whole worker down. So every route
   * ends here, and a failure becomes a response rather than an exception.
   */
  const handle = (session: Session, run: () => Promise<void>): Promise<void> =>
    run().catch((error: unknown) => {
      const detail = error instanceof Error ? error.message : String(error);
      const line = detail.split("\n").map((entry) => entry.trim()).find(Boolean) || "The request failed";
      session.status = /could not be fetched|ENOTFOUND|repository/i.test(line) ? 502 : 400;
      try {
        session.respond({ error: line.replace(/^fatal:\s*/i, "") }, "json");
      } catch {
        // Already answered; nothing more to say.
      }
    });

  ctx
    .route("/api/user/external-plugin/marketplaces")
    .methods("GET")
    .action((session) =>
      handle(session, async () => {
        const id = user(session);
        if (id === undefined) return;
        session.respond({ marketplaces: await service.marketplaces(id) }, "json");
      }),
    );
  ctx
    .route("/api/user/external-plugin/marketplaces")
    .methods("POST")
    .action((session) =>
      handle(session, async () => {
        const id = user(session);
        if (id === undefined) return;
        // The second action argument is the query string; the body is read.
        const body = (await session.parseRequestBody()) as any;
        const url = String(body?.url ?? "").trim();
        if (!url) {
          session.status = 400;
          session.respond({ error: "A marketplace URL is required" }, "json");
          return;
        }
        session.respond({ marketplace: await service.addMarketplace(id, url) }, "json");
      }),
    );
  ctx
    .route("/api/user/external-plugin/marketplaces/:id/sync")
    .methods("POST")
    .action((session, _params, marketplaceId) =>
      handle(session, async () => {
        const id = user(session);
        if (id === undefined) return;
        session.respond({ marketplace: await service.syncMarketplace(id, String(marketplaceId)) }, "json");
      }),
    );
  ctx
    .route("/api/user/external-plugin/marketplaces/:id")
    .methods("DELETE")
    .action((session, _params, marketplaceId) =>
      handle(session, async () => {
        const id = user(session);
        if (id === undefined) return;
        session.respond({ success: await service.removeMarketplace(id, String(marketplaceId)) }, "json");
      }),
    );
  ctx
    .route("/api/user/external-plugin/plugins")
    .methods("GET")
    .action((session) =>
      handle(session, async () => {
        const id = user(session);
        if (id === undefined) return;
        session.respond({ plugins: await service.plugins(id) }, "json");
      }),
    );
  ctx
    .route("/api/user/external-plugin/plugins/:id")
    .methods("POST")
    .action((session, _params, pluginId) =>
      handle(session, async () => {
        const id = user(session);
        if (id === undefined) return;
        const body = (await session.parseRequestBody()) as any;
        const installed = Boolean(body?.installed ?? body?.enabled);
        const ok = await service.setInstalled(id, String(pluginId), installed);
        session.respond({ success: ok }, "json");
      }),
    );
}
