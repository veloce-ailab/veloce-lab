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
export const depend: string[] = [];
export const provide = ["database"];
export const config: Schema<PgsqlConfig> = Schema.object({
  host: Schema.string("PostgreSQL host").key("pgsql.config.host").default("127.0.0.1"),
  port: Schema.number("PostgreSQL port").key("pgsql.config.port").default(5432),
  user: Schema.string("PostgreSQL user").key("pgsql.config.user").default("postgres"),
  password: Schema.string("PostgreSQL password").key("pgsql.config.password").default(""),
  database: Schema.string("PostgreSQL database").key("pgsql.config.database").default("veloce"),
});

function placeholders(sql: string) {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
}

export async function apply(ctx: Context, pluginConfig: PgsqlConfig) {
  ctx.i18n({ pgsql: { config: { host: { zh: "PostgreSQL 主机", en: "PostgreSQL host", ja: "PostgreSQL ホスト" }, port: { zh: "PostgreSQL 端口", en: "PostgreSQL port", ja: "PostgreSQL ポート" }, user: { zh: "PostgreSQL 用户", en: "PostgreSQL user", ja: "PostgreSQL ユーザー" }, password: { zh: "PostgreSQL 密码", en: "PostgreSQL password", ja: "PostgreSQL パスワード" }, database: { zh: "PostgreSQL 数据库", en: "PostgreSQL database", ja: "PostgreSQL データベース" } } } });
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
