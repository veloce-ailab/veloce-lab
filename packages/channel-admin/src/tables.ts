// Tables owned by this plugin.
//
// The columns mirror the schema the Go implementation left behind, so a
// database created by it and one created here agree. `extend` is idempotent:
// it creates the table when it is missing and adds columns that are absent.
import type { Database } from "yumeri";

export async function ensureTables(db: Database): Promise<void> {
  await db.extend(
    "channels",
    {
      id: { type: "integer", autoIncrement: true },
      user_channel_id: "integer",
      name: "string",
      type: "string",
      base_url: "string",
      api_key: "string",
      plugin_config: "string",
      multiplier: { type: "decimal", initial: 1 },
      priority: { type: "integer", initial: 1 },
      weight: { type: "integer", initial: 1 },
      enabled: "boolean",
      price_sync_enabled: "boolean",
      price_sync_cron: "string",
      price_sync_last_at: "timestamp",
      consecutive_failures: { type: "integer", initial: 0 },
      last_failure_at: "timestamp",
      last_failure_reason: "string",
      auto_disabled_at: "timestamp",
      auto_disabled_reason: "string",
      last_health_checked_at: "timestamp",
      last_health_status: "string",
      created_at: "timestamp",
      updated_at: "timestamp",
    },
  );
  await db.extend(
    "model_configs",
    {
      id: { type: "integer", autoIncrement: true },
      channel_id: "integer",
      model_id: "integer",
      upstream_model_name: "string",
      input_price: { type: "decimal", initial: 0 },
      output_price: { type: "decimal", initial: 0 },
      enabled: "boolean",
      created_at: "timestamp",
      updated_at: "timestamp",
    },
  );
}
