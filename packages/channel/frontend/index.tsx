import { defineExtension } from "@velocelab/dashboard/frontend"; import MessageChannelsWorkspace from "./pages/MessageChannelsWorkspace";
defineExtension(api => api.route({ path: "/settings/message-channel", component: MessageChannelsWorkspace, protected: true }));
