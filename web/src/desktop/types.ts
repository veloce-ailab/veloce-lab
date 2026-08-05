export interface DesktopTab {
  id: string
  title: string
  serverURL: string
  path: string
}

export interface BuiltinServerStatus {
  enabled: boolean
  running: boolean
  phase: "idle" | "checking" | "downloading" | "starting" | "running" | "error"
  message: string
  serverURL: string
  version: string
}

export interface SetupStatus {
  required: boolean
}

export interface DesktopCurrentUser {
  username?: string
  email?: string
  avatar_url?: string
  balance?: string | number
}

export interface DesktopUserStats {
  balance?: string | number
}

export interface DesktopStorageSettings {
  file_storage_total_mb?: number
  file_storage_used_bytes?: number
}
