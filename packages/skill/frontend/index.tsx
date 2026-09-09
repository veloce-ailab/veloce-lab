import type { DashboardContext } from "@velocelab/dashboard/frontend"; import Skills from "./pages/Skills"; import { Sparkles } from "lucide-react";
export function apply(ctx: DashboardContext) { ctx.route({ path: "/chat/skills", component: Skills }); ctx.nav({ id: "chat-skills", label: "技能", path: "/chat/skills", icon: Sparkles, order: 30, scope: "chat", group: "agents" }); }
export default apply
