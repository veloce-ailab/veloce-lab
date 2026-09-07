import { randomUUID } from "node:crypto";
import { Context, Database, Schema, Session } from "yumeri";
import "@velocelab/dashboard";
export const depend = ["database", "dashboard"];
export const provide = ["knowledge"];
export interface KnowledgeService { list(userId: number): Promise<any[]>; create(userId: number, input: Record<string, unknown>): Promise<any>; documents(userId: number, baseId: string): Promise<any[]>; }
export const config: Schema<{ enabled: boolean }> = Schema.object({ enabled: Schema.boolean("Enable knowledge bases").default(true) });
declare module "yumeri" { interface Components { knowledge: KnowledgeService; } }
export function apply(ctx: Context, cfg: { enabled: boolean }) {
  ctx.component.dashboard.addEntry({ dev: new URL("../frontend/index.tsx", import.meta.url).pathname, prod: new URL("../frontend/knowledge.js", import.meta.url).pathname, plugin: "knowledge" });
  const db = ctx.component.database as Database;
  const service: KnowledgeService = { list: (userId) => db.select("advanced_chat_knowledge_bases", { user_id: userId }), create: (userId, input) => db.create("advanced_chat_knowledge_bases", { id: randomUUID(), user_id: userId, name: String(input.name ?? "Untitled"), description: String(input.description ?? ""), embedding_model_name: String(input.embedding_model_name ?? ""), embedding_user_channel_id: Number(input.embedding_user_channel_id ?? 0), created_at: new Date().toISOString(), updated_at: new Date().toISOString() } as any), documents: (userId, baseId) => db.select("advanced_chat_knowledge_documents", { user_id: userId, knowledge_base_id: baseId }) };
  ctx.registerComponent("knowledge", service);
  const user = (s: Session) => (s.properties.user as any)?.id as number | undefined;
  ctx.route("/api/user/advanced-chat/knowledge-bases").methods("GET").action(async s => { const id = user(s); if (id) s.respond(await service.list(id), "json"); });
  ctx.route("/api/user/advanced-chat/knowledge-bases").methods("POST").action(async s => { const id = user(s); if (!id) return; s.status = 201; s.respond(await service.create(id, await s.parseRequestBody() as any), "json"); });
  ctx.route("/api/user/advanced-chat/knowledge-bases/:id/documents").methods("GET").action(async (s, _p, baseId) => { const id = user(s); if (id) s.respond(await service.documents(id, baseId), "json"); });
  ctx.route("/api/user/advanced-chat/knowledge-bases/:id").methods("PUT").action(async (s, _p, baseId) => { const id = user(s); if (!id) return; const input = await s.parseRequestBody() as any; await db.update("advanced_chat_knowledge_bases", { id: baseId, user_id: id }, { name: String(input.name ?? ""), description: String(input.description ?? ""), updated_at: new Date().toISOString() }); s.respond(await db.selectOne("advanced_chat_knowledge_bases", { id: baseId, user_id: id }), "json"); });
  ctx.route("/api/user/advanced-chat/knowledge-bases/:id").methods("DELETE").action(async (s, _p, baseId) => { const id = user(s); if (id) { await db.remove("advanced_chat_knowledge_bases", { id: baseId, user_id: id }); s.respond({ success: true }, "json"); } });
  ctx.route("/api/user/advanced-chat/knowledge-bases/:id/search").methods("POST").action(async (s, _p, baseId) => { const id = user(s); if (!id) return; const input = await s.parseRequestBody() as any; const query = String(input.query ?? "").toLowerCase(); const rows = await service.documents(id, baseId); s.respond(rows.filter((row: any) => String(row.name ?? "").toLowerCase().includes(query)), "json"); });
}

