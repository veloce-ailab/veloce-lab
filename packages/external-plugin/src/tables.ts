// Tables owned by this plugin.
//
// Everything a plugin contributes is data here, never code that got registered
// somewhere. Enabling and disabling is a column, so a run picks up the current
// answer and nothing has to be unwound afterwards.
import type { Database } from "yumeri";

export async function ensureTables(db: Database): Promise<void> {
  await db.extend(
    "external_plugin_marketplaces",
    {
      id: { type: "string", nullable: false },
      user_id: { type: "integer", nullable: false },
      url: { type: "string", nullable: false },
      name: { type: "string", initial: "" },
      /** Where the checkout lives, relative to the plugin's data root. */
      directory: { type: "string", nullable: false },
      revision: { type: "string", initial: "" },
      synced_at: { type: "string", initial: "" },
      error_text: { type: "string", initial: "" },
      created_at: "timestamp",
      updated_at: "timestamp",
    },
    { unique: ["user_id", "url"] },
  );
  await db.extend(
    "external_plugins",
    {
      id: { type: "string", nullable: false },
      user_id: { type: "integer", nullable: false },
      marketplace_id: { type: "string", nullable: false },
      /** Directory name in the repository; stable across syncs. */
      slug: { type: "string", nullable: false },
      name: { type: "string", initial: "" },
      version: { type: "string", initial: "" },
      description: { type: "string", initial: "" },
      author: { type: "string", initial: "" },
      homepage: { type: "string", initial: "" },
      license: { type: "string", initial: "" },
      manifest_path: { type: "string", initial: "" },
      skills: { type: "string", initial: "[]" },
      mcp_servers: { type: "string", initial: "[]" },
      ignored: { type: "string", initial: "[]" },
      unsupported: { type: "string", initial: "[]" },
      enabled: { type: "integer", initial: 0 },
      created_at: "timestamp",
      updated_at: "timestamp",
    },
    { unique: ["user_id", "marketplace_id", "slug"] },
  );
}
