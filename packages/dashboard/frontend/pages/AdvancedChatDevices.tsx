import { useEffect, useMemo, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { ArrowLeft, Copy, KeyRound, Laptop, Play, Plus, RefreshCcw, Save, Server, Settings, Square, Terminal, Trash2, XCircle } from "lucide-react"
import { Link, useNavigate, useParams } from "react-router-dom"
import api, { getDesktopServerURL, isDesktopTarget } from "@/lib/api"
import { useI18n } from "@/lib/i18n"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { useToast } from "@/components/ui/toast"
import { useConfirmDialog } from "@/components/ui/confirm-dialog"
import { cn } from "@/lib/utils"
import { withPublicSettingsDefaults, type PublicSettings } from "@/lib/public-settings"

interface ConnectorDevice {
  id: string
  name: string
  hostname?: string
  os?: string
  arch?: string
  version?: string
  kind?: "cli" | "desktop" | string
  desktop_instance_id?: string
  status: string
  online: boolean
  last_seen_at?: string
  created_at?: string
}

interface ConnectorTask {
  id: string
  device_id: string
  run_id?: string
  action: string
  workspace_path?: string
  workspace_unrestricted?: boolean
  payload: Record<string, unknown>
  status: string
  result?: string
  error_message?: string
  started_at?: string
  finished_at?: string
  created_at?: string
  updated_at?: string
}

interface MCPProcess {
  key: string
  id?: string
  name?: string
  command: string
  args?: string[]
  cwd?: string
  pid?: number
  initialized: boolean
  pending_requests: number
  started_at?: string
}

interface ConnectorCredential {
  id: string
  name: string
  type: "environment" | "http_header"
  key: string
  value_set: boolean
}

interface ConnectorDeviceCredentialsResponse {
  credentials: ConnectorCredential[]
  credential_ids: string[]
}

const devicesQueryKey = ["advanced-chat-connector-devices"] as const

export default function AdvancedChatDevices() {
  const { language } = useI18n()
  const copy = language === "zh" ? zhCopy : language === "ja" ? jaCopy : enCopy
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { success, error } = useToast()
  const { confirm, confirmDialog } = useConfirmDialog()
  const [deviceName, setDeviceName] = useState(copy.defaultDeviceName)
  const [token, setToken] = useState("")
  const [isCreating, setIsCreating] = useState(false)
  const [generatingDeviceID, setGeneratingDeviceID] = useState("")
  const [connectingDeviceID, setConnectingDeviceID] = useState("")
  const [deletingDeviceID, setDeletingDeviceID] = useState("")
  const [editingDeviceID, setEditingDeviceID] = useState("")
  const [editingDeviceName, setEditingDeviceName] = useState("")

  const { data: devices = [], isFetching, refetch } = useQuery<ConnectorDevice[]>({
    queryKey: devicesQueryKey,
    refetchInterval: 5000,
    queryFn: async () => {
      const res = await api.get("/user/advanced-chat/devices")
      return Array.isArray(res.data) ? res.data.map(normalizeDevice).filter((device): device is ConnectorDevice => Boolean(device)) : []
    },
  })

  const { data: publicSettings } = useQuery<Partial<PublicSettings>>({
    queryKey: ["public-settings"],
    queryFn: async () => {
      const res = await api.get("/public/settings")
      return res.data
    },
  })

  const baseURL = useMemo(() => {
    if (isDesktopTarget()) {
      return getDesktopServerURL()
    }
    const value = withPublicSettingsDefaults(publicSettings).base_url.trim()
    return value || (typeof window !== "undefined" ? window.location.origin : "http://localhost:8080")
  }, [publicSettings])

  useEffect(() => {
    setDeviceName(copy.defaultDeviceName)
  }, [copy.defaultDeviceName])

  const commands = useMemo(() => {
    if (!token) {
      return { windows: "", unix: "" }
    }
    const server = quoteArg(baseURL)
    const rawToken = quoteArg(token)
    return {
      windows: `app.exe -server ${server} -token ${rawToken}`,
      unix: `./app -server ${server} -token ${rawToken}`,
    }
  }, [baseURL, token])

  const createToken = async () => {
    const name = deviceName.trim() || copy.defaultDeviceName
    setIsCreating(true)
    try {
      const res = await api.post("/user/advanced-chat/devices/token", {
        name,
        mode: "platform",
      })
      const nextToken = typeof res.data?.token === "string" ? res.data.token : ""
      if (!nextToken) {
        throw new Error(copy.createFailed)
      }
      setToken(nextToken)
      success(copy.created)
      await queryClient.invalidateQueries({ queryKey: devicesQueryKey })
    } catch (err) {
      error(apiErrorMessage(err, copy.createFailed))
    } finally {
      setIsCreating(false)
    }
  }

  const copyValue = async (value: string) => {
    if (!value) {
      return
    }
    await navigator.clipboard.writeText(value)
    success(copy.copied)
  }

  const regenerateDeviceCommand = async (device: ConnectorDevice) => {
    setGeneratingDeviceID(device.id)
    try {
      const res = await api.post(`/user/advanced-chat/devices/${encodeURIComponent(device.id)}/token`)
      const nextToken = typeof res.data?.token === "string" ? res.data.token : ""
      if (!nextToken) {
        throw new Error(copy.regenerateFailed)
      }
      setDeviceName(device.name)
      setToken(nextToken)
      success(copy.commandRegenerated)
      await queryClient.invalidateQueries({ queryKey: devicesQueryKey })
    } catch (err) {
      error(apiErrorMessage(err, copy.regenerateFailed))
    } finally {
      setGeneratingDeviceID("")
    }
  }

  const connectToken = async ({
    connectionToken,
    deviceID,
  }: {
    connectionToken: string
    deviceID: string
  }) => {
    if (!window.veloceDesktop) {
      error(copy.desktopOnly)
      return
    }
    setConnectingDeviceID(deviceID)
    try {
      const result = await window.veloceDesktop.startConnector({
        serverURL: baseURL,
        token: connectionToken,
        mode: "platform",
      })
      if (!result.ok) {
        throw new Error(result.message || copy.connectFailed)
      }
      success(result.version ? copy.connectedWithVersion.replace("{version}", result.version) : copy.connected)
      await queryClient.invalidateQueries({ queryKey: devicesQueryKey })
    } catch (err) {
      error(err instanceof Error ? err.message : copy.connectFailed)
    } finally {
      setConnectingDeviceID("")
    }
  }

  const connectCurrentToken = async () => {
    await connectToken({
      connectionToken: token,
      deviceID: "__new__",
    })
  }

  const deleteDevice = async (device: ConnectorDevice) => {
    if (!await confirm({ description: copy.deleteConfirm.replace("{name}", device.name) })) {
      return
    }
    setDeletingDeviceID(device.id)
    try {
      await api.delete(`/user/advanced-chat/devices/${encodeURIComponent(device.id)}`)
      if (generatingDeviceID === device.id) {
        setGeneratingDeviceID("")
      }
      success(copy.deleted)
      await queryClient.invalidateQueries({ queryKey: devicesQueryKey })
    } catch (err) {
      error(apiErrorMessage(err, copy.deleteFailed))
    } finally {
      setDeletingDeviceID("")
    }
  }

  const openDeviceEditor = (device: ConnectorDevice) => {
    setEditingDeviceID(device.id)
    setEditingDeviceName(device.name)
  }

  const closeDeviceEditor = () => {
    setEditingDeviceID("")
    setEditingDeviceName("")
  }

  const saveDeviceName = async () => {
    const device = devices.find((item) => item.id === editingDeviceID)
    const name = editingDeviceName.trim()
    if (!device || !name) {
      error(copy.deviceNameRequired)
      return
    }
    try {
      await api.put(`/user/advanced-chat/devices/${encodeURIComponent(device.id)}`, { name })
      success(copy.savedName)
      await queryClient.invalidateQueries({ queryKey: devicesQueryKey })
      closeDeviceEditor()
    } catch (err) {
      error(apiErrorMessage(err, copy.saveFailed))
    }
  }

  return (
    <div className="space-y-6">
      {confirmDialog}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">{copy.title}</h1>
          <div className="mt-2 text-sm text-muted-foreground">{copy.subtitle}</div>
        </div>
        <Button variant="outline" className="gap-2" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCcw size={16} />
          {copy.refresh}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Terminal size={18} />
            {copy.commandTitle}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[1fr_1fr_auto]">
            <label className="space-y-1 text-sm">
              <span className="font-medium">{copy.deviceName}</span>
              <Input
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={deviceName}
                onChange={(event) => {
                  setDeviceName(event.target.value)
                  setToken("")
                }}
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium">Base URL</span>
              <Input className="h-10 w-full bg-muted text-muted-foreground" value={baseURL} readOnly />
            </label>
            <div className="flex items-end">
              <Button className="w-full gap-2" onClick={createToken} disabled={isCreating}>
                <Plus size={16} />
                {isCreating ? copy.creating : copy.generateCommand}
              </Button>
            </div>
          </div>

          {token && (
            <div className="space-y-3 rounded-md border bg-muted/30 p-3 text-sm">
              <CommandRow label={copy.token} value={token} copyText={copy.copy} onCopy={copyValue} />
              <CommandRow label={copy.windowsCommand} value={commands.windows} copyText={copy.copy} onCopy={copyValue} />
              <CommandRow label={copy.unixCommand} value={commands.unix} copyText={copy.copy} onCopy={copyValue} />
              {window.veloceDesktop && (
                <div className="flex justify-end">
                  <Button className="gap-2" onClick={connectCurrentToken} disabled={connectingDeviceID === "__new__"}>
                    <Play size={15} />
                    {connectingDeviceID === "__new__" ? copy.connecting : copy.connectNow}
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Laptop size={18} />
            {copy.deviceList}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {devices.length === 0 ? (
            <div className="rounded-md border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">{copy.empty}</div>
          ) : (
            <div className="space-y-3">
              {devices.map((device) => (
                <div
                  key={device.id}
                  className="cursor-pointer rounded-md border p-4 transition-colors hover:bg-muted/30"
                  role="button"
                  tabIndex={0}
                  onClick={() => navigate(`/settings/devices/${encodeURIComponent(device.id)}`)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault()
                      navigate(`/settings/devices/${encodeURIComponent(device.id)}`)
                    }
                  }}
                >
                  <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-center">
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-center gap-2">
                        <div className="truncate text-sm font-medium">{device.name}</div>
                        <span className={cn("shrink-0 text-xs", device.online ? "text-emerald-600" : "text-muted-foreground")}>
                          {device.online ? copy.online : copy.offline}
                        </span>
                      </div>
                      <div className="mt-1 truncate text-xs text-muted-foreground">
                        {[device.kind === "desktop" ? (language === "zh" ? "桌面端设备" : "Desktop device") : (language === "zh" ? "CLI 设备" : "CLI device"), device.hostname, device.os, device.arch, device.version, "platform"].filter(Boolean).join(" / ") || "-"}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">{copy.lastSeen}: {formatDateTime(device.last_seen_at) || "-"}</div>
                    </div>
                    <div className="flex flex-wrap gap-2 lg:justify-end" onClick={(event) => event.stopPropagation()}>
                      {device.kind !== "desktop" && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 gap-2"
                          onClick={() => regenerateDeviceCommand(device)}
                          disabled={Boolean(generatingDeviceID) || deletingDeviceID === device.id}
                          aria-label={copy.regenerateCommand}
                          title={copy.regenerateCommand}
                        >
                          <KeyRound size={15} />
                          {generatingDeviceID === device.id ? copy.regeneratingCommand : copy.regenerateCommand}
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => openDeviceEditor(device)}
                        disabled={deletingDeviceID === device.id}
                        aria-label={copy.editDevice}
                        title={copy.editDevice}
                      >
                        <Settings size={15} />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => deleteDevice(device)}
                        disabled={Boolean(deletingDeviceID)}
                        aria-label={copy.deleteDevice}
                        title={copy.deleteDevice}
                      >
                        <Trash2 size={15} />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={Boolean(editingDeviceID)}
        onOpenChange={(open) => {
          if (!open) {
            closeDeviceEditor()
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{copy.editDevice}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <div className="text-sm font-medium">{copy.deviceName}</div>
            <Input value={editingDeviceName} onChange={(event) => setEditingDeviceName(event.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDeviceEditor}>
              {copy.cancel}
            </Button>
            <Button className="gap-2" onClick={saveDeviceName}>
              <Save size={15} />
              {copy.save}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export function AdvancedChatDeviceDetail() {
  const { id = "" } = useParams()
  const deviceID = id.trim()
  const { language } = useI18n()
  const copy = language === "zh" ? zhCopy : language === "ja" ? jaCopy : enCopy
  const queryClient = useQueryClient()
  const { success, error } = useToast()
  const [cancellingTaskID, setCancellingTaskID] = useState("")
  const [mcpProcesses, setMCPProcesses] = useState<MCPProcess[]>([])
  const [isLoadingMCP, setIsLoadingMCP] = useState(false)
  const [stoppingMCPKey, setStoppingMCPKey] = useState("")
  const [selectedCredentialIDs, setSelectedCredentialIDs] = useState<string[]>([])
  const [isSavingCredentials, setIsSavingCredentials] = useState(false)

  const { data: device, isFetching: isFetchingDevice } = useQuery<ConnectorDevice | null>({
    queryKey: ["advanced-chat-connector-device", deviceID],
    enabled: Boolean(deviceID),
    refetchInterval: 5000,
    queryFn: async () => {
      const res = await api.get(`/user/advanced-chat/devices/${encodeURIComponent(deviceID)}`)
      return normalizeDevice(res.data)
    },
  })

  const tasksQueryKey = ["advanced-chat-connector-device-tasks", deviceID] as const
  const { data: tasks = [], isFetching: isFetchingTasks } = useQuery<ConnectorTask[]>({
    queryKey: tasksQueryKey,
    enabled: Boolean(deviceID),
    refetchInterval: 5000,
    queryFn: async () => {
      const res = await api.get(`/user/advanced-chat/devices/${encodeURIComponent(deviceID)}/tasks?limit=80`)
      return Array.isArray(res.data) ? res.data.map(normalizeConnectorTask).filter((task): task is ConnectorTask => Boolean(task)) : []
    },
  })

  const credentialsQueryKey = ["advanced-chat-connector-device-credentials", deviceID] as const
  const credentialsQuery = useQuery<ConnectorDeviceCredentialsResponse>({
    queryKey: credentialsQueryKey,
    enabled: Boolean(deviceID),
    queryFn: async () => normalizeConnectorDeviceCredentials((await api.get(`/user/advanced-chat/devices/${encodeURIComponent(deviceID)}/credentials`)).data),
  })

  useEffect(() => {
    setSelectedCredentialIDs(credentialsQuery.data?.credential_ids || [])
  }, [credentialsQuery.data?.credential_ids])

  const refreshMCPProcesses = async () => {
    if (!deviceID) {
      return
    }
    setIsLoadingMCP(true)
    try {
      const res = await api.get(`/user/advanced-chat/devices/${encodeURIComponent(deviceID)}/mcp-processes`)
      const items = isRecord(res.data) && Array.isArray(res.data.processes) ? res.data.processes : []
      setMCPProcesses(items.map(normalizeMCPProcess).filter((process): process is MCPProcess => Boolean(process)))
    } catch (err) {
      error(apiErrorMessage(err, copy.mcpRefreshFailed))
    } finally {
      setIsLoadingMCP(false)
      await queryClient.invalidateQueries({ queryKey: tasksQueryKey })
    }
  }

  useEffect(() => {
    if (device?.online) {
      refreshMCPProcesses()
    } else {
      setMCPProcesses([])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [device?.id, device?.online])

  const cancelTask = async (task: ConnectorTask) => {
    setCancellingTaskID(task.id)
    try {
      await api.post(`/user/advanced-chat/devices/${encodeURIComponent(deviceID)}/tasks/${encodeURIComponent(task.id)}/cancel`)
      success(copy.taskCancelled)
      await queryClient.invalidateQueries({ queryKey: tasksQueryKey })
    } catch (err) {
      error(apiErrorMessage(err, copy.taskCancelFailed))
    } finally {
      setCancellingTaskID("")
    }
  }

  const stopMCPProcess = async (process: MCPProcess) => {
    setStoppingMCPKey(process.key)
    try {
      await api.post(`/user/advanced-chat/devices/${encodeURIComponent(deviceID)}/mcp-processes/stop`, { key: process.key })
      success(copy.mcpStopped)
      await refreshMCPProcesses()
    } catch (err) {
      error(apiErrorMessage(err, copy.mcpStopFailed))
    } finally {
      setStoppingMCPKey("")
    }
  }

  const saveCredentials = async () => {
    setIsSavingCredentials(true)
    try {
      await api.put(`/user/advanced-chat/devices/${encodeURIComponent(deviceID)}/credentials`, { credential_ids: selectedCredentialIDs })
      success(copy.credentialsSaved)
      await queryClient.invalidateQueries({ queryKey: credentialsQueryKey })
    } catch (err) {
      error(apiErrorMessage(err, copy.credentialsSaveFailed))
    } finally {
      setIsSavingCredentials(false)
    }
  }

  const toggleCredential = (credentialID: string, checked: boolean) => {
    setSelectedCredentialIDs((current) => checked ? [...new Set([...current, credentialID])] : current.filter((id) => id !== credentialID))
  }

  const activeTasks = tasks.filter((task) => isActiveConnectorTask(task.status))
  const recentTasks = tasks.filter((task) => !isActiveConnectorTask(task.status))

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <Button asChild variant="ghost" className="-ml-3 mb-2 gap-2">
            <Link to="/settings/devices">
              <ArrowLeft size={16} />
              {copy.backToDevices}
            </Link>
          </Button>
          <h1 className="truncate text-3xl font-bold">{device?.name || copy.deviceDetail}</h1>
          <div className="mt-2 text-sm text-muted-foreground">{copy.deviceDetailSubtitle}</div>
        </div>
        <Button variant="outline" className="gap-2" onClick={() => queryClient.invalidateQueries({ queryKey: tasksQueryKey })} disabled={isFetchingTasks || isFetchingDevice}>
          <RefreshCcw size={16} />
          {copy.refresh}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Laptop size={18} />
            {copy.deviceOverview}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!device ? (
            <div className="text-sm text-muted-foreground">{isFetchingDevice ? copy.loading : copy.deviceNotFound}</div>
          ) : (
            <div className="grid gap-3 text-sm md:grid-cols-2 xl:grid-cols-4">
              <InfoField label={copy.status} value={device.online ? copy.online : copy.offline} accent={device.online ? "text-emerald-600" : "text-muted-foreground"} />
              <InfoField label={copy.environment} value={[device.hostname, device.os, device.arch].filter(Boolean).join(" / ") || "-"} />
              <InfoField label={copy.version} value={device.version || "-"} />
              <InfoField label={copy.lastSeen} value={formatDateTime(device.last_seen_at) || "-"} />
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <KeyRound size={18} />
            {copy.connectorCredentials}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {credentialsQuery.isLoading ? <div className="text-sm text-muted-foreground">{copy.loading}</div> : (credentialsQuery.data?.credentials || []).length === 0 ? (
            <div className="rounded-md border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
              {copy.noCredentials} <Link to="/settings/credentials" className="ml-1 text-primary underline-offset-4 hover:underline">{copy.manageCredentials}</Link>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                {(credentialsQuery.data?.credentials || []).map((credential) => {
                  const selected = selectedCredentialIDs.includes(credential.id)
                  return <label key={credential.id} className="flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2.5 text-sm hover:bg-muted/30"><Checkbox checked={selected} onCheckedChange={(checked) => toggleCredential(credential.id, checked === true)} /><span className="min-w-0 flex-1"><span className="block truncate font-medium">{credential.name}</span><span className="block truncate font-mono text-xs text-muted-foreground">{credential.key}</span></span><span className="shrink-0 rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">{credential.type === "environment" ? copy.environmentCredential : copy.headerCredential}</span></label>
                })}
              </div>
              <div className="flex items-center justify-between gap-3"><Link to="/settings/credentials" className="text-sm text-primary underline-offset-4 hover:underline">{copy.manageCredentials}</Link><Button size="sm" className="gap-2" disabled={isSavingCredentials} onClick={saveCredentials}><Save size={15} />{isSavingCredentials ? copy.saving : copy.save}</Button></div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Terminal size={18} />
            {copy.runningTasks}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {activeTasks.length === 0 ? (
            <div className="rounded-md border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">{copy.noRunningTasks}</div>
          ) : (
            activeTasks.map((task) => (
              <ConnectorTaskRow key={task.id} task={task} copy={copy} cancelling={cancellingTaskID === task.id} onCancel={() => cancelTask(task)} />
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-3 text-base">
            <span className="flex items-center gap-2">
              <Server size={18} />
              {copy.mcpProcesses}
            </span>
            <Button variant="outline" size="sm" className="gap-2" onClick={refreshMCPProcesses} disabled={!device?.online || isLoadingMCP}>
              <RefreshCcw size={15} />
              {isLoadingMCP ? copy.loading : copy.refresh}
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {!device?.online ? (
            <div className="rounded-md border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">{copy.deviceOfflineHint}</div>
          ) : mcpProcesses.length === 0 ? (
            <div className="rounded-md border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">{copy.noMCPProcesses}</div>
          ) : (
            mcpProcesses.map((process) => (
              <div key={process.key} className="rounded-md border p-3">
                <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-center">
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-2">
                      <div className="truncate text-sm font-medium">{process.name || process.id || process.command}</div>
                      <span className="shrink-0 rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">PID {process.pid || "-"}</span>
                      <span className={cn("shrink-0 text-xs", process.initialized ? "text-emerald-600" : "text-muted-foreground")}>{process.initialized ? copy.initialized : copy.starting}</span>
                    </div>
                    <div className="mt-1 truncate font-mono text-xs text-muted-foreground">{[process.command, ...(process.args || [])].filter(Boolean).join(" ")}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {copy.pendingRequests}: {process.pending_requests || 0} · {copy.startedAt}: {formatDateTime(process.started_at) || "-"}
                    </div>
                  </div>
                  <Button variant="outline" size="sm" className="gap-2 text-destructive hover:text-destructive" onClick={() => stopMCPProcess(process)} disabled={stoppingMCPKey === process.key}>
                    <Square size={15} />
                    {stoppingMCPKey === process.key ? copy.stopping : copy.stopProcess}
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{copy.recentTasks}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {recentTasks.length === 0 ? (
            <div className="rounded-md border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">{copy.noRecentTasks}</div>
          ) : (
            recentTasks.slice(0, 30).map((task) => <ConnectorTaskRow key={task.id} task={task} copy={copy} />)
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function CommandRow({ label, value, copyText, onCopy }: { label: string; value: string; copyText: string; onCopy: (value: string) => void }) {
  return (
    <div className="grid gap-2 sm:grid-cols-[8rem_1fr_auto] sm:items-center">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="min-w-0 break-all rounded-md bg-background p-2 font-mono text-xs">{value}</div>
      <Button variant="outline" size="sm" className="gap-2" onClick={() => onCopy(value)}>
        <Copy size={15} />
        {copyText}
      </Button>
    </div>
  )
}

function InfoField({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-md border bg-muted/20 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={cn("mt-1 truncate text-sm font-medium", accent)}>{value}</div>
    </div>
  )
}

function ConnectorTaskRow({ task, copy, cancelling, onCancel }: { task: ConnectorTask; copy: typeof zhCopy; cancelling?: boolean; onCancel?: () => void }) {
  const active = isActiveConnectorTask(task.status)
  return (
    <div className="rounded-md border p-3">
      <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-center">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-sm font-medium">{task.action || "connector"}</span>
            <span className={cn("shrink-0 rounded-md px-2 py-0.5 text-xs", taskStatusClass(task.status))}>{taskStatusLabel(task.status, copy)}</span>
          </div>
          <div className="mt-1 truncate text-xs text-muted-foreground">
            {copy.createdAt}: {formatDateTime(task.created_at) || "-"}
            {task.started_at ? ` · ${copy.startedAt}: ${formatDateTime(task.started_at)}` : ""}
            {task.finished_at ? ` · ${copy.finishedAt}: ${formatDateTime(task.finished_at)}` : ""}
          </div>
          {task.error_message && <div className="mt-1 truncate text-xs text-destructive">{task.error_message}</div>}
          {!task.error_message && task.result && <div className="mt-1 truncate text-xs text-muted-foreground">{task.result}</div>}
        </div>
        {active && onCancel && (
          <Button variant="outline" size="sm" className="gap-2 text-destructive hover:text-destructive" onClick={onCancel} disabled={cancelling}>
            <XCircle size={15} />
            {cancelling ? copy.cancelling : copy.cancelTask}
          </Button>
        )}
      </div>
    </div>
  )
}

function normalizeDevice(value: unknown): ConnectorDevice | null {
  if (!isRecord(value)) {
    return null
  }
  const id = stringFromUnknown(value.id)
  if (!id) {
    return null
  }
  return {
    id,
    name: stringFromUnknown(value.name) || "Local device",
    hostname: stringFromUnknown(value.hostname) || undefined,
    os: stringFromUnknown(value.os) || undefined,
    arch: stringFromUnknown(value.arch) || undefined,
    version: stringFromUnknown(value.version) || undefined,
    kind: stringFromUnknown(value.kind) || "cli",
    desktop_instance_id: stringFromUnknown(value.desktop_instance_id) || undefined,
    status: stringFromUnknown(value.status) || "offline",
    online: value.online === true,
    last_seen_at: stringFromUnknown(value.last_seen_at) || undefined,
    created_at: stringFromUnknown(value.created_at) || undefined,
  }
}

function normalizeConnectorTask(value: unknown): ConnectorTask | null {
  if (!isRecord(value)) {
    return null
  }
  const id = stringFromUnknown(value.id)
  if (!id) {
    return null
  }
  return {
    id,
    device_id: stringFromUnknown(value.device_id),
    run_id: stringFromUnknown(value.run_id) || undefined,
    action: stringFromUnknown(value.action) || "connector",
    workspace_path: stringFromUnknown(value.workspace_path) || undefined,
    workspace_unrestricted: value.workspace_unrestricted === true,
    payload: isRecord(value.payload) ? value.payload : {},
    status: stringFromUnknown(value.status) || "queued",
    result: stringFromUnknown(value.result) || undefined,
    error_message: stringFromUnknown(value.error_message) || undefined,
    started_at: stringFromUnknown(value.started_at) || undefined,
    finished_at: stringFromUnknown(value.finished_at) || undefined,
    created_at: stringFromUnknown(value.created_at) || undefined,
    updated_at: stringFromUnknown(value.updated_at) || undefined,
  }
}

function normalizeMCPProcess(value: unknown): MCPProcess | null {
  if (!isRecord(value)) {
    return null
  }
  const key = stringFromUnknown(value.key)
  if (!key) {
    return null
  }
  return {
    key,
    id: stringFromUnknown(value.id) || undefined,
    name: stringFromUnknown(value.name) || undefined,
    command: stringFromUnknown(value.command) || "mcp",
    args: Array.isArray(value.args) ? value.args.filter((item): item is string => typeof item === "string") : [],
    cwd: stringFromUnknown(value.cwd) || undefined,
    pid: typeof value.pid === "number" ? value.pid : undefined,
    initialized: value.initialized === true,
    pending_requests: typeof value.pending_requests === "number" ? value.pending_requests : 0,
    started_at: stringFromUnknown(value.started_at) || undefined,
  }
}

function normalizeConnectorDeviceCredentials(value: unknown): ConnectorDeviceCredentialsResponse {
  const item = isRecord(value) ? value : {}
  const credentials = Array.isArray(item.credentials) ? item.credentials.map((credential) => {
    if (!isRecord(credential) || !stringFromUnknown(credential.id)) return null
    return {
      id: stringFromUnknown(credential.id),
      name: stringFromUnknown(credential.name),
      type: credential.type === "http_header" ? "http_header" as const : "environment" as const,
      key: stringFromUnknown(credential.key),
      value_set: credential.value_set === true,
    }
  }).filter((credential): credential is ConnectorCredential => Boolean(credential)) : []
  const credentialIDs = Array.isArray(item.credential_ids) ? item.credential_ids.filter((id): id is string => typeof id === "string" && id.trim() !== "") : []
  return { credentials, credential_ids: credentialIDs }
}

function isActiveConnectorTask(status: string) {
  return status === "queued" || status === "running" || status === "pending_approval"
}

function taskStatusLabel(status: string, copy: typeof zhCopy) {
  switch (status) {
    case "pending_approval":
      return copy.pendingApproval
    case "queued":
      return copy.queued
    case "running":
      return copy.running
    case "completed":
      return copy.completed
    case "failed":
      return copy.failed
    default:
      return status || "-"
  }
}

function taskStatusClass(status: string) {
  switch (status) {
    case "completed":
      return "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
    case "failed":
      return "bg-destructive/10 text-destructive"
    case "running":
      return "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300"
    default:
      return "bg-muted text-muted-foreground"
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function stringFromUnknown(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

function quoteArg(value: string) {
  if (!/[ \t"]/g.test(value)) {
    return value
  }
  return `"${value.replace(/"/g, '\\"')}"`
}

function formatDateTime(value?: string) {
  if (!value) {
    return ""
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }
  return date.toLocaleString()
}

function apiErrorMessage(err: unknown, fallback: string) {
  if (isRecord(err) && isRecord(err.response) && isRecord(err.response.data) && typeof err.response.data.error === "string") {
    return err.response.data.error
  }
  return err instanceof Error ? err.message : fallback
}

const zhCopy = {
  title: "设备",
  subtitle: "管理连接到助理聊天的本地设备，并生成本地连接器启动命令。",
  commandTitle: "添加设备",
  deviceName: "设备名称",
  defaultDeviceName: "本地设备",
  generateCommand: "生成连接命令",
  creating: "生成中...",
  token: "令牌",
  windowsCommand: "Windows",
  unixCommand: "macOS / Linux",
  copy: "复制",
  copied: "已复制",
  connectNow: "立即连接",
  connecting: "连接中...",
  connected: "连接器已启动",
  connectedWithVersion: "连接器已启动（{version}）",
  connectFailed: "连接失败",
  desktopOnly: "立即连接仅在桌面应用中可用",
  created: "连接命令已生成",
  createFailed: "生成连接命令失败",
  regenerateCommand: "重新生成连接命令",
  regeneratingCommand: "生成中...",
  commandRegenerated: "连接命令已重新生成",
  regenerateFailed: "重新生成连接命令失败",
  deleteDevice: "删除设备",
  deleteConfirm: "确定删除设备“{name}”吗？",
  deleted: "设备已删除",
  deleteFailed: "删除设备失败",
  deviceList: "设备列表",
  empty: "暂无设备，先生成命令并启动 app 连接器。",
  refresh: "刷新",
  online: "在线",
  offline: "离线",
  lastSeen: "最后在线",
  editDevice: "设备设置",
  deviceDetail: "设备详情",
  deviceDetailSubtitle: "查看这个连接器正在执行的任务和它托管的 MCP 子进程。",
  backToDevices: "返回设备",
  deviceOverview: "连接器概览",
  deviceNotFound: "设备不存在",
  loading: "加载中...",
  status: "状态",
  environment: "运行环境",
  connectorCredentials: "连接器凭据",
  noCredentials: "暂未创建可用凭据。",
  manageCredentials: "管理凭据",
  environmentCredential: "环境变量",
  headerCredential: "HTTP 请求头",
  credentialsSaved: "连接器凭据已保存",
  credentialsSaveFailed: "保存连接器凭据失败",
  version: "版本",
  runningTasks: "正在运行的任务",
  noRunningTasks: "暂无正在运行的任务",
  recentTasks: "最近任务",
  noRecentTasks: "暂无最近任务",
  cancelTask: "取消任务",
  cancelling: "取消中...",
  taskCancelled: "任务已取消",
  taskCancelFailed: "取消任务失败",
  pendingApproval: "待批准",
  queued: "排队中",
  running: "运行中",
  completed: "已完成",
  failed: "失败",
  createdAt: "创建",
  startedAt: "开始",
  finishedAt: "结束",
  mcpProcesses: "MCP 子进程",
  noMCPProcesses: "暂无 MCP 子进程。使用 Connector MCP 后会出现在这里。",
  deviceOfflineHint: "设备离线，无法读取 MCP 子进程。",
  mcpRefreshFailed: "刷新 MCP 子进程失败",
  mcpStopped: "MCP 子进程已停止",
  mcpStopFailed: "停止 MCP 子进程失败",
  initialized: "已初始化",
  starting: "启动中",
  pendingRequests: "等待请求",
  stopProcess: "停止进程",
  stopping: "停止中...",
  save: "保存",
  saving: "保存中...",
  savedName: "设备名称已保存",
  saveFailed: "保存设备名称失败",
  deviceNameRequired: "设备名称不能为空",
  cancel: "取消",
}

const enCopy: typeof zhCopy = {
  title: "Devices",
  subtitle: "Manage local devices connected to agent chat and generate connector start commands.",
  commandTitle: "Add device",
  deviceName: "Device name",
  defaultDeviceName: "Local device",
  generateCommand: "Generate command",
  creating: "Generating...",
  token: "Token",
  windowsCommand: "Windows",
  unixCommand: "macOS / Linux",
  copy: "Copy",
  copied: "Copied",
  connectNow: "Connect now",
  connecting: "Connecting...",
  connected: "Connector started",
  connectedWithVersion: "Connector started ({version})",
  connectFailed: "Failed to connect",
  desktopOnly: "Connect now is only available in the desktop app",
  created: "Connector command generated",
  createFailed: "Failed to generate connector command",
  regenerateCommand: "Regenerate command",
  regeneratingCommand: "Generating...",
  commandRegenerated: "Connector command regenerated",
  regenerateFailed: "Failed to regenerate connector command",
  deleteDevice: "Delete device",
  deleteConfirm: 'Delete device "{name}"?',
  deleted: "Device deleted",
  deleteFailed: "Failed to delete device",
  deviceList: "Device list",
  empty: "No devices yet. Generate a command and start the app connector first.",
  refresh: "Refresh",
  online: "Online",
  offline: "Offline",
  lastSeen: "Last seen",
  editDevice: "Device settings",
  deviceDetail: "Device detail",
  deviceDetailSubtitle: "Inspect active connector tasks and MCP subprocesses managed by this connector.",
  backToDevices: "Back to devices",
  deviceOverview: "Connector overview",
  deviceNotFound: "Device not found",
  loading: "Loading...",
  status: "Status",
  environment: "Environment",
  connectorCredentials: "Connector credentials",
  noCredentials: "No credentials are available yet.",
  manageCredentials: "Manage credentials",
  environmentCredential: "Environment variable",
  headerCredential: "HTTP header",
  credentialsSaved: "Connector credentials saved",
  credentialsSaveFailed: "Failed to save connector credentials",
  version: "Version",
  runningTasks: "Running tasks",
  noRunningTasks: "No running tasks",
  recentTasks: "Recent tasks",
  noRecentTasks: "No recent tasks",
  cancelTask: "Cancel task",
  cancelling: "Cancelling...",
  taskCancelled: "Task cancelled",
  taskCancelFailed: "Failed to cancel task",
  pendingApproval: "Pending approval",
  queued: "Queued",
  running: "Running",
  completed: "Completed",
  failed: "Failed",
  createdAt: "Created",
  startedAt: "Started",
  finishedAt: "Finished",
  mcpProcesses: "MCP subprocesses",
  noMCPProcesses: "No MCP subprocesses yet. They appear here after using Connector MCP.",
  deviceOfflineHint: "Device is offline. MCP subprocesses cannot be read.",
  mcpRefreshFailed: "Failed to refresh MCP subprocesses",
  mcpStopped: "MCP subprocess stopped",
  mcpStopFailed: "Failed to stop MCP subprocess",
  initialized: "Initialized",
  starting: "Starting",
  pendingRequests: "Pending requests",
  stopProcess: "Stop process",
  stopping: "Stopping...",
  save: "Save",
  saving: "Saving...",
  savedName: "Device name saved",
  saveFailed: "Failed to save device name",
  deviceNameRequired: "Device name is required",
  cancel: "Cancel",
}

const jaCopy: typeof zhCopy = {
  ...enCopy,
  title: "デバイス",
  subtitle: "高度なチャットに接続するローカルデバイスを管理し、コネクター起動コマンドを生成します。",
  commandTitle: "デバイスを追加",
  deviceName: "デバイス名",
  defaultDeviceName: "ローカルデバイス",
  generateCommand: "コマンドを生成",
  deviceList: "デバイス一覧",
  empty: "デバイスがありません。先にコマンドを生成して app コネクターを起動してください。",
  deviceDetail: "デバイス詳細",
  deviceDetailSubtitle: "このコネクターの実行中タスクと管理中のMCPサブプロセスを確認します。",
  backToDevices: "デバイスに戻る",
  deviceOverview: "コネクター概要",
  runningTasks: "実行中タスク",
  recentTasks: "最近のタスク",
  mcpProcesses: "MCPサブプロセス",
}
