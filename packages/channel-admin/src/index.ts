import { Context, Database, Session } from "yumeri";
import type { Channel, Model, ModelConfig } from "./types.js";
import type { TokenLog } from "@velocelab/billing";
import "@velocelab/dashboard";
import "@velocelab/billing";
import "@velocelab/database-core";

declare module "@yumerijs/types" {
  interface Tables { channels: Channel; models: Model; model_configs: ModelConfig; }
}

export const depend = ["database", "dashboard", "billing"];
export const provide = ["channel-admin"];

export function apply(ctx: Context) {
  ctx.i18n("channelAdmin.settings", { zh: "AI 服务商与模型", en: "AI providers and models", ja: "AIサービスとモデル" });
  ctx.component.dashboard.addEntry({ dev: new URL("../frontend/index.tsx", import.meta.url).pathname, prod: new URL("./frontend/channel-admin.js", import.meta.url).pathname, plugin: "channel-admin" });
  const db = ctx.component.database as Database;
  const channels = {
    list: async () => db.select("channels", {}),
    findById: (id: number) => db.selectOne("channels", { id }),
    create: (data: Omit<Channel, "id" | "created_at" | "updated_at">) => db.create("channels", { ...data, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }),
    update: async (id: number, data: Partial<Channel>) => { await db.update("channels", { id }, { ...data, updated_at: new Date().toISOString() }); return db.selectOne("channels", { id }); },
    delete: (id: number) => db.remove("channels", { id }),
  };
  const models = { list: () => db.select("models", {}) };
  const admin = (session: Session) =>
    (session.properties.user as { is_admin?: boolean } | undefined)?.is_admin;
  const body = async (session: Session) =>
    (await session.parseRequestBody()) as Record<string, unknown>;
  ctx.registerComponent("channel-admin", {
    list: () => channels.list(),
  });
  ctx.route("/api/channel-usage").methods("GET").action(async (session) => {
    if (!admin(session)) return;
    const channelRows = await channels.list();
    const logs = await db.select("token_logs", {});
    session.respond({ upstream_channels: channelRows.map((channel) => {
      const rows = logs.filter((row: TokenLog) => row.channel_id === channel.id);
      const input = rows.reduce((sum: number, row: TokenLog) => sum + Number(row.input_tokens || 0), 0);
      const output = rows.reduce((sum: number, row: TokenLog) => sum + Number(row.output_tokens || 0), 0);
      return { id: channel.id, name: channel.name, request_count: rows.length, input_tokens: input, output_tokens: output, total_tokens: input + output, total_cost: rows.reduce((sum: number, row: TokenLog) => sum + Number(row.cost || 0), 0).toString() };
    }) }, "json");
  });
  ctx.route("/api/channels/:id/health").methods("POST").action(async (session, _params, id) => {
    if (!admin(session)) return;
    const channel = await channels.findById(Number(id));
    if (!channel) { session.status = 404; session.respond({ error: "Channel not found" }, "json"); return; }
    const checkedAt = new Date().toISOString();
    try {
      const response = await fetch(channel.base_url.replace(/\/$/, ""), {
        headers: channel.api_key ? { Authorization: `Bearer ${channel.api_key}` } : {},
        signal: AbortSignal.timeout(10_000),
      });
      const status = response.ok ? "up" : "down";
      await channels.update(channel.id!, {
        last_health_checked_at: checkedAt,
        last_health_status: status,
        consecutive_failures: response.ok ? 0 : (channel.consecutive_failures ?? 0) + 1,
        last_failure_at: response.ok ? null : checkedAt,
        last_failure_reason: response.ok ? "" : `health check returned HTTP ${response.status}`,
      } as any);
      session.respond({ ok: response.ok, status: response.status, health_status: status }, "json");
    } catch (error) {
      await channels.update(channel.id!, {
        last_health_checked_at: checkedAt,
        last_health_status: "down",
        consecutive_failures: (channel.consecutive_failures ?? 0) + 1,
        last_failure_at: checkedAt,
        last_failure_reason: error instanceof Error ? error.message : String(error),
      } as any);
      session.status = 502;
      session.respond({ error: "Health check failed", health_status: "down" }, "json");
    }
  });
  ctx.route("/api/channels").methods("GET").action(async (session) => {
    if (!admin(session)) return;
    session.respond(await channels.list(), "json");
  });
  ctx.route("/api/channels").methods("POST").action(async (session) => {
    if (!admin(session)) return;
    const input = await body(session);
    const channel = await channels.create({
      user_channel_id: Number(input.user_channel_id ?? 0) || null,
      name: String(input.name ?? "").trim(),
      type: String(input.type ?? "openai").trim(),
      base_url: String(input.base_url ?? "").trim(),
      api_key: String(input.api_key ?? ""),
      plugin_config: String(input.plugin_config ?? "{}"),
      multiplier: String(input.multiplier ?? "1"),
      priority: Number(input.priority ?? 1),
      weight: Number(input.weight ?? 1),
      enabled: input.enabled !== false,
      price_sync_enabled: input.price_sync_enabled === true,
      price_sync_cron: String(input.price_sync_cron ?? ""),
      consecutive_failures: 0,
      last_failure_reason: "",
      auto_disabled_reason: "",
      last_health_status: "unknown",
    } as any);
    session.status = 201;
    session.respond(channel, "json");
  });
  ctx.route("/api/channels/:id").methods("PUT").action(async (session, _params, id) => {
    if (!admin(session)) return;
    const input = await body(session);
    const updates = Object.fromEntries(
      ["name", "type", "base_url", "api_key", "plugin_config", "multiplier", "priority", "weight", "enabled", "price_sync_enabled", "price_sync_cron"]
        .filter((key) => input[key] !== undefined)
        .map((key) => [key, input[key]]),
    );
    session.respond(await channels.update(Number(id), updates as Partial<Channel>), "json");
  });
  ctx.route("/api/channels/:id").methods("DELETE").action(async (session, _params, id) => {
    if (!admin(session)) return;
    await channels.delete(Number(id));
    session.respond({ success: true }, "json");
  });
  ctx.route("/api/channels/:id/models").methods("GET").action(async (session, _params, id) => {
    if (!admin(session)) return;
    const rows = await db.select("model_configs", { channel_id: Number(id) });
    const modelRows = await models.list();
    session.respond(rows.map((row) => ({
      ...row,
      model_name: modelRows.find((item) => item.id === row.model_id)?.model_name ?? row.upstream_model_name,
      provider: modelRows.find((item) => item.id === row.model_id)?.provider ?? "",
    })), "json");
  });
  ctx.route("/api/channels/:id/models").methods("POST").action(async (session, _params, id) => {
    if (!admin(session)) return;
    const input = await body(session);
    const now = new Date().toISOString();
    const row = await db.create("model_configs", {
      channel_id: Number(id), model_id: Number(input.model_id ?? 0),
      upstream_model_name: String(input.upstream_model_name ?? input.model_name ?? ""),
      input_price: String(input.input_price ?? "0"), output_price: String(input.output_price ?? "0"),
      enabled: input.enabled !== false, created_at: now, updated_at: now,
    } as any);
    session.status = 201;
    session.respond(row, "json");
  });
  ctx.route("/api/channel-models/:id").methods("PUT").action(async (session, _params, id) => {
    if (!admin(session)) return;
    const input = await body(session);
    const updates = Object.fromEntries(["upstream_model_name", "input_price", "output_price", "enabled"].filter((key) => input[key] !== undefined).map((key) => [key, input[key]]));
    await db.update("model_configs", { id: Number(id) }, { ...updates, updated_at: new Date().toISOString() } as any);
    session.respond(await db.selectOne("model_configs", { id: Number(id) }), "json");
  });
  ctx.route("/api/channel-models/:id").methods("DELETE").action(async (session, _params, id) => {
    if (!admin(session)) return;
    await db.remove("model_configs", { id: Number(id) });
    session.respond({ success: true }, "json");
  });
}
