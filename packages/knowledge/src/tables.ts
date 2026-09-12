// Tables owned by this plugin.
//
// The columns mirror the schema the Go implementation left behind, so a
// database created by it and one created here agree. `extend` is idempotent:
// it creates the table when it is missing and adds columns that are absent.
import type { Database } from "yumeri";

export async function ensureTables(db: Database): Promise<void> {
  await db.extend(
    "advanced_chat_knowledge_bases",
    {
      id: { type: "string", nullable: false },
      user_id: { type: "integer", nullable: false },
      name: { type: "string", nullable: false },
      description: { type: "string", initial: "" },
      embedding_model_name: { type: "string", initial: "" },
      embedding_user_channel_id: { type: "integer", initial: 0 },
      created_at: "timestamp",
      updated_at: "timestamp",
    },
    { unique: [["user_id", "name"]] },
  );
  await db.extend(
    "advanced_chat_knowledge_documents",
    {
      id: { type: "string", nullable: false },
      knowledge_base_id: { type: "string", nullable: false },
      user_id: { type: "integer", nullable: false },
      file_id: { type: "string", nullable: false },
      name: { type: "string", nullable: false },
      mime_type: { type: "string", nullable: false },
      size: { type: "bigint", nullable: false },
      text_available: "boolean",
      embedding_status: { type: "string", initial: "pending" },
      embedding_error: { type: "string", initial: "" },
      embedding_model: { type: "string", initial: "" },
      embedding_dim: { type: "integer", initial: 0 },
      chunk_count: { type: "integer", initial: 0 },
      embedded_at: "timestamp",
      created_at: "timestamp",
      updated_at: "timestamp",
      storage_path: "string",
      hash: "string",
    },
    { unique: [["file_id"]] },
  );
  await db.extend(
    "advanced_chat_knowledge_chunks",
    {
      id: { type: "string", nullable: false },
      knowledge_base_id: { type: "string", nullable: false },
      document_id: { type: "string", nullable: false },
      user_id: { type: "integer", nullable: false },
      ordinal: { type: "integer", nullable: false },
      content: { type: "string", nullable: false },
      content_hash: { type: "string", nullable: false },
      embedding: { type: "string", nullable: false },
      embedding_model: { type: "string", nullable: false },
      embedding_dim: { type: "integer", nullable: false },
      created_at: "timestamp",
      updated_at: "timestamp",
    },
  );
}
