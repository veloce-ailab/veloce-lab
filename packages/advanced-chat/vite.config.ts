import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
const frontend = path.resolve(__dirname, "frontend");
export default defineConfig({ define: { "process.env.NODE_ENV": JSON.stringify("production") }, plugins: [react()], resolve: { alias: [
  { find: "react/jsx-runtime", replacement: "/dashboard-client.js" },
  { find: "react/jsx-dev-runtime", replacement: "/dashboard-client.js" },
  { find: "react-dom/client", replacement: "/dashboard-client.js" },
  { find: "react-dom", replacement: "/dashboard-client.js" },
  { find: "react-router-dom", replacement: "/dashboard-client.js" },
  { find: "@tanstack/react-query", replacement: "/dashboard-client.js" },
  { find: "lucide-react", replacement: "/dashboard-client.js" },
  { find: "react", replacement: "/dashboard-client.js" },
  { find: "@velocelab/dashboard/frontend", replacement: "/dashboard-client.js" },
  { find: /^@\/components\/chat/, replacement: path.join(frontend, "components/chat") },
  { find: /^@\/(components|lib|hooks)(?:\/.*)?$/, replacement: "/dashboard-client.js" },
  { find: "@", replacement: frontend },
] }, build: { outDir: "dist/frontend", emptyOutDir: true, rollupOptions: { external: ["/dashboard-client.js"] }, lib: { entry: "frontend/index.tsx", formats: ["es"], fileName: () => "advanced-chat.js" } } });
