// Tables owned by this plugin.
//
// The columns mirror the schema the Go implementation left behind, so a
// database created by it and one created here agree. `extend` is idempotent:
// it creates the table when it is missing and adds columns that are absent.
import type { Database } from "yumeri";

export async function ensureTables(db: Database): Promise<void> {
  await db.extend(
    "advanced_chat_workspaces",
    {
      id: { type: "string", nullable: false },
      user_id: { type: "integer", nullable: false },
      name: { type: "string", nullable: false },
      location: { type: "string", initial: "server" },
      device_id: { type: "string", initial: "" },
      path: { type: "string", nullable: false },
      model: { type: "string", initial: "" },
      agent: { type: "string", initial: "" },
      created_at: "timestamp",
      updated_at: "timestamp",
    },
  );
  await db.extend(
    "advanced_chat_workspace_files",
    {
      id: { type: "string", nullable: false },
      workspace_id: { type: "string", nullable: false },
      user_id: { type: "integer", nullable: false },
      name: { type: "string", nullable: false },
      content: { type: "string", nullable: false },
      storage_path: { type: "string", initial: "" },
      created_at: "timestamp",
      updated_at: "timestamp",
    },
    { unique: [["workspace_id", "name"]] },
  );
}
