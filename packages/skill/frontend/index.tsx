import type { DashboardContext } from "@velocelab/dashboard/frontend"; import Skills from "./pages/Skills"; import { Sparkles } from "lucide-react";
export function apply(ctx: DashboardContext) { ctx.page({ frame: "chat", path: "/chat/skills", component: Skills, nav: { id: "chat-skills", label: "技能", icon: Sparkles, order: 30, scope: "chat", group: "agents" } }); }
export default apply
