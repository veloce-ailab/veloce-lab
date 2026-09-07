import { defineExtension } from "@velocelab/dashboard/frontend"; import Channels from "./pages/Channels";
defineExtension(api => api.route({ path: "/settings/channels", component: Channels, protected: true }));
