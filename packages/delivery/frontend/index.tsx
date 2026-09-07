import { defineExtension } from "@velocelab/dashboard/frontend"; import AdvancedChatDeliveries from "./pages/AdvancedChatDeliveries";
defineExtension(api => api.route({ path: "/chat/deliveries", component: AdvancedChatDeliveries, protected: true }));
