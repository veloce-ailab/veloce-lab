import path from "node:path"
import { defineConfig } from "vite"

export default defineConfig({
  define: { "process.env.NODE_ENV": JSON.stringify("production"), "process.env": "{}" },
  build: {
    outDir: path.resolve(__dirname, "dist/web"),
    emptyOutDir: false,
    lib: {
      entry: path.resolve(__dirname, "frontend/vendor.ts"),
      formats: ["es"],
      fileName: () => "dashboard-vendor.js",
    },
  },
})
