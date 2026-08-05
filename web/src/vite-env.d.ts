/// <reference types="vite/client" />

interface BuiltinServerStatus {
  enabled: boolean
  running: boolean
  phase: "idle" | "checking" | "downloading" | "starting" | "running" | "error"
  message: string
  serverURL: string
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

interface DesktopTabState {
  id: string
  title: string
  serverURL: string
  path: string
}

interface Window {
  veloceDesktop?: {
    getBuiltinServerStatus: () => Promise<BuiltinServerStatus>
    getDesktopProcessStatus: () => Promise<DesktopProcessStatus>
    terminateDesktopProcess: (id: string) => Promise<DesktopProcessStatus>
    getDesktopSettings: () => Promise<DesktopSettings>
    saveDesktopSettings: (settings: DesktopSettings) => Promise<DesktopSettings>
    chooseDesktopFile: () => Promise<string>
    chooseDesktopFolder: (initialPath?: string) => Promise<string>
    getDesktopSystemInfo: () => Promise<{ hostname: string; platform: string; instanceID: string }>
    openInVSCode: (workspacePath: string) => Promise<{ ok: boolean; message: string }>
    notifyTaskComplete: (input: { id: string; title: string; body: string }) => Promise<{ ok: boolean; duplicate?: boolean }>
    notifyConnectorApproval: (input: { id: string; taskID: string; title: string; body: string; approveLabel: string; rejectLabel: string }) => Promise<{ ok: boolean; duplicate?: boolean }>
    dismissConnectorApproval: (taskID: string) => Promise<{ ok: boolean }>
    runDesktopMenuAction: (action: "new-window" | "quit" | "close-window" | "copy" | "paste" | "cut" | "delete" | "undo" | "redo") => Promise<{ ok: boolean }>
    openDesktopLink: (target: "official-site" | "github") => Promise<{ ok: boolean }>
    openExternalURL: (url: string) => Promise<{ ok: boolean }>
    setTitleBarTheme: (theme: "light" | "dark") => Promise<{ ok: boolean }>
    openDesktopBrowser: (url?: string) => Promise<{ ok: boolean }>
    onBrowserAskPage: (callback: (page: { title?: string; url?: string }) => void) => () => void
    checkDesktopUpdate: () => Promise<DesktopUpdateResult>
    installPreparedDesktopUpdate: () => Promise<{ ok: boolean; message: string }>
    getDesktopTabInitialState: () => Promise<{ windowID: number; tab: DesktopTabState | null }>
    detachDesktopTab: (input: DesktopTabState & { screenX: number; screenY: number }) => Promise<{ moved: boolean; targetWindowID?: number }>
    setBuiltinServerEnabled: (enabled: boolean) => Promise<BuiltinServerStatus>
    startConnector: (input: {
      serverURL: string
      token: string
      mode: "platform" | "web_server"
      webPort?: number
    }) => Promise<{ ok: boolean; message: string; version: string }>
    ensureDesktopConnector: (input: { serverURL: string; authToken: string }) => Promise<{ ok: boolean; message: string; version: string }>
    desktopAuthLogin: (input: { serverURL: string; hint?: string }) => Promise<{ ok: boolean; token?: string; cancelled?: boolean; message?: string }>
    onBuiltinServerStatus: (callback: (status: BuiltinServerStatus) => void) => () => void
    onDesktopProcessStatus: (callback: (status: DesktopProcessStatus) => void) => () => void
    onDesktopTabReceived: (callback: (tab: DesktopTabState) => void) => () => void
    onConnectorApprovalDecision: (callback: (input: { taskID: string; approved: boolean }) => void) => () => void
  }
}
