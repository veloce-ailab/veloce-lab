import type { DashboardContext } from "@velocelab/dashboard/frontend";
import { MessageCircleHeart } from "lucide-react";
import Companions from "./pages/Companions";
import CompanionList from "./pages/CompanionList";
import CompanionAdd from "./pages/CompanionAdd";
import CompanionLogs from "./pages/CompanionLogs";

export function apply(ctx: DashboardContext) {
  ctx.page({
    frame: "chat",
    path: "/chat/companions",
    component: CompanionList,
    nav: { id: "chat-companions", label: "聊天陪伴", icon: MessageCircleHeart, order: 25, scope: "chat", group: "agents" },
  });
  ctx.page({ frame: "chat", path: "/chat/companions/add", component: CompanionAdd, layout: "default" });
  ctx.page({ frame: "chat", path: "/chat/companions/:id", component: Companions, layout: "default" });
  ctx.page({ frame: "chat", path: "/chat/companions/:id/logs", component: CompanionLogs, layout: "default" });
}
export default apply;
