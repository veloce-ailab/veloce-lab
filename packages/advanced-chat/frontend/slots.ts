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
  addFileToPrompt?: (path: string) => void
  /**
   * Sends a message as if it had been typed: the page runs it, streams it, and
   * the stop button works. Used by a plugin whose user action means "ask the
   * model to do the next thing", so that turn looks like every other turn
   * instead of a run that only appears when it is over.
   */
  sendMessage?: (text: string) => void
}
