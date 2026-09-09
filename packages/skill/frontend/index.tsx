import type { DashboardContext } from "@velocelab/dashboard/frontend"; import Skills from "./pages/Skills";
export function apply(ctx: DashboardContext) { ctx.route({ path: "/chat/skills", component: Skills, protected: true }) }
