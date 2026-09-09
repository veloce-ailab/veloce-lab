import path from "node:path";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import { dashboardClientUrl as client } from "./client-version";
const root = path.resolve(__dirname, "frontend");

export default defineConfig({ root, base: "/", define: { "process.env.NODE_ENV": JSON.stringify("production") }, plugins: [tailwindcss(), react()], build: { outDir: path.resolve(__dirname, "dist/web"), emptyOutDir: true, rollupOptions: { input: { app: path.resolve(root, "index.html"), runtime: path.resolve(root, "runtime.ts") }, preserveEntrySignatures: "strict", output: { entryFileNames: (chunk) => chunk.name === "runtime" ? "dashboard-runtime.js" : "assets/[name]-[hash].js" }, external: [client] } }, resolve: { alias: [
  { find: "react/jsx-runtime", replacement: client },
  { find: "react/jsx-dev-runtime", replacement: client },
  { find: "react-dom/client", replacement: client },
  { find: "react-dom", replacement: client },
  { find: "react-router-dom", replacement: client },
  { find: "@tanstack/react-query", replacement: client },
  { find: "lucide-react", replacement: client },
  { find: "react", replacement: client },
  { find: "@velocelab/dashboard/frontend", replacement: client },
  { find: "@/AppEntry", replacement: path.resolve(root, "App.tsx") },
  { find: "@", replacement: root },
] } });
