import fs from "fs"
import path from "path"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import { defineConfig, loadEnv, type Plugin } from "vite"

// dist/placeholder.txt is tracked in git so //go:embed dist compiles in fresh
// checkouts; emptyOutDir wipes it on every build, so put it back afterwards.
const keepDistPlaceholder = (): Plugin => ({
  name: "keep-dist-placeholder",
  closeBundle() {
    const placeholder = path.resolve(__dirname, "dist/placeholder.txt")
    if (fs.existsSync(path.dirname(placeholder)) && !fs.existsSync(placeholder)) {
      const eol = process.platform === "win32" ? "\r\n" : "\n"
      fs.writeFileSync(placeholder, `This file keeps the shared frontend embed directory present in source checkouts.${eol}`)
    }
  },
})

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "")
  const isDesktop = env.VITE_APP_TARGET === "desktop"

  return {
    base: isDesktop ? "./" : "/",
    plugins: [tailwindcss(), react(), ...(isDesktop ? [] : [keepDistPlaceholder()])],
    build: {
      // Clean the output directory so stale hashed bundles never accumulate —
      // the community server embeds web/dist wholesale via //go:embed.
      emptyOutDir: true,
      outDir: isDesktop ? path.resolve(__dirname, "../desktop/dist/web") : path.resolve(__dirname, "dist"),
    },
    resolve: {
      alias: {
        "@/AppEntry": path.resolve(__dirname, isDesktop ? "./src/App.desktop.tsx" : "./src/App.tsx"),
        "@": path.resolve(__dirname, "./src"),
      },
    },
    server: {
      allowedHosts: ["mynas.fireguo.com"],
      proxy: {
        '/api': {
          target: 'http://localhost:8080',
          changeOrigin: true,
        },
        '/v1beta': {
          target: 'http://localhost:8080',
          changeOrigin: true,
        },
        '/v1': {
          target: 'http://localhost:8080',
          changeOrigin: true,
        },
        '/auth': {
          target: 'http://localhost:8080',
          changeOrigin: true,
        },
      },
    },
  }
})
