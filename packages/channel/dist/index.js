import { Schema } from "yumeri";
import { randomUUID } from "node:crypto";
export const depend = ["database"];
export const provide = ["channel"];
export const config = Schema.object({
    enabled: Schema.boolean("Enable message channels").default(true),
    contextMessageCount: Schema.string("Default context message count").default("12"),
    webhookPayloadMaxBytes: Schema.string("Maximum webhook payload bytes").default("1048576"),
});
const providers = [
    { id: "telegram", name: "Telegram" },
    { id: "discord", name: "Discord" },
    { id: "qq", name: "QQ Official Bot" },
    { id: "onebot", name: "OneBot" },
    { id: "weixin", name: "Weixin Bot" },
    { id: "tencent_channel", name: "Tencent Channel Gateway" },
];
function object(value) {
    return value && typeof value === "object"
        ? value
        : {};
}
function text(value) {
    return typeof value === "string" || typeof value === "number"
        ? String(value).trim()
        : "";
}
function first(...values) {
    for (const value of values) {
        const result = text(value);
        if (result)
            return result;
    }
    return "";
}
function summary(provider, payload) {
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
export function apply(ctx, pluginConfig) {
    const db = ctx.component.database;
    ctx.registerComponent("channel", {
        enabled: () => pluginConfig.enabled,
        providers: () => providers.map((provider) => ({ ...provider })),
        normalizeProvider: (provider) => provider.trim().toLowerCase().replaceAll("-", "_"),
        webhookSummary: summary,
    });
    const currentUser = (session) => session.properties.user;
    const body = async (session) => (await session.parseRequestBody());
    ctx.route("/api/user/message-channels/settings").methods("GET").action((session) => {
        session.respond({ enabled: pluginConfig.enabled, providers }, "json");
    });
    ctx.route("/api/user/message-channels").methods("GET").action(async (session) => {
        const user = currentUser(session);
        if (!user?.id)
            return;
        const rows = await db.select("message_channel_integrations", { user_id: user.id });
        session.respond(rows.map(({ bot_token: _token, ...row }) => row), "json");
    });
    ctx.route("/api/user/message-channels").methods("POST").action(async (session) => {
        const user = currentUser(session);
        if (!user?.id)
            return;
        const input = await body(session);
        const provider = (input.provider ? String(input.provider) : "").trim().toLowerCase();
        if (!providers.some((item) => item.id === provider)) {
            session.status = 400;
            session.respond({ error: "Unsupported provider" }, "json");
            return;
        }
        const now = new Date().toISOString();
        const row = await db.create("message_channel_integrations", {
            user_id: user.id,
            name: String(input.name ?? provider).trim().slice(0, 120),
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
            default_context_message_count: Number(pluginConfig.contextMessageCount) || 12,
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
    ctx.route("/api/user/message-channels/:id").methods("PUT").action(async (session, _params, id) => {
        const user = currentUser(session);
        if (!user?.id)
            return;
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
        const updates = {
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
            if (input[key] !== undefined)
                updates[key] = String(input[key] ?? "");
        }
        if (input.bot_token !== undefined)
            updates.bot_token = String(input.bot_token ?? "");
        if (typeof input.enabled === "boolean")
            updates.enabled = input.enabled;
        await db.update("message_channel_integrations", { id: Number(id), user_id: user.id }, updates);
        const row = await db.selectOne("message_channel_integrations", { id: Number(id), user_id: user.id });
        if (!row)
            return;
        const { bot_token: _token, ...response } = row;
        session.respond(response, "json");
    });
    for (const [method, enabled] of [
        ["enable", true],
        ["disable", false],
    ]) {
        ctx
            .route(`/api/user/message-channels/:id/${method}`)
            .methods("POST")
            .action(async (session, _params, id) => {
            const user = currentUser(session);
            if (!user?.id)
                return;
            await db.update("message_channel_integrations", { id: Number(id), user_id: user.id }, { enabled, updated_at: new Date().toISOString() });
            session.respond({ success: true, enabled }, "json");
        });
    }
    ctx.route("/api/user/message-channels/:id").methods("DELETE").action(async (session, _params, id) => {
        const user = currentUser(session);
        if (!user?.id)
            return;
        await db.remove("message_channel_messages", { integration_id: Number(id), user_id: user.id });
        const removed = await db.remove("message_channel_integrations", { id: Number(id), user_id: user.id });
        if (!removed)
            session.status = 404;
        session.respond({ success: removed > 0 }, "json");
    });
    ctx.route("/api/user/message-channels/:id/messages").methods("GET").action(async (session, params, id) => {
        const user = currentUser(session);
        if (!user?.id)
            return;
        const limit = Math.min(200, Math.max(1, Number(params.get("limit") ?? 50) || 50));
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
        await db.update("message_channel_integrations", { id: Number(id) }, {
            last_event_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        });
        session.respond({ ok: true }, "json");
    });
}
