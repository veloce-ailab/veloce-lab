import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

import { dashboardClientUrl as client } from "../dashboard/client-version";

export default defineConfig({
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
  plugins: [react()],
  resolve: {
    alias: [
      { find: "react/jsx-runtime", replacement: client },
      { find: "react/jsx-dev-runtime", replacement: client },
      { find: "react-dom/client", replacement: client },
      { find: "react-dom", replacement: client },
      { find: "react-router-dom", replacement: client },
      { find: "@tanstack/react-query", replacement: client },
      { find: "lucide-react", replacement: client },
      { find: "react", replacement: client },
      { find: "@velocelab/dashboard/frontend", replacement: client },
    ],
  },
  build: {
    outDir: "dist/frontend",
    emptyOutDir: true,
    rollupOptions: { external: [client] },
    lib: { entry: "frontend/index.tsx", formats: ["es"], fileName: () => "settings.js" },
  },
});
