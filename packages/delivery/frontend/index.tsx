import type { DashboardContext } from "@velocelab/dashboard/frontend"; import AdvancedChatDeliveries from "./pages/AdvancedChatDeliveries"; import { Send } from "lucide-react";
export function apply(ctx: DashboardContext) { ctx.route({ path: "/chat/deliveries", component: AdvancedChatDeliveries }); ctx.nav({ id: "chat-deliveries", label: "结果投递", path: "/chat/deliveries", icon: Send, order: 10, scope: "chat", group: "workflow" }); }
export default apply
