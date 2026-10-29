import path from "node:path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { dashboardClientUrl as client } from "../dashboard/client-version"
export default defineConfig({ define: { "process.env.NODE_ENV": JSON.stringify("production") }, plugins: [react()], resolve: { alias: [...["react/jsx-runtime", "react/jsx-dev-runtime", "react-dom/client", "react-dom", "react-router-dom", "@tanstack/react-query", "lucide-react", "react", "@velocelab/dashboard/frontend"].map((find) => ({ find, replacement: client })), { find: /^@\/(components|lib|hooks)(?:\/.*)?$/, replacement: client }, { find: "@", replacement: path.resolve(import.meta.dirname, "frontend") }] }, build: { outDir: "dist/frontend", emptyOutDir: true, rollupOptions: { external: [client], output: { inlineDynamicImports: true } }, lib: { entry: "frontend/index.tsx", formats: ["es"], fileName: () => "explorer.js" } } })
