import { createPool } from "mysql2/promise";
import { Schema } from "yumeri";
import { SqlDatabase } from "@velocelab/database-core";
export const depend = ["velocelab-core"];
export const provide = ["database"];
export const config = Schema.object({
    host: Schema.string("MySQL host").default("127.0.0.1"),
    port: Schema.number("MySQL port").default(3306),
    user: Schema.string("MySQL user").default("root"),
    password: Schema.string("MySQL password").default(""),
    database: Schema.string("MySQL database").default("veloce"),
});
async function withConnection(pool, work) {
    const connection = await pool.getConnection();
    try {
        await connection.query("SET SESSION sql_mode = CONCAT(@@sql_mode, ',ANSI_QUOTES')");
        return await work(connection);
    }
    finally {
        connection.release();
    }
}
export async function apply(ctx, pluginConfig) {
    const pool = createPool({ ...pluginConfig, waitForConnections: true });
    ctx.registerComponent("database", new SqlDatabase({
        dialect: "mysql",
        async execute(sql, params = []) {
            return withConnection(pool, async (connection) => {
                const [result] = await connection.execute(sql, params);
                const data = result;
                return { changes: data.affectedRows, insertId: data.insertId };
            });
        },
        async one(sql, params = []) {
            return withConnection(pool, async (connection) => {
                const [rows] = await connection.execute(sql, params);
                return rows[0];
            });
        },
        async many(sql, params = []) {
            return withConnection(pool, async (connection) => {
                const [rows] = await connection.execute(sql, params);
                return rows;
            });
        },
        async close() {
            await pool.end();
        },
    }));
}
