// Tables owned by this plugin.
//
// The columns mirror the schema the Go implementation left behind, so a
// database created by it and one created here agree. `extend` is idempotent:
// it creates the table when it is missing and adds columns that are absent.
import type { Database } from "yumeri";

export async function ensureTables(db: Database): Promise<void> {
  await db.extend(
    "advanced_chat_scheduled_tasks",
    {
      id: { type: "string", nullable: false },
      user_id: { type: "integer", nullable: false },
      name: { type: "string", nullable: false },
      description: { type: "string", initial: "" },
      agent_id: "string",
      schedule_type: { type: "string", nullable: false },
      run_at: "timestamp",
      interval_seconds: { type: "integer", initial: 0 },
      session_mode: { type: "string", nullable: false },
      session_id: "string",
      auto_delete_session: "boolean",
      message: { type: "string", nullable: false },
      timeout_seconds: { type: "integer", initial: 300 },
      delivery_id: "string",
      model_name: "string",
      user_channel_id: "integer",
      max_tokens: { type: "integer", initial: 0 },
      temperature: "float",
      reasoning_effort: "string",
      enabled: "boolean",
      last_run_at: "timestamp",
      next_run_at: "timestamp",
      last_run_id: "string",
      last_status: { type: "string", initial: "idle" },
      last_error: { type: "string", initial: "" },
      created_at: "timestamp",
      updated_at: "timestamp",
    },
  );
}
