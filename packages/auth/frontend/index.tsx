import type { DashboardContext } from "@velocelab/dashboard/frontend"
import Login from "./pages/Login"
export function apply(ctx: DashboardContext) { ctx.route({ path: "/login", component: Login }) }
export default apply
