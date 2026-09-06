import AdvancedChat from "./pages/AdvancedChat";
import { defineExtension } from "@velocelab/dashboard/frontend";
import { MessageSquare } from "lucide-react";

defineExtension((api) => {
  api.route({ path: "/chat/*", component: AdvancedChat, protected: true });
  api.nav({ id: "advanced-chat", label: "聊天", path: "/chat", icon: MessageSquare, order: 10 });
});
