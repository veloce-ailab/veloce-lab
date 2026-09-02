import { createPool, type Pool } from "mysql2/promise";
import { Context, Schema } from "yumeri";
import { SqlDatabase } from "@velocelab/database-core";

export interface MysqlConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}
export const depend = ["velocelab-core", "config"];
export const provide = ["database"];
export const config: Schema<MysqlConfig> = Schema.object({
  host: Schema.string("MySQL host").default("127.0.0.1"),
  port: Schema.number("MySQL port").default(3306),
  user: Schema.string("MySQL user").default("root"),
  password: Schema.string("MySQL password").default(""),
  database: Schema.string("MySQL database").default("veloce"),
});

async function withConnection<T>(
  pool: Pool,
  work: (connection: Awaited<ReturnType<Pool["getConnection"]>>) => Promise<T>,
) {
  const connection = await pool.getConnection();
  try {
    await connection.query(
      "SET SESSION sql_mode = CONCAT(@@sql_mode, ',ANSI_QUOTES')",
    );
    return await work(connection);
  } finally {
    connection.release();
  }
}

export async function apply(ctx: Context, pluginConfig: MysqlConfig) {
  const pool = createPool({ ...pluginConfig, waitForConnections: true });
  ctx.registerComponent(
    "database",
    new SqlDatabase({
      dialect: "mysql",
      async execute(sql, params = []) {
        return withConnection(pool, async (connection) => {
          const [result] = await connection.execute(sql, params as any[]);
          const data = result as { affectedRows?: number; insertId?: number };
          return { changes: data.affectedRows, insertId: data.insertId };
        });
      },
      async one(sql, params = []) {
        return withConnection(pool, async (connection) => {
          const [rows] = await connection.execute(sql, params as any[]);
          return (rows as Record<string, unknown>[])[0];
        });
      },
      async many(sql, params = []) {
        return withConnection(pool, async (connection) => {
          const [rows] = await connection.execute(sql, params as any[]);
          return rows as Record<string, unknown>[];
        });
      },
      async close() {
        await pool.end();
      },
    }),
  );
}
