import type { DashboardContext } from "@velocelab/dashboard/frontend"; import AdvancedChatMemories from "./pages/AdvancedChatMemories";
export function apply(ctx: DashboardContext) { ctx.route({ path: "/chat/memories", component: AdvancedChatMemories }) }
export default apply
