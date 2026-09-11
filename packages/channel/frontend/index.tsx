import type { DashboardContext } from "@velocelab/dashboard/frontend"; import MessageChannelsWorkspace from "./pages/MessageChannelsWorkspace"; import { MessageSquare } from "lucide-react";
export function apply(ctx: DashboardContext) { ctx.page({ frame: "settings", path: "/settings/message-channel", component: MessageChannelsWorkspace, nav: { id: "channel.settings", labelKey: "channel.settings", icon: MessageSquare, order: 80, scope: "settings", group: "system" } }); }
export default apply
