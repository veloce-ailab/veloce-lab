import { randomUUID } from "node:crypto";
import { Context, Database, Session } from "yumeri";
import "@velocelab/dashboard";
import "@velocelab/advanced-chat";
export const depend = ["dashboard", "advanced-chat", "database"];
export const provide = ["skill"];
export interface SkillDefinition { id: string; name: string; description: string; content: string; enabled: boolean; }
export interface SkillService { list(userId: number): Promise<SkillDefinition[]>; register(skill: SkillDefinition): () => void; }
declare module "yumeri" { interface Components { skill: SkillService; } }
export function apply(ctx: Context) {
  ctx.component.dashboard.addEntry({ dev: new URL("../frontend/index.tsx", import.meta.url).pathname, prod: new URL("../frontend/skill.js", import.meta.url).pathname, plugin: "skill" });
  const skills: SkillDefinition[] = [];
  const db = ctx.component.database as Database;
  const service: SkillService = { list: async (userId) => userId ? [...skills.filter((skill) => skill.enabled), ...(await db.select("advanced_chat_packaged_skills", { user_id: userId, enabled: true })).map((row: any) => ({ id: String(row.id), name: String(row.name), description: String(row.description ?? ""), content: String(row.metadata_json ?? ""), enabled: true }))] : [], register(skill) { skills.push(skill); return () => { const index = skills.indexOf(skill); if (index >= 0) skills.splice(index, 1); }; } };
  ctx.registerComponent("skill", service);
  const chat = ctx.component["advanced-chat"];
  chat.registerContextProvider({ id: "skill", provide: async ({ userId }) => { const enabled = await service.list(userId); return enabled.length ? `Enabled skills:\n${enabled.map(skill => `- ${skill.name}: ${skill.description}`).join("\n")}` : undefined; } });
  chat.registerTool({ name: "skill_list", description: "List enabled skills", parameters: { type: "object", properties: {} }, execute: (_input, context) => service.list(context.userId) });
  const user = (s: Session) => Number((s.properties.user as any)?.id ?? 0);
  ctx.route("/api/user/advanced-chat/skills").methods("GET").action(async s => { const id = user(s); if (id) s.respond(await service.list(id), "json"); });
  ctx.route("/api/user/advanced-chat/skills").methods("POST").action(async s => { const id = user(s); if (!id) return; const input = await s.parseRequestBody() as any; const now = new Date().toISOString(); const row = await db.create("advanced_chat_packaged_skills", { id: randomUUID(), user_id: id, package_id: "", name: String(input.name ?? "Skill"), description: String(input.description ?? ""), source: "user", skill_path: "", root_path: "", metadata_json: JSON.stringify({ content: input.content ?? "" }), allowed_tools: "[]", compatibility: "{}", enabled: input.enabled !== false, size: Buffer.byteLength(String(input.content ?? "")), hash: "", created_at: now, updated_at: now } as any); s.status = 201; s.respond(row, "json"); });
  ctx.route("/api/user/advanced-chat/skills/:id").methods("DELETE").action(async (s, _p, skillId) => { const id = user(s); if (id) { await db.remove("advanced_chat_packaged_skills", { id: skillId, user_id: id }); s.respond({ success: true }, "json"); } });
}
