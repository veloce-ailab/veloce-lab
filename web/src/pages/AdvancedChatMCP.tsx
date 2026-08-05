import { Switch } from "@/components/ui/switch"
import { useEffect, useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Bot, Pencil, Plus, Terminal, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { PageInlineSlot, PageTitleSlot } from "@/components/layout/PageTitleSlot"
import api from "@/lib/api"
import { useI18n } from "@/lib/i18n"
import { useToast } from "@/components/ui/toast"

interface MCPServer {
  id: string
  name: string
  type?: "http" | "connector" | string
  url?: string
  headers?: string
  command?: string
  args?: string[]
  env?: Record<string, string>
  cwd?: string
  enabled: boolean
  request_mode: "backend" | "frontend" | string
}

interface MCPDraft {
  id?: string
  type: "http" | "connector"
  name: string
  url: string
  headers: string
  command: string
  argsText: string
  envText: string
  cwd: string
  configJSON: string
  enabled: boolean
}

interface AdvancedChatSettings {
  attachment_max_mb: number
  attachment_allowed_types: string[]
  mcp_servers: MCPServer[]
  builtin_mcp_servers: MCPServer[]
  custom_mcp_servers: MCPServer[]
}

const defaultAttachmentSettings = {
  attachment_max_mb: 10,
  attachment_allowed_types: [
    "text/plain",
    "text/markdown",
    "application/json",
    "text/csv",
    "image/png",
    "image/jpeg",
    "application/pdf",
  ],
}

const emptyDraft: MCPDraft = {
  type: "http",
  name: "",
  url: "",
  headers: "",
  command: "",
  argsText: "",
  envText: "",
  cwd: "",
  configJSON: "",
  enabled: true,
}

export default function AdvancedChatMCP() {
  const queryClient = useQueryClient()
  const { success, error } = useToast()
  const { t } = useI18n()
  const [customServers, setCustomServers] = useState<MCPServer[]>([])
  const [draft, setDraft] = useState<MCPDraft>(emptyDraft)
  const [isDialogOpen, setIsDialogOpen] = useState(false)

  const { data: settings } = useQuery<AdvancedChatSettings>({
    queryKey: ["advanced-chat-user-settings"],
    queryFn: async () => {
      const res = await api.get("/user/advanced-chat/settings")
      return normalizeAdvancedChatSettings(res.data)
    },
  })

  useEffect(() => {
    if (settings) {
      setCustomServers(Array.isArray(settings.custom_mcp_servers) ? settings.custom_mcp_servers : [])
    }
  }, [settings])

  const builtinServers = Array.isArray(settings?.builtin_mcp_servers) ? settings.builtin_mcp_servers : []
  const builtinServerIDs = useMemo(() => new Set(builtinServers.filter(Boolean).map((server) => server.id)), [builtinServers])
  const allServers = useMemo(() => {
    const merged = mergeMCPServers(builtinServers, customServers)
    const customByID = new Map((Array.isArray(customServers) ? customServers : []).filter(Boolean).map((server) => [server.id, server]))
    return merged.filter(Boolean).map((server) => ({
      ...(customByID.get(server.id) || server),
      readonly: builtinServerIDs.has(server.id),
    }))
  }, [builtinServerIDs, builtinServers, customServers])

  const saveServers = useMutation({
    mutationFn: async (nextServers: MCPServer[]) => {
      const res = await api.put("/user/advanced-chat/mcp-servers", {
        custom_mcp_servers: nextServers.map(serverForSave),
      })
      return normalizeAdvancedChatSettings(res.data)
    },
    onMutate: (nextServers) => {
      const previous = customServers
      setCustomServers(nextServers)
      return { previous }
    },
    onSuccess: (saved) => {
      setCustomServers(saved.custom_mcp_servers)
      success(t("advancedChat.mcp.saved"))
      queryClient.invalidateQueries({ queryKey: ["advanced-chat-user-settings"] })
    },
    onError: (err, _nextServers, context) => {
      if (context?.previous) {
        setCustomServers(context.previous)
      }
      error(apiErrorMessage(err, t("advancedChat.mcp.saveFailed")))
    },
  })

  const openCreateDialog = () => {
    setDraft(emptyDraft)
    setIsDialogOpen(true)
  }

  const openEditDialog = (server: MCPServer) => {
    setDraft({
      id: server.id,
      type: normalizeMCPType(server.type),
      name: server.name,
      url: server.url || "",
      headers: server.headers || "",
      command: server.command || "",
      argsText: Array.isArray(server.args) ? server.args.join("\n") : "",
      envText: server.env && Object.keys(server.env).length ? JSON.stringify(server.env, null, 2) : "",
      cwd: server.cwd || "",
      configJSON: "",
      enabled: server.enabled,
    })
    setIsDialogOpen(true)
  }

  const applyDraft = () => {
    let nextDraft = draft
    if (draft.type === "connector" && draft.configJSON.trim()) {
      const imported = parseMCPConfigJSON(draft.configJSON)
      if (!imported) {
        error(t("advancedChat.mcp.configInvalid"))
        return
      }
      nextDraft = { ...draft, ...imported, id: draft.id || imported.id, type: "connector" }
    }
    const serverType = normalizeMCPType(nextDraft.type)
    const next: MCPServer = {
      id: nextDraft.id || createID(),
      type: serverType,
      name: nextDraft.name.trim(),
      url: serverType === "http" ? nextDraft.url.trim() : "",
      headers: serverType === "http" ? nextDraft.headers.trim() : "",
      command: serverType === "connector" ? nextDraft.command.trim() : "",
      args: serverType === "connector" ? parseArgsText(nextDraft.argsText) : [],
      env: serverType === "connector" ? parseEnvText(nextDraft.envText) : {},
      cwd: serverType === "connector" ? nextDraft.cwd.trim() : "",
      enabled: nextDraft.enabled,
      request_mode: serverType === "connector" ? "connector" : "backend",
    }
    if (serverType === "http" && (!next.name || !next.url)) {
      error(t("advancedChat.mcp.nameURLRequired"))
      return
    }
    if (serverType === "connector" && (!next.name || !next.command)) {
      error(t("advancedChat.mcp.nameCommandRequired"))
      return
    }
    const serverExists = customServers.some((server) => server.id === next.id)
    const nextServers = serverExists ? customServers.map((server) => (server.id === next.id ? next : server)) : [...customServers, next]
    saveServers.mutate(nextServers)
    setIsDialogOpen(false)
  }

  const removeServer = (id: string) => {
    saveServers.mutate(customServers.filter((server) => server.id !== id))
  }

  const setDraftWithConfigJSON = (value: string) => {
    const imported = parseMCPConfigJSON(value)
    setDraft((current) => {
      if (!imported) {
        return { ...current, configJSON: value }
      }
      return {
        ...current,
        ...imported,
        id: current.id || imported.id,
        type: "connector",
        configJSON: value,
      }
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">{t("advancedChat.mcp.title")}</h1>
          <div className="mt-2 text-sm text-muted-foreground">{t("advancedChat.mcp.subtitle")}</div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2" onClick={openCreateDialog}>
            <Plus size={16} />
            {t("common.add")}
          </Button>
        </div>
      </div>

      <PageTitleSlot />
      <Card>
        <CardHeader>
          <CardTitle>{t("advancedChat.mcp.list")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {allServers.length === 0 ? (
            <div className="rounded-md border border-dashed px-3 py-8 text-center text-sm text-muted-foreground">{t("advancedChat.mcp.empty")}</div>
          ) : (
            allServers.map((server) => (
              <div key={`${server.request_mode}-${server.id}`} className="flex items-center justify-between gap-3 rounded-md border p-3">
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-2">
                    {normalizeMCPType(server.type) === "connector" ? <Terminal className="h-4 w-4 shrink-0 text-muted-foreground" /> : <Bot className="h-4 w-4 shrink-0 text-muted-foreground" />}
                    <span className="truncate text-sm font-medium">{server.name}</span>
                    <span className="shrink-0 rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                      {normalizeMCPType(server.type) === "connector" ? t("advancedChat.mcp.connectorType") : "HTTP"}
                    </span>
                    <span className="shrink-0 rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                      {server.readonly ? t("advancedChat.mcp.adminBuiltin") : t("common.mine")}
                    </span>
                    {!server.enabled && <span className="shrink-0 rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">{t("common.disabled")}</span>}
                  </div>
                  <div className="mt-1 truncate text-xs text-muted-foreground">{mcpServerSummary(server)}</div>
                </div>
                {server.readonly ? (
                  <div className="shrink-0 rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">{t("common.readOnly")}</div>
                ) : (
                  <div className="flex shrink-0 gap-2">
                    <Button variant="outline" size="icon" onClick={() => openEditDialog(server)} aria-label={t("advancedChat.mcp.editServer")} title={t("advancedChat.mcp.editServer")}>
                      <Pencil size={16} />
                    </Button>
                    <Button variant="outline" size="icon" disabled={saveServers.isPending} onClick={() => removeServer(server.id)} aria-label={t("advancedChat.mcp.deleteServer")} title={t("advancedChat.mcp.deleteServer")}>
                      <Trash2 size={16} />
                    </Button>
                  </div>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <PageInlineSlot slotKey="primary" />
      <PageInlineSlot slotKey="secondary" />
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="flex max-h-[90vh] max-w-2xl flex-col">
          <DialogHeader className="shrink-0">
            <DialogTitle>{draft.id ? t("advancedChat.mcp.editDialogTitle") : t("advancedChat.mcp.addDialogTitle")}</DialogTitle>
          </DialogHeader>
          <div className="grid min-h-0 gap-4 overflow-y-auto pr-1">
            <div className="grid grid-cols-2 gap-2 rounded-md border bg-muted/30 p-1">
              {(["http", "connector"] as const).map((type) => (
                <Button
                  key={type}
                  type="button"
                  variant={draft.type === type ? "default" : "ghost"}
                  onClick={() => setDraft((current) => ({ ...current, type }))}
                >
                  {type === "connector" ? t("advancedChat.mcp.connectorType") : "HTTP"}
                </Button>
              ))}
            </div>
            <label className="space-y-1 text-sm">
              <span className="font-medium">{t("common.name")}</span>
              <Input value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} />
            </label>
            {draft.type === "http" ? (
              <>
                <label className="space-y-1 text-sm">
                  <span className="font-medium">{t("advancedChat.mcp.serverURL")}</span>
                  <Input value={draft.url} placeholder={t("advancedChat.mcp.urlPlaceholder")} onChange={(event) => setDraft((current) => ({ ...current, url: event.target.value }))} />
                </label>
                <label className="space-y-1 text-sm">
                  <span className="font-medium">{t("advancedChat.mcp.headers")}</span>
                  <textarea
                    className="min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                    value={draft.headers}
                    placeholder={t("advancedChat.mcp.headersPlaceholder")}
                    onChange={(event) => setDraft((current) => ({ ...current, headers: event.target.value }))}
                  />
                </label>
              </>
            ) : (
              <>
                <label className="space-y-1 text-sm">
                  <span className="font-medium">{t("advancedChat.mcp.configJSON")}</span>
                  <textarea
                    className="min-h-28 w-full rounded-md border bg-background px-3 py-2 font-mono text-xs outline-none focus:ring-2 focus:ring-ring"
                    value={draft.configJSON}
                    placeholder={'{"mcpServers":{"makenotion-notion-mcp-server":{"command":"npx","args":["-y","@notionhq/notion-mcp-server"]}}}'}
                    onChange={(event) => setDraftWithConfigJSON(event.target.value)}
                  />
                </label>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="space-y-1 text-sm">
                    <span className="font-medium">{t("advancedChat.mcp.command")}</span>
                    <Input value={draft.command} placeholder="npx" onChange={(event) => setDraft((current) => ({ ...current, command: event.target.value }))} />
                  </label>
                  <label className="space-y-1 text-sm">
                    <span className="font-medium">{t("advancedChat.mcp.cwd")}</span>
                    <Input value={draft.cwd} onChange={(event) => setDraft((current) => ({ ...current, cwd: event.target.value }))} />
                  </label>
                </div>
                <label className="space-y-1 text-sm">
                  <span className="font-medium">{t("advancedChat.mcp.args")}</span>
                  <textarea
                    className="min-h-20 w-full rounded-md border bg-background px-3 py-2 font-mono text-xs outline-none focus:ring-2 focus:ring-ring"
                    value={draft.argsText}
                    placeholder={"-y\n@notionhq/notion-mcp-server"}
                    onChange={(event) => setDraft((current) => ({ ...current, argsText: event.target.value }))}
                  />
                </label>
                <label className="space-y-1 text-sm">
                  <span className="font-medium">{t("advancedChat.mcp.env")}</span>
                  <textarea
                    className="min-h-20 w-full rounded-md border bg-background px-3 py-2 font-mono text-xs outline-none focus:ring-2 focus:ring-ring"
                    value={draft.envText}
                    placeholder={'{"NOTION_TOKEN":"secret_..."}'}
                    onChange={(event) => setDraft((current) => ({ ...current, envText: event.target.value }))}
                  />
                </label>
              </>
            )}
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={draft.enabled} onCheckedChange={(checked) => setDraft((current) => ({ ...current, enabled: checked }))} />
              {t("advancedChat.mcp.enabledLabel")}
            </label>
            <div className="rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">{t("advancedChat.mcp.hint")}</div>
          </div>
          <DialogFooter className="shrink-0">
            <Button variant="ghost" onClick={() => setIsDialogOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={applyDraft} disabled={saveServers.isPending}>{saveServers.isPending ? t("common.saving") : t("common.confirm")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function normalizeAdvancedChatSettings(value: unknown): AdvancedChatSettings {
  const item = isRecord(value) ? value : {}
  const builtin = Array.isArray(item.builtin_mcp_servers) ? item.builtin_mcp_servers.map(normalizeMCPServer) : []
  const custom = Array.isArray(item.custom_mcp_servers) ? item.custom_mcp_servers.map(normalizeMCPServer) : []
  return {
    attachment_max_mb: Number(item.attachment_max_mb || defaultAttachmentSettings.attachment_max_mb),
    attachment_allowed_types: Array.isArray(item.attachment_allowed_types)
      ? item.attachment_allowed_types.filter((value): value is string => typeof value === "string")
      : defaultAttachmentSettings.attachment_allowed_types,
    mcp_servers: Array.isArray(item.mcp_servers) ? item.mcp_servers.map(normalizeMCPServer) : mergeMCPServers(builtin, custom),
    builtin_mcp_servers: builtin,
    custom_mcp_servers: custom,
  }
}

function normalizeMCPServer(value: unknown): MCPServer {
  const item = isRecord(value) ? value : {}
  return {
    id: typeof item.id === "string" && item.id ? item.id : createID(),
    name: typeof item.name === "string" ? item.name : "",
    type: typeof item.type === "string" ? item.type : "http",
    url: typeof item.url === "string" ? item.url : "",
    headers: typeof item.headers === "string" ? item.headers : "",
    command: typeof item.command === "string" ? item.command : "",
    args: Array.isArray(item.args) ? item.args.filter((value): value is string => typeof value === "string") : [],
    env: isStringRecord(item.env) ? item.env : {},
    cwd: typeof item.cwd === "string" ? item.cwd : "",
    enabled: item.enabled !== false,
    request_mode: typeof item.request_mode === "string" ? item.request_mode : "backend",
  }
}

function normalizeMCPType(value: unknown): "http" | "connector" {
  return value === "connector" ? "connector" : "http"
}

function serverForSave(server: MCPServer): MCPServer {
  const type = normalizeMCPType(server.type)
  if (type === "connector") {
    return {
      id: server.id,
      name: server.name,
      type,
      command: server.command || "",
      args: Array.isArray(server.args) ? server.args : [],
      env: server.env || {},
      cwd: server.cwd || "",
      enabled: server.enabled,
      request_mode: "connector",
    }
  }
  return {
    id: server.id,
    name: server.name,
    type,
    url: server.url || "",
    headers: server.headers || "",
    enabled: server.enabled,
    request_mode: "backend",
  }
}

function mcpServerSummary(server: MCPServer) {
  if (normalizeMCPType(server.type) === "connector") {
    return [server.command, ...(Array.isArray(server.args) ? server.args : [])].filter(Boolean).join(" ")
  }
  return server.url || ""
}

function parseMCPConfigJSON(raw: string): Partial<MCPDraft> | null {
  try {
    const parsed = JSON.parse(raw)
    const root = isRecord(parsed) ? parsed : {}
    let id = typeof root.id === "string" && root.id ? root.id : ""
    let value: unknown = root
    if (isRecord(root.mcpServers)) {
      const entry = Object.entries(root.mcpServers)[0]
      id = entry?.[0] || id
      value = entry?.[1]
    }
    if (!isRecord(value)) {
      return null
    }
    const command = typeof value.command === "string" ? value.command : ""
    if (!command) {
      return null
    }
    if (!id) {
      id = createID()
    }
    return {
      id,
      name: typeof value.name === "string" && value.name ? value.name : id,
      command,
      argsText: Array.isArray(value.args) ? value.args.filter((item): item is string => typeof item === "string").join("\n") : "",
      envText: isStringRecord(value.env) ? JSON.stringify(value.env, null, 2) : "",
      cwd: typeof value.cwd === "string" ? value.cwd : "",
    }
  } catch {
    return null
  }
}

function parseArgsText(raw: string) {
  const value = raw.trim()
  if (!value) {
    return []
  }
  if (value.startsWith("[")) {
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : []
    } catch {
      return []
    }
  }
  return raw.split(/\r?\n/).map((item) => item.trim()).filter(Boolean)
}

function parseEnvText(raw: string): Record<string, string> {
  const value = raw.trim()
  if (!value) {
    return {}
  }
  try {
    const parsed = JSON.parse(value)
    return isStringRecord(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function apiErrorMessage(err: unknown, fallback: string) {
  if (isRecord(err)) {
    const response = err.response
    if (isRecord(response)) {
      const data = response.data
      if (isRecord(data) && typeof data.error === "string" && data.error) {
        return data.error
      }
    }
  }
  return err instanceof Error && err.message ? err.message : fallback
}

function createID() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`
}

function mergeMCPServers(...groups: Array<Array<MCPServer | null | undefined> | null | undefined>) {
  const servers: MCPServer[] = []
  const seen = new Set<string>()
  const items = groups
    .flatMap((group) => Array.isArray(group) ? group : [])
    .filter((server): server is MCPServer => Boolean(server))
  for (const server of items) {
    if (!server.id || seen.has(server.id)) {
      continue
    }
    seen.add(server.id)
    servers.push(server)
  }
  return servers
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function isStringRecord(value: unknown): value is Record<string, string> {
  if (!isRecord(value)) {
    return false
  }
  return Object.values(value).every((item) => typeof item === "string")
}
