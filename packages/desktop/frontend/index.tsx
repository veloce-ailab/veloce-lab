import type { DashboardContext } from "@velocelab/dashboard/frontend"; import DesktopNotifications from "./pages/DesktopNotifications";
export function apply(ctx: DashboardContext) { ctx.route({ path: "/settings/notifications", component: DesktopNotifications }) }
export default apply
