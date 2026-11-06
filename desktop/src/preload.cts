import { contextBridge, ipcRenderer } from "electron"

interface BuiltinServerStatus {
  enabled: boolean
  running: boolean
  phase: "idle" | "checking" | "downloading" | "starting" | "running" | "error"
  message: string
  serverURL: string
  version: string
}

interface StartConnectorInput {
  serverURL: string
  token: string
  mode: "platform"
}

interface StartConnectorResult {
  ok: boolean
  message: string
  version: string
}

interface DesktopProcessStatus {
  generatedAt: string
  processes: Array<{
    id: string
    kind: "builtin-server" | "connector"
    running: boolean
    phase: "idle" | "checking" | "downloading" | "starting" | "running" | "error"
    message: string
    pid: number | null
    version: string
    serverURL?: string
    mode?: string
    enabled?: boolean
    startedAt?: string
  }>
}

interface DesktopSettings {
  httpProxy: string
  builtinServerPath: string
  connectorPath: string
  developerMode: boolean
  serverURL: string
  preparedUpdate?: {
    tagName: string
    assetName: string
    filePath: string
  } | null
}

interface DesktopUpdateResult {
  state: "ready" | "not_available" | "error"
  message: string
  version: string
  filePath?: string
}

contextBridge.exposeInMainWorld("veloceDesktop", {
  getBuiltinServerStatus: () => ipcRenderer.invoke("builtin-server:get-status") as Promise<BuiltinServerStatus>,
  getDesktopProcessStatus: () => ipcRenderer.invoke("desktop-processes:get-status") as Promise<DesktopProcessStatus>,
  terminateDesktopProcess: (id: string) => ipcRenderer.invoke("desktop-processes:terminate", id) as Promise<DesktopProcessStatus>,
  getDesktopSettings: () => ipcRenderer.invoke("desktop-settings:get") as Promise<DesktopSettings>,
  saveDesktopSettings: (settings: DesktopSettings) => ipcRenderer.invoke("desktop-settings:save", settings) as Promise<DesktopSettings>,
  chooseDesktopFile: () => ipcRenderer.invoke("desktop-settings:choose-file") as Promise<string>,
  chooseDesktopFolder: (initialPath?: string) => ipcRenderer.invoke("desktop:choose-folder", initialPath) as Promise<string>,
  getDesktopSystemInfo: () => ipcRenderer.invoke("desktop:get-system-info") as Promise<{ hostname: string; platform: string; instanceID: string }>,
  openInVSCode: (workspacePath: string) => ipcRenderer.invoke("desktop:open-in-vscode", workspacePath) as Promise<{ ok: boolean; message: string }>,
  notifyTaskComplete: (input: { id: string; title: string; body: string }) => ipcRenderer.invoke("desktop:notify-task-complete", input) as Promise<{ ok: boolean; duplicate?: boolean }>,
  notifyConnectorApproval: (input: { id: string; taskID: string; title: string; body: string; approveLabel: string; rejectLabel: string }) => ipcRenderer.invoke("desktop:notify-connector-approval", input) as Promise<{ ok: boolean; duplicate?: boolean }>,
  dismissConnectorApproval: (taskID: string) => ipcRenderer.invoke("desktop:dismiss-connector-approval", taskID) as Promise<{ ok: boolean }>,
  runDesktopMenuAction: (action: "new-window" | "quit" | "close-window" | "copy" | "paste" | "cut" | "delete" | "undo" | "redo") => ipcRenderer.invoke("desktop:menu-action", action) as Promise<{ ok: boolean }>,
  openDesktopLink: (target: "official-site" | "github") => ipcRenderer.invoke("desktop:open-link", target) as Promise<{ ok: boolean }>,
  openExternalURL: (url: string) => ipcRenderer.invoke("desktop:open-external-url", url) as Promise<{ ok: boolean }>,
  setTitleBarTheme: (theme: "light" | "dark") => ipcRenderer.invoke("desktop:set-titlebar-theme", theme) as Promise<{ ok: boolean }>,
  checkDesktopUpdate: () => ipcRenderer.invoke("desktop-update:check") as Promise<DesktopUpdateResult>,
  installPreparedDesktopUpdate: () => ipcRenderer.invoke("desktop-update:install-prepared") as Promise<{ ok: boolean; message: string }>,
  setBuiltinServerEnabled: (enabled: boolean) => ipcRenderer.invoke("builtin-server:set-enabled", enabled) as Promise<BuiltinServerStatus>,
  startConnector: (input: StartConnectorInput) => ipcRenderer.invoke("connector:start", input) as Promise<StartConnectorResult>,
  ensureDesktopConnector: (input: { serverURL: string; token: string; deviceID?: string }) => ipcRenderer.invoke("connector:ensure-desktop", input) as Promise<StartConnectorResult>,
  onBuiltinServerStatus: (callback: (status: BuiltinServerStatus) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, status: BuiltinServerStatus) => callback(status)
    ipcRenderer.on("builtin-server:status", listener)
    return () => ipcRenderer.off("builtin-server:status", listener)
  },
  onDesktopProcessStatus: (callback: (status: DesktopProcessStatus) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, status: DesktopProcessStatus) => callback(status)
    ipcRenderer.on("desktop-processes:status", listener)
    return () => ipcRenderer.off("desktop-processes:status", listener)
  },
  onConnectorApprovalDecision: (callback: (input: { taskID: string; approved: boolean }) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, input: { taskID: string; approved: boolean }) => callback(input)
    ipcRenderer.on("desktop:connector-approval-decision", listener)
    return () => ipcRenderer.off("desktop:connector-approval-decision", listener)
  },
})
