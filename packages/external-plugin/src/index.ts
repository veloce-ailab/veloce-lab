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
    enabled: Number(row.enabled) === 1,
  });

  const pluginsOf = async (userId: number): Promise<ExternalPlugin[]> =>
    (await db.select("external_plugins", { user_id: userId }))
      .map(pluginRow)
      .sort((a, b) => a.name.localeCompare(b.name) || a.slug.localeCompare(b.slug));

  const enabledPlugins = async (userId: number) =>
    (await pluginsOf(userId)).filter((plugin) => plugin.enabled);

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
    async setEnabled(userId: number, id: string, enabled: boolean) {
      const row: any = await db.selectOne("external_plugins", { id, user_id: userId });
      if (!row) return false;
      await db.update(
        "external_plugins",
        { id, user_id: userId },
        { enabled: enabled ? 1 : 0, updated_at: new Date().toISOString() },
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

  ctx
    .route("/api/user/external-plugin/marketplaces")
    .methods("GET")
    .action(async (session) => {
      const id = user(session);
      if (id === undefined) return;
      session.respond({ marketplaces: await service.marketplaces(id) }, "json");
    });
  ctx
    .route("/api/user/external-plugin/marketplaces")
    .methods("POST")
    .action(async (session, params) => {
      const id = user(session);
      if (id === undefined) return;
      const url = String((params as any)?.url ?? "").trim();
      if (!url) {
        session.status = 400;
        session.respond({ error: "A marketplace URL is required" }, "json");
        return;
      }
      try {
        session.respond({ marketplace: await service.addMarketplace(id, url) }, "json");
      } catch (error) {
        session.status = 502;
        session.respond(
          { error: error instanceof Error ? error.message : "Marketplace could not be read" },
          "json",
        );
      }
    });
  ctx
    .route("/api/user/external-plugin/marketplaces/:id/sync")
    .methods("POST")
    .action(async (session, _params, marketplaceId) => {
      const id = user(session);
      if (id === undefined) return;
      try {
        session.respond({ marketplace: await service.syncMarketplace(id, String(marketplaceId)) }, "json");
      } catch (error) {
        session.status = 502;
        session.respond(
          { error: error instanceof Error ? error.message : "Marketplace could not be read" },
          "json",
        );
      }
    });
  ctx
    .route("/api/user/external-plugin/marketplaces/:id")
    .methods("DELETE")
    .action(async (session, _params, marketplaceId) => {
      const id = user(session);
      if (id === undefined) return;
      session.respond({ success: await service.removeMarketplace(id, String(marketplaceId)) }, "json");
    });
  ctx
    .route("/api/user/external-plugin/plugins")
    .methods("GET")
    .action(async (session) => {
      const id = user(session);
      if (id === undefined) return;
      session.respond({ plugins: await service.plugins(id) }, "json");
    });
  ctx
    .route("/api/user/external-plugin/plugins/:id")
    .methods("POST")
    .action(async (session, params, pluginId) => {
      const id = user(session);
      if (id === undefined) return;
      const enabled = Boolean((params as any)?.enabled);
      const ok = await service.setEnabled(id, String(pluginId), enabled);
      session.respond({ success: ok }, "json");
    });
}
