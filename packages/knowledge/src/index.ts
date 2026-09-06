import { randomUUID } from "node:crypto";
import { Context, Database, Schema, Session } from "yumeri";
export const depend = ["database"];
export const provide = ["knowledge"];
export interface KnowledgeService { list(userId: number): Promise<any[]>; create(userId: number, input: Record<string, unknown>): Promise<any>; documents(userId: number, baseId: string): Promise<any[]>; }
export const config: Schema<{ enabled: boolean }> = Schema.object({ enabled: Schema.boolean("Enable knowledge bases").default(true) });
declare module "yumeri" { interface Components { knowledge: KnowledgeService; } }
export function apply(ctx: Context, cfg: { enabled: boolean }) {
  const db = ctx.component.database as Database;
  const service: KnowledgeService = { list: (userId) => db.select("advanced_chat_knowledge_bases", { user_id: userId }), create: (userId, input) => db.create("advanced_chat_knowledge_bases", { id: randomUUID(), user_id: userId, name: String(input.name ?? "Untitled"), description: String(input.description ?? ""), embedding_model_name: String(input.embedding_model_name ?? ""), embedding_user_channel_id: Number(input.embedding_user_channel_id ?? 0), created_at: new Date().toISOString(), updated_at: new Date().toISOString() } as any), documents: (userId, baseId) => db.select("advanced_chat_knowledge_documents", { user_id: userId, knowledge_base_id: baseId }) };
  ctx.registerComponent("knowledge", service);
  const user = (s: Session) => (s.properties.user as any)?.id as number | undefined;
  ctx.route("/api/user/advanced-chat/knowledge-bases").methods("GET").action(async s => { const id = user(s); if (id) s.respond(await service.list(id), "json"); });
  ctx.route("/api/user/advanced-chat/knowledge-bases").methods("POST").action(async s => { const id = user(s); if (!id) return; s.status = 201; s.respond(await service.create(id, await s.parseRequestBody() as any), "json"); });
  ctx.route("/api/user/advanced-chat/knowledge-bases/:id/documents").methods("GET").action(async (s, _p, baseId) => { const id = user(s); if (id) s.respond(await service.documents(id, baseId), "json"); });
}

