import type { DashboardContext } from "@velocelab/dashboard/frontend"; import AdvancedChatDevices from "./pages/AdvancedChatDevices";
export function apply(ctx: DashboardContext) { ctx.route({ path: "/chat/devices", component: AdvancedChatDevices }) }
export default apply
