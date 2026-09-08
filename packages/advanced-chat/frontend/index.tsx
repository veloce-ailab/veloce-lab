import AdvancedChat from "./pages/AdvancedChat";
import AdvancedChatManagement from "./pages/AdvancedChatManagement";
import { defineExtension } from "@velocelab/dashboard/frontend";
import { MessageSquare } from "lucide-react";
import ConnectorCredentials from "./pages/ConnectorCredentials";

defineExtension((api) => {
  api.route({ path: "/chat/*", component: AdvancedChat, protected: true });
  api.route({ path: "/settings/chat", component: AdvancedChatManagement, protected: true });
  api.nav({ id: "advanced-chat", label: "聊天", path: "/chat", icon: MessageSquare, order: 10 });
  api.route({ path: "/settings/credentials", component: ConnectorCredentials, protected: true });
});
