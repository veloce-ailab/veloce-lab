/// <reference types="vite/client" />

interface BuiltinServerStatus {
  enabled: boolean
  running: boolean
  phase: "idle" | "checking" | "downloading" | "starting" | "running" | "error"
  message: string
  serverURL: string
  version: string
}


interface DesktopSettings {
  httpProxy: string
  builtinServerPath: string
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

interface Window {
  veloceDesktop?: {
    getBuiltinServerStatus: () => Promise<BuiltinServerStatus>
    getDesktopSettings: () => Promise<DesktopSettings>
    saveDesktopSettings: (settings: DesktopSettings) => Promise<DesktopSettings>
    chooseDesktopFolder: (initialPath?: string) => Promise<string>
    getDesktopSystemInfo: () => Promise<{ hostname: string; platform: string; instanceID: string; titleBar?: "overlay" | "frame" }>
    openInVSCode: (workspacePath: string) => Promise<{ ok: boolean; message: string }>
    notifyTaskComplete: (input: { id: string; title: string; body: string }) => Promise<{ ok: boolean; duplicate?: boolean }>
    notifyConnectorApproval: (input: { id: string; taskID: string; title: string; body: string; approveLabel: string; rejectLabel: string }) => Promise<{ ok: boolean; duplicate?: boolean }>
    dismissConnectorApproval: (taskID: string) => Promise<{ ok: boolean }>
    runDesktopMenuAction: (action: "new-window" | "quit" | "close-window" | "copy" | "paste" | "cut" | "delete" | "undo" | "redo") => Promise<{ ok: boolean }>
    openDesktopLink: (target: "official-site" | "github") => Promise<{ ok: boolean }>
    openExternalURL: (url: string) => Promise<{ ok: boolean }>
    setTitleBarTheme: (theme: "light" | "dark") => Promise<{ ok: boolean }>
    checkDesktopUpdate: () => Promise<DesktopUpdateResult>
    installPreparedDesktopUpdate: () => Promise<{ ok: boolean; message: string }>
    setBuiltinServerEnabled: (enabled: boolean) => Promise<BuiltinServerStatus>
      serverURL: string
      token: string
      mode: "platform"
    }) => Promise<{ ok: boolean; message: string; version: string }>
    onBuiltinServerStatus: (callback: (status: BuiltinServerStatus) => void) => () => void
    onConnectorApprovalDecision: (callback: (input: { taskID: string; approved: boolean }) => void) => () => void
  }
}
