import type { DashboardContext } from "@velocelab/dashboard/frontend"
import Setup from "./pages/Setup"
export function apply(ctx: DashboardContext) { ctx.route({ path: "/setup", component: Setup }) }
export default apply
