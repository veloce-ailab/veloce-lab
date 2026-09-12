// Tables owned by this plugin.
//
// The columns mirror the schema the Go implementation left behind, so a
// database created by it and one created here agree. `extend` is idempotent:
// it creates the table when it is missing and adds columns that are absent.
import type { Database } from "yumeri";

export async function ensureTables(db: Database): Promise<void> {
  await db.extend(
    "advanced_chat_connector_credentials",
    {
      id: { type: "string", nullable: false },
      user_id: { type: "integer", nullable: false },
      name: { type: "string", nullable: false },
      type: { type: "string", nullable: false },
      key: { type: "string", nullable: false },
      value: { type: "string", nullable: false },
      created_at: "timestamp",
      updated_at: "timestamp",
    },
  );
  await db.extend(
    "advanced_chat_connector_credential_bindings",
    {
      id: { type: "string", nullable: false },
      user_id: { type: "integer", nullable: false },
      device_id: { type: "string", nullable: false },
      credential_id: { type: "string", nullable: false },
      created_at: "timestamp",
    },
    { unique: [["device_id", "credential_id"]] },
  );
}
