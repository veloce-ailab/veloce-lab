import { app, BrowserWindow, Menu, Notification, Tray, WebContentsView, dialog, ipcMain, nativeTheme, shell } from "electron"
import { spawn, spawnSync } from "node:child_process"
import type { ChildProcess } from "node:child_process"
import fs from "node:fs"
import fsp from "node:fs/promises"
import https from "node:https"
import { createHash, randomBytes, randomUUID } from "node:crypto"
import os from "node:os"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const indexPath = path.join(__dirname, "web", "index.html")
const iconPath = path.join(__dirname, "..", "assets", "logo.png")
const preloadPath = path.join(__dirname, "preload.cjs")
const desktopInternalName = "veloce-lab"
const desktopDisplayName = "Veloce Lab"

// Use the project identifier for Electron's single-instance lock while
// keeping the display name user-facing in windows and the tray.
app.setName(desktopInternalName)

let mainWindow: BrowserWindow | null = null
let browserWindow: BrowserWindow | null = null
let browserToolbarView: WebContentsView | null = null
let tray: Tray | null = null
let isQuitting = false
const desktopProtocolScheme = "veloce"
const desktopTaskNotificationIDs = new Set<string>()
const desktopApprovalNotificationIDs = new Set<string>()
const desktopApprovalNotificationOwners = new Map<string, Electron.WebContents>()
const desktopApprovalNotifications = new Map<string, Notification>()
let builtinServerEnabled = false
let builtinServerProcess: ChildProcess | null = null
const initialWindowTabs = new Map<number, DesktopTab>()
const browserTabs = new Map<string, { id: string; title: string; url: string; view: WebContentsView }>()
let activeBrowserTabID = ""
let desktopTitleBarTheme: "light" | "dark" | null = null

function titleBarOverlayOptions(theme = desktopTitleBarTheme || (nativeTheme.shouldUseDarkColors ? "dark" : "light")) {
  return {
    color: "#ffffff00",
    symbolColor: theme === "dark" ? "#f8fafc" : "#111827",
    height: 36,
  }
}

function applyTitleBarOverlayTheme() {
  for (const window of [mainWindow, browserWindow]) {
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
  mode: "platform" | "web_server"
  webPort?: number
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
  mode: "platform" | "web_server"
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

interface DesktopTab {
  id: string
  title: string
  serverURL: string
  path: string
}

interface ManagedConnectorProcess {
  process: ChildProcess | null
  status: ConnectorStatus
  restartInput: StartConnectorInput
  restartAttempt: number
  stopRequested: boolean
}

interface BrowserToolbarState {
  activeID: string
  tabs: Array<{ id: string; title: string; url: string }>
  canGoBack: boolean
  canGoForward: boolean
}

let builtinServerStatus: BuiltinServerStatus = {
  enabled: false,
  running: false,
  phase: "idle",
  message: "",
  serverURL: builtinServerURL(),
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
}

const gotSingleInstanceLock = app.requestSingleInstanceLock()

if (!gotSingleInstanceLock) {
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

function tokenFromURL(rawURL: string) {
  try {
    const url = new URL(rawURL)
    const queryToken = url.searchParams.get("token")
    if (queryToken) {
      return queryToken
    }
    if (url.hash.startsWith("#token=")) {
      return url.hash.slice("#token=".length)
    }
    const hashQueryIndex = url.hash.indexOf("?")
    if (hashQueryIndex >= 0) {
      return new URLSearchParams(url.hash.slice(hashQueryIndex + 1)).get("token")
    }
  } catch {
    return null
  }
  return null
}

function loadLocalApp(hash = "/login") {
  if (!mainWindow) {
    return
  }
  void mainWindow.loadFile(indexPath, { hash })
}

function showMainWindow() {
  if (!mainWindow) {
    createWindow()
    return
  }
  if (mainWindow.isMinimized()) {
    mainWindow.restore()
  }
  mainWindow.show()
  mainWindow.focus()
}

function normalizeBrowserURL(value: unknown) {
  const raw = typeof value === "string" ? value.trim() : ""
  if (!raw) {
    return "https://www.bing.com/"
  }
  try {
    const url = new URL(raw)
    if (url.protocol === "http:" || url.protocol === "https:") {
      return url.toString()
    }
  } catch {
    // Treat text without a valid http(s) URL as a search query.
  }
  return `https://www.bing.com/search?q=${encodeURIComponent(raw)}`
}

function currentBrowserTab() {
  return browserTabs.get(activeBrowserTabID) || null
}

function browserToolbarState(): BrowserToolbarState {
  const active = currentBrowserTab()
  return {
    activeID: active?.id || "",
    tabs: Array.from(browserTabs.values()).map((tab) => ({ id: tab.id, title: tab.title, url: tab.url })),
    canGoBack: Boolean(active?.view.webContents.canGoBack()),
    canGoForward: Boolean(active?.view.webContents.canGoForward()),
  }
}

function emitBrowserState() {
  browserToolbarView?.webContents.send("browser:state", browserToolbarState())
}

function askBrowserPage(tab: { title: string; url: string }) {
  mainWindow?.webContents.send("browser:ask-page", { title: tab.title, url: tab.url })
}

function layoutBrowserViews() {
  if (!browserWindow || browserWindow.isDestroyed() || !browserToolbarView) {
    return
  }
  const [width, height] = browserWindow.getContentSize()
  const toolbarHeight = 76
  browserToolbarView.setBounds({ x: 0, y: 0, width, height: toolbarHeight })
  const active = currentBrowserTab()
  if (active) {
    active.view.setBounds({ x: 0, y: toolbarHeight, width, height: Math.max(0, height - toolbarHeight) })
  }
}

function setActiveBrowserTab(tabID: string) {
  const tab = browserTabs.get(tabID)
  if (!browserWindow || !tab) {
    return
  }
  const current = currentBrowserTab()
  if (current && current.id !== tabID) {
    browserWindow.contentView.removeChildView(current.view)
  }
  activeBrowserTabID = tabID
  browserWindow.contentView.addChildView(tab.view)
  layoutBrowserViews()
  emitBrowserState()
}

function createBrowserTab(rawURL?: string) {
  if (!browserWindow) {
    return
  }
  const id = `browser-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const view = new WebContentsView({
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  const tab = { id, title: "New tab", url: normalizeBrowserURL(rawURL), view }
  browserTabs.set(id, tab)
  view.webContents.on("page-title-updated", (_event, title) => {
    tab.title = title.trim() || "New tab"
    emitBrowserState()
  })
  const updateURL = () => {
    tab.url = view.webContents.getURL() || tab.url
    emitBrowserState()
  }
  view.webContents.on("did-navigate", updateURL)
  view.webContents.on("did-navigate-in-page", updateURL)
  view.webContents.on("did-stop-loading", updateURL)
  view.webContents.setWindowOpenHandler(({ url }) => {
    createBrowserTab(url)
    return { action: "deny" }
  })
  view.webContents.on("context-menu", (_event, params) => {
    const selection = params.selectionText.trim()
    const menu = Menu.buildFromTemplate([
      { label: "后退", enabled: view.webContents.canGoBack(), click: () => view.webContents.goBack() },
      { label: "前进", enabled: view.webContents.canGoForward(), click: () => view.webContents.goForward() },
      { label: "刷新", click: () => view.webContents.reload() },
      { type: "separator" },
      ...(selection ? [
        { label: "复制", click: () => view.webContents.copy() },
        { label: "使用 Bing 搜索选中文本", click: () => createBrowserTab(`https://www.bing.com/search?q=${encodeURIComponent(selection)}`) },
      ] : []),
      ...(selection ? [{ type: "separator" as const }] : []),
      { label: "询问本页面", click: () => askBrowserPage(tab) },
      { label: "在默认浏览器中打开", click: () => void shell.openExternal(tab.url) },
    ])
    if (browserWindow && !browserWindow.isDestroyed()) {
      menu.popup({ window: browserWindow })
    }
  })
  setActiveBrowserTab(id)
  void view.webContents.loadURL(tab.url)
}

function closeBrowserTab(tabID: string) {
  const tab = browserTabs.get(tabID)
  if (!tab || !browserWindow) {
    return
  }
  const ids = Array.from(browserTabs.keys())
  const index = ids.indexOf(tabID)
  browserWindow.contentView.removeChildView(tab.view)
  browserTabs.delete(tabID)
  tab.view.webContents.close()
  if (browserTabs.size === 0) {
    createBrowserTab()
    return
  }
  if (activeBrowserTabID === tabID) {
    setActiveBrowserTab(ids[Math.max(0, index - 1)] || Array.from(browserTabs.keys())[0])
    return
  }
  emitBrowserState()
}

function openDesktopBrowser(rawURL?: string) {
  if (!browserWindow || browserWindow.isDestroyed()) {
    browserWindow = new BrowserWindow({
      width: 1180,
      height: 820,
      minWidth: 760,
      minHeight: 520,
      title: `${desktopDisplayName} Browser`,
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
    browserToolbarView = new WebContentsView({
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        preload: preloadPath,
        sandbox: false,
      },
    })
    browserWindow.contentView.addChildView(browserToolbarView)
    browserWindow.on("resize", layoutBrowserViews)
    browserWindow.on("closed", () => {
      for (const tab of browserTabs.values()) {
        tab.view.webContents.close()
      }
      browserWindow = null
      browserToolbarView = null
      activeBrowserTabID = ""
      browserTabs.clear()
    })
    browserToolbarView.webContents.on("did-finish-load", emitBrowserState)
    void browserToolbarView.webContents.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(browserToolbarHTML())}`)
  }
  browserWindow.show()
  browserWindow.focus()
  if (rawURL || browserTabs.size === 0) {
    createBrowserTab(rawURL)
  } else {
    layoutBrowserViews()
    emitBrowserState()
  }
}

function browserToolbarHTML() {
  return `<!doctype html>
<html><head><meta charset="utf-8"><style>
*{box-sizing:border-box}body{position:relative;margin:0;background:#f7f8fa;color:#172033;font:13px system-ui,-apple-system,"Segoe UI",sans-serif;overflow:hidden}.tabs{height:36px;display:flex;align-items:end;gap:4px;padding:4px 142px 0 8px;-webkit-app-region:drag}.tabs button,.nav button,.external{font:inherit;-webkit-app-region:no-drag}.tab{display:flex;align-items:center;gap:7px;min-width:0;max-width:220px;height:28px;padding:0 8px;border:1px solid transparent;border-radius:6px 6px 0 0;background:transparent;color:#667085}.tab.active{background:#fff;border-color:#e2e5ea;color:#172033}.tab span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.tab-close{border:0;background:transparent;color:inherit;font-size:16px;line-height:1;cursor:pointer}.new-tab{width:28px;height:28px;border:0;border-radius:5px;background:transparent;color:#556070;font-size:18px;cursor:pointer}.external{position:absolute;right:138px;top:4px;display:flex;align-items:center;justify-content:center;width:28px;height:28px;border:0;border-radius:5px;background:transparent;cursor:pointer}.external:hover{background:#e9edf2}.browser-icon{position:relative;width:15px;height:12px;border:1.5px solid #556070;border-radius:2px}.browser-icon:before{content:'';position:absolute;left:-1.5px;right:-1.5px;top:2px;border-top:1.5px solid #556070}.nav{height:40px;display:flex;align-items:center;gap:6px;padding:4px 10px;border-top:1px solid #e5e7eb;background:#fff}.nav button{width:28px;height:28px;border:0;border-radius:5px;background:transparent;color:#475467;font-size:16px;cursor:pointer}.nav button:disabled{opacity:.35}.address{height:28px;flex:1;border:1px solid #d8dde5;border-radius:5px;background:#f7f8fa;padding:0 9px;color:#172033;outline:none}.address:focus{border-color:#98a2b3;background:#fff}</style></head>
<body><div class="tabs" id="tabs"></div><button id="external" class="external" title="Open in default browser"><span class="browser-icon"></span></button><div class="nav"><button id="back" title="Back">&lt;</button><button id="forward" title="Forward">&gt;</button><button id="reload" title="Reload">R</button><input id="address" class="address" autocomplete="off" spellcheck="false"><button id="go" title="Go">Go</button></div>
<script>const api=window.veloceDesktop;let state={tabs:[],activeID:'',canGoBack:false,canGoForward:false};const tabs=document.getElementById('tabs'),address=document.getElementById('address'),back=document.getElementById('back'),forward=document.getElementById('forward');const action=(input)=>api.browserAction(input);function render(next){state=next||state;tabs.textContent='';state.tabs.forEach(tab=>{const item=document.createElement('button');item.className='tab'+(tab.id===state.activeID?' active':'');item.onclick=()=>action({type:'activate',id:tab.id});const label=document.createElement('span');label.textContent=tab.title||tab.url;item.append(label);const close=document.createElement('button');close.className='tab-close';close.textContent='x';close.onclick=(event)=>{event.stopPropagation();action({type:'close',id:tab.id})};item.append(close);tabs.append(item)});const add=document.createElement('button');add.className='new-tab';add.textContent='+';add.onclick=()=>action({type:'new'});tabs.append(add);const active=state.tabs.find(tab=>tab.id===state.activeID);address.value=active?active.url:'';back.disabled=!state.canGoBack;forward.disabled=!state.canGoForward}address.addEventListener('keydown',event=>{if(event.key==='Enter')action({type:'navigate',url:address.value})});document.getElementById('go').onclick=()=>action({type:'navigate',url:address.value});document.getElementById('external').onclick=()=>action({type:'external'});back.onclick=()=>action({type:'back'});forward.onclick=()=>action({type:'forward'});document.getElementById('reload').onclick=()=>action({type:'reload'});api.onBrowserState(render);action({type:'state'}).then(render);</script></body></html>`
}

function veloceDataDir() {
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

function builtinServerRuntimeDir() {
  return path.join(veloceDataDir(), "community-data")
}

function builtinServerDBPath() {
  const configured = process.env.VELOCE_BUILTIN_SERVER_DB_PATH?.trim()
  if (configured) {
    return path.isAbsolute(configured) ? configured : path.join(builtinServerRuntimeDir(), configured)
  }
  return path.join(builtinServerRuntimeDir(), "flai.db")
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

function builtinServerPort() {
  return (process.env.VELOCE_BUILTIN_SERVER_PORT || process.env.PORT || "8080").trim()
}

function builtinServerURL() {
  return `http://localhost:${builtinServerPort()}`
}

function builtinServerEnv() {
  return {
    ...desktopProcessEnv(),
    PORT: builtinServerPort(),
    DB_PATH: builtinServerDBPath(),
  }
}

async function resolveBuiltinServerURL(pid?: number) {
  if (pid) {
    const port = await waitForProcessListenPort(pid, 8000)
    if (port) {
      return `http://localhost:${port}`
    }
  }
  return builtinServerURL()
}

async function waitForProcessListenPort(pid: number, timeoutMs: number) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    const port = detectProcessListenPort(pid)
    if (port) {
      return port
    }
    await sleep(250)
  }
  return null
}

function detectProcessListenPort(pid: number) {
  if (process.platform === "win32") {
    return detectWindowsListenPort(pid)
  }
  return detectLsofListenPort(pid) || detectSsListenPort(pid)
}

function detectWindowsListenPort(pid: number) {
  const script = `$ErrorActionPreference='SilentlyContinue'; ` + [
    `Get-NetTCPConnection -OwningProcess ${pid} -State Listen`,
    "Where-Object { $_.LocalAddress -eq '127.0.0.1' -or $_.LocalAddress -eq '0.0.0.0' -or $_.LocalAddress -eq '::1' -or $_.LocalAddress -eq '::' }",
    "Sort-Object LocalPort",
    "Select-Object -First 1 -ExpandProperty LocalPort",
  ].join(" | ")
  const result = spawnSync("powershell.exe", ["-NoProfile", "-Command", script], { encoding: "utf8", windowsHide: true })
  return firstPort(result.stdout)
}

function detectLsofListenPort(pid: number) {
  const result = spawnSync("lsof", ["-nP", "-a", "-p", String(pid), "-iTCP", "-sTCP:LISTEN", "-FnP"], { encoding: "utf8" })
  return firstPort(result.stdout)
}

function detectSsListenPort(pid: number) {
  const result = spawnSync("ss", ["-ltnp"], { encoding: "utf8" })
  const line = result.stdout
    .split(/\r?\n/)
    .find((item) => item.includes(`pid=${pid},`))
  return firstPort(line || "")
}

function firstPort(value: string) {
  const colonMatch = value.match(/:(\d+)(?:\s|$)/)
  const plainMatch = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => /^\d{2,5}$/.test(line))
  const rawPort = colonMatch?.[1] || plainMatch
  if (!rawPort) {
    return null
  }
  const port = Number(rawPort)
  return port > 0 && port <= 65535 ? port : null
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
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

function setupBuiltinServerIPC() {
  ipcMain.handle("builtin-server:get-status", () => builtinServerStatus)
  ipcMain.handle("builtin-server:set-enabled", async (_event, enabled: boolean) => {
    builtinServerEnabled = enabled
    await writeBuiltinServerConfig({ enabled })
    if (enabled) {
      await ensureBuiltinServerRunning()
    } else {
      stopBuiltinServer()
      updateBuiltinServerStatus({ phase: "idle", message: "", version: "" })
    }
    return builtinServerStatus
  })
  ipcMain.handle("connector:start", async (_event, input: StartConnectorInput) => startConnector(input))
  ipcMain.handle("connector:ensure-desktop", async (_event, input: { serverURL: string; authToken: string }) => ensureDesktopConnector(input))
  ipcMain.handle("desktop-auth:login", async (event, input: unknown) => desktopAuthLogin(event, input))
  ipcMain.handle("desktop-processes:terminate", (_event, id: string) => terminateManagedProcess(id))
  ipcMain.handle("desktop-processes:get-status", () => getDesktopProcessStatus())
  ipcMain.handle("desktop-settings:get", () => desktopSettingsForRenderer())
  ipcMain.handle("desktop-settings:save", async (_event, input: DesktopSettings) => writeDesktopSettings(input))
  ipcMain.handle("desktop-settings:choose-file", async () => chooseDesktopExecutable())
  ipcMain.handle("desktop:choose-folder", async (_event, initialPath: unknown) => chooseDesktopFolder(initialPath))
  ipcMain.handle("desktop:get-system-info", () => ({ hostname: os.hostname(), platform: process.platform, instanceID: desktopInstanceID() }))
  ipcMain.handle("desktop:open-in-vscode", async (_event, workspacePath: string) => openWorkspaceInVSCode(workspacePath))
  ipcMain.handle("desktop:notify-task-complete", (event, input: unknown) => showDesktopTaskNotification(event.sender, input))
  ipcMain.handle("desktop:notify-connector-approval", (event, input: unknown) => showDesktopApprovalNotification(event.sender, input))
  ipcMain.handle("desktop:dismiss-connector-approval", (_event, taskID: unknown) => ({ ok: dismissDesktopApprovalNotification(typeof taskID === "string" ? taskID : "") }))
  ipcMain.handle("desktop:menu-action", (event, action: unknown) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (action === "new-window") {
      const nextWindow = createWindow()
      nextWindow.show()
      nextWindow.focus()
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
  ipcMain.handle("desktop:open-link", async (_event, target: unknown) => {
    const links: Record<string, string> = {
      "official-site": "https://veloce.flweb.cn",
      github: "https://github.com/veloce-ailab/veloce-lab",
    }
    const url = typeof target === "string" ? links[target] : undefined
    if (!url) return { ok: false }
    await shell.openExternal(url)
    return { ok: true }
  })
  ipcMain.handle("desktop:open-external-url", async (_event, rawURL: unknown) => {
    if (typeof rawURL !== "string") {
      return { ok: false }
    }
    try {
      const url = new URL(rawURL)
      if (url.protocol !== "https:" && url.protocol !== "http:") {
        return { ok: false }
      }
      await shell.openExternal(url.toString())
      return { ok: true }
    } catch {
      return { ok: false }
    }
  })
  ipcMain.handle("desktop:set-titlebar-theme", (_event, theme: unknown) => {
    if (theme !== "light" && theme !== "dark") {
      return { ok: false }
    }
    desktopTitleBarTheme = theme
    applyTitleBarOverlayTheme()
    return { ok: true }
  })
  ipcMain.handle("browser:open", async (_event, rawURL?: unknown) => {
    openDesktopBrowser(typeof rawURL === "string" ? rawURL : undefined)
    return { ok: true }
  })
  ipcMain.handle("browser:action", async (_event, input: unknown) => handleBrowserAction(input))
  ipcMain.handle("desktop-update:check", async () => checkDesktopUpdate())
  ipcMain.handle("desktop-update:install-prepared", async () => installPreparedDesktopUpdate())
  ipcMain.handle("desktop-tabs:get-initial-state", (event) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    return { windowID: window?.id || 0, tab: window ? initialWindowTabs.get(window.id) || null : null }
  })
  ipcMain.handle("desktop-tabs:detach", (event, input: unknown) => detachDesktopTab(event.sender, input))
}

function detachDesktopTab(sender: Electron.WebContents, input: unknown) {
  const sourceWindow = BrowserWindow.fromWebContents(sender)
  const tab = normalizeDesktopTab(input)
  if (!sourceWindow || !tab) {
    return { moved: false }
  }
  const point = isRecord(input) ? input : {}
  const screenX = finiteNumber(point.screenX)
  const screenY = finiteNumber(point.screenY)
  const targetWindow = BrowserWindow.getAllWindows().find((window) => {
    if (window.id === sourceWindow.id || window.isDestroyed()) {
      return false
    }
    const bounds = window.getBounds()
    return screenX >= bounds.x && screenX <= bounds.x + bounds.width && screenY >= bounds.y && screenY <= bounds.y + bounds.height
  })
  if (targetWindow) {
    targetWindow.webContents.send("desktop-tabs:received", tab)
    targetWindow.show()
    targetWindow.focus()
    return { moved: true, targetWindowID: targetWindow.id }
  }
  const window = createWindow(tab)
  return { moved: Boolean(window), targetWindowID: window?.id || 0 }
}

function normalizeDesktopTab(value: unknown): DesktopTab | null {
  if (!isRecord(value)) {
    return null
  }
  const id = typeof value.id === "string" && /^[a-zA-Z0-9_-]{1,80}$/.test(value.id) ? value.id : ""
  if (!id) {
    return null
  }
  const title = typeof value.title === "string" ? value.title.trim().slice(0, 40) : "Chat"
  const serverURL = typeof value.serverURL === "string" ? value.serverURL.trim().slice(0, 2048) : ""
  const pagePath = typeof value.path === "string" && value.path.startsWith("/") ? value.path.slice(0, 1024) : "/chat"
  return { id, title: title || "Chat", serverURL, path: pagePath }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object"
}

function finiteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : -1
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

async function ensureBuiltinServerRunning() {
  if (builtinServerProcess && !builtinServerProcess.killed) {
    return updateBuiltinServerStatus({ phase: "running", message: "Built-in server is running", serverURL: builtinServerStatus.serverURL || builtinServerURL() })
  }

  try {
    updateBuiltinServerStatus({ phase: "checking", message: "Preparing bundled built-in server", serverURL: "" })
    const install = await ensureLatestCommunityInstall()
    await prepareBuiltinServerRuntime()
    updateBuiltinServerStatus({ phase: "starting", message: "Starting built-in server", version: install.tagName })
    builtinServerProcess = spawn(install.executablePath, [], {
      cwd: builtinServerRuntimeDir(),
      env: builtinServerEnv(),
      stdio: "ignore",
      windowsHide: true,
    })
    builtinServerProcess.on("exit", () => {
      builtinServerProcess = null
      if (!isQuitting && builtinServerEnabled) {
        updateBuiltinServerStatus({ phase: "error", message: "Built-in server stopped unexpectedly" })
      }
    })
    builtinServerProcess.unref()
    const serverURL = await resolveBuiltinServerURL(builtinServerProcess.pid)
    return updateBuiltinServerStatus({ phase: "running", message: "Built-in server is running", serverURL, version: install.tagName })
  } catch (error) {
    return updateBuiltinServerStatus({
      phase: "error",
      message: error instanceof Error ? error.message : "Failed to start built-in server",
    })
  }
}

function stopBuiltinServer() {
  if (!builtinServerProcess) {
    return
  }
  builtinServerProcess.kill()
  builtinServerProcess = null
}

async function prepareBuiltinServerRuntime() {
  const runtimeDir = builtinServerRuntimeDir()
  const dbPath = builtinServerDBPath()
  await fsp.mkdir(runtimeDir, { recursive: true })
  if (fs.existsSync(dbPath)) {
    return
  }
  const legacyDBPath = await findLegacyBuiltinServerDB()
  if (legacyDBPath) {
    await fsp.mkdir(path.dirname(dbPath), { recursive: true })
    await fsp.copyFile(legacyDBPath, dbPath)
  }
}

async function findLegacyBuiltinServerDB() {
  const communityRoot = path.join(veloceDataDir(), "community")
  const candidates: Array<{ filePath: string; mtimeMs: number }> = []
  await collectLegacyDBFiles(communityRoot, candidates)
  candidates.sort((left, right) => right.mtimeMs - left.mtimeMs)
  return candidates[0]?.filePath || null
}

async function collectLegacyDBFiles(root: string, candidates: Array<{ filePath: string; mtimeMs: number }>) {
  const entries = await fsp.readdir(root, { withFileTypes: true }).catch(() => [])
  for (const entry of entries) {
    const fullPath = path.join(root, entry.name)
    if (entry.isDirectory()) {
      await collectLegacyDBFiles(fullPath, candidates)
      continue
    }
    if (entry.name.toLowerCase() !== "flai.db") {
      continue
    }
    const stat = await fsp.stat(fullPath).catch(() => null)
    if (stat?.isFile()) {
      candidates.push({ filePath: fullPath, mtimeMs: stat.mtimeMs })
    }
  }
}

async function ensureLatestCommunityInstall() {
  const customPath = desktopSettings.builtinServerPath.trim()
  if (customPath) {
    await assertExecutableFile(customPath, "Built-in server")
    return {
      tagName: "custom",
      assetName: path.basename(customPath),
      executablePath: customPath,
    }
  }
  return bundledRuntimeInstall("flai-community", "Built-in server")
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

function handleBrowserAction(input: unknown) {
  const value = input && typeof input === "object" ? input as Record<string, unknown> : {}
  const type = typeof value.type === "string" ? value.type : ""
  if (!browserWindow || browserWindow.isDestroyed()) {
    openDesktopBrowser()
  }
  const tab = currentBrowserTab()
  if (type === "new") {
    createBrowserTab()
  } else if (type === "activate" && typeof value.id === "string") {
    setActiveBrowserTab(value.id)
  } else if (type === "close" && typeof value.id === "string") {
    closeBrowserTab(value.id)
  } else if (type === "navigate" && tab) {
    void tab.view.webContents.loadURL(normalizeBrowserURL(value.url))
  } else if (type === "back" && tab?.view.webContents.canGoBack()) {
    tab.view.webContents.goBack()
  } else if (type === "forward" && tab?.view.webContents.canGoForward()) {
    tab.view.webContents.goForward()
  } else if (type === "reload" && tab) {
    tab.view.webContents.reload()
  } else if (type === "external" && tab) {
    void shell.openExternal(tab.url)
  } else if (type === "ask" && tab) {
    askBrowserPage(tab)
  }
  emitBrowserState()
  return browserToolbarState()
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
      mode: input.mode,
      startedAt: "",
      deviceID,
      deviceKind,
    },
  })
  emitDesktopProcessStatus()
  try {
    const useGoRunConnector = !app.isPackaged && !desktopSettings.connectorPath.trim()
    updateConnectorStatus(connectorID, { phase: "checking", message: useGoRunConnector ? "Preparing connector from ../app" : "Preparing bundled connector", serverURL, mode: input.mode })
    const install = useGoRunConnector ? null : await ensureLatestConnectorInstall()
    const connectorVersion = useGoRunConnector ? "dev" : install!.tagName
    updateConnectorStatus(connectorID, { phase: "starting", message: useGoRunConnector ? "Starting connector from ../app" : "Starting connector", serverURL, version: connectorVersion, mode: input.mode })
    const args = ["-server", serverURL, "-token", token, "-device-kind", deviceKind]
    if (deviceKind === "desktop") {
      args.push("-desktop-instance-id", input.desktopInstanceID?.trim() || desktopInstanceID())
    }
    if (input.mode === "web_server") {
      args.push("-mode", "web_server", "-web-port", String(input.webPort || 8080))
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
      mode: input.mode,
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

function ensureDesktopConnector(input: { serverURL: string; authToken: string }) {
  const key = input.serverURL.trim().replace(/\/+$/, "")
  const pending = desktopConnectorEnsureRequests.get(key)
  if (pending) {
    return pending
  }
  const request = ensureDesktopConnectorForServer(input).finally(() => {
    desktopConnectorEnsureRequests.delete(key)
  })
  desktopConnectorEnsureRequests.set(key, request)
  return request
}

async function ensureDesktopConnectorForServer(input: { serverURL: string; authToken: string }) {
  const serverURL = input.serverURL.trim().replace(/\/+$/, "")
  const authToken = input.authToken.trim()
  if (!/^https?:\/\//i.test(serverURL) || !authToken) {
    return { ok: false, message: "Missing desktop connector server URL or login token", version: "" }
  }
  const savedToken = desktopSettings.desktopConnectorTokens[serverURL] || ""
  try {
    const response = await fetch(`${serverURL}/api/user/advanced-chat/devices/desktop/ensure`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${authToken}`,
        "Content-Type": "application/json",
        ...(savedToken ? { "X-Desktop-Connector-Token": savedToken } : {}),
      },
      body: JSON.stringify({
        desktop_instance_id: desktopInstanceID(),
        hostname: os.hostname(),
        os: process.platform,
        arch: process.arch,
        version: app.getVersion(),
      }),
    })
    const payload = await response.json().catch(() => ({})) as { token?: unknown; device?: { id?: unknown } }
    if (!response.ok) {
      throw new Error(typeof (payload as { error?: unknown }).error === "string" ? (payload as { error: string }).error : `HTTP ${response.status}`)
    }
    const token = typeof payload.token === "string" && payload.token.trim() ? payload.token.trim() : savedToken
    const deviceID = typeof payload.device?.id === "string" ? payload.device.id.trim() : ""
    if (!token || !deviceID) {
      throw new Error("Desktop connector credentials are unavailable")
    }
    if (token !== savedToken) {
      desktopSettings.desktopConnectorTokens[serverURL] = token
      await fsp.mkdir(veloceDataDir(), { recursive: true })
      await fsp.writeFile(desktopSettingsPath(), JSON.stringify(desktopSettings, null, 2))
    }
    return startConnector({
      serverURL,
      token,
      mode: "platform",
      deviceID,
      deviceKind: "desktop",
      desktopInstanceID: desktopInstanceID(),
      restart: token !== savedToken,
    })
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Failed to connect desktop connector", version: "" }
  }
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

async function checkDesktopUpdate(): Promise<DesktopUpdateResult> {
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

function handleNavigationURL(event: Electron.Event, rawURL: string) {
  const token = tokenFromURL(rawURL)
  if (token) {
    event.preventDefault()
    loadLocalApp(`/chat?token=${encodeURIComponent(token)}`)
    return
  }

  const parsedURL = new URL(rawURL)
  if (parsedURL.protocol === "file:" || parsedURL.protocol === "http:" || parsedURL.protocol === "https:") {
    return
  }

  event.preventDefault()
  void shell.openExternal(rawURL)
}

interface DesktopAuthLoginResult {
  ok: boolean
  token?: string
  cancelled?: boolean
  message?: string
}

const desktopAuthCallbackPrefix = `${desktopProtocolScheme}://desktop-auth/callback`
const desktopAuthTimeoutMs = 10 * 60 * 1000

// Sign in through the server's own web authorization flow: open an embedded
// window at /desktop/authorize with a PKCE challenge, wait for the page to
// bounce back through the veloce:// callback, then exchange the one-time code
// (plus verifier) for a JWT. The verifier never leaves the main process.
async function desktopAuthLogin(event: Electron.IpcMainInvokeEvent, input: unknown): Promise<DesktopAuthLoginResult> {
  const record = isRecord(input) ? input : {}
  const serverURL = typeof record.serverURL === "string" ? record.serverURL.trim().replace(/\/+$/, "") : ""
  const hint = typeof record.hint === "string" && /^[a-zA-Z0-9:_-]{0,120}$/.test(record.hint) ? record.hint : ""
  if (!/^https?:\/\//i.test(serverURL)) {
    return { ok: false, message: "Invalid server URL" }
  }

  const state = randomBytes(32).toString("base64url")
  const codeVerifier = randomBytes(32).toString("base64url")
  const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64url")

  const authorizeURL = new URL(`${serverURL}/desktop/authorize`)
  authorizeURL.searchParams.set("state", state)
  authorizeURL.searchParams.set("code_challenge", codeChallenge)
  if (hint) {
    authorizeURL.searchParams.set("hint", hint)
  }

  const parent = BrowserWindow.fromWebContents(event.sender) || undefined
  const authWindow = new BrowserWindow({
    width: 480,
    height: 760,
    parent,
    title: desktopDisplayName,
    icon: iconPath,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // Persist login cookies/storage across authorizations so repeat sign-ins
      // only need one click on the consent page.
      partition: "persist:desktop-auth",
    },
  })
  authWindow.setMenuBarVisibility(false)

  return await new Promise<DesktopAuthLoginResult>((resolve) => {
    let settled = false
    const finish = (result: DesktopAuthLoginResult) => {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timeout)
      resolve(result)
      if (!authWindow.isDestroyed()) {
        authWindow.destroy()
      }
    }
    const timeout = setTimeout(() => finish({ ok: false, cancelled: true, message: "Authorization timed out" }), desktopAuthTimeoutMs)

    const handleCallbackURL = async (rawURL: string) => {
      let url: URL
      try {
        url = new URL(rawURL)
      } catch {
        return
      }
      const callbackError = url.searchParams.get("error")
      const code = url.searchParams.get("code") || ""
      const returnedState = url.searchParams.get("state") || ""
      if (callbackError) {
        finish({ ok: false, cancelled: callbackError === "access_denied", message: callbackError })
        return
      }
      if (!code || returnedState !== state) {
        finish({ ok: false, message: "Invalid authorization response" })
        return
      }
      try {
        const response = await fetch(`${serverURL}/auth/desktop/token`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code, code_verifier: codeVerifier }),
        })
        const payload = await response.json().catch(() => ({})) as { token?: unknown; error?: unknown }
        if (!response.ok || typeof payload.token !== "string" || !payload.token) {
          throw new Error(typeof payload.error === "string" ? payload.error : `HTTP ${response.status}`)
        }
        finish({ ok: true, token: payload.token })
      } catch (error) {
        finish({ ok: false, message: error instanceof Error ? error.message : "Failed to complete sign-in" })
      }
    }

    const isCallbackURL = (rawURL: string) => rawURL.startsWith(desktopAuthCallbackPrefix)

    // Allow free http(s) navigation inside the window (login page, external
    // OIDC providers, back again); only the veloce:// callback and other
    // non-web schemes are intercepted.
    const interceptNavigation = (navigationEvent: Electron.Event, rawURL: string) => {
      if (isCallbackURL(rawURL)) {
        navigationEvent.preventDefault()
        void handleCallbackURL(rawURL)
        return
      }
      try {
        const parsed = new URL(rawURL)
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
          navigationEvent.preventDefault()
        }
      } catch {
        navigationEvent.preventDefault()
      }
    }

    authWindow.webContents.on("will-navigate", interceptNavigation)
    authWindow.webContents.on("will-redirect", interceptNavigation)
    authWindow.webContents.setWindowOpenHandler(({ url }) => {
      if (isCallbackURL(url)) {
        void handleCallbackURL(url)
        return { action: "deny" }
      }
      try {
        const parsed = new URL(url)
        if (parsed.protocol === "http:" || parsed.protocol === "https:") {
          void authWindow.webContents.loadURL(url)
        }
      } catch {
        // Ignore malformed popup URLs.
      }
      return { action: "deny" }
    })
    authWindow.on("closed", () => finish({ ok: false, cancelled: true }))

    void authWindow.loadURL(authorizeURL.toString())
  })
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

function createWindow(initialTab?: DesktopTab) {
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

  if (initialTab) {
    initialWindowTabs.set(window.id, initialTab)
  }
  if (!mainWindow) {
    mainWindow = window
  }
  window.webContents.on("will-navigate", handleNavigationURL)
  window.webContents.on("will-redirect", handleNavigationURL)
  window.webContents.setWindowOpenHandler(({ url }) => {
    const token = tokenFromURL(url)
    if (token) {
      loadLocalApp(`/chat?token=${encodeURIComponent(token)}`)
    } else {
      void shell.openExternal(url)
    }
    return { action: "deny" }
  })
  window.on("close", (event) => {
    if (isQuitting || window !== mainWindow) {
      return
    }
    event.preventDefault()
    window.hide()
  })
  window.on("closed", () => {
    initialWindowTabs.delete(window.id)
    if (mainWindow === window) {
      mainWindow = BrowserWindow.getAllWindows().find((candidate) => candidate !== window && candidate !== browserWindow) || null
    }
  })

  void window.loadFile(indexPath)
  return window
}

if (gotSingleInstanceLock) {
  setupBuiltinServerIPC()

  app.whenReady().then(async () => {
    registerDesktopProtocol()
    handleDesktopProtocolArguments(process.argv)
    desktopSettings = await readDesktopSettings()
    applyDesktopProxySettings()
    const config = await readBuiltinServerConfig()
    builtinServerEnabled = Boolean(config.enabled)
    updateBuiltinServerStatus({ enabled: builtinServerEnabled })
    createTray()
    createWindow()
    if (builtinServerEnabled) {
      void ensureBuiltinServerRunning()
    }
    app.on("activate", showMainWindow)
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
