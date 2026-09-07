import AdvancedChat from "./pages/AdvancedChat";
import AdvancedChatManagement from "./pages/AdvancedChatManagement";
import AdvancedChatDevices from "./pages/AdvancedChatDevices";
import { defineExtension } from "@velocelab/dashboard/frontend";
import { MessageSquare } from "lucide-react";

defineExtension((api) => {
  api.route({ path: "/chat/*", component: AdvancedChat, protected: true });
  api.route({ path: "/settings/chat", component: AdvancedChatManagement, protected: true });
  api.route({ path: "/settings/devices", component: AdvancedChatDevices, protected: true });
  api.route({ path: "/settings/devices/:id", component: AdvancedChatDevices, protected: true });
  api.nav({ id: "advanced-chat", label: "聊天", path: "/chat", icon: MessageSquare, order: 10 });
});
