import { Context } from "yumeri";
import "@velocelab/dashboard";
import "@velocelab/advanced-chat";
export const depend = ["dashboard", "advanced-chat"];
export const provide = ["skill"];
export interface SkillDefinition { id: string; name: string; description: string; content: string; enabled: boolean; }
export interface SkillService { list(userId: number): Promise<SkillDefinition[]>; register(skill: SkillDefinition): () => void; }
declare module "yumeri" { interface Components { skill: SkillService; } }
export function apply(ctx: Context) {
  ctx.component.dashboard.addEntry({ dev: new URL("../frontend/index.tsx", import.meta.url).pathname, prod: new URL("../frontend/skill.js", import.meta.url).pathname, plugin: "skill" });
  const skills: SkillDefinition[] = [];
  const service: SkillService = { list: async (userId) => userId ? skills.filter((skill) => skill.enabled) : [], register(skill) { skills.push(skill); return () => { const index = skills.indexOf(skill); if (index >= 0) skills.splice(index, 1); }; } };
  ctx.registerComponent("skill", service);
  const chat = ctx.component["advanced-chat"];
  chat.registerContextProvider({ id: "skill", provide: async ({ userId }) => { const enabled = await service.list(userId); return enabled.length ? `Enabled skills:\n${enabled.map(skill => `- ${skill.name}: ${skill.description}`).join("\n")}` : undefined; } });
  chat.registerTool({ name: "skill_list", description: "List enabled skills", parameters: { type: "object", properties: {} }, execute: (_input, context) => service.list(context.userId) });
}
