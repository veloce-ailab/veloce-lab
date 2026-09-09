import type { DashboardContext } from "@velocelab/dashboard/frontend"; import AdvancedChatMCP from "./pages/AdvancedChatMCP";
export function apply(ctx: DashboardContext) { ctx.route({ path: "/chat/mcp", component: AdvancedChatMCP }) }
export default apply
