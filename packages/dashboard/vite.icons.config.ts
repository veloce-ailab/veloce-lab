import path from "node:path"
import { defineConfig } from "vite"

const root = path.resolve(__dirname, "frontend")
const vendor = "/dashboard-vendor.js"

export default defineConfig({
  define: { "process.env.NODE_ENV": JSON.stringify("production"), "process.env": "{}" },
  resolve: { alias: [
    { find: "react/jsx-runtime", replacement: vendor },
    { find: "react/jsx-dev-runtime", replacement: vendor },
    { find: "react-dom/client", replacement: vendor },
    { find: "react-dom", replacement: vendor },
    { find: "react-router-dom", replacement: vendor },
    { find: "@tanstack/react-query", replacement: vendor },
    { find: "react", replacement: vendor },
    { find: "@", replacement: root },
  ] },
  build: {
    outDir: path.resolve(__dirname, "dist/web"),
    emptyOutDir: false,
    lib: { entry: path.resolve(root, "icons.ts"), formats: ["es"], fileName: () => "dashboard-icons.js" },
    rollupOptions: { external: [vendor] },
  },
})
