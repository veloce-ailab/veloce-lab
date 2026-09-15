// Tables owned by this plugin.
//
// The columns mirror the schema the Go implementation left behind, so a
// database created by it and one created here agree. `extend` is idempotent:
// it creates the table when it is missing and adds columns that are absent.
import type { Database } from "yumeri";

export async function ensureTables(db: Database): Promise<void> {
  await db.extend(
    "advanced_chat_deliveries",
    {
      id: { type: "string", nullable: false },
      user_id: { type: "integer", nullable: false },
      name: { type: "string", nullable: false },
      description: { type: "string", initial: "" },
      method: { type: "string", nullable: false },
      webhook_url: { type: "string", initial: "" },
      webhook_headers: { type: "string", initial: "{}" },
      email_to: "string",
      smtp_host: "string",
      smtp_port: "string",
      smtp_username: "string",
      smtp_password: "string",
      smtp_from: "string",
      enabled: "boolean",
      created_at: "timestamp",
      updated_at: "timestamp",
    },
  );
}
