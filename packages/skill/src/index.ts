import { Context } from "yumeri";
export const depend: string[] = [];
export const provide = ["skill"];
export interface SkillDefinition { id: string; name: string; description: string; content: string; enabled: boolean; }
export interface SkillService { list(userId: number): Promise<SkillDefinition[]>; register(skill: SkillDefinition): () => void; }
declare module "yumeri" { interface Components { skill: SkillService; } }
export function apply(ctx: Context) {
  const skills: SkillDefinition[] = [];
  const service: SkillService = { list: async (userId) => userId ? skills.filter((skill) => skill.enabled) : [], register(skill) { skills.push(skill); return () => { const index = skills.indexOf(skill); if (index >= 0) skills.splice(index, 1); }; } };
  ctx.registerComponent("skill", service);
}
