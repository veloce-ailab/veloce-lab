import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { Schema } from 'yumeri';
import { SqlDatabase } from '@velocelab/database-core';
export const depend = ['velocelab-core', 'config'];
export const provide = ['database'];
export const config = Schema.object({ path: Schema.string('SQLite database path').default('./data/veloce.db') });
export async function apply(ctx, pluginConfig) {
    const file = path.resolve(pluginConfig.path);
    await mkdir(path.dirname(file), { recursive: true });
    const raw = new DatabaseSync(file, { enableForeignKeyConstraints: true });
    ctx.registerComponent('database', new SqlDatabase({
        dialect: 'sqlite',
        async execute(sql, params = []) { const result = raw.prepare(sql).run(...params); return { changes: Number(result.changes), insertId: result.lastInsertRowid }; },
        async one(sql, params = []) { return raw.prepare(sql).get(...params); },
        async many(sql, params = []) { return raw.prepare(sql).all(...params); },
        async close() { raw.close(); },
    }));
}
