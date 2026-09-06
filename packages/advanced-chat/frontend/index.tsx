import React from "react";
import AdvancedChat from "./pages/AdvancedChat";

declare global {
  interface Window {
    __VELOCE_DASHBOARD__?: { registerPlugin(plugin: { id: string; routes: Array<{ path: string; component: React.ComponentType }>; slots: Array<{ name: string; id: string; order: number }> }): void };
  }
}

window.__VELOCE_DASHBOARD__?.registerPlugin({
  id: "advanced-chat",
  routes: [{ path: "/chat/*", component: AdvancedChat }],
  slots: [{ name: "dashboard.nav.primary", id: "advanced-chat", order: 10 }],
});
