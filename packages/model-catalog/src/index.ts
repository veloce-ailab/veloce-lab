import { Context, Database, Session } from "yumeri";
import type { ModelService, Channel, Model, ModelConfig, ModelGroupMultiplier, ChannelGroupMultiplier } from "./model-service.js";
import { apply as applyModelService } from "./model-service.js";
export * from "./model-service.js";
import "@velocelab/database-core";

declare module "@yumerijs/types" {
  interface Tables {
    channels: Channel;
    models: Model;
    model_configs: ModelConfig;
    model_group_multipliers: ModelGroupMultiplier;
    channel_group_multipliers: ChannelGroupMultiplier;
  }
}

export const depend = ["database"];
export const provide = ["model", "model-catalog"];

export interface ModelCatalogService {
  list(): ReturnType<ModelService["models"]["list"]>;
}

declare module "yumeri" {
  interface Components {
    "model-catalog": ModelCatalogService;
  }
}

export async function apply(ctx: Context) {
  await applyModelService(ctx);
  const model = ctx.component.model as ModelService;
  const db = ctx.component.database;
  await db.extend("channels", {
    id: { type: "integer", autoIncrement: true }, user_channel_id: "integer", name: "string", type: "string", base_url: "string", api_key: "string", plugin_config: "text", multiplier: { type: "decimal", initial: 1 }, priority: { type: "integer", initial: 1 }, weight: { type: "integer", initial: 1 }, enabled: { type: "boolean", initial: true }, price_sync_enabled: "boolean", price_sync_cron: "string", price_sync_last_at: "timestamp", consecutive_failures: { type: "integer", initial: 0 }, last_failure_at: "timestamp", last_failure_reason: "string", auto_disabled_at: "timestamp", auto_disabled_reason: "string", last_health_checked_at: "timestamp", last_health_status: "string", created_at: "timestamp", updated_at: "timestamp",
  });
  await db.extend("models", {
    id: { type: "integer", autoIncrement: true }, model_name: { type: "string", nullable: false }, provider: "string", provider_icon_url: "string", quota_type: { type: "integer", initial: 0 }, input_price: { type: "decimal", initial: 0 }, output_price: { type: "decimal", initial: 0 }, cached_input_price: { type: "decimal", initial: 0 }, cache_write_input_price: { type: "decimal", initial: 0 }, cache_write_1h_input_price: { type: "decimal", initial: 0 }, image_input_price: { type: "decimal", initial: 0 }, image_output_price: { type: "decimal", initial: 0 }, audio_input_price: { type: "decimal", initial: 0 }, audio_output_price: { type: "decimal", initial: 0 }, input_price_tiers: "text", output_price_tiers: "text", cached_input_price_tiers: "text", cache_write_input_price_tiers: "text", cache_write_1h_input_price_tiers: "text", image_input_price_tiers: "text", image_output_price_tiers: "text", audio_input_price_tiers: "text", audio_output_price_tiers: "text", video_billing_config: "text", enabled: { type: "boolean", initial: true }, created_at: "timestamp", updated_at: "timestamp",
  }, { unique: ["model_name"] });
  await db.extend("model_configs", {
    id: { type: "integer", autoIncrement: true }, channel_id: "integer", model_id: "integer", upstream_model_name: "string", input_price: { type: "decimal", initial: 0 }, output_price: { type: "decimal", initial: 0 }, enabled: { type: "boolean", initial: true }, created_at: "timestamp", updated_at: "timestamp",
  });
  await db.extend("model_group_multipliers", {
    id: { type: "integer", autoIncrement: true }, model_config_id: { type: "integer", nullable: false }, group_id: { type: "integer", nullable: false }, multiplier: { type: "decimal", initial: 1 }, created_at: "timestamp", updated_at: "timestamp",
  }, { unique: [["model_config_id", "group_id"]] });
  await db.extend("channel_group_multipliers", {
    id: { type: "integer", autoIncrement: true },
    channel_id: { type: "integer", nullable: false },
    group_id: { type: "integer", nullable: false },
    multiplier: { type: "decimal", initial: 1 },
    created_at: "timestamp",
    updated_at: "timestamp",
  }, { unique: [["channel_id", "group_id"]] });
  const catalog: ModelCatalogService = {
    list: () => model.models.list(),
  };
  ctx.registerComponent("model-catalog", catalog);
  ctx
    .route("/api/models")
    .methods("GET")
    .action(async (session: Session) => {
      const user = session.properties.user as
        { is_admin?: boolean } | undefined;
      if (!user) {
        session.status = 401;
        session.respond({ error: "Authorization is required" }, "json");
        return;
      }
      if (!user.is_admin) {
        session.status = 403;
        session.respond({ error: "Admin access required" }, "json");
        return;
      }
      session.respond(await catalog.list(), "json");
    });

  // Model synchronization belongs to the catalog plugin, not the service
  // bootstrap/authentication plugin.
  ctx
    .route("/api/models/sync/preview")
    .methods("POST")
    .action(async (session) => {
      const user = session.properties.user as
        { is_admin?: boolean } | undefined;
      if (!user?.is_admin) return;
      const input = (await session.parseRequestBody()) as Record<
        string,
        unknown
      >;
      const channel = await model.channels.findById(Number(input.channel_id));
      if (!channel) {
        session.status = 404;
        session.respond({ error: "Channel not found" }, "json");
        return;
      }
      const path = String(input.path ?? "/v1/models").trim() || "/v1/models";
      const response = await fetch(
        `${channel.base_url.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`,
        {
          headers: channel.api_key
            ? { Authorization: `Bearer ${channel.api_key}` }
            : {},
        },
      );
      const payload = (await response.json().catch(() => ({}))) as any;
      const items = Array.isArray(payload.data)
        ? payload.data
        : Array.isArray(payload.models)
          ? payload.models
          : [];
      const existing = await catalog.list();
      session.respond(
        {
          channel_id: channel.id,
          channel_name: channel.name,
          source: "upstream",
          models: items.map((item: any) => ({
            model_name: String(item.id ?? item.name ?? ""),
            provider: channel.type,
            exists: existing.some(
              (entry: any) =>
                entry.model_name === String(item.id ?? item.name ?? ""),
            ),
          })),
        },
        "json",
      );
    });

  ctx
    .route("/api/models/sync/preview/browser")
    .methods("POST")
    .action(async (session) => {
      const user = session.properties.user as
        { is_admin?: boolean } | undefined;
      if (!user?.is_admin) return;
      const input = (await session.parseRequestBody()) as any;
      const channel = await model.channels.findById(Number(input.channel_id));
      const payload = input.payload ?? {};
      const items = Array.isArray(payload.data)
        ? payload.data
        : Array.isArray(payload.models)
          ? payload.models
          : Array.isArray(payload)
            ? payload
            : [];
      session.respond(
        {
          channel_id: channel?.id ?? Number(input.channel_id),
          channel_name: channel?.name ?? "",
          source: String(input.source ?? "browser"),
          models: items.map((item: any) => ({
            model_name: String(item.id ?? item.name ?? item.model_name ?? ""),
            provider: channel?.type ?? "",
            exists: false,
          })),
        },
        "json",
      );
    });

  ctx
    .route("/api/models/sync/apply")
    .methods("POST")
    .action(async (session) => {
      const user = session.properties.user as
        { is_admin?: boolean } | undefined;
      if (!user?.is_admin) {
        session.status = 403;
        session.respond({ error: "Admin access required" }, "json");
        return;
      }
      const input = (await session.parseRequestBody()) as any;
      const channel = await model.channels.findById(Number(input.channel_id));
      if (!channel) {
        session.status = 404;
        session.respond({ error: "Channel not found" }, "json");
        return;
      }
      const items = Array.isArray(input.models) ? input.models : [];
      const created: any[] = [];
      for (const item of items) {
        const name = String(
          item.model_name ?? item.id ?? item.name ?? "",
        ).trim();
        if (!name || (await model.models.findByName(name))) continue;
        created.push(
          await model.models.create({
            model_name: name,
            provider: String(item.provider ?? channel.type),
            provider_icon_url: String(item.provider_icon_url ?? ""),
            quota_type: Number(item.quota_type ?? 0),
            input_price: String(item.input_price ?? "0"),
            output_price: String(item.output_price ?? "0"),
            cached_input_price: "0",
            cache_write_input_price: "0",
            cache_write_1h_input_price: "0",
            image_input_price: "0",
            image_output_price: "0",
            audio_input_price: "0",
            audio_output_price: "0",
            input_price_tiers: "[]",
            output_price_tiers: "[]",
            cached_input_price_tiers: "[]",
            cache_write_input_price_tiers: "[]",
            cache_write_1h_input_price_tiers: "[]",
            image_input_price_tiers: "[]",
            image_output_price_tiers: "[]",
            audio_input_price_tiers: "[]",
            audio_output_price_tiers: "[]",
            video_billing_config: "{}",
            enabled: item.enabled !== false,
          } as any),
        );
      }
      session.respond({ created: created.length, models: created }, "json");
    });
}
