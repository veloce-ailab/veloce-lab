// Tables owned by this plugin.
//
// The columns mirror the schema the Go implementation left behind, so a
// database created by it and one created here agree. `extend` is idempotent:
// it creates the table when it is missing and adds columns that are absent.
import type { Database } from "yumeri";

export async function ensureTables(db: Database): Promise<void> {
  await db.extend(
    "advanced_chat_mcp_servers",
    {
      id: { type: "string", nullable: false },
      user_id: { type: "integer", nullable: false },
      name: { type: "string", nullable: false },
      transport: { type: "string", initial: "stdio" },
      command: "string",
      args: { type: "string", initial: "[]" },
      env: { type: "string", initial: "{}" },
      url: "string",
      enabled: "boolean",
      created_at: "timestamp",
      updated_at: "timestamp",
    },
    { unique: [["user_id", "name"]] },
  );
}
