// Tables owned by this plugin.
//
// The columns mirror the schema the Go implementation left behind, so a
// database created by it and one created here agree. `extend` is idempotent:
// it creates the table when it is missing and adds columns that are absent.
import type { Database } from "yumeri";

export async function ensureTables(db: Database): Promise<void> {
  await db.extend(
    "advanced_chat_memory_documents",
    {
      id: { type: "string", nullable: false },
      user_id: { type: "integer", nullable: false },
      scope: { type: "string", nullable: false },
      agent_id: { type: "string", initial: "" },
      group_id: { type: "string", initial: "" },
      kind: { type: "string", nullable: false },
      title: { type: "string", nullable: false },
      storage_path: { type: "string", nullable: false },
      size: { type: "bigint", nullable: false },
      hash: { type: "string", nullable: false },
      enabled: "boolean",
      updated_by: { type: "string", initial: "user" },
      created_at: "timestamp",
      updated_at: "timestamp",
    },
    { unique: [["user_id", "scope", "agent_id", "kind"]] },
  );
}
