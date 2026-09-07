import { defineExtension } from "@velocelab/dashboard/frontend"; import AdvancedChatDevices from "./pages/AdvancedChatDevices";
defineExtension(api => api.route({ path: "/chat/devices", component: AdvancedChatDevices, protected: true }));
