/** Live chat state passed through dashboard slots; plugins never refetch the session. */
export interface ChatSlotSession {
  id: string
  run_mode?: string
  connector_device_id?: string
  connector_workspace_path?: string
  connector_approval_mode?: string
}

export interface ChatSlotDevice {
  id: string
  name: string
  os?: string
  online?: boolean
}

export interface ChatSlotMessage {
  tool_calls?: Array<{ name: string; status: string; arguments?: Record<string, unknown> }>
}

export interface ChatSlotData extends Record<string, unknown> {
  session?: ChatSlotSession
  runMode: string
  messages: ChatSlotMessage[]
  device?: ChatSlotDevice
  devices: ChatSlotDevice[]
  recentWorkspacePaths: string[]
  setDevice: (deviceID: string) => void
  setWorkspacePath: (path: string) => void
  openWorkspacePicker: () => void
}
