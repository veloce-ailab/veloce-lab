import { randomUUID } from "node:crypto"; import { Context, Database, Session } from "yumeri"; import "@velocelab/dashboard";
export const depend = ["database", "dashboard"]; export const provide = ["memory"];
export function apply(ctx: Context) {
  ctx.component.dashboard.addEntry({ dev: new URL("../frontend/index.tsx", import.meta.url).pathname, prod: new URL("../frontend/memory.js", import.meta.url).pathname, plugin: "memory" });
  const db = ctx.component.database as Database;
  const user = (s: Session) => Number((s.properties.user as { id?: number } | undefined)?.id ?? 0);
  ctx.route("/api/advanced-chat/memories").methods("GET").action(async s => { const id = user(s); if (id) s.respond(await db.select("advanced_chat_memory_documents", { user_id: id }), "json"); });
  ctx.route("/api/advanced-chat/memories").methods("POST").action(async s => { const id = user(s); if (!id) return; const input = await s.parseRequestBody() as any; const now = new Date().toISOString(); const value = await db.create("advanced_chat_memory_documents", { id: randomUUID(), user_id: id, scope: String(input.scope ?? "global"), agent_id: String(input.agent_id ?? ""), group_id: String(input.group_id ?? ""), kind: String(input.kind ?? "facts"), title: String(input.title ?? ""), storage_path: "", size: 0, hash: "", enabled: input.enabled !== false, updated_by: "user", created_at: now, updated_at: now } as any); s.status = 201; s.respond(value, "json"); });
  ctx.route("/api/advanced-chat/memories/:id").methods("DELETE").action(async (s, _p, id) => { const uid = user(s); if (uid) { await db.remove("advanced_chat_memory_documents", { id, user_id: uid }); s.respond({ success: true }, "json"); } });
}
