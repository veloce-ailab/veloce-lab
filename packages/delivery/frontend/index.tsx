import type { DashboardContext } from "@velocelab/dashboard/frontend"; import AdvancedChatDeliveries from "./pages/AdvancedChatDeliveries"; import { Send } from "lucide-react";
export function apply(ctx: DashboardContext) { ctx.page({ frame: "chat", path: "/chat/deliveries", component: AdvancedChatDeliveries, nav: { id: "chat-deliveries", label: "结果投递", icon: Send, order: 10, scope: "chat", group: "workflow" } }); }
export default apply
