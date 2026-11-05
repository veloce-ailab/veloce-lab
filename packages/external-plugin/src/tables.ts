// Tables owned by this plugin.
//
// Everything a plugin contributes is data here, never code that got registered
// somewhere. Enabling and disabling is a column, so a run picks up the current
// answer and nothing has to be unwound afterwards.
import type { Database } from "yumeri";

/**
 * Removes the per-column unique indexes an earlier build created.
 *
 * `unique` takes one entry per index, and a bare array of column names reads as
 * three separate indexes rather than one composite. Those columns are not unique
 * on their own — one marketplace holds many plugins — so every insert past the
 * first failed. `IF NOT EXISTS` never replaces an index, so they have to go
 * before the composite one is created.
 */
async function dropStaleIndexes(db: Database): Promise<void> {
  const stale: Array<[string, string]> = [
    ["external_plugin_marketplaces", "external_plugin_marketplaces_user_id_unique"],
    ["external_plugin_marketplaces", "external_plugin_marketplaces_url_unique"],
    ["external_plugins", "external_plugins_user_id_unique"],
    ["external_plugins", "external_plugins_marketplace_id_unique"],
    ["external_plugins", "external_plugins_slug_unique"],
  ];
  for (const [table, index] of stale) {
    // SQLite and PostgreSQL, then MySQL, which spells it differently and has no
    // IF EXISTS. Whichever the server understands runs; the other is a no-op.
    await db.run(`DROP INDEX IF EXISTS "${index}"`).catch(() => undefined);
    await db.run(`DROP INDEX "${index}" ON "${table}"`).catch(() => undefined);
  }
}

export async function ensureTables(db: Database): Promise<void> {
  await dropStaleIndexes(db);
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
    { unique: [["user_id", "url"]] },
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
      category: { type: "string", initial: "" },
      // Where to fetch a plugin that does not live in the marketplace repository
      // itself, as JSON. Empty for plugins that were readable at sync time.
      source: { type: "string", initial: "" },
      materialized: { type: "integer", initial: 0 },
      manifest_path: { type: "string", initial: "" },
      skills: { type: "string", initial: "[]" },
      mcp_servers: { type: "string", initial: "[]" },
      ignored: { type: "string", initial: "[]" },
      unsupported: { type: "string", initial: "[]" },
      enabled: { type: "integer", initial: 0 },
      created_at: "timestamp",
      updated_at: "timestamp",
    },
    { unique: [["user_id", "marketplace_id", "slug"]] },
  );
}
