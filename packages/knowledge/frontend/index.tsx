import type { DashboardContext } from "@velocelab/dashboard/frontend"; import KnowledgeBases from "./pages/KnowledgeBases";
export function apply(ctx: DashboardContext) { ctx.route({ path: "/chat/knowledge", component: KnowledgeBases }) }
export default apply
