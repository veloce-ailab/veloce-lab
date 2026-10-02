import type { DashboardContext } from "@velocelab/dashboard/frontend";
import { MessageCircleHeart } from "lucide-react";
import Companions from "./pages/Companions";

export function apply(ctx: DashboardContext) {
  ctx.page({
    frame: "chat",
    path: "/chat/companions",
    component: Companions,
    layout: "full",
    nav: { id: "chat-companions", label: "聊天陪伴", icon: MessageCircleHeart, order: 25, scope: "chat", group: "agents" },
  });
}
export default apply;
