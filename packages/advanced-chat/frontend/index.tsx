import Chat from "./pages/Chat";
import ChatWorkspace from "./pages/ChatWorkspace";
import Agents from "./pages/Agents";
import AgentEditor from "./pages/AgentEditor";
import AgentGroupsPage from "./pages/AgentGroupsPage";
import ChatGroups from "./pages/ChatGroups";
import AdvancedChatManagement from "./pages/AdvancedChatManagement";
import AssistantSettings from "./pages/AssistantSettings";
import ConnectorCredentials from "./pages/ConnectorCredentials";
import { Navigate, type DashboardContext } from "@velocelab/dashboard/frontend";
import { Bot, KeyRound, LayoutGrid, MessageSquare, MessagesSquare } from "lucide-react";

const AdvancedChatRedirect = () => <Navigate to="/settings/chat" replace />;
const DevicesRedirect = () => <Navigate to="/settings/devices" replace />;

export function apply(ctx: DashboardContext) {
  // This plugin owns the chat frame: the chrome around every `/chat/*` page.
  // Everything inside it, the chat page included, is a contributed page, so a
  // package that adds a chat capability only registers a page and a menu entry.
  ctx.frame({ id: "chat", path: "/chat", component: ChatWorkspace });
  ctx.page({ frame: "chat", path: "/chat", component: Chat, home: true, layout: "full" });
  ctx.page({ frame: "chat", path: "/chat/session/:id", component: Chat, layout: "full" });
  ctx.page({
    frame: "chat",
    path: "/chat/groups",
    component: ChatGroups,
    nav: { id: "chat-groups", label: "聊天群组", icon: MessagesSquare, order: 20, scope: "chat", group: "direct" },
  });
  ctx.page({ frame: "chat", path: "/chat/groups/:groupID", component: ChatGroups });
  ctx.page({
    frame: "chat",
    path: "/chat/agents",
    component: Agents,
    nav: { id: "chat-agents", labelKey: "nav.agents", icon: Bot, order: 10, scope: "chat", group: "agents" },
  });
  ctx.page({ frame: "chat", path: "/chat/agents/:id", component: AgentEditor });
  ctx.page({
    frame: "chat",
    path: "/chat/agent-groups/*",
    component: AgentGroupsPage,
    nav: { id: "chat-agent-groups", label: "工作室", icon: LayoutGrid, order: 40, scope: "chat", group: "agents" },
  });
  ctx.page({ frame: "chat", path: "/chat/devices/*", component: DevicesRedirect });

  // The console sidebar lists unscoped navigation, which is how the chat area is
  // reached from the rest of the console.
  ctx.nav({ id: "advanced-chat", labelKey: "nav.chat", path: "/chat", icon: MessageSquare, order: 10 });

  ctx.page({
    frame: "settings",
    path: "/settings/assistant",
    component: AssistantSettings,
    nav: { id: "advanced-chat-assistant", labelKey: "advancedChat.assistant", icon: Bot, order: 40, scope: "settings", group: "ai" },
  });
  ctx.page({
    frame: "settings",
    path: "/settings/chat",
    component: AdvancedChatManagement,
    nav: { id: "advanced-chat-settings", labelKey: "advancedChat.settings", icon: MessageSquare, order: 10, scope: "settings", group: { id: "chat", labelKey: "advancedChat.settingsGroup", order: 30 } },
  });
  ctx.page({ frame: "settings", path: "/settings/advanced-chat", component: AdvancedChatRedirect });
  ctx.page({
    frame: "settings",
    path: "/settings/credentials",
    component: ConnectorCredentials,
    nav: { id: "advanced-chat-credentials", labelKey: "advancedChat.credentials", icon: KeyRound, order: 20, scope: "settings", group: "chat" },
  });
}

export default apply;
