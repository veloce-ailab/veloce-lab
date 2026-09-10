import AdvancedChat from "./pages/AdvancedChat";
import AdvancedChatManagement from "./pages/AdvancedChatManagement";
import { Navigate, SettingsPage, type DashboardContext } from "@velocelab/dashboard/frontend";
import { Bot, MessageSquare } from "lucide-react";
import ConnectorCredentials from "./pages/ConnectorCredentials";

const AssistantSettings = () => <SettingsPage section="assistant" />;
const AdvancedChatRedirect = () => <Navigate to="/settings/chat" replace />;

export function apply(ctx: DashboardContext) {
  ctx.route({ path: "/chat/*", component: AdvancedChat, shell: "owned" });
  ctx.page({ frame: "settings", path: "/settings/assistant", component: AssistantSettings });
  ctx.page({ frame: "settings", path: "/settings/chat", component: AdvancedChatManagement });
  ctx.page({ frame: "settings", path: "/settings/advanced-chat", component: AdvancedChatRedirect });
  ctx.nav({ id: "advanced-chat", label: "聊天", path: "/chat", icon: MessageSquare, order: 10 });
  ctx.nav({ id: "advanced-chat-settings", label: "聊天设置", path: "/settings/chat", icon: MessageSquare, order: 10, scope: "settings", group: "chat" });
  ctx.nav({ id: "advanced-chat-assistant", label: "AI 助手", path: "/settings/assistant", icon: Bot, order: 40, scope: "settings", group: "ai" });
  ctx.nav({ id: "advanced-chat-credentials", label: "凭据管理", path: "/settings/credentials", icon: MessageSquare, order: 20, scope: "settings", group: "chat" });
  ctx.page({ frame: "settings", path: "/settings/credentials", component: ConnectorCredentials });
  ctx.nav({ id: "chat-groups", label: "聊天群组", path: "/chat/groups", icon: MessageSquare, order: 20, scope: "chat", group: "direct" });
  ctx.nav({ id: "chat-agents", label: "代理", path: "/chat/agents", icon: MessageSquare, order: 10, scope: "chat", group: "agents" });
  ctx.nav({ id: "chat-agent-groups", label: "工作室", path: "/chat/agent-groups", icon: MessageSquare, order: 40, scope: "chat", group: "agents" });
}

export default apply;
