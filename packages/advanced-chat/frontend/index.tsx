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
  ctx.nav({ id: "chat-groups", label: "聊天群组", path: "/chat/groups", icon: MessageSquare, order: 20, scope: "chat", group: "direct" });
  ctx.nav({ id: "chat-agents", label: "代理", path: "/chat/agents", icon: MessageSquare, order: 10, scope: "chat", group: "agents" });
  ctx.nav({ id: "chat-agent-groups", label: "工作室", path: "/chat/agent-groups", icon: MessageSquare, order: 40, scope: "chat", group: "agents" });
}

export default apply;
