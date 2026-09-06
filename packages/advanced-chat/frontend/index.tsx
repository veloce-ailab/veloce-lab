import React from "react";
import AdvancedChat from "./pages/AdvancedChat";
import { defineExtension } from "@velocelab/dashboard/frontend";

declare global {
  interface Window {
    __VELOCE_DASHBOARD__?: { registerPlugin(plugin: { id: string; routes: Array<{ path: string; component: React.ComponentType }>; slots: Array<{ name: string; id: string; order: number }> }): void };
  }
}

defineExtension((api) => {
  api.route({ path: "/chat/*", component: AdvancedChat, protected: true });
});
