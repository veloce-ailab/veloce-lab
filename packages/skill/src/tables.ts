// Tables owned by this plugin.
//
// The columns mirror the schema the Go implementation left behind, so a
// database created by it and one created here agree. `extend` is idempotent:
// it creates the table when it is missing and adds columns that are absent.
import type { Database } from "yumeri";

export async function ensureTables(db: Database): Promise<void> {
  await db.extend(
    "advanced_chat_skill_packages",
    {
      id: { type: "string", nullable: false },
      user_id: { type: "integer", nullable: false },
      name: { type: "string", nullable: false },
      source_name: { type: "string", nullable: false },
      storage_path: { type: "string", nullable: false },
      size: { type: "bigint", nullable: false },
      file_count: { type: "integer", nullable: false },
      hash: { type: "string", nullable: false },
      status: { type: "string", nullable: false },
      error_text: { type: "string", initial: "" },
      created_at: "timestamp",
      updated_at: "timestamp",
    },
  );
  await db.extend(
    "advanced_chat_packaged_skills",
    {
      id: { type: "string", nullable: false },
      user_id: { type: "integer", nullable: false },
      package_id: { type: "string", nullable: false },
      name: { type: "string", nullable: false },
      description: { type: "string", initial: "" },
      source: { type: "string", nullable: false },
      skill_path: { type: "string", nullable: false },
      root_path: { type: "string", nullable: false },
      metadata_json: { type: "string", initial: "{}" },
      allowed_tools: { type: "string", initial: "[]" },
      compatibility: { type: "string", initial: "{}" },
      enabled: "boolean",
      size: { type: "bigint", nullable: false },
      hash: { type: "string", nullable: false },
      created_at: "timestamp",
      updated_at: "timestamp",
    },
  );
}
