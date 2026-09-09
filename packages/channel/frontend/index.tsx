import type { DashboardContext } from "@velocelab/dashboard/frontend"; import MessageChannelsWorkspace from "./pages/MessageChannelsWorkspace";
export function apply(ctx: DashboardContext) { ctx.route({ path: "/settings/message-channel", component: MessageChannelsWorkspace }) }
export default apply
