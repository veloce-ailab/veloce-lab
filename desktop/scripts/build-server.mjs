// Collects everything the built-in server needs into `resources/server/`.
//
// The desktop app runs a Yumeri server of its own instead of loading a page from
// somewhere: no network, no separate install, and the plugins it ships are the
// plugins it runs. Three things have to end up there:
//
//   runtime/node      a Node runtime whose ABI matches the native modules below
//   node_modules/     the server framework, its dependencies and every plugin
//   yumeri.json       the template with its plugin list, filled in at first run
//
// The Node runtime is downloaded rather than borrowed from Electron: `node-pty`
// and `node:sqlite` are native, and one ABI is easier to keep honest than two.
// `VELOCE_SERVER_RUNTIME` points at an existing runtime for an offline build.
import { execFileSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const desktopRoot = path.resolve(scriptDir, "..")
const repoRoot = path.resolve(desktopRoot, "..")
const outputRoot = path.join(desktopRoot, "resources", "server")
const modulesRoot = path.join(outputRoot, "node_modules")

/** Packages the server never imports: they belong to the frontend bundles we ship prebuilt. */
const FRONTEND_ONLY = [
  "react", "react-dom", "react-is", "react-router", "react-router-dom", "scheduler",
  "@tanstack/", "lucide-react", "monaco-editor", "@monaco-editor/", "@xterm/",
  "class-variance-authority", "clsx", "tailwind-merge", "tailwindcss", "@tailwindcss/",
  "radix-ui", "@radix-ui/", "date-fns", "recharts", "react-day-picker", "@fontsource",
  "eslint", "typescript", "@types/", "vite", "@vitejs/", "postcss", "autoprefixer",
  "@babel/", "shadcn", "tw-animate-css", "tailwindcss-animate",
]

const isFrontendOnly = (name) => FRONTEND_ONLY.some((prefix) => name === prefix || name.startsWith(prefix))

function readPackage(name) {
  const manifest = path.join(repoRoot, "node_modules", name, "package.json")
  if (!fs.existsSync(manifest)) return null
  return JSON.parse(fs.readFileSync(manifest, "utf8"))
}

function realPath(name) {
  const target = path.join(repoRoot, "node_modules", name)
  try {
    return fs.realpathSync(target)
  } catch {
    return null
  }
}

function copyTree(from, to) {
  fs.rmSync(to, { recursive: true, force: true })
  fs.mkdirSync(path.dirname(to), { recursive: true })
  fs.cpSync(from, to, { recursive: true, dereference: true })
}

/** Workspace plugins the template lists, in the order they appear there. */
function workspacePlugins(template) {
  const names = Object.keys(template.plugins ?? {})
    .map((key) => key.replace(/^~/, ""))
    .filter((name) => name.startsWith("@velocelab/"))
  return [...new Set(names)]
}

/** Everything reachable from `roots` through `dependencies`, minus the frontend-only. */
function runtimeDependencies(roots) {
  const resolved = new Map()
  const queue = [...roots]
  while (queue.length > 0) {
    const name = queue.shift()
    if (!name || resolved.has(name) || isFrontendOnly(name)) continue
    const manifest = readPackage(name)
    const location = realPath(name)
    if (!manifest || !location) continue
    resolved.set(name, location)
    for (const dependency of Object.keys(manifest.dependencies ?? {})) queue.push(dependency)
  }
  return resolved
}

function copyRuntime() {
  const runtimeDir = path.join(outputRoot, "runtime")
  fs.mkdirSync(runtimeDir, { recursive: true })
  const binaryName = process.platform === "win32" ? "node.exe" : "node"
  const target = path.join(runtimeDir, binaryName)
  const override = process.env.VELOCE_SERVER_RUNTIME
  if (override) {
    fs.copyFileSync(override, target)
    fs.chmodSync(target, 0o755)
    return target
  }
  // The runtime version follows the one that built the native modules: `node-pty`
  // and `node:sqlite` are binary, and a server that ships a different major than
  // the install that compiled them would fail to load. Cross-platform packaging
  // pins both explicitly (VELOCE_SERVER_NODE_VERSION) and rebuilds the modules
  // for that target.
  const version = process.env.VELOCE_SERVER_NODE_VERSION || process.version.replace(/^v/, "")
  const arch = process.env.VELOCE_SERVER_NODE_ARCH || process.arch
  const platform = process.env.VELOCE_SERVER_NODE_PLATFORM || process.platform
  const downloadTarget = `${platform}-${arch}`
  const fileName = platform === "win32" ? `node.exe` : `node-v${version}-${downloadTarget}.tar.gz`
  const cacheDir = path.join(desktopRoot, ".cache", "node")
  fs.mkdirSync(cacheDir, { recursive: true })
  const cached = path.join(cacheDir, fileName)
  const baseURL = process.env.VELOCE_NODE_MIRROR || "https://nodejs.org/dist"
  if (platform === "win32") {
    const archive = path.join(cacheDir, `node-v${version}-${downloadTarget}.zip`)
    if (!fs.existsSync(archive)) download(`${baseURL}/v${version}/${path.basename(archive)}`, archive)
    execFileSync("powershell", ["-NoProfile", "-Command", `Expand-Archive -Force '${archive}' '${cacheDir}'`], { stdio: "inherit" })
    fs.copyFileSync(path.join(cacheDir, `node-v${version}-${downloadTarget}`, "node.exe"), target)
    return target
  }
  if (!fs.existsSync(cached)) download(`${baseURL}/v${version}/${fileName}`, cached)
  const extractDir = path.join(cacheDir, `node-v${version}-${downloadTarget}`)
  if (!fs.existsSync(extractDir)) {
    execFileSync("tar", ["-xzf", cached, "-C", cacheDir], { stdio: "inherit" })
  }
  fs.copyFileSync(path.join(extractDir, "bin", "node"), target)
  fs.chmodSync(target, 0o755)
  return target
}

/** Reported for the build log; `du` is not on every host, so it is best effort. */
function directorySize(root) {
  let total = 0
  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name)
      if (entry.isDirectory()) walk(target)
      else if (entry.isFile()) total += fs.statSync(target).size
    }
  }
  walk(root)
  return `${Math.round(total / 1024 / 1024)} MiB`
}

function download(url, destination) {
  console.log(`[build-server] fetching ${url}`)
  execFileSync("curl", ["-fsSL", url, "-o", destination], { stdio: "inherit" })
}

function main() {
  const templatePath = path.join(desktopRoot, "yumeri.json")
  const template = JSON.parse(fs.readFileSync(templatePath, "utf8"))
  const plugins = workspacePlugins(template)

  fs.rmSync(outputRoot, { recursive: true, force: true })
  fs.mkdirSync(modulesRoot, { recursive: true })

  const runtime = copyRuntime()
  console.log(`[build-server] runtime: ${runtime}`)

  // The framework and the plugins' own dependencies, resolved from the lockfile
  // layout the repository already builds against.
  const roots = ["yumeri", ...plugins]
  const dependencies = runtimeDependencies(roots)
  for (const [name, location] of dependencies) {
    copyTree(location, path.join(modulesRoot, name))
  }
  console.log(`[build-server] ${dependencies.size} runtime packages`)

  // The workspace plugins themselves: their built server code plus the plugin
  // bundles the dashboard serves.
  for (const name of plugins) {
    const location = path.join(repoRoot, "node_modules", name)
    if (!fs.existsSync(location)) throw new Error(`Plugin not linked in node_modules: ${name}`)
    const target = path.join(modulesRoot, name)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    copyTree(location, target)
  }
  console.log(`[build-server] ${plugins.length} plugins`)

  // A panel without its shared runtime renders blank, and the dashboard's own
  // app build wipes `dist/web` first — so this is checked here rather than
  // discovered on a user's screen.
  const clientBundle = path.join(repoRoot, "packages", "dashboard", "dist", "web", "dashboard-client.js")
  if (!fs.existsSync(clientBundle)) {
    throw new Error(
      `The dashboard client bundle is missing (${clientBundle}). Run \`yarn build\` in the repository root ` +
        "(the dashboard's build has three steps; running only the first one deletes it).",
    )
  }
  fs.copyFileSync(templatePath, path.join(outputRoot, "yumeri.json"))
  console.log(`[build-server] payload ${directorySize(outputRoot)}`)
}

main()
