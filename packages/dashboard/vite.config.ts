import path from "node:path";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
const root = path.resolve(__dirname, "frontend");
export default defineConfig({ root, base: "/", define: { "process.env.NODE_ENV": JSON.stringify("production") }, plugins: [tailwindcss(), react()], build: { outDir: path.resolve(__dirname, "dist/web"), emptyOutDir: true }, resolve: { alias: { "@/AppEntry": path.resolve(root, "App.tsx"), "@": root } } });
