import type { Database } from "yumeri";

declare module "@yumerijs/types" {
  interface Tables {
    companion_integrations: Record<string, unknown>;
    companion_personas: Record<string, unknown>;
    companion_messages: Record<string, unknown>;
    companion_stickers: Record<string, unknown>;
    advanced_chat_files: Record<string, unknown>;
  }
}

export async function ensureCompanionTables(db: Database) {
  await db.extend("companion_integrations", {
    id: { type: "integer", autoIncrement: true }, user_id: { type: "integer", nullable: false },
    name: { type: "string", nullable: false }, provider: { type: "string", initial: "onebot_v11" },
    base_url: { type: "string", nullable: false }, access_token: { type: "text", initial: "" },
    app_id: { type: "string", initial: "" }, app_secret: { type: "text", initial: "" },
    webhook_secret: { type: "string", nullable: false },
    enabled: { type: "boolean", initial: true }, default_persona_id: { type: "string", initial: "" },
    session_mode: { type: "string", initial: "per_chat" }, allow_image_input: { type: "boolean", initial: true },
    allow_image_output: { type: "boolean", initial: true }, typing_delay_ms: { type: "integer", initial: 500 },
    multiple_messages: { type: "boolean", initial: true }, max_messages: { type: "integer", initial: 3 },
    interrupt_mode: { type: "string", initial: "stop" },
    allowed_user_ids: { type: "string", initial: "[]" }, blocked_user_ids: { type: "string", initial: "[]" },
    allowed_group_ids: { type: "string", initial: "[]" }, blocked_group_ids: { type: "string", initial: "[]" },
    group_personas: { type: "string", initial: "{}" }, created_at: "timestamp", updated_at: "timestamp",
  }, { unique: [["user_id", "name"], "webhook_secret"] });
  await db.extend("companion_personas", {
    id: { type: "string", nullable: false }, user_id: { type: "integer", nullable: false },
    integration_id: { type: "integer", nullable: false }, name: { type: "string", nullable: false },
    assistant_agent_id: { type: "string", nullable: false }, base_agent_id: { type: "string", initial: "" },
    enabled: { type: "boolean", initial: true }, created_at: "timestamp", updated_at: "timestamp",
  }, { unique: [["integration_id", "name"]] });
  await db.extend("companion_messages", {
    id: { type: "integer", autoIncrement: true }, user_id: { type: "integer", nullable: false },
    integration_id: { type: "integer", nullable: false }, persona_id: { type: "string", initial: "" },
    external_chat_id: { type: "string", initial: "" }, external_user_id: { type: "string", initial: "" },
    external_message_id: { type: "string", initial: "" }, direction: { type: "string", nullable: false },
    status: { type: "string", initial: "ok" }, content: { type: "text", initial: "" },
    error: { type: "text", initial: "" }, created_at: "timestamp",
  });
  await db.extend("companion_stickers", {
    id: { type: "string", nullable: false }, user_id: { type: "integer", nullable: false },
    integration_id: { type: "integer", nullable: false }, external_chat_id: { type: "string", initial: "" },
    image_url: { type: "text", nullable: false }, file_id: { type: "string", initial: "" },
    category: { type: "string", initial: "inbox" }, name: { type: "string", initial: "" }, description: { type: "string", initial: "" },
    created_at: "timestamp", updated_at: "timestamp",
  });
}
