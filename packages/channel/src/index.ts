import { Context, Schema } from "yumeri";

export const depend = ["velocelab-core", "model", "adapters"];
export const provide = ["channel"];

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
  contextMessageCount: Schema.string("Default context message count").default("12"),
  webhookPayloadMaxBytes: Schema.string("Maximum webhook payload bytes").default("1048576"),
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
  const sender = object(message.from ?? body.sender ?? body.author ?? body.user);
  return {
    external_chat_id: first(chat.id, body.chat_id, body.group_id, body.channel_id),
    external_user_id: first(sender.id, body.user_id, body.sender_id),
    external_user_name: first(sender.username, sender.nickname, sender.name, body.username),
    external_message_id: first(message.message_id, message.id, body.message_id, body.id),
    content: first(message.text, message.content, body.text, body.content),
  };
}

export function apply(ctx: Context, pluginConfig: ChannelConfig) {
  ctx.registerComponent("channel", {
    enabled: () => pluginConfig.enabled,
    providers: () => providers.map((provider) => ({ ...provider })),
    normalizeProvider: (provider) => provider.trim().toLowerCase().replaceAll("-", "_"),
    webhookSummary: summary,
  });
}
