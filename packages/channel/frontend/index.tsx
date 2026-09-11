import type { DashboardContext } from "@velocelab/dashboard/frontend"; import MessageChannelsWorkspace from "./pages/MessageChannelsWorkspace"; import { MessageSquare } from "lucide-react";
export function apply(ctx: DashboardContext) { ctx.page({ frame: "settings", path: "/settings/message-channel", component: MessageChannelsWorkspace, nav: { id: "message-channel-settings", label: "消息通道", icon: MessageSquare, order: 80, scope: "settings", group: "system" } }); }
export default apply
