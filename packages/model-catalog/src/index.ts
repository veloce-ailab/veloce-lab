import { Context, Database, Session } from "yumeri";
import { ModelService } from "@velocelab/model";

export const depend = ["model", "database"];
export const provide = ["model-catalog"];

export interface ModelCatalogService {
  list(): ReturnType<ModelService["models"]["list"]>;
}

declare module "yumeri" {
  interface Components {
    "model-catalog": ModelCatalogService;
  }
}

export function apply(ctx: Context) {
  const model = ctx.component.model as ModelService;
  const db = ctx.component.database as Database;
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
