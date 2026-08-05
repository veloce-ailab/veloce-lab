import { Switch } from "@/components/ui/switch"
import { useEffect, useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Bot, Pencil, Plus, Save, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import api from "@/lib/api"
import { useToast } from "@/components/ui/toast"

interface MCPServer {
  id: string
  name: string
  url: string
  headers: string
  enabled: boolean
  request_mode: "backend" | "frontend" | string
}

interface MCPDraft {
  id?: string
  name: string
  url: string
  headers: string
  enabled: boolean
}

interface AdvancedChatSettings {
  attachment_max_mb: number
  attachment_allowed_types: string[]
  file_storage_enabled: boolean
  file_storage_total_mb: number
  file_storage_auto_save_images_enabled: boolean
  file_storage_auto_save_videos_enabled: boolean
  builtin_mcp_servers: MCPServer[]
  assistant_mode_enabled: boolean
  assistant_run_timeout_seconds: number
  agent_group_run_timeout_seconds: number
  assistant_mcp_tools_enabled: boolean
  assistant_connector_list_files_enabled: boolean
  assistant_connector_read_file_enabled: boolean
  assistant_connector_write_file_enabled: boolean
  assistant_connector_replace_text_enabled: boolean
  assistant_connector_run_command_enabled: boolean
  assistant_connector_web_search_enabled: boolean
  assistant_connector_static_site_enabled: boolean
  scheduled_tasks_enabled: boolean
  message_channel_enabled: boolean
  message_delivery_enabled: boolean
  delivery_system_smtp_enabled: boolean
}

const defaultAdvancedChatSettings: AdvancedChatSettings = {
  attachment_max_mb: 10,
  attachment_allowed_types: ["text/plain", "text/markdown", "application/json", "text/csv", "image/png", "image/jpeg", "application/pdf"],
  file_storage_enabled: true,
  file_storage_total_mb: 100,
  file_storage_auto_save_images_enabled: false,
  file_storage_auto_save_videos_enabled: false,
  builtin_mcp_servers: [],
  assistant_mode_enabled: true,
  assistant_run_timeout_seconds: 1800,
  agent_group_run_timeout_seconds: 3600,
  assistant_mcp_tools_enabled: true,
  assistant_connector_list_files_enabled: true,
  assistant_connector_read_file_enabled: true,
  assistant_connector_write_file_enabled: true,
  assistant_connector_replace_text_enabled: true,
  assistant_connector_run_command_enabled: true,
  assistant_connector_web_search_enabled: true,
  assistant_connector_static_site_enabled: true,
  scheduled_tasks_enabled: true,
  message_channel_enabled: false,
  message_delivery_enabled: true,
  delivery_system_smtp_enabled: true,
}

const emptyDraft: MCPDraft = {
  name: "",
  url: "",
  headers: "",
  enabled: true,
}

export default function AdvancedChatManagement({ mode = "attachments" }: { mode?: "attachments" | "assistant" | "mcp" }) {
  const queryClient = useQueryClient()
  const { success, error } = useToast()
  const [form, setForm] = useState<AdvancedChatSettings>(defaultAdvancedChatSettings)
  const [typesText, setTypesText] = useState(defaultAdvancedChatSettings.attachment_allowed_types.join("\n"))
  const [draft, setDraft] = useState<MCPDraft>(emptyDraft)
  const [isServerDialogOpen, setIsServerDialogOpen] = useState(false)

  const advancedSettings = useQuery<AdvancedChatSettings>({
    queryKey: ["advanced-chat-admin-settings"],
    queryFn: async () => {
      const res = await api.get("/advanced-chat/settings")
      return normalizeAdvancedChatSettings(res.data)
    },
  })

  useEffect(() => {
    if (!advancedSettings.data) {
      return
    }
    const next = advancedSettings.data
    setForm(next)
    setTypesText(next.attachment_allowed_types.join("\n"))
  }, [advancedSettings.data])

  const allowedTypes = useMemo(() => parseAllowedTypes(typesText), [typesText])

  const saveAttachmentSettings = useMutation({
    mutationFn: async () => {
      const res = await api.put("/advanced-chat/settings", {
        attachment_max_mb: Number(form.attachment_max_mb) || 10,
        attachment_allowed_types: allowedTypes,
        file_storage_total_mb: Number(form.file_storage_total_mb) || 100,
        file_storage_enabled: form.file_storage_enabled,
        file_storage_auto_save_images_enabled: form.file_storage_auto_save_images_enabled,
        file_storage_auto_save_videos_enabled: form.file_storage_auto_save_videos_enabled,
      })
      return normalizeAdvancedChatSettings(res.data)
    },
    onSuccess: (saved) => {
      setForm(saved)
      setTypesText(saved.attachment_allowed_types.join("\n"))
      success("附件设置已保存")
      queryClient.invalidateQueries({ queryKey: ["advanced-chat-admin-settings"] })
      queryClient.invalidateQueries({ queryKey: ["advanced-chat-user-settings"] })
      queryClient.invalidateQueries({ queryKey: ["advanced-chat-files"] })
    },
    onError: (err) => error(err instanceof Error ? err.message : "保存附件设置失败"),
  })

  const saveAssistantSettings = useMutation({
    mutationFn: async () => {
      const res = await api.put("/advanced-chat/settings", {
        assistant_mode_enabled: form.assistant_mode_enabled,
        assistant_run_timeout_seconds: Number(form.assistant_run_timeout_seconds) || defaultAdvancedChatSettings.assistant_run_timeout_seconds,
        agent_group_run_timeout_seconds: Number(form.agent_group_run_timeout_seconds) || defaultAdvancedChatSettings.agent_group_run_timeout_seconds,
        assistant_mcp_tools_enabled: form.assistant_mcp_tools_enabled,
        assistant_connector_list_files_enabled: form.assistant_connector_list_files_enabled,
        assistant_connector_read_file_enabled: form.assistant_connector_read_file_enabled,
        assistant_connector_write_file_enabled: form.assistant_connector_write_file_enabled,
        assistant_connector_replace_text_enabled: form.assistant_connector_replace_text_enabled,
        assistant_connector_run_command_enabled: form.assistant_connector_run_command_enabled,
        assistant_connector_web_search_enabled: form.assistant_connector_web_search_enabled,
        assistant_connector_static_site_enabled: form.assistant_connector_static_site_enabled,
        scheduled_tasks_enabled: form.scheduled_tasks_enabled,
        message_channel_enabled: form.message_channel_enabled,
        message_delivery_enabled: form.message_delivery_enabled,
        delivery_system_smtp_enabled: form.delivery_system_smtp_enabled,
      })
      return normalizeAdvancedChatSettings(res.data)
    },
    onSuccess: (saved) => {
      setForm(saved)
      setTypesText(saved.attachment_allowed_types.join("\n"))
      success("助理设置已保存")
      queryClient.invalidateQueries({ queryKey: ["advanced-chat-admin-settings"] })
      queryClient.invalidateQueries({ queryKey: ["advanced-chat-user-settings"] })
      queryClient.invalidateQueries({ queryKey: ["public-settings"] })
      queryClient.invalidateQueries({ queryKey: ["system-settings"] })
    },
    onError: (err) => error(err instanceof Error ? err.message : "保存助理设置失败"),
  })

  const saveMCPServers = useMutation({
    mutationFn: async (input: { servers: MCPServer[]; message: string; closeDialog?: boolean }) => {
      const res = await api.put("/advanced-chat/settings", {
        builtin_mcp_servers: input.servers.map((server) => ({
          ...server,
          request_mode: "backend",
        })),
      })
      return { settings: normalizeAdvancedChatSettings(res.data), message: input.message, closeDialog: input.closeDialog }
    },
    onSuccess: ({ settings: saved, message, closeDialog }) => {
      setForm(saved)
      setTypesText(saved.attachment_allowed_types.join("\n"))
      if (closeDialog) {
        setIsServerDialogOpen(false)
      }
      success(message)
      queryClient.invalidateQueries({ queryKey: ["advanced-chat-admin-settings"] })
      queryClient.invalidateQueries({ queryKey: ["advanced-chat-user-settings"] })
    },
    onError: (err) => error(err instanceof Error ? err.message : "保存 MCP 服务器失败"),
  })

  const openCreateDialog = () => {
    setDraft(emptyDraft)
    setIsServerDialogOpen(true)
  }

  const openEditDialog = (server: MCPServer) => {
    setDraft({
      id: server.id,
      name: server.name,
      url: server.url,
      headers: server.headers || "",
      enabled: server.enabled,
    })
    setIsServerDialogOpen(true)
  }

  const applyDraft = () => {
    const next: MCPServer = {
      id: draft.id || createID(),
      name: draft.name.trim(),
      url: draft.url.trim(),
      headers: draft.headers.trim(),
      enabled: draft.enabled,
      request_mode: "backend",
    }
    if (!next.name || !next.url) {
      error("请输入 MCP 名称和服务器地址")
      return
    }
    const nextServers = draft.id
      ? form.builtin_mcp_servers.map((server) => (server.id === draft.id ? next : server))
      : [...form.builtin_mcp_servers, next]
    saveMCPServers.mutate({
      servers: nextServers,
      message: draft.id ? "MCP 服务器已更新" : "MCP 服务器已添加",
      closeDialog: true,
    })
  }

  const removeServer = (id: string) => {
    saveMCPServers.mutate({
      servers: form.builtin_mcp_servers.filter((server) => server.id !== id),
      message: "MCP 服务器已删除",
    })
  }

  const updateFeatureToggle =
    (key: "file_storage_enabled" | "file_storage_auto_save_images_enabled" | "file_storage_auto_save_videos_enabled" | "scheduled_tasks_enabled" | "message_channel_enabled" | "message_delivery_enabled" | "delivery_system_smtp_enabled") =>
    (checked: boolean) => setForm((current) => ({ ...current, [key]: checked }))

  if (advancedSettings.isLoading) {
    return <div className="text-sm text-muted-foreground">Loading...</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">助理聊天管理</h1>
          <div className="mt-2 text-sm text-muted-foreground">管理独立聊天的助理模式、可用工具、附件限制和内置 MCP 服务器。</div>
        </div>
      </div>

      <>
          {mode === "attachments" && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <CardTitle>附件设置</CardTitle>
                  <Button className="gap-2" disabled={saveAttachmentSettings.isPending} onClick={() => saveAttachmentSettings.mutate()}>
                    <Save size={16} />
                    {saveAttachmentSettings.isPending ? "保存中" : "保存"}
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 lg:grid-cols-[240px_240px_minmax(0,1fr)]">
                  <label className="space-y-2 text-sm">
                    <span className="font-medium">单个附件大小上限 MB</span>
                    <Input
                      type="number"
                      min={1}
                      max={100}
                      value={form.attachment_max_mb}
                      onChange={(event) => setForm((current) => ({ ...current, attachment_max_mb: Number(event.target.value) || 1 }))}
                    />
                  </label>
                  <label className="space-y-2 text-sm">
                    <span className="font-medium">每用户总容量 MB</span>
                    <Input
                      type="number"
                      min={1}
                      max={102400}
                      value={form.file_storage_total_mb}
                      onChange={(event) => setForm((current) => ({ ...current, file_storage_total_mb: Number(event.target.value) || 1 }))}
                    />
                  </label>
                  <label className="space-y-2 text-sm">
                    <span className="font-medium">允许的附件类型</span>
                    <textarea
                      className="min-h-32 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                      value={typesText}
                      placeholder="text/plain&#10;application/json&#10;image/png"
                      onChange={(event) => setTypesText(event.target.value)}
                    />
                    <span className="block text-xs text-muted-foreground">每行一个 MIME 类型，支持 `text/*` 这样的通配。</span>
                  </label>
                </div>
                <div className="grid gap-3 lg:grid-cols-3">
                  <ToggleRow
                    title="启用文件存储"
                    description="关闭后，独立助理聊天文件库、上传附件和选择已有文件都会被禁用。"
                    checked={form.file_storage_enabled}
                    onChange={updateFeatureToggle("file_storage_enabled")}
                  />
                  <ToggleRow
                    title="图片生成自动入库"
                    description="开启后，图片生成或编辑返回的图片会在用户剩余空间足够时保存到文件库。"
                    checked={form.file_storage_auto_save_images_enabled}
                    onChange={updateFeatureToggle("file_storage_auto_save_images_enabled")}
                  />
                  <ToggleRow
                    title="视频生成自动入库"
                    description="开启后，视频生成完成并返回视频时会在用户剩余空间足够时保存到文件库。"
                    checked={form.file_storage_auto_save_videos_enabled}
                    onChange={updateFeatureToggle("file_storage_auto_save_videos_enabled")}
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {mode === "assistant" && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <CardTitle>助理设置</CardTitle>
                  <Button className="gap-2" disabled={saveAssistantSettings.isPending} onClick={() => saveAssistantSettings.mutate()}>
                    <Save size={16} />
                    {saveAssistantSettings.isPending ? "保存中" : "保存"}
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <ToggleRow
                  title="启用助理模式"
                  description="关闭后，独立聊天页面不能切换到助理模式，后端也会拒绝助理运行请求。"
                  checked={form.assistant_mode_enabled}
                  onChange={(checked) => setForm((current) => ({ ...current, assistant_mode_enabled: checked }))}
                />
                <div className="grid gap-3 lg:grid-cols-2">
                  <label className="space-y-2 text-sm">
                    <span className="font-medium">助理运行超时（秒）</span>
                    <Input
                      type="number"
                      min={300}
                      max={86400}
                      step={60}
                      value={form.assistant_run_timeout_seconds}
                      onChange={(event) => setForm((current) => ({ ...current, assistant_run_timeout_seconds: Number(event.target.value) }))}
                    />
                    <span className="block text-xs leading-5 text-muted-foreground">普通助理模式单次后台运行的总时限，默认 1800 秒。</span>
                  </label>
                  <label className="space-y-2 text-sm">
                    <span className="font-medium">工作室运行超时（秒）</span>
                    <Input
                      type="number"
                      min={300}
                      max={86400}
                      step={60}
                      value={form.agent_group_run_timeout_seconds}
                      onChange={(event) => setForm((current) => ({ ...current, agent_group_run_timeout_seconds: Number(event.target.value) }))}
                    />
                    <span className="block text-xs leading-5 text-muted-foreground">工作室模式单次后台运行的总时限，默认 3600 秒。</span>
                  </label>
                </div>
                <div className="grid gap-3 lg:grid-cols-3">
                  <ToggleRow
                    title="启用计划任务"
                    description="关闭后，用户不能创建、编辑或运行助理聊天计划任务，后台调度器也不会执行到期任务。"
                    checked={form.scheduled_tasks_enabled}
                    onChange={updateFeatureToggle("scheduled_tasks_enabled")}
                  />
                  <ToggleRow
                    title="启用消息通道"
                    description="开启后，用户可以在独立聊天页面配置 Telegram、QQ、Discord 等消息通道。"
                    checked={form.message_channel_enabled}
                    onChange={updateFeatureToggle("message_channel_enabled")}
                  />
                  <ToggleRow
                    title="启用消息投递"
                    description="关闭后，计划任务仍可运行，但不会向 AI 暴露结果投递工具，也不能管理投递配置。"
                    checked={form.message_delivery_enabled}
                    onChange={updateFeatureToggle("message_delivery_enabled")}
                  />
                  <ToggleRow
                    title="允许使用系统 SMTP"
                    description="开启后，邮箱投递可使用后台认证邮件的 SMTP；关闭后，用户必须在投递配置中填写自己的 SMTP。"
                    checked={form.delivery_system_smtp_enabled}
                    onChange={updateFeatureToggle("delivery_system_smtp_enabled")}
                  />
                </div>
                <div className="rounded-md border p-3">
                  <div className="text-sm font-medium">助理工具</div>
                  <div className="mt-1 text-xs text-muted-foreground">控制助理模式下模型可以调用的工具类型。关闭的工具不会出现在可用工具列表中。</div>
                  <div className="mt-4 grid gap-3 lg:grid-cols-2">
                    <ToggleRow
                      title="MCP 工具"
                      description="允许助理调用用户选择的 MCP 服务工具。"
                      checked={form.assistant_mcp_tools_enabled}
                      onChange={(checked) => setForm((current) => ({ ...current, assistant_mcp_tools_enabled: checked }))}
                    />
                    <ToggleRow
                      title="列出文件"
                      description="允许查看本地工作区目录列表。"
                      checked={form.assistant_connector_list_files_enabled}
                      onChange={(checked) => setForm((current) => ({ ...current, assistant_connector_list_files_enabled: checked }))}
                    />
                    <ToggleRow
                      title="读取文件"
                      description="允许读取本地工作区文件内容。"
                      checked={form.assistant_connector_read_file_enabled}
                      onChange={(checked) => setForm((current) => ({ ...current, assistant_connector_read_file_enabled: checked }))}
                    />
                    <ToggleRow
                      title="写入文件"
                      description="允许创建或覆盖本地工作区文件，仍会走用户确认流程。"
                      checked={form.assistant_connector_write_file_enabled}
                      onChange={(checked) => setForm((current) => ({ ...current, assistant_connector_write_file_enabled: checked }))}
                    />
                    <ToggleRow
                      title="替换文本"
                      description="允许对本地工作区文件执行文本替换，仍会走用户确认流程。"
                      checked={form.assistant_connector_replace_text_enabled}
                      onChange={(checked) => setForm((current) => ({ ...current, assistant_connector_replace_text_enabled: checked }))}
                    />
                    <ToggleRow
                      title="运行命令"
                      description="允许在本地工作区运行命令，仍受命令前缀和确认流程限制。"
                      checked={form.assistant_connector_run_command_enabled}
                      onChange={(checked) => setForm((current) => ({ ...current, assistant_connector_run_command_enabled: checked }))}
                    />
                    <ToggleRow
                      title="Web Search"
                      description="Allow assistant connector web search and web fetch requests. Network tasks are read-only and do not require approval."
                      checked={form.assistant_connector_web_search_enabled}
                      onChange={(checked) => setForm((current) => ({ ...current, assistant_connector_web_search_enabled: checked }))}
                    />
                    <ToggleRow
                      title="静态站点"
                      description="允许 AI 管理连接器托管的静态站点，包括部署、启停和删除。"
                      checked={form.assistant_connector_static_site_enabled}
                      onChange={(checked) => setForm((current) => ({ ...current, assistant_connector_static_site_enabled: checked }))}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {mode === "mcp" && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <CardTitle>内置 MCP 服务器</CardTitle>
                  <Button variant="outline" className="gap-2" disabled={saveMCPServers.isPending} onClick={openCreateDialog}>
                    <Plus size={16} />
                    添加
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {form.builtin_mcp_servers.length === 0 ? (
                  <div className="rounded-md border border-dashed px-3 py-8 text-center text-sm text-muted-foreground">暂无内置 MCP 服务器</div>
                ) : (
                  form.builtin_mcp_servers.map((server) => (
                    <div key={server.id} className="flex items-center justify-between gap-3 rounded-md border p-3">
                      <div className="min-w-0">
                        <div className="flex min-w-0 items-center gap-2">
                          <Bot className="h-4 w-4 shrink-0 text-muted-foreground" />
                          <span className="truncate text-sm font-medium">{server.name}</span>
                          <span className="shrink-0 rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">后端请求</span>
                          {!server.enabled && <span className="shrink-0 rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">停用</span>}
                        </div>
                        <div className="mt-1 truncate text-xs text-muted-foreground">{server.url}</div>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <Button variant="outline" size="icon" disabled={saveMCPServers.isPending} onClick={() => openEditDialog(server)} aria-label="编辑 MCP 服务器" title="编辑 MCP 服务器">
                          <Pencil size={16} />
                        </Button>
                        <Button variant="outline" size="icon" disabled={saveMCPServers.isPending} onClick={() => removeServer(server.id)} aria-label="删除 MCP 服务器" title="删除 MCP 服务器">
                          <Trash2 size={16} />
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          )}
        </>

      <Dialog open={isServerDialogOpen} onOpenChange={setIsServerDialogOpen}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{draft.id ? "编辑内置 MCP" : "添加内置 MCP"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            <label className="space-y-1 text-sm">
              <span className="font-medium">名称</span>
              <Input value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} />
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium">服务器地址</span>
              <Input value={draft.url} placeholder="https://mcp.example.com" onChange={(event) => setDraft((current) => ({ ...current, url: event.target.value }))} />
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium">请求头 JSON</span>
              <textarea
                className="min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                value={draft.headers}
                placeholder='{"Authorization":"Bearer ..."}'
                onChange={(event) => setDraft((current) => ({ ...current, headers: event.target.value }))}
              />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={draft.enabled} onCheckedChange={(checked) => setDraft((current) => ({ ...current, enabled: checked }))} />
              启用
            </label>
            <div className="rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">管理员内置 MCP 服务器由后端请求。</div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsServerDialogOpen(false)}>
              取消
            </Button>
            <Button disabled={saveMCPServers.isPending} onClick={applyDraft}>
              {saveMCPServers.isPending ? "保存中" : "确定"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  )
}

function ToggleRow({
  title,
  description,
  checked,
  onChange,
}: {
  title: string
  description: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <label className="flex items-start gap-3 rounded-md border bg-background p-3 text-sm">
      <Switch
        className="mt-1"
        checked={checked}
        onCheckedChange={(checked) => onChange(checked)}
      />
      <span>
        <span className="block font-medium">{title}</span>
        <span className="mt-1 block text-xs leading-5 text-muted-foreground">{description}</span>
      </span>
    </label>
  )
}

function normalizeAdvancedChatSettings(value: unknown): AdvancedChatSettings {
  const item = isRecord(value) ? value : {}
  return {
    attachment_max_mb: Number(item.attachment_max_mb || defaultAdvancedChatSettings.attachment_max_mb),
    attachment_allowed_types: Array.isArray(item.attachment_allowed_types)
      ? item.attachment_allowed_types.filter((value): value is string => typeof value === "string")
      : defaultAdvancedChatSettings.attachment_allowed_types,
    file_storage_enabled: item.file_storage_enabled !== false,
    file_storage_total_mb: Number(item.file_storage_total_mb || defaultAdvancedChatSettings.file_storage_total_mb),
    file_storage_auto_save_images_enabled: item.file_storage_auto_save_images_enabled === true,
    file_storage_auto_save_videos_enabled: item.file_storage_auto_save_videos_enabled === true,
    builtin_mcp_servers: Array.isArray(item.builtin_mcp_servers) ? item.builtin_mcp_servers.map(normalizeMCPServer) : [],
    assistant_mode_enabled: item.assistant_mode_enabled !== false,
    assistant_run_timeout_seconds: Number(item.assistant_run_timeout_seconds || defaultAdvancedChatSettings.assistant_run_timeout_seconds),
    agent_group_run_timeout_seconds: Number(item.agent_group_run_timeout_seconds || defaultAdvancedChatSettings.agent_group_run_timeout_seconds),
    assistant_mcp_tools_enabled: item.assistant_mcp_tools_enabled !== false,
    assistant_connector_list_files_enabled: item.assistant_connector_list_files_enabled !== false,
    assistant_connector_read_file_enabled: item.assistant_connector_read_file_enabled !== false,
    assistant_connector_write_file_enabled: item.assistant_connector_write_file_enabled !== false,
    assistant_connector_replace_text_enabled: item.assistant_connector_replace_text_enabled !== false,
    assistant_connector_run_command_enabled: item.assistant_connector_run_command_enabled !== false,
    assistant_connector_web_search_enabled: item.assistant_connector_web_search_enabled !== false,
    assistant_connector_static_site_enabled: item.assistant_connector_static_site_enabled !== false,
    scheduled_tasks_enabled: item.scheduled_tasks_enabled !== false,
    message_channel_enabled: item.message_channel_enabled === true,
    message_delivery_enabled: item.message_delivery_enabled !== false,
    delivery_system_smtp_enabled: item.delivery_system_smtp_enabled !== false,
  }
}

function normalizeMCPServer(value: unknown): MCPServer {
  const item = isRecord(value) ? value : {}
  return {
    id: typeof item.id === "string" && item.id ? item.id : createID(),
    name: typeof item.name === "string" ? item.name : "",
    url: typeof item.url === "string" ? item.url : "",
    headers: typeof item.headers === "string" ? item.headers : "",
    enabled: item.enabled !== false,
    request_mode: typeof item.request_mode === "string" ? item.request_mode : "backend",
  }
}

function parseAllowedTypes(raw: string) {
  return raw
    .split(/\r?\n|,/)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
}

function createID() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}
