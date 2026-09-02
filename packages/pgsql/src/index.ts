import { Pool } from "pg";
import { Context, Schema } from "yumeri";
import { SqlDatabase } from "@velocelab/database-core";

export interface PgsqlConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}
export const depend = ["velocelab-core", "config"];
export const provide = ["database"];
export const config: Schema<PgsqlConfig> = Schema.object({
  host: Schema.string("PostgreSQL host").default("127.0.0.1"),
  port: Schema.number("PostgreSQL port").default(5432),
  user: Schema.string("PostgreSQL user").default("postgres"),
  password: Schema.string("PostgreSQL password").default(""),
  database: Schema.string("PostgreSQL database").default("veloce"),
});

function placeholders(sql: string) {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
}

export async function apply(ctx: Context, pluginConfig: PgsqlConfig) {
  const pool = new Pool(pluginConfig);
  await pool.query("SELECT 1");
  ctx.registerComponent(
    "database",
    new SqlDatabase({
      dialect: "pgsql",
      async execute(sql, params = []) {
        const result = await pool.query(placeholders(sql), params);
        return { changes: result.rowCount ?? 0, insertId: undefined };
      },
      async one(sql, params = []) {
        const result = await pool.query(placeholders(sql), params);
        return result.rows[0] as Record<string, unknown> | undefined;
      },
      async many(sql, params = []) {
        const result = await pool.query(placeholders(sql), params);
        return result.rows as Record<string, unknown>[];
      },
      async close() {
        await pool.end();
      },
    }),
  );
}
