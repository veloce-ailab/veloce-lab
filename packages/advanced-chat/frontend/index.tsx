import AdvancedChat from "./pages/AdvancedChat";
import AdvancedChatManagement from "./pages/AdvancedChatManagement";
import type { DashboardContext } from "@velocelab/dashboard/frontend";
import { MessageSquare } from "lucide-react";
import ConnectorCredentials from "./pages/ConnectorCredentials";

export function apply(ctx: DashboardContext) {
  ctx.route({ path: "/chat/*", component: AdvancedChat, protected: true });
  ctx.route({ path: "/settings/chat", component: AdvancedChatManagement, protected: true });
  ctx.nav({ id: "advanced-chat", label: "聊天", path: "/chat", icon: MessageSquare, order: 10 });
  ctx.route({ path: "/settings/credentials", component: ConnectorCredentials, protected: true });
}
