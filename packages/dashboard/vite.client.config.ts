import path from "node:path"
import { defineConfig } from "vite"

const root = path.resolve(__dirname, "frontend")

export default defineConfig({
  define: { "process.env.NODE_ENV": JSON.stringify("production"), "process.env": "{}" },
  resolve: { alias: { "@": root } },
  build: {
    outDir: path.resolve(__dirname, "dist/web"),
    emptyOutDir: false,
    lib: { entry: path.resolve(root, "client.ts"), formats: ["es"], fileName: () => "dashboard-client.js" },
  },
})
