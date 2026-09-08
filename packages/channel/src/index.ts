import { Context, Schema, Session } from "yumeri";
import { randomUUID } from "node:crypto";
import "@velocelab/dashboard";
import "@velocelab/advanced-chat";
import "@velocelab/database-core";
import "@velocelab/model-catalog";

export const depend = ["database", "dashboard", "advanced-chat"];
export const provide = ["channel"];
interface ChannelIntegration { id?: number; user_id: number; name: string; provider: string; bot_token: string; webhook_secret: string; enabled: boolean; default_model: string; [key: string]: unknown }
interface ChannelMessage { id?: number; integration_id: number; user_id: number; provider: string; [key: string]: unknown }
declare module "@yumerijs/types" { interface Tables { message_channel_integrations: ChannelIntegration; message_channel_messages: ChannelMessage } }

export interface ChannelConfig {
  enabled: boolean;
  contextMessageCount: string;
  webhookPayloadMaxBytes: string;
}

export interface ProviderDefinition {
  id: string;
  name: string;
  description?: string;
  plugin_id?: string;
  config?: unknown;
}

export interface WebhookSummary {
  external_chat_id: string;
  external_user_id: string;
  external_user_name: string;
  external_message_id: string;
  content: string;
}

export interface ChannelService {
  enabled(): boolean;
  providers(): ProviderDefinition[];
  normalizeProvider(provider: string): string;
  webhookSummary(provider: string, payload: unknown): WebhookSummary;
}

export const config: Schema<ChannelConfig> = Schema.object({
  enabled: Schema.boolean("Enable message channels").default(true),
  contextMessageCount: Schema.string("Default context message count").default(
    "12",
  ),
  webhookPayloadMaxBytes: Schema.string(
    "Maximum webhook payload bytes",
  ).default("1048576"),
});

declare module "yumeri" {
  interface Components {
    channel: ChannelService;
  }
}

const providers: ProviderDefinition[] = [
  { id: "telegram", name: "Telegram" },
  { id: "discord", name: "Discord" },
  { id: "qq", name: "QQ Official Bot" },
  { id: "onebot", name: "OneBot" },
  { id: "weixin", name: "Weixin Bot" },
  { id: "tencent_channel", name: "Tencent Channel Gateway" },
];

function object(value: unknown): Record<string, any> {
  return value && typeof value === "object"
    ? (value as Record<string, any>)
    : {};
}

function text(value: unknown): string {
  return typeof value === "string" || typeof value === "number"
    ? String(value).trim()
    : "";
}

function first(...values: unknown[]) {
  for (const value of values) {
    const result = text(value);
    if (result) return result;
  }
  return "";
}

function summary(provider: string, payload: unknown): WebhookSummary {
  const body = object(payload);
  const message = object(body.message ?? body.event ?? body.data);
  const chat = object(message.chat ?? body.chat ?? body.group);
  const sender = object(
    message.from ?? body.sender ?? body.author ?? body.user,
  );
  return {
    external_chat_id: first(
      chat.id,
      body.chat_id,
      body.group_id,
      body.channel_id,
    ),
    external_user_id: first(sender.id, body.user_id, body.sender_id),
    external_user_name: first(
      sender.username,
      sender.nickname,
      sender.name,
      body.username,
    ),
    external_message_id: first(
      message.message_id,
      message.id,
      body.message_id,
      body.id,
    ),
    content: first(message.text, message.content, body.text, body.content),
  };
}

export async function apply(ctx: Context, pluginConfig: ChannelConfig) {
  const db = ctx.component.database;
  await db.extend("message_channel_integrations", {
    id: { type: "integer", autoIncrement: true }, user_id: { type: "integer", nullable: false }, name: { type: "string", nullable: false }, provider: { type: "string", nullable: false }, bot_token: { type: "text", nullable: false }, webhook_secret: { type: "string", nullable: false }, enabled: { type: "boolean", initial: true }, default_model: "string", created_at: "timestamp", updated_at: "timestamp",
  }, { unique: [["user_id", "name"], "webhook_secret"] });
  await db.extend("message_channel_messages", {
    id: { type: "integer", autoIncrement: true }, integration_id: { type: "integer", nullable: false }, user_id: { type: "integer", nullable: false }, provider: { type: "string", nullable: false }, content: { type: "text", nullable: false }, payload: { type: "text", nullable: false }, created_at: "timestamp",
  });
  ctx.component.dashboard.addEntry({
    dev: new URL("../frontend/index.tsx", import.meta.url).pathname,
    prod: new URL("../frontend/channel.js", import.meta.url).pathname,
    plugin: "channel",
  });
  ctx.registerComponent("channel", {
    enabled: () => pluginConfig.enabled,
    providers: () => providers.map((provider) => ({ ...provider })),
    normalizeProvider: (provider) =>
      provider.trim().toLowerCase().replaceAll("-", "_"),
    webhookSummary: summary,
  });

  const currentUser = (session: Session) =>
    session.properties.user as { id?: number; is_admin?: boolean } | undefined;
  const body = async (session: Session) =>
    (await session.parseRequestBody()) as Record<string, unknown>;

  ctx
    .route("/api/user/message-channels/settings")
    .methods("GET")
    .action((session) => {
      session.respond({ enabled: pluginConfig.enabled, providers }, "json");
    });
  ctx
    .route("/api/user/message-channels")
    .methods("GET")
    .action(async (session) => {
      const user = currentUser(session);
      if (!user?.id) return;
      const rows = await db.select("message_channel_integrations", {
        user_id: user.id,
      });
      session.respond(
        rows.map(({ bot_token: _token, ...row }) => row),
        "json",
      );
    });
  ctx
    .route("/api/user/message-channels")
    .methods("POST")
    .action(async (session) => {
      const user = currentUser(session);
      if (!user?.id) return;
      const input = await body(session);
      const provider = (input.provider ? String(input.provider) : "")
        .trim()
        .toLowerCase();
      if (!providers.some((item) => item.id === provider)) {
        session.status = 400;
        session.respond({ error: "Unsupported provider" }, "json");
        return;
      }
      const now = new Date().toISOString();
      const row = await db.create("message_channel_integrations", {
        user_id: user.id,
        name: String(input.name ?? provider)
          .trim()
          .slice(0, 120),
        provider,
        bot_token: String(input.bot_token ?? ""),
        webhook_secret: randomUUID().replaceAll("-", ""),
        enabled: input.enabled !== false,
        default_device_id: "",
        default_workspace_path: "",
        default_workspace_unrestricted: false,
        default_connector_auto_approve: false,
        default_connector_command_prefixes: "[]",
        default_model: String(input.default_model ?? ""),
        default_agent_key: "default",
        default_agent_group_id: "",
        default_skill_ids: "[]",
        default_context_message_count:
          Number(pluginConfig.contextMessageCount) || 12,
        reply_mode: "mention",
        trigger_mode: "mention",
        system_prompt: "",
        group_configs: "[]",
        advanced_options: "{}",
        created_at: now,
        updated_at: now,
      });
      const { bot_token: _token, ...response } = row;
      session.status = 201;
      session.respond(response, "json");
    });
  ctx
    .route("/api/user/message-channels/:id")
    .methods("PUT")
    .action(async (session, _params, id) => {
      const user = currentUser(session);
      if (!user?.id) return;
      const existing = await db.selectOne("message_channel_integrations", {
        id: Number(id),
        user_id: user.id,
      });
      if (!existing) {
        session.status = 404;
        session.respond({ error: "Message channel not found" }, "json");
        return;
      }
      const input = await body(session);
      const updates: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };
      for (const key of [
        "name",
        "default_device_id",
        "default_workspace_path",
        "default_model",
        "default_agent_key",
        "default_agent_group_id",
        "reply_mode",
        "trigger_mode",
        "system_prompt",
        "group_configs",
        "advanced_options",
      ]) {
        if (input[key] !== undefined) updates[key] = String(input[key] ?? "");
      }
      if (input.bot_token !== undefined)
        updates.bot_token = String(input.bot_token ?? "");
      if (typeof input.enabled === "boolean") updates.enabled = input.enabled;
      await db.update(
        "message_channel_integrations",
        { id: Number(id), user_id: user.id },
        updates as any,
      );
      const row = await db.selectOne("message_channel_integrations", {
        id: Number(id),
        user_id: user.id,
      });
      if (!row) return;
      const { bot_token: _token, ...response } = row;
      session.respond(response, "json");
    });
  for (const [method, enabled] of [
    ["enable", true],
    ["disable", false],
  ] as const) {
    ctx
      .route(`/api/user/message-channels/:id/${method}`)
      .methods("POST")
      .action(async (session, _params, id) => {
        const user = currentUser(session);
        if (!user?.id) return;
        await db.update(
          "message_channel_integrations",
          { id: Number(id), user_id: user.id },
          { enabled, updated_at: new Date().toISOString() },
        );
        session.respond({ success: true, enabled }, "json");
      });
  }
  ctx
    .route("/api/user/message-channels/:id")
    .methods("DELETE")
    .action(async (session, _params, id) => {
      const user = currentUser(session);
      if (!user?.id) return;
      await db.remove("message_channel_messages", {
        integration_id: Number(id),
        user_id: user.id,
      });
      const removed = await db.remove("message_channel_integrations", {
        id: Number(id),
        user_id: user.id,
      });
      if (!removed) session.status = 404;
      session.respond({ success: removed > 0 }, "json");
    });
  ctx
    .route("/api/user/message-channels/:id/messages")
    .methods("GET")
    .action(async (session, params, id) => {
      const user = currentUser(session);
      if (!user?.id) return;
      const limit = Math.min(
        200,
        Math.max(1, Number(params.get("limit") ?? 50) || 50),
      );
      const rows = await db.select("message_channel_messages", {
        integration_id: Number(id),
        user_id: user.id,
      });
      session.respond(rows.slice(-limit), "json");
    });
  ctx
    .route("/api/message-channels/:provider/:id/webhook")
    .methods("POST")
    .action(async (session, _params, provider, id) => {
      if (!pluginConfig.enabled) {
        session.status = 403;
        session.respond({ error: "Message channel is disabled" }, "json");
        return;
      }
      const integration = await db.selectOne("message_channel_integrations", {
        id: Number(id),
        provider,
      });
      if (!integration || !integration.enabled) {
        session.status = 404;
        session.respond({ error: "Message channel not found" }, "json");
        return;
      }
      const payload = await body(session);
      const item = summary(provider, payload);
      await db.create("message_channel_messages", {
        integration_id: Number(id),
        user_id: integration.user_id,
        provider,
        external_chat_id: item.external_chat_id,
        external_user_id: item.external_user_id,
        external_user_name: item.external_user_name,
        external_message_id: item.external_message_id,
        direction: "inbound",
        status: "received",
        content: item.content,
        payload: JSON.stringify(payload),
        error: "",
        created_at: new Date().toISOString(),
      });
      await db.update(
        "message_channel_integrations",
        { id: Number(id) },
        {
          last_event_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      );
      const modelName = String(integration.default_model ?? "").trim();
      if (item.content && modelName) {
        try {
          const chat = ctx.component["advanced-chat"];
          const result = await chat.complete(integration.user_id, {
            sessionId: `channel-${integration.id}-${item.external_chat_id || "direct"}`,
            model: modelName,
            userChannelId: Number(integration.id),
            messages: [
              {
                role: "user",
                content: item.content,
              },
            ],
            stream: false,
          });
          const answer = String(result.message?.content ?? "").trim();
          if (answer) {
            await db.create("message_channel_messages", {
              integration_id: Number(id),
              user_id: integration.user_id,
              provider,
              external_chat_id: item.external_chat_id,
              external_user_id: item.external_user_id,
              external_user_name: "assistant",
              external_message_id: "",
              direction: "outbound",
              status: "generated",
              content: answer,
              payload: JSON.stringify({ run_id: result.runId }),
              error: "",
              created_at: new Date().toISOString(),
            });
          }
        } catch (error) {
          await db.create("message_channel_messages", {
            integration_id: Number(id),
            user_id: integration.user_id,
            provider,
            external_chat_id: item.external_chat_id,
            external_user_id: item.external_user_id,
            external_user_name: "assistant",
            external_message_id: "",
            direction: "outbound",
            status: "failed",
            content: "",
            payload: "{}",
            error: error instanceof Error ? error.message : String(error),
            created_at: new Date().toISOString(),
          });
        }
      }
      session.respond({ ok: true }, "json");
    });
}
