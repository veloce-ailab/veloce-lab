import type { DashboardContext } from "@velocelab/dashboard/frontend"; import Community from "./pages/Community";
export function apply(ctx: DashboardContext) { ctx.route({ path: "/community/*", component: Community }) }
export default apply
