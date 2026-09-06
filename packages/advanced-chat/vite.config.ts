import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
const frontend = path.resolve(__dirname, "frontend");
const dashboard = path.resolve(__dirname, "../dashboard/frontend");
export default defineConfig({ plugins: [react()], resolve: { alias: [
  { find: "@velocelab/dashboard/frontend", replacement: path.join(dashboard, "extension.tsx") },
  { find: /^@\/components\/chat/, replacement: path.join(frontend, "components/chat") },
  { find: /^@\/components/, replacement: path.join(dashboard, "components") },
  { find: /^@\/lib/, replacement: path.join(dashboard, "lib") },
  { find: /^@\/hooks/, replacement: path.join(dashboard, "hooks") },
  { find: "@", replacement: frontend },
] }, build: { outDir: "dist/frontend", emptyOutDir: true, lib: { entry: "frontend/index.tsx", formats: ["es"], fileName: () => "advanced-chat.js" } } });
