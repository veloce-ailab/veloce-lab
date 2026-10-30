import type { DashboardContext } from "@velocelab/dashboard/frontend"; import MessageChannelsWorkspace from "./pages/MessageChannelsWorkspace"; import { MessageSquare } from "lucide-react";
export function apply(ctx: DashboardContext) { ctx.page({ frame: "settings", path: "/settings/message-channel", component: MessageChannelsWorkspace, minimumPermissionLevel: 10, nav: { id: "channel.settings", labelKey: "channel.settings", icon: MessageSquare, order: 80, minimumPermissionLevel: 10, scope: "settings", group: "chat" } }); }
export default apply
