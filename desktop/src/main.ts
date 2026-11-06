// The desktop shell: one Electron process, one server, many windows.
//
// It does not bundle a frontend. A server is started from the payload that ships
// with the app (`resources/server`), and every window loads that server's own
// dashboard, so the panel a window shows is always the panel that server serves —
// plugins included. The shell itself owns the window, the tray, OS notifications,
// the connector process and the update check, and it exposes those to the page
// through the preload bridge.
//
// Only the built-in server is reachable by default. A developer build can point
// the windows at another server instead, which is why every IPC call checks the
// origin it came from before doing anything.
import { app, BrowserWindow, Menu, Notification, Tray, dialog, ipcMain, nativeTheme, shell } from "electron"
import { type ChildProcess, spawn } from "node:child_process"
import fs from "node:fs"
import fsp from "node:fs/promises"
import https from "node:https"
import net from "node:net"
import os from "node:os"
import path from "node:path"
import { randomUUID } from "node:crypto"
import { fileURLToPath, pathToFileURL } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const resourcesRoot = app.isPackaged ? process.resourcesPath : path.join(__dirname, "..", "resources")
const serverRoot = path.join(resourcesRoot, "server")
const serverEntry = path.join(serverRoot, "node_modules", "yumeri", "bin.js")
const serverRuntimePath = path.join(serverRoot, "runtime", process.platform === "win32" ? "node.exe" : "node")
const serverTemplatePath = path.join(serverRoot, "yumeri.json")
const shellPagePath = path.join(__dirname, "shell", "index.html")
const iconPath = path.join(__dirname, "..", "assets", "logo.png")
const preloadPath = path.join(__dirname, "preload.cjs")
const desktopInternalName = "veloce-lab"
const desktopDisplayName = "Veloce Lab"
const preferredServerPort = 12789

/**
 * Development mode changes the shell only, never the server: the payload stays
 * the production one (`resources/server`), and what gets easier is looking at it
 * — server output goes to this process's terminal, DevTools open with the
 * window, and F12 / Ctrl+Shift+I toggle them.
 */
const desktopDevMode =
  process.argv.includes("--dev") || /^(1|true|yes)$/i.test(process.env.VELOCE_DESKTOP_DEV ?? "")

function devLog(message: string) {
  if (!desktopDevMode) return
  process.stdout.write(`[desktop] ${message}\n`)
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

app.setName(desktopInternalName)

if (desktopDevMode) {
  // A development run keeps its own profile: it must not fight the installed app
  // for the single-instance lock, and it must not write its scratch database into
  // the user's real data directory.
  app.setPath("userData", path.join(__dirname, "..", ".dev-data"))
}

let mainWindow: BrowserWindow | null = null
const appWindows = new Set<BrowserWindow>()
let tray: Tray | null = null
let isQuitting = false
const desktopProtocolScheme = "veloce"
const desktopTaskNotificationIDs = new Set<string>()
const desktopApprovalNotificationIDs = new Set<string>()
const desktopApprovalNotificationOwners = new Map<string, Electron.WebContents>()
const desktopApprovalNotifications = new Map<string, Notification>()
let builtinServerEnabled = true
let builtinServerProcess: ChildProcess | null = null
let builtinServerRestarts = 0
let serverReady = false
let activeServerURL = ""
let desktopTitleBarTheme: "light" | "dark" | null = null

function titleBarOverlayOptions(theme = desktopTitleBarTheme || (nativeTheme.shouldUseDarkColors ? "dark" : "light")) {
  return {
    color: "#ffffff00",
    symbolColor: theme === "dark" ? "#f8fafc" : "#111827",
    height: 36,
  }
}

function applyTitleBarOverlayTheme() {
  for (const window of appWindows) {
    if (window && !window.isDestroyed()) {
      window.setTitleBarOverlay(titleBarOverlayOptions())
    }
  }
}

type BuiltinServerPhase = "idle" | "checking" | "downloading" | "starting" | "running" | "error"

type ManagedProcessKind = "builtin-server" | "connector"

interface BuiltinServerStatus {
  enabled: boolean
  running: boolean
  phase: BuiltinServerPhase
  message: string
  serverURL: string
  version: string
}

interface GitHubReleaseAsset {
  name: string
  browser_download_url: string
}

interface GitHubRelease {
  tag_name: string
  assets: GitHubReleaseAsset[]
}

interface BuiltinServerConfig {
  enabled?: boolean
  /** The port the built-in server last listened on. */
  port?: number
}

interface PreparedDesktopUpdate {
  tagName: string
  assetName: string
  filePath: string
}

interface DesktopSettings {
  httpProxy: string
  builtinServerPath: string
  connectorPath: string
  preparedUpdate?: PreparedDesktopUpdate | null
  desktopConnectorTokens: Record<string, string>
  /** Only a developer build may point the windows at another server. */
  developerMode: boolean
  /** The external server that developer mode allows. */
  serverURL: string
}

interface DesktopUpdateResult {
  state: "ready" | "not_available" | "error"
  message: string
  version: string
  filePath?: string
}

interface StartConnectorInput {
  serverURL: string
  token: string
  mode: "platform"
  deviceID?: string
  deviceKind?: "cli" | "desktop"
  desktopInstanceID?: string
  restart?: boolean
  watchdogAttempt?: number
}

interface ConnectorStatus {
  id: string
  running: boolean
  phase: BuiltinServerPhase
  message: string
  serverURL: string
  version: string
  mode: "platform"
  startedAt: string
  deviceID: string
  deviceKind: "cli" | "desktop"
}

interface ManagedProcessStatus {
  id: string
  kind: ManagedProcessKind
  running: boolean
  phase: BuiltinServerPhase
  message: string
  pid: number | null
  version: string
  serverURL?: string
  mode?: string
  enabled?: boolean
  startedAt?: string
}

interface DesktopProcessStatus {
  generatedAt: string
  processes: ManagedProcessStatus[]
}

interface ManagedConnectorProcess {
  process: ChildProcess | null
  status: ConnectorStatus
  restartInput: StartConnectorInput
  restartAttempt: number
  stopRequested: boolean
}

let builtinServerStatus: BuiltinServerStatus = {
  enabled: false,
  running: false,
  phase: "idle",
  message: "",
  serverURL: `http://127.0.0.1:${preferredServerPort}`,
  version: "",
}

const connectorProcesses = new Map<string, ManagedConnectorProcess>()

const desktopConnectorEnsureRequests = new Map<string, Promise<{ ok: boolean; message: string; version: string }>>()

const connectorRestartTimers = new Map<string, NodeJS.Timeout>()

let desktopSettings: DesktopSettings = {
  httpProxy: "",
  builtinServerPath: "",
  connectorPath: "",
  preparedUpdate: null,
  desktopConnectorTokens: {},
  developerMode: false,
  serverURL: "",
}

const gotSingleInstanceLock = app.requestSingleInstanceLock()

if (!gotSingleInstanceLock) {
  // Closing the window only hides it, so a forgotten instance in the tray is the
  // usual reason for this; saying so beats disappearing without a word.
  process.stderr.write(
    `[desktop] Another ${desktopDisplayName} instance is already running (profile: ${app.getPath("userData")}).\n` +
      "[desktop] Quit it from the tray (or `pkill -f veloce-lab`) and start again — or run `npm run start:dev`, which uses its own profile.\n",
  )
  app.quit()
}

app.on("second-instance", (_event, commandLine) => {
  handleDesktopProtocolArguments(commandLine)
  showMainWindow()
})

function registerDesktopProtocol() {
  if (process.platform !== "win32") {
    return
  }
  app.setAppUserModelId("com.windypear.veloce.lab")
  if (process.defaultApp && process.argv[1]) {
    app.setAsDefaultProtocolClient(desktopProtocolScheme, process.execPath, [path.resolve(process.argv[1])])
    return
  }
  app.setAsDefaultProtocolClient(desktopProtocolScheme)
}

function handleDesktopProtocolArguments(args: readonly string[]) {
  const rawURL = args.find((arg) => arg.startsWith(`${desktopProtocolScheme}://`))
  if (!rawURL) {
    return
  }
  handleDesktopProtocolURL(rawURL)
}

function handleDesktopProtocolURL(rawURL: string) {
  try {
    const url = new URL(rawURL)
    if (url.protocol !== `${desktopProtocolScheme}:` || url.hostname !== "connector-approval") {
      return
    }
    const taskID = url.searchParams.get("task") || ""
    const decision = url.searchParams.get("decision")
    if (!/^[A-Za-z0-9_-]{1,160}$/.test(taskID) || (decision !== "approve" && decision !== "reject")) {
      return
    }
    const owner = desktopApprovalNotificationOwners.get(taskID)
    dismissDesktopApprovalNotification(taskID)
    if (owner && !owner.isDestroyed()) {
      owner.send("desktop:connector-approval-decision", { taskID, approved: decision === "approve" })
    }
  } catch {
    // Ignore malformed protocol activations.
  }
}

// --- built-in server -------------------------------------------------------

function desktopServerDir() {
  return path.join(veloceDataDir(), "desktop-server")
}

function desktopServerConfigPath() {
  return path.join(desktopServerDir(), "yumeri.json")
}

function desktopServerDBPath() {
  return path.join(desktopServerDir(), "veloce.db")
}

function desktopServerDataDir() {
  return path.join(desktopServerDir(), "data")
}

function desktopServerLogPath() {
  return path.join(desktopServerDir(), "server.log")
}

function portIsFree(port: number) {
  return new Promise<boolean>((resolve) => {
    const probe = net.createServer()
    probe.once("error", () => resolve(false))
    probe.once("listening", () => probe.close(() => resolve(true)))
    probe.listen(port, "127.0.0.1")
  })
}

/**
 * A port nothing else is listening on.
 *
 * It is picked at random rather than reused, so another program on this machine
 * cannot park itself on the address the shell is about to load — the page in the
 * window has the desktop bridge, and that is not something a stranger's server
 * should be able to claim. The preferred range is only a fallback.
 */
async function resolveServerPort() {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const candidate = 20_000 + Math.floor(Math.random() * 40_000)
    if (await portIsFree(candidate)) {
      const config = await readBuiltinServerConfig()
      await writeBuiltinServerConfig({ ...config, port: candidate })
      return candidate
    }
  }
  for (let port = preferredServerPort; port < preferredServerPort + 100; port += 1) {
    if (await portIsFree(port)) {
      const config = await readBuiltinServerConfig()
      await writeBuiltinServerConfig({ ...config, port })
      return port
    }
  }
  throw new Error("No free port for the built-in server")
}

/**
 * Writes the server's configuration from the template that ships with the app,
 * every start: the template is the source of truth, and the machine-specific
 * parts (port, database, data root) are filled in here.
 */
async function ensureDesktopServerConfig(port: number) {
  await fsp.mkdir(desktopServerDir(), { recursive: true })
  await fsp.mkdir(desktopServerDataDir(), { recursive: true })
  const template = JSON.parse(await fsp.readFile(serverTemplatePath, "utf8"))
  template.core = { ...(template.core ?? {}), host: "127.0.0.1", port }
  template.plugins = {
    ...(template.plugins ?? {}),
    "@velocelab/sqlite": { path: desktopServerDBPath() },
    "@velocelab/file": { root: desktopServerDataDir() },
  }
  await fsp.writeFile(desktopServerConfigPath(), `${JSON.stringify(template, null, 2)}\n`)
}

async function appendServerLog(chunk: Buffer) {
  const text = chunk.toString("utf8")
  if (!text) return
  if (desktopDevMode) process.stdout.write(text)
  await fsp.appendFile(desktopServerLogPath(), text).catch(() => undefined)
}

async function waitForServer(url: string, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (!builtinServerProcess || builtinServerProcess.killed) {
      throw new Error("The built-in server stopped before it was ready")
    }
    try {
      const response = await fetch(`${url}/api/public/settings`, { signal: AbortSignal.timeout(2000) })
      if (response.ok) return
    } catch {
      // Not listening yet.
    }
    await sleep(250)
  }
  throw new Error(`The built-in server did not answer within ${Math.round(timeoutMs / 1000)} seconds`)
}

async function ensureBuiltinServerRunning() {
  if (builtinServerProcess && !builtinServerProcess.killed && serverReady) {
    return builtinServerStatus
  }
  try {
    if (!fs.existsSync(serverEntry)) {
      throw new Error(
        `The built-in server payload is missing (${serverEntry}). Run \`npm run build:server\` (after \`yarn build\` in the repository root).`,
      )
    }
    updateBuiltinServerStatus({ phase: "checking", message: "Preparing the built-in server", serverURL: "" })
    const port = await resolveServerPort()
    await ensureDesktopServerConfig(port)
    await fsp.writeFile(desktopServerLogPath(), "")
    const runtime = fs.existsSync(serverRuntimePath) ? serverRuntimePath : process.execPath
    const env: NodeJS.ProcessEnv = {
      ...desktopProcessEnv(),
      NODE_ENV: "production",
      PORT: String(port),
    }
    if (runtime === process.execPath) {
      // No bundled runtime: the shell's own Node is the next best thing.
      env.ELECTRON_RUN_AS_NODE = "1"
    }
    updateBuiltinServerStatus({ phase: "starting", message: "Starting the built-in server", version: app.getVersion() })
    devLog(`server: ${runtime} ${serverEntry} start -c ${desktopServerConfigPath()}`)
    devLog(`config: ${desktopServerConfigPath()}`)
    devLog(`log:    ${desktopServerLogPath()}`)
    const child = spawn(runtime, [serverEntry, "start", "-c", desktopServerConfigPath()], {
      cwd: serverRoot,
      env,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    })
    builtinServerProcess = child
    child.stdout?.on("data", (chunk: Buffer) => void appendServerLog(chunk))
    child.stderr?.on("data", (chunk: Buffer) => void appendServerLog(chunk))
    child.on("exit", () => {
      builtinServerProcess = null
      serverReady = false
      if (isQuitting || !builtinServerEnabled) return
      if (builtinServerRestarts < 3) {
        builtinServerRestarts += 1
        updateBuiltinServerStatus({ phase: "starting", message: "Restarting the built-in server", version: "" })
        void ensureBuiltinServerRunning()
        return
      }
      updateBuiltinServerStatus({ phase: "error", message: `The built-in server stopped. See ${desktopServerLogPath()}`, version: "" })
    })
    const url = `http://127.0.0.1:${port}`
    devLog(`waiting for ${url}/api/public/settings`)
    await waitForServer(url, 25_000)
    serverReady = true
    builtinServerRestarts = 0
    updateBuiltinServerStatus({ phase: "running", message: "Built-in server is running", serverURL: url, version: app.getVersion() })
    loadAppInWindows(url)
    return builtinServerStatus
  } catch (error) {
    serverReady = false
    const message = error instanceof Error ? error.message : "Failed to start the built-in server"
    updateBuiltinServerStatus({ phase: "error", message })
    void showServerFailure(message)
    return builtinServerStatus
  }
}

function stopBuiltinServer() {
  if (!builtinServerProcess) {
    serverReady = false
    return
  }
  const child = builtinServerProcess
  builtinServerProcess = null
  serverReady = false
  child.kill()
}

/**
 * Where the windows point. A developer build may name another server; anything
 * else is the built-in one, which is the only origin the bridge trusts.
 */
function trustedServerURL() {
  if (desktopSettings.developerMode && /^https?:\/\//i.test(desktopSettings.serverURL)) {
    return desktopSettings.serverURL.replace(/\/+$/, "")
  }
  return builtinServerStatus.serverURL || `http://127.0.0.1:${preferredServerPort}`
}

function trustedOrigin() {
  try {
    return new URL(trustedServerURL()).origin
  } catch {
    return ""
  }
}

// --- windows ---------------------------------------------------------------

function loadAppInWindows(url: string) {
  devLog(`loading ${url} in ${appWindows.size} window(s)`)
  activeServerURL = url
  for (const window of appWindows) {
    if (window.isDestroyed()) continue
    void window.loadURL(url)
  }
  updateWindowTitles()
}

function updateWindowTitles() {
  const external = desktopSettings.developerMode && /^https?:\/\//i.test(desktopSettings.serverURL)
  for (const window of appWindows) {
    if (window.isDestroyed()) continue
    window.setTitle(external ? `${desktopDisplayName} — external server` : desktopDisplayName)
  }
}

function isTrustedNavigation(rawURL: string) {
  if (rawURL.startsWith("about:")) return true
  try {
    return new URL(rawURL).origin === trustedOrigin()
  } catch {
    return false
  }
}

function handleAppNavigation(event: Electron.Event, rawURL: string) {
  if (isTrustedNavigation(rawURL)) return
  event.preventDefault()
  if (/^https?:\/\//i.test(rawURL)) void shell.openExternal(rawURL)
}

async function showServerFailure(message: string) {
  const options = {
    type: "error" as const,
    title: desktopDisplayName,
    message: "The built-in server could not start",
    detail: `${message}\n\nLog: ${desktopServerLogPath()}`,
    buttons: ["Retry", "Open data folder", "Quit"],
    defaultId: 0,
    cancelId: 2,
  }
  const result = mainWindow
    ? await dialog.showMessageBox(mainWindow, options)
    : await dialog.showMessageBox(options)
  if (result.response === 0) {
    builtinServerRestarts = 0
    void ensureBuiltinServerRunning()
    return
  }
  if (result.response === 1) {
    await shell.openPath(desktopServerDir())
    return
  }
  isQuitting = true
  app.quit()
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    title: desktopDisplayName,
    icon: iconPath,
    ...(process.platform === "win32" ? { backgroundMaterial: "acrylic" as const } : {}),
    titleBarStyle: "hidden",
    titleBarOverlay: titleBarOverlayOptions(),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: preloadPath,
      sandbox: false,
    },
  })
  appWindows.add(window)
  if (!mainWindow) mainWindow = window
  window.webContents.on("will-navigate", handleAppNavigation)
  window.webContents.on("will-redirect", handleAppNavigation)
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isTrustedNavigation(url)) return { action: "allow" }
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
    return { action: "deny" }
  })
  window.on("close", (event) => {
    if (isQuitting || window !== mainWindow) return
    event.preventDefault()
    window.hide()
  })
  window.on("closed", () => {
    appWindows.delete(window)
    if (mainWindow === window) {
      mainWindow = Array.from(appWindows)[0] || null
    }
  })
  window.webContents.on("before-input-event", (event, input) => {
    if (!desktopDevMode || input.type !== "keyDown") return
    const key = input.key.toLowerCase()
    const chord = (input.control || input.meta) && input.shift
    if (key === "f12" || (chord && key === "i") || (input.meta && input.alt && key === "i")) {
      event.preventDefault()
      window.webContents.toggleDevTools()
      return
    }
    if ((input.control || input.meta) && key === "r") {
      event.preventDefault()
      if (input.shift) window.webContents.reloadIgnoringCache()
      else window.webContents.reload()
    }
  })
  void window.loadFile(shellPagePath)
  if (serverReady && activeServerURL) void window.loadURL(activeServerURL)
  if (desktopDevMode) window.webContents.openDevTools({ mode: "detach" })
  return window
}

/**
 * In development the default menu is replaced by one that keeps the view
 * commands next to the app's own, so reloading and DevTools are discoverable
 * without remembering shortcuts.
 */
function installDevMenu() {
  if (!desktopDevMode) return
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(process.platform === "darwin" ? [{ role: "appMenu" as const }] : []),
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    { role: "windowMenu" },
  ]))
}

function openWindow() {
  const window = createWindow()
  window.show()
  window.focus()
}

function showMainWindow() {
  if (!mainWindow) {
    createWindow()
    return
  }
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

// --- IPC ------------------------------------------------------------------

/** Whether a frame is allowed to use the bridge: the server, or our own shell page. */
function isTrustedSender(frameURL: string) {
  if (!frameURL) return false
  try {
    const parsed = new URL(frameURL)
    if (parsed.protocol === "file:") return decodeURIComponent(parsed.pathname) === shellPagePath
    return parsed.origin === trustedOrigin()
  } catch {
    return false
  }
}

function handle(channel: string, handler: (event: Electron.IpcMainInvokeEvent, ...args: any[]) => unknown) {
  ipcMain.handle(channel, (event, ...args) => {
    const frameURL = event.senderFrame?.url ?? ""
    if (!isTrustedSender(frameURL)) {
      throw new Error(`Refused ${channel} from an untrusted origin: ${frameURL}`)
    }
    return handler(event, ...args)
  })
}

async function saveDesktopSettings(event: Electron.IpcMainInvokeEvent, input: unknown) {
  const next = normalizeDesktopSettings(input)
  if (next.developerMode && !desktopSettings.developerMode) {
    const window = BrowserWindow.fromWebContents(event.sender) ?? mainWindow ?? undefined
    const options = {
      type: "warning" as const,
      title: desktopDisplayName,
      message: "Allow connecting to an external server?",
      detail:
        "A page served by another machine gets the same desktop abilities this app has, including opening files, starting a connector and showing notifications. Only do this with a server you control.",
      buttons: ["Cancel", "Allow"],
      defaultId: 0,
      cancelId: 0,
    }
    const answer = window ? await dialog.showMessageBox(window, options) : await dialog.showMessageBox(options)
    if (answer.response !== 1) return desktopSettingsForRenderer()
  }
  if (!next.developerMode) next.serverURL = ""
  if (next.serverURL && !/^https?:\/\//i.test(next.serverURL)) {
    throw new Error("The server URL must start with http:// or https://")
  }
  const targetChanged = next.developerMode !== desktopSettings.developerMode || next.serverURL !== desktopSettings.serverURL
  desktopSettings = await writeDesktopSettings(next)
  applyDesktopProxySettings()
  if (targetChanged) {
    if (desktopSettings.developerMode && desktopSettings.serverURL) {
      loadAppInWindows(desktopSettings.serverURL.replace(/\/+$/, ""))
    } else {
      void ensureBuiltinServerRunning().then(() => loadAppInWindows(trustedServerURL()))
    }
  }
  return desktopSettingsForRenderer()
}

function setupIPC() {
  handle("builtin-server:get-status", () => builtinServerStatus)
  handle("builtin-server:set-enabled", async (_event, enabled: boolean) => {
    builtinServerEnabled = enabled === true
    await writeBuiltinServerConfig({ enabled: builtinServerEnabled, port: builtinServerStatus.serverURL ? Number(new URL(builtinServerStatus.serverURL).port) : undefined })
    if (builtinServerEnabled) {
      await ensureBuiltinServerRunning()
    } else {
      stopBuiltinServer()
      updateBuiltinServerStatus({ phase: "idle", message: "The built-in server is turned off", version: "" })
    }
    return builtinServerStatus
  })
  handle("connector:start", async (_event, input: StartConnectorInput) => startConnector(input))
  handle("connector:ensure-desktop", async (_event, input: { serverURL: string; token: string; deviceID?: string }) => ensureDesktopConnector(input))
  handle("desktop-processes:get-status", () => getDesktopProcessStatus())
  handle("desktop-processes:terminate", (_event, id: string) => terminateManagedProcess(id))
  handle("desktop-settings:get", () => desktopSettingsForRenderer())
  handle("desktop-settings:save", (event, input: unknown) => saveDesktopSettings(event, input))
  handle("desktop-settings:choose-file", async () => chooseDesktopExecutable())
  handle("desktop:choose-folder", async (_event, initialPath: unknown) => chooseDesktopFolder(initialPath))
  handle("desktop:get-system-info", () => ({ hostname: os.hostname(), platform: process.platform, instanceID: desktopInstanceID() }))
  handle("desktop:open-in-vscode", async (_event, workspacePath: string) => openWorkspaceInVSCode(workspacePath))
  handle("desktop:notify-task-complete", (event, input: unknown) => showDesktopTaskNotification(event.sender, input))
  handle("desktop:notify-connector-approval", (event, input: unknown) => showDesktopApprovalNotification(event.sender, input))
  handle("desktop:dismiss-connector-approval", (_event, taskID: unknown) => ({ ok: dismissDesktopApprovalNotification(typeof taskID === "string" ? taskID : "") }))
  handle("desktop:menu-action", (event, action: unknown) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (action === "new-window") {
      openWindow()
      return { ok: true }
    }
    if (action === "close-window") {
      window?.destroy()
      return { ok: true }
    }
    if (action === "quit") {
      isQuitting = true
      app.quit()
      return { ok: true }
    }
    if (!window || !["copy", "paste", "cut", "delete", "undo", "redo"].includes(String(action))) {
      return { ok: false }
    }
    const contents = window.webContents
    if (action === "copy") contents.copy()
    if (action === "paste") contents.paste()
    if (action === "cut") contents.cut()
    if (action === "delete") contents.delete()
    if (action === "undo") contents.undo()
    if (action === "redo") contents.redo()
    return { ok: true }
  })
  handle("desktop:open-link", async (_event, target: unknown) => {
    const links: Record<string, string> = {
      "official-site": "https://veloce.flweb.cn",
      github: "https://github.com/veloce-ailab/veloce-lab",
    }
    const url = typeof target === "string" ? links[target] : undefined
    if (!url) return { ok: false }
    await shell.openExternal(url)
    return { ok: true }
  })
  handle("desktop:open-external-url", async (_event, rawURL: unknown) => {
    if (typeof rawURL !== "string") return { ok: false }
    try {
      const url = new URL(rawURL)
      if (url.protocol !== "https:" && url.protocol !== "http:") return { ok: false }
      await shell.openExternal(url.toString())
      return { ok: true }
    } catch {
      return { ok: false }
    }
  })
  handle("desktop:set-titlebar-theme", (_event, theme: unknown) => {
    if (theme !== "light" && theme !== "dark") return { ok: false }
    desktopTitleBarTheme = theme
    applyTitleBarOverlayTheme()
    return { ok: true }
  })
  handle("desktop-update:check", async () => checkDesktopUpdate())
  handle("desktop-update:install-prepared", async () => installPreparedDesktopUpdate())
}

function veloceDataDir() {
  // A development run owns everything it writes, next to its Electron profile:
  // its scratch database must never be the one the installed app is using.
  if (desktopDevMode) return app.getPath("userData")
  if (process.platform === "win32") {
    return path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"), desktopInternalName)
  }
  return path.join(os.homedir(), desktopInternalName)
}

function builtinServerConfigPath() {
  return path.join(veloceDataDir(), "desktop-server.json")
}

function desktopSettingsPath() {
  return path.join(veloceDataDir(), "desktop-settings.json")
}

function desktopInstanceIDPath() {
  return path.join(veloceDataDir(), "desktop-instance-id")
}

function desktopInstanceID() {
  try {
    const existing = fs.readFileSync(desktopInstanceIDPath(), "utf8").trim()
    if (/^[a-f0-9-]{36}$/i.test(existing)) {
      return existing
    }
  } catch {
    // A new installation receives an opaque random id below.
  }
  const instanceID = randomUUID()
  fs.mkdirSync(veloceDataDir(), { recursive: true })
  fs.writeFileSync(desktopInstanceIDPath(), instanceID, "utf8")
  return instanceID
}

async function readBuiltinServerConfig() {
  try {
    const raw = await fsp.readFile(builtinServerConfigPath(), "utf8")
    return JSON.parse(raw) as BuiltinServerConfig
  } catch {
    return {}
  }
}

async function writeBuiltinServerConfig(config: BuiltinServerConfig) {
  await fsp.mkdir(veloceDataDir(), { recursive: true })
  await fsp.writeFile(builtinServerConfigPath(), JSON.stringify(config, null, 2))
}

async function readDesktopSettings() {
  try {
    const raw = await fsp.readFile(desktopSettingsPath(), "utf8")
    return normalizeDesktopSettings(JSON.parse(raw))
  } catch {
    return normalizeDesktopSettings({})
  }
}

async function writeDesktopSettings(settings: DesktopSettings) {
  desktopSettings = {
    ...normalizeDesktopSettings(settings),
    desktopConnectorTokens: desktopSettings.desktopConnectorTokens,
  }
  applyDesktopProxySettings()
  await fsp.mkdir(veloceDataDir(), { recursive: true })
  await fsp.writeFile(desktopSettingsPath(), JSON.stringify(desktopSettings, null, 2))
  return desktopSettings
}

function normalizeDesktopSettings(value: unknown): DesktopSettings {
  const item = value && typeof value === "object" ? value as Record<string, unknown> : {}
  const prepared = item.preparedUpdate && typeof item.preparedUpdate === "object"
    ? item.preparedUpdate as Record<string, unknown>
    : null
  const rawConnectorTokens = item.desktopConnectorTokens && typeof item.desktopConnectorTokens === "object"
    ? item.desktopConnectorTokens as Record<string, unknown>
    : {}
  const desktopConnectorTokens = Object.fromEntries(Object.entries(rawConnectorTokens)
    .filter(([, token]) => typeof token === "string" && token.trim())
    .map(([serverURL, token]) => [serverURL, (token as string).trim()]))
  return {
    httpProxy: typeof item.httpProxy === "string" ? item.httpProxy.trim() : "",
    builtinServerPath: typeof item.builtinServerPath === "string" ? item.builtinServerPath.trim() : "",
    connectorPath: typeof item.connectorPath === "string" ? item.connectorPath.trim() : "",
    preparedUpdate: prepared && typeof prepared.tagName === "string" && typeof prepared.assetName === "string" && typeof prepared.filePath === "string"
      ? { tagName: prepared.tagName, assetName: prepared.assetName, filePath: prepared.filePath }
      : null,
    desktopConnectorTokens,
    developerMode: item.developerMode === true,
    serverURL: typeof item.serverURL === "string" ? item.serverURL.trim().replace(/\/+$/, "") : "",
  }
}

function desktopSettingsForRenderer() {
  const { desktopConnectorTokens: _tokens, ...settings } = desktopSettings
  return settings
}

function applyDesktopProxySettings() {
  const proxy = desktopSettings.httpProxy.trim()
  if (proxy) {
    process.env.HTTP_PROXY = proxy
    process.env.HTTPS_PROXY = proxy
    process.env.http_proxy = proxy
    process.env.https_proxy = proxy
  } else {
    delete process.env.HTTP_PROXY
    delete process.env.HTTPS_PROXY
    delete process.env.http_proxy
    delete process.env.https_proxy
  }
}

function desktopProcessEnv() {
  const env = { ...process.env }
  const proxy = desktopSettings.httpProxy.trim()
  if (proxy) {
    env.HTTP_PROXY = proxy
    env.HTTPS_PROXY = proxy
    env.http_proxy = proxy
    env.https_proxy = proxy
  }
  return env
}

function updateBuiltinServerStatus(patch: Partial<BuiltinServerStatus>) {
  builtinServerStatus = {
    ...builtinServerStatus,
    ...patch,
    enabled: builtinServerEnabled,
    running: Boolean(builtinServerProcess && !builtinServerProcess.killed),
  }
  mainWindow?.webContents.send("builtin-server:status", builtinServerStatus)
  emitDesktopProcessStatus()
  return builtinServerStatus
}

function updateConnectorStatus(id: string, patch: Partial<ConnectorStatus>) {
  const connector = connectorProcesses.get(id)
  if (!connector) {
    return null
  }
  connector.status = {
    ...connector.status,
    ...patch,
    running: Boolean(connector.process && !connector.process.killed),
  }
  emitDesktopProcessStatus()
  return connector.status
}

function getDesktopProcessStatus(): DesktopProcessStatus {
  const builtinRunning = Boolean(builtinServerProcess && !builtinServerProcess.killed)
  const processes: ManagedProcessStatus[] = []
  if (builtinRunning) {
    processes.push({
      id: "builtin-server",
      kind: "builtin-server",
      running: true,
      phase: builtinServerStatus.phase,
      message: builtinServerStatus.message,
      pid: builtinServerProcess?.pid ?? null,
      version: builtinServerStatus.version,
      serverURL: builtinServerStatus.serverURL,
      enabled: builtinServerStatus.enabled,
    })
  }
  for (const connector of connectorProcesses.values()) {
    const connectorRunning = Boolean(connector.process && !connector.process.killed)
    if (!connectorRunning) {
      continue
    }
    processes.push({
      id: connector.status.id,
      kind: "connector",
      running: true,
      phase: connector.status.phase,
      message: connector.status.message,
      pid: connector.process?.pid ?? null,
      version: connector.status.version,
      serverURL: connector.status.serverURL,
      mode: connector.status.mode,
      startedAt: connector.status.startedAt,
    })
  }
  return {
    generatedAt: new Date().toISOString(),
    processes,
  }
}

function emitDesktopProcessStatus() {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send("desktop-processes:status", getDesktopProcessStatus())
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object"
}


async function openWorkspaceInVSCode(workspacePath: string) {
  const targetPath = workspacePath.trim()
  if (!targetPath || !path.isAbsolute(targetPath)) {
    return { ok: false, message: "A local absolute workspace path is required" }
  }
  try {
    await shell.openExternal(`vscode://file${pathToFileURL(targetPath).pathname}`)
    return { ok: true, message: "VS Code opened" }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Failed to open VS Code" }
  }
}

function showDesktopTaskNotification(sender: Electron.WebContents, input: unknown) {
  if (!isRecord(input)) {
    return { ok: false }
  }
  const id = typeof input.id === "string" ? input.id.trim().slice(0, 240) : ""
  const title = typeof input.title === "string" ? input.title.trim().slice(0, 120) : ""
  const body = typeof input.body === "string" ? input.body.trim().slice(0, 360) : ""
  if (!id || !title || desktopTaskNotificationIDs.has(id)) {
    return { ok: Boolean(id && title), duplicate: Boolean(id && desktopTaskNotificationIDs.has(id)) }
  }
  try {
    desktopTaskNotificationIDs.add(id)
    const cleanup = setTimeout(() => desktopTaskNotificationIDs.delete(id), 10 * 60 * 1000)
    cleanup.unref()
    const notification = new Notification({ title, body, icon: iconPath })
    notification.on("click", () => {
      const owner = BrowserWindow.fromWebContents(sender)
      if (owner && !owner.isDestroyed()) {
        owner.show()
        owner.focus()
      }
    })
    notification.show()
    return { ok: true }
  } catch {
    desktopTaskNotificationIDs.delete(id)
    return { ok: false }
  }
}

function showDesktopApprovalNotification(sender: Electron.WebContents, input: unknown) {
  if (!isRecord(input)) {
    return { ok: false }
  }
  const id = typeof input.id === "string" ? input.id.trim().slice(0, 240) : ""
  const taskID = typeof input.taskID === "string" ? input.taskID.trim() : ""
  const title = typeof input.title === "string" ? input.title.trim().slice(0, 120) : ""
  const body = typeof input.body === "string" ? input.body.trim().slice(0, 360) : ""
  const approveLabel = typeof input.approveLabel === "string" ? input.approveLabel.trim().slice(0, 40) : "Approve"
  const rejectLabel = typeof input.rejectLabel === "string" ? input.rejectLabel.trim().slice(0, 40) : "Reject"
  if (!id || !title || !/^[A-Za-z0-9_-]{1,160}$/.test(taskID) || desktopApprovalNotificationIDs.has(id)) {
    return { ok: Boolean(id && title && taskID), duplicate: Boolean(id && desktopApprovalNotificationIDs.has(id)) }
  }
  try {
    desktopApprovalNotificationIDs.add(id)
    desktopApprovalNotificationOwners.set(taskID, sender)
    const cleanup = setTimeout(() => {
      desktopApprovalNotificationIDs.delete(id)
      desktopApprovalNotificationOwners.delete(taskID)
      desktopApprovalNotifications.delete(taskID)
    }, 10 * 60 * 1000)
    cleanup.unref()
    const options = {
      title,
      body,
      icon: iconPath,
      ...(process.platform === "win32" ? { toastXml: desktopApprovalToastXML(taskID, title, body, approveLabel, rejectLabel) } : {}),
    }
    const notification = new Notification(options)
    desktopApprovalNotifications.set(taskID, notification)
    notification.on("click", () => {
      const owner = BrowserWindow.fromWebContents(sender)
      if (owner && !owner.isDestroyed()) {
        owner.show()
        owner.focus()
      }
    })
    notification.show()
    return { ok: true }
  } catch {
    desktopApprovalNotificationIDs.delete(id)
    desktopApprovalNotificationOwners.delete(taskID)
    desktopApprovalNotifications.delete(taskID)
    return { ok: false }
  }
}

function dismissDesktopApprovalNotification(taskID: string) {
  const notification = desktopApprovalNotifications.get(taskID)
  desktopApprovalNotifications.delete(taskID)
  desktopApprovalNotificationOwners.delete(taskID)
  if (!notification) {
    return false
  }
  notification.close()
  return true
}

function desktopApprovalToastXML(taskID: string, title: string, body: string, approveLabel: string, rejectLabel: string) {
  const approveURL = `${desktopProtocolScheme}://connector-approval?task=${encodeURIComponent(taskID)}&decision=approve`
  const rejectURL = `${desktopProtocolScheme}://connector-approval?task=${encodeURIComponent(taskID)}&decision=reject`
  return `<toast scenario="reminder"><visual><binding template="ToastGeneric"><text>${escapeToastXML(title)}</text><text>${escapeToastXML(body)}</text></binding></visual><actions><action content="${escapeToastXML(approveLabel || "Approve")}" arguments="${escapeToastXML(approveURL)}" activationType="protocol"/><action content="${escapeToastXML(rejectLabel || "Reject")}" arguments="${escapeToastXML(rejectURL)}" activationType="protocol"/></actions></toast>`
}

function escapeToastXML(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&apos;" })[character] || character)
}

function clearConnectorRestart(connectorID: string) {
  const timer = connectorRestartTimers.get(connectorID)
  if (timer) {
    clearTimeout(timer)
    connectorRestartTimers.delete(connectorID)
  }
}

function scheduleConnectorRestart(connectorID: string) {
  const connector = connectorProcesses.get(connectorID)
  if (!connector || connector.stopRequested || isQuitting) {
    return
  }
  clearConnectorRestart(connectorID)
  const nextAttempt = connector.restartAttempt + 1
  const delay = Math.min(30_000, 1_000 * 2 ** Math.min(nextAttempt - 1, 5))
  connector.restartAttempt = nextAttempt
  connector.status = {
    ...connector.status,
    running: false,
    phase: "checking",
    message: `Connector exited; restarting in ${Math.ceil(delay / 1000)}s`,
  }
  emitDesktopProcessStatus()
  const timer = setTimeout(() => {
    connectorRestartTimers.delete(connectorID)
    const current = connectorProcesses.get(connectorID)
    if (!current || current.stopRequested || isQuitting) {
      return
    }
    connectorProcesses.delete(connectorID)
    void startConnector({ ...current.restartInput, restart: true, watchdogAttempt: current.restartAttempt })
  }, delay)
  timer.unref()
  connectorRestartTimers.set(connectorID, timer)
}

async function startConnector(input: StartConnectorInput) {
  const serverURL = input.serverURL.trim()
  const token = input.token.trim()
  if (!serverURL || !token) {
    return { ok: false, message: "Missing connector server URL or token", version: "" }
  }
  const deviceKind = input.deviceKind === "desktop" ? "desktop" : "cli"
  const deviceID = input.deviceID?.trim() || ""
  const existing = Array.from(connectorProcesses.values()).find((connector) =>
    connector.status.deviceKind === deviceKind &&
    connector.status.serverURL === serverURL &&
    (deviceKind !== "desktop" || connector.status.deviceID === deviceID)
  )
  if (existing?.process && !existing.process.killed && !input.restart) {
    return { ok: true, message: "Connector is already running", version: existing.status.version }
  }
  if (existing) {
    existing.stopRequested = true
    clearConnectorRestart(existing.status.id)
    existing.process?.kill()
    connectorProcesses.delete(existing.status.id)
  }
  const connectorID = `connector-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  connectorProcesses.set(connectorID, {
    process: null,
    restartInput: { ...input, restart: false },
    restartAttempt: input.watchdogAttempt || 0,
    stopRequested: false,
    status: {
      id: connectorID,
      running: false,
      phase: "checking",
      message: "Preparing bundled connector",
      serverURL,
      version: "",
      mode: "platform",
      startedAt: "",
      deviceID,
      deviceKind,
    },
  })
  emitDesktopProcessStatus()
  try {
    const useGoRunConnector = !app.isPackaged && !desktopSettings.connectorPath.trim()
    updateConnectorStatus(connectorID, { phase: "checking", message: useGoRunConnector ? "Preparing connector from ../app" : "Preparing bundled connector", serverURL, mode: "platform" })
    const install = useGoRunConnector ? null : await ensureLatestConnectorInstall()
    const connectorVersion = useGoRunConnector ? "dev" : install!.tagName
    updateConnectorStatus(connectorID, { phase: "starting", message: useGoRunConnector ? "Starting connector from ../app" : "Starting connector", serverURL, version: connectorVersion, mode: "platform" })
    const args = ["-server", serverURL, "-token", token, "-device-kind", deviceKind]
    if (deviceKind === "desktop") {
      args.push("-desktop-instance-id", input.desktopInstanceID?.trim() || desktopInstanceID())
    }
    const childProcess = spawn(
      useGoRunConnector ? (process.platform === "win32" ? "go.exe" : "go") : install!.executablePath,
      useGoRunConnector ? ["run", ".", ...args] : args,
      {
        cwd: useGoRunConnector ? path.resolve(__dirname, "..", "..", "app") : path.dirname(install!.executablePath),
        env: desktopProcessEnv(),
        stdio: "ignore",
        windowsHide: true,
      }
    )
    const connector = connectorProcesses.get(connectorID)
    if (connector) {
      connector.process = childProcess
    }
    childProcess.on("exit", () => {
      const current = connectorProcesses.get(connectorID)
      if (!current || current !== connector) {
        return
      }
      current.process = null
      scheduleConnectorRestart(connectorID)
    })
    childProcess.on("error", () => {
      const current = connectorProcesses.get(connectorID)
      if (!current || current !== connector) {
        return
      }
      current.process = null
      scheduleConnectorRestart(connectorID)
    })
    childProcess.unref()
    updateConnectorStatus(connectorID, {
      phase: "running",
      message: "Connector is running",
      serverURL,
      version: connectorVersion,
      mode: "platform",
      startedAt: new Date().toISOString(),
      deviceID,
      deviceKind,
    })
    return { ok: true, message: "Connector started", version: connectorVersion }
  } catch (error) {
    connectorProcesses.delete(connectorID)
    emitDesktopProcessStatus()
    return { ok: false, message: error instanceof Error ? error.message : "Failed to start connector", version: "" }
  }
}

/**
 * Starts the connector for the desktop app's own server.
 *
 * The page does the part that needs credentials — it asks the server for a
 * device token of kind `desktop` — and hands the token here; the shell only
 * supervises the process. Nothing in this path assumes an authentication plugin:
 * a server without one answers the same request.
 */
async function ensureDesktopConnectorForServer(input: { serverURL: string; token: string; deviceID?: string }) {
  const serverURL = String(input.serverURL ?? "").trim().replace(/\/+$/, "")
  const token = String(input.token ?? "").trim()
  if (!/^https?:\/\//i.test(serverURL) || !token) {
    return { ok: false, message: "Missing connector server URL or device token", version: "" }
  }
  return startConnector({
    serverURL,
    token,
    mode: "platform",
    deviceID: String(input.deviceID ?? "").trim(),
    deviceKind: "desktop",
    desktopInstanceID: desktopInstanceID(),
    restart: false,
  })
}

function ensureDesktopConnector(input: { serverURL: string; token: string; deviceID?: string }) {
  const key = String(input.serverURL ?? "").trim().replace(/\/+$/, "")
  const pending = desktopConnectorEnsureRequests.get(key)
  if (pending) return pending
  const request = ensureDesktopConnectorForServer(input).finally(() => {
    desktopConnectorEnsureRequests.delete(key)
  })
  desktopConnectorEnsureRequests.set(key, request)
  return request
}

function terminateManagedProcess(id: string) {
  if (id === "builtin-server") {
    builtinServerEnabled = false
    void writeBuiltinServerConfig({ enabled: false })
    stopBuiltinServer()
    updateBuiltinServerStatus({ phase: "idle", message: "", version: "" })
    return getDesktopProcessStatus()
  }

  const connector = connectorProcesses.get(id)
  if (!connector) {
    return getDesktopProcessStatus()
  }
  connector.stopRequested = true
  clearConnectorRestart(id)
  connector.process?.kill()
  connectorProcesses.delete(id)
  emitDesktopProcessStatus()
  return getDesktopProcessStatus()
}

function stopAllConnectors() {
  for (const connector of connectorProcesses.values()) {
    connector.stopRequested = true
    clearConnectorRestart(connector.status.id)
    connector.process?.kill()
  }
  connectorProcesses.clear()
  emitDesktopProcessStatus()
}

async function assertExecutableFile(filePath: string, label: string) {
  const stat = await fsp.stat(filePath).catch(() => null)
  if (!stat?.isFile()) {
    throw new Error(`${label} file does not exist`)
  }
}

async function chooseDesktopExecutable() {
  const options = {
    title: "Select executable",
    properties: ["openFile"] as Array<"openFile">,
  }
  const result = mainWindow
    ? await dialog.showOpenDialog(mainWindow, options)
    : await dialog.showOpenDialog(options)
  return result.canceled ? "" : result.filePaths[0] || ""
}

async function chooseDesktopFolder(initialPath: unknown) {
  const defaultPath = typeof initialPath === "string" && initialPath.trim() ? initialPath.trim() : undefined
  const options = {
    title: "Select workspace folder",
    defaultPath,
    properties: ["openDirectory", "createDirectory"] as Array<"openDirectory" | "createDirectory">,
  }
  const result = mainWindow
    ? await dialog.showOpenDialog(mainWindow, options)
    : await dialog.showOpenDialog(options)
  return result.canceled ? "" : result.filePaths[0] || ""
}

// Desktop updates are not wired yet: the entry point stays (and so does the
// installer path below), but nothing is fetched until a release feed exists.
const desktopUpdateCheckEnabled = false

async function checkDesktopUpdate(): Promise<DesktopUpdateResult> {
  if (!desktopUpdateCheckEnabled) {
    return { state: "not_available", message: "Desktop updates are not available yet", version: app.getVersion() }
  }
  const prepared = desktopSettings.preparedUpdate
  if (prepared && fs.existsSync(prepared.filePath)) {
    return {
      state: "ready",
      message: "Update is ready",
      version: prepared.tagName,
      filePath: prepared.filePath,
    }
  }

  try {
    const release = await requestJSON<GitHubRelease>("https://api.github.com/repos/veloce-ailab/veloce-lab/releases/latest")
    const asset = selectDesktopUpdateAsset(release.assets)
    if (!asset) {
      return { state: "not_available", message: "No compatible desktop update asset found", version: release.tag_name }
    }

    const root = path.join(veloceDataDir(), "desktop-updates", safePathSegment(release.tag_name))
    await fsp.mkdir(root, { recursive: true })
    const downloadPath = path.join(root, asset.name)
    if (!fs.existsSync(downloadPath)) {
      await downloadFile(asset.browser_download_url, downloadPath)
    }
    await writeDesktopSettings({
      ...desktopSettings,
      preparedUpdate: {
        tagName: release.tag_name,
        assetName: asset.name,
        filePath: downloadPath,
      },
    })
    return {
      state: "ready",
      message: "Update is ready",
      version: release.tag_name,
      filePath: downloadPath,
    }
  } catch (error) {
    return {
      state: "error",
      message: error instanceof Error ? error.message : "Failed to check updates",
      version: "",
    }
  }
}

async function installPreparedDesktopUpdate() {
  const prepared = desktopSettings.preparedUpdate
  if (!prepared || !fs.existsSync(prepared.filePath)) {
    return { ok: false, message: "No prepared update installer" }
  }
  isQuitting = true
  if (process.platform === "win32" && prepared.filePath.toLowerCase().endsWith(".exe")) {
    spawn(prepared.filePath, [], {
      cwd: path.dirname(prepared.filePath),
      detached: true,
      stdio: "ignore",
      windowsHide: false,
    }).unref()
  } else {
    await shell.openPath(prepared.filePath)
  }
  app.quit()
  return { ok: true, message: "Installer started" }
}

function selectDesktopUpdateAsset(assets: GitHubReleaseAsset[]) {
  const suffixes = desktopUpdateSuffixes()
  return assets.find((asset) => {
    const normalized = asset.name.toLowerCase()
    if (normalized.endsWith(".blockmap") || normalized.endsWith(".yml") || normalized.endsWith(".yaml")) {
      return false
    }
    return suffixes.some((suffix) => normalized.endsWith(suffix))
  }) || null
}

function desktopUpdateSuffixes() {
  const arch = process.arch === "arm64" ? "arm64" : process.arch === "x64" ? "x64" : ""
  if (!arch) {
    return []
  }
  if (process.platform === "win32") {
    return [`-win-${arch}.exe`]
  }
  if (process.platform === "darwin") {
    return [`-mac-${arch}.dmg`]
  }
  if (process.platform === "linux") {
    return [`-linux-${arch}.appimage`, `-linux-${arch}.deb`]
  }
  return []
}

function safePathSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_")
}

function requestJSON<T>(url: string) {
  return new Promise<T>((resolve, reject) => {
    const request = https.get(url, { headers: { "User-Agent": "VeloceDesktop/0.1" } }, (response) => {
      if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        requestJSON<T>(response.headers.location).then(resolve, reject)
        return
      }
      if (response.statusCode !== 200) {
        reject(new Error(`GitHub request failed: HTTP ${response.statusCode}`))
        return
      }
      let raw = ""
      response.setEncoding("utf8")
      response.on("data", (chunk) => {
        raw += chunk
      })
      response.on("end", () => {
        try {
          resolve(JSON.parse(raw) as T)
        } catch (error) {
          reject(error)
        }
      })
    })
    request.on("error", reject)
  })
}

function downloadFile(url: string, destination: string) {
  return new Promise<void>((resolve, reject) => {
    const request = https.get(url, { headers: { "User-Agent": "VeloceDesktop/0.1" } }, (response) => {
      if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        downloadFile(response.headers.location, destination).then(resolve, reject)
        return
      }
      if (response.statusCode !== 200) {
        reject(new Error(`Download failed: HTTP ${response.statusCode}`))
        return
      }
      const file = fs.createWriteStream(destination)
      response.pipe(file)
      file.on("finish", () => {
        file.close((error) => error ? reject(error) : resolve())
      })
      file.on("error", reject)
    })
    request.on("error", reject)
  })
}

async function bundledRuntimeInstall(binaryName: string, label: string) {
  const executableName = process.platform === "win32" ? `${binaryName}.exe` : binaryName
  const resourceRoot = app.isPackaged ? process.resourcesPath : path.join(__dirname, "..", "resources")
  const executablePath = path.join(resourceRoot, "bin", executableName)
  await assertExecutableFile(executablePath, label)
  if (process.platform !== "win32") {
    await fsp.chmod(executablePath, 0o755)
  }
  return {
    tagName: app.getVersion(),
    assetName: executableName,
    executablePath,
  }
}

async function ensureLatestConnectorInstall() {
  const customPath = desktopSettings.connectorPath.trim()
  if (customPath) {
    await assertExecutableFile(customPath, "Connector")
    return {
      tagName: "custom",
      assetName: path.basename(customPath),
      executablePath: customPath,
    }
  }
  return bundledRuntimeInstall("veloce-connector", "Connector")
}

function createTray() {
  if (tray) {
    return
  }
  tray = new Tray(iconPath)
  tray.setToolTip(desktopDisplayName)
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: `显示 ${desktopDisplayName}`, click: showMainWindow },
    { type: "separator" },
    {
      label: "退出",
      click: () => {
        isQuitting = true
        app.quit()
      },
    },
  ]))
  tray.on("click", showMainWindow)
}

if (gotSingleInstanceLock) {
  setupIPC()

  const start = async () => {
    devLog(`userData: ${app.getPath("userData")}`)
    devLog(`resources: ${resourcesRoot}`)
    registerDesktopProtocol()
    handleDesktopProtocolArguments(process.argv)
    desktopSettings = await readDesktopSettings()
    applyDesktopProxySettings()
    installDevMenu()
    devLog(`mode: ${app.isPackaged ? "packaged" : "development"} shell, production server payload`)
    const config = await readBuiltinServerConfig()
    builtinServerEnabled = config.enabled !== false
    updateBuiltinServerStatus({ enabled: builtinServerEnabled })
    createTray()
    createWindow()
    if (desktopSettings.developerMode && desktopSettings.serverURL) {
      serverReady = true
      loadAppInWindows(desktopSettings.serverURL.replace(/\/+$/, ""))
    } else if (builtinServerEnabled) {
      void ensureBuiltinServerRunning()
    }
    app.on("activate", showMainWindow)
  }
  app.whenReady().then(start).catch((error: unknown) => {
    const message = error instanceof Error ? error.stack || error.message : String(error)
    process.stderr.write(`[desktop] Failed to start: ${message}\n`)
    dialog.showErrorBox(
      `${desktopDisplayName} could not start`,
      `${error instanceof Error ? error.message : String(error)}\n\nData directory: ${veloceDataDir()}`,
    )
    isQuitting = true
    app.quit()
  })
}

app.on("before-quit", () => {
  isQuitting = true
  stopBuiltinServer()
  stopAllConnectors()
})

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit()
  }
})
