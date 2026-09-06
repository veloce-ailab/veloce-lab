import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
export default defineConfig({ plugins: [react()], resolve: { alias: { "@": path.resolve(__dirname, "frontend"), "@velocelab/dashboard/frontend": path.resolve(__dirname, "../dashboard/frontend/extension.tsx") } }, build: { outDir: "dist/frontend", emptyOutDir: true, lib: { entry: "frontend/index.tsx", formats: ["es"], fileName: () => "advanced-chat.js" } } });
