import AdvancedChat from "./pages/AdvancedChat";
import AdvancedChatManagement from "./pages/AdvancedChatManagement";
import type { DashboardContext } from "@velocelab/dashboard/frontend";
import { MessageSquare } from "lucide-react";
import ConnectorCredentials from "./pages/ConnectorCredentials";

export function apply(ctx: DashboardContext) {
  ctx.route({ path: "/chat/*", component: AdvancedChat, shell: "owned" });
  ctx.route({ path: "/settings/chat", component: AdvancedChatManagement });
  ctx.nav({ id: "advanced-chat", label: "聊天", path: "/chat", icon: MessageSquare, order: 10 });
  ctx.nav({ id: "advanced-chat-settings", label: "聊天设置", path: "/settings/chat", icon: MessageSquare, order: 10, scope: "settings", group: "chat" });
  ctx.nav({ id: "advanced-chat-credentials", label: "凭据管理", path: "/settings/credentials", icon: MessageSquare, order: 20, scope: "settings", group: "chat" });
  ctx.route({ path: "/settings/credentials", component: ConnectorCredentials });
}

export default apply;
