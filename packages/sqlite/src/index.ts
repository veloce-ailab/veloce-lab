import { mkdir } from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { Context, Schema } from "yumeri";
import { SqlDatabase } from "@velocelab/database-core";

export interface SqliteConfig {
  path: string;
}

export const depend = ["velocelab-core"];
export const provide = ["database"];

export const config: Schema<SqliteConfig> = Schema.object({
  path: Schema.string("SQLite database path").default("./data/veloce.db"),
});

function sqliteParams(params: unknown[]): any[] {
  return params.map((value) => {
    if (typeof value === "boolean") return value ? 1 : 0;
    if (value instanceof Date) return value.toISOString();
    return value;
  });
}

export async function apply(ctx: Context, pluginConfig: SqliteConfig) {
  const file = path.resolve(pluginConfig.path);
  await mkdir(path.dirname(file), { recursive: true });

  const raw = new DatabaseSync(file, {
    enableForeignKeyConstraints: true,
  });

  const database = new SqlDatabase({
    dialect: "sqlite",
    async execute(sql, params = []) {
      const result = raw.prepare(sql).run(...sqliteParams(params));
      return {
        changes: Number(result.changes),
        insertId: result.lastInsertRowid,
      };
    },
    async one(sql, params = []) {
      return raw.prepare(sql).get(...sqliteParams(params)) as
        | Record<string, unknown>
        | undefined;
    },
    async many(sql, params = []) {
      return raw.prepare(sql).all(...sqliteParams(params)) as Record<
        string,
        unknown
      >[];
    },
    async close() {
      raw.close();
    },
  });

  ctx.registerComponent("database", database);
}
