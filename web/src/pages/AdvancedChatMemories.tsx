import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useEffect, useMemo, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Brain, Plus, RefreshCw, Save, Trash2 } from "lucide-react"
import api from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { useToast } from "@/components/ui/toast"
import { useI18n } from "@/lib/i18n"
import { cn } from "@/lib/utils"

interface MemoryDocument {
  id: string
  scope: "global" | "agent"
  agent_id?: string
  kind: string
  title: string
  size: number
  hash: string
  enabled: boolean
  updated_by: string
  created_at: string
  updated_at: string
}

interface MemoryListResponse {
  memories: MemoryDocument[]
  used_bytes: number
  total_bytes: number
  remaining_bytes: number
}

interface MemoryContentResponse extends MemoryDocument {
  content: string
  truncated: boolean
}

interface AgentOption {
  id: string
  name: string
}

const memoriesQueryKey = ["advanced-chat-memories"] as const
const agentsQueryKey = ["advanced-chat-agents"] as const
const memoryKinds = ["profile", "preferences", "facts", "projects", "rules", "scratch", "custom"] as const

const emptyDraft = {
  id: "",
  scope: "global" as "global" | "agent",
  agent_id: "",
  kind: "facts",
  title: "",
  content: "",
  enabled: true,
}

export default function AdvancedChatMemories() {
  const { language } = useI18n()
  const copy = language === "zh" ? zhCopy : enCopy
  const queryClient = useQueryClient()
  const { success, error } = useToast()
  const [selectedID, setSelectedID] = useState("")
  const [draft, setDraft] = useState(emptyDraft)
  const [isEditorOpen, setIsEditorOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const memoriesQuery = useQuery<MemoryListResponse>({
    queryKey: memoriesQueryKey,
    queryFn: async () => {
      const res = await api.get("/user/advanced-chat/memories")
      return normalizeMemoryList(res.data)
    },
  })

  const agentsQuery = useQuery<AgentOption[]>({
    queryKey: agentsQueryKey,
    queryFn: async () => {
      const res = await api.get("/user/advanced-chat/agents")
      return Array.isArray(res.data) ? res.data.map(normalizeAgent).filter((item): item is AgentOption => Boolean(item)) : []
    },
  })

  const selectedMemory = useMemo(() => memoriesQuery.data?.memories.find((item) => item.id === selectedID), [memoriesQuery.data?.memories, selectedID])
  const usage = useMemo(() => {
    const used = memoriesQuery.data?.used_bytes || 0
    const total = memoriesQuery.data?.total_bytes || 0
    return { used, total, percent: total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0 }
  }, [memoriesQuery.data?.total_bytes, memoriesQuery.data?.used_bytes])

  useEffect(() => {
    if (selectedID || !memoriesQuery.data?.memories.length) {
      return
    }
    setSelectedID(memoriesQuery.data.memories[0].id)
  }, [memoriesQuery.data?.memories, selectedID])

  useEffect(() => {
    if (!selectedMemory) {
      return
    }
    let cancelled = false
    api.get(`/user/advanced-chat/memories/${encodeURIComponent(selectedMemory.id)}`)
      .then((res) => {
        if (cancelled) {
          return
        }
        const memory = normalizeMemoryContent(res.data)
        setDraft({
          id: memory.id,
          scope: memory.scope,
          agent_id: memory.agent_id || "",
          kind: memory.kind || "facts",
          title: memory.title || "",
          content: memory.content || "",
          enabled: memory.enabled !== false,
        })
      })
      .catch((err) => error(apiErrorMessage(err, copy.loadFailed)))
    return () => {
      cancelled = true
    }
  }, [copy.loadFailed, error, selectedMemory])

  const startNew = () => {
    setSelectedID("")
    setDraft({ ...emptyDraft })
    setIsEditorOpen(true)
  }

  const saveMemory = async () => {
    if (isSaving) {
      return
    }
    if (!draft.content.trim()) {
      error(copy.contentRequired)
      return
    }
    if (draft.scope === "agent" && !draft.agent_id.trim()) {
      error(copy.agentRequired)
      return
    }
    setIsSaving(true)
    try {
      const payload = {
        scope: draft.scope,
        agent_id: draft.scope === "agent" ? draft.agent_id.trim() : "",
        kind: draft.kind,
        title: draft.title.trim(),
        content: draft.content,
        enabled: draft.enabled,
      }
      const res = draft.id
        ? await api.put(`/user/advanced-chat/memories/${encodeURIComponent(draft.id)}`, payload)
        : await api.post("/user/advanced-chat/memories", payload)
      const saved = normalizeMemory(res.data)
      success(copy.saved)
      await queryClient.invalidateQueries({ queryKey: memoriesQueryKey })
      if (saved?.id) {
        setSelectedID(saved.id)
      }
      setIsEditorOpen(false)
    } catch (err) {
      error(apiErrorMessage(err, copy.saveFailed))
    } finally {
      setIsSaving(false)
    }
  }

  const deleteMemory = async () => {
    if (!draft.id || isDeleting) {
      return
    }
    setIsDeleting(true)
    try {
      await api.delete(`/user/advanced-chat/memories/${encodeURIComponent(draft.id)}`)
      success(copy.deleted)
      setSelectedID("")
      setDraft({ ...emptyDraft })
      setIsEditorOpen(false)
      await queryClient.invalidateQueries({ queryKey: memoriesQueryKey })
    } catch (err) {
      error(apiErrorMessage(err, copy.deleteFailed))
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">{copy.title}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{copy.subtitle}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="gap-2" disabled={memoriesQuery.isFetching} onClick={() => memoriesQuery.refetch()}>
            <RefreshCw size={16} />
            {copy.refresh}
          </Button>
          <Button className="gap-2" onClick={startNew}>
            <Plus size={16} />
            {copy.newMemory}
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-primary transition-all" style={{ width: `${usage.percent}%` }} />
          </div>
          <div className="mt-2 flex justify-between text-sm text-muted-foreground">
            <span>{formatBytes(usage.used)} / {formatBytes(usage.total)}</span>
            <span>{usage.percent}%</span>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Brain size={18} />
              {copy.memories}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {(memoriesQuery.data?.memories || []).length === 0 ? (
              <div className="rounded-md border border-dashed px-3 py-10 text-center text-sm text-muted-foreground">
                {memoriesQuery.isLoading ? copy.loading : copy.empty}
              </div>
            ) : (
              <div className="grid gap-2">
                {(memoriesQuery.data?.memories || []).map((memory) => (
                  <button
                    key={memory.id}
                    type="button"
                    className={cn(
                      "rounded-md border px-3 py-2 text-left text-sm transition-colors hover:bg-muted/40",
                      selectedID === memory.id && "border-primary bg-muted"
                    )}
                    onClick={() => setSelectedID(memory.id)}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-medium">{memory.title || memory.kind}</span>
                      <span className="shrink-0 text-[11px] text-muted-foreground">{memory.scope === "global" ? copy.global : copy.agent}</span>
                    </div>
                    <div className="mt-1 truncate text-xs text-muted-foreground">
                      {memory.kind} · {memory.agent_id || "-"} · {formatBytes(memory.size)}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{copy.details}</CardTitle>
          </CardHeader>
          <CardContent>
            {selectedMemory ? (
              <div className="space-y-4 text-sm">
                <div>
                  <div className="text-xs text-muted-foreground">{copy.memoryTitle}</div>
                  <div className="font-medium">{selectedMemory.title || selectedMemory.kind}</div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <SummaryItem label={copy.scope} value={selectedMemory.scope === "global" ? copy.global : copy.agent} />
                  <SummaryItem label={copy.kind} value={selectedMemory.kind} />
                  <SummaryItem label={copy.agent} value={selectedMemory.agent_id || "-"} />
                  <SummaryItem label={copy.size} value={formatBytes(selectedMemory.size)} />
                  <SummaryItem label={copy.status} value={selectedMemory.enabled ? copy.enabled : copy.disabled} />
                  <SummaryItem label={copy.updatedBy} value={selectedMemory.updated_by || "-"} />
                </div>
                <Button
                  className="gap-2"
                  onClick={() => {
                    setDraft((current) => ({
                      id: selectedMemory.id,
                      scope: selectedMemory.scope,
                      agent_id: selectedMemory.agent_id || "",
                      kind: selectedMemory.kind || "facts",
                      title: selectedMemory.title || "",
                      content: current.id === selectedMemory.id ? current.content : "",
                      enabled: selectedMemory.enabled !== false,
                    }))
                    setIsEditorOpen(true)
                  }}
                >
                  <Save size={16} />
                  {copy.editMemory}
                </Button>
              </div>
            ) : (
              <div className="rounded-md border border-dashed px-3 py-10 text-center text-sm text-muted-foreground">{copy.selectMemory}</div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={isEditorOpen} onOpenChange={setIsEditorOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>{draft.id ? copy.editMemory : copy.newMemory}</DialogTitle>
          </DialogHeader>
          <div className="max-h-[72vh] space-y-4 overflow-y-auto pr-1">
            <div className="grid gap-3 md:grid-cols-2">
              <label className="space-y-1 text-sm">
                <span className="font-medium">{copy.scope}</span>
                <Select value={String((draft.scope) || "__shadcn_empty__")} onValueChange={(value) => setDraft((current) => ({ ...current, scope: (value === "__shadcn_empty__" ? "" : value) as "global" | "agent" }))}><SelectTrigger className="h-10 w-full rounded-2xl border border-border bg-background px-3 text-sm"><SelectValue /></SelectTrigger><SelectContent>
                  <SelectItem value="global">{copy.global}</SelectItem>
                  <SelectItem value="agent">{copy.agent}</SelectItem>
                </SelectContent></Select>
              </label>
              <label className="space-y-1 text-sm">
                <span className="font-medium">{copy.agent}</span>
                <Select value={String((draft.agent_id) || "__shadcn_empty__")} disabled={draft.scope !== "agent"} onValueChange={(value) => setDraft((current) => ({ ...current, agent_id: (value === "__shadcn_empty__" ? "" : value) }))}><SelectTrigger className="h-10 w-full rounded-2xl border border-border bg-background px-3 text-sm"><SelectValue /></SelectTrigger><SelectContent>
                  <SelectItem value="__shadcn_empty__">{copy.selectAgent}</SelectItem>
                  {(agentsQuery.data || []).map((agent) => (
                    <SelectItem key={agent.id} value={String(agent.id)}>{agent.name}</SelectItem>
                  ))}
                </SelectContent></Select>
              </label>
              <label className="space-y-1 text-sm">
                <span className="font-medium">{copy.kind}</span>
                <Select value={String((draft.kind) || "__shadcn_empty__")} onValueChange={(value) => setDraft((current) => ({ ...current, kind: (value === "__shadcn_empty__" ? "" : value) }))}><SelectTrigger className="h-10 w-full rounded-2xl border border-border bg-background px-3 text-sm"><SelectValue /></SelectTrigger><SelectContent>
                  {memoryKinds.map((kind) => (
                    <SelectItem key={kind} value={String(kind)}>{kind}</SelectItem>
                  ))}
                </SelectContent></Select>
              </label>
              <label className="space-y-1 text-sm">
                <span className="font-medium">{copy.memoryTitle}</span>
                <Input value={draft.title} placeholder={copy.titlePlaceholder} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} />
              </label>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={draft.enabled} onCheckedChange={(checked) => setDraft((current) => ({ ...current, enabled: checked }))} />
              {copy.enabled}
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium">{copy.content}</span>
              <textarea
                className="min-h-[420px] w-full rounded-md border bg-background px-3 py-2 font-mono text-sm outline-none focus:ring-2 focus:ring-ring"
                value={draft.content}
                placeholder={copy.contentPlaceholder}
                onChange={(event) => setDraft((current) => ({ ...current, content: event.target.value }))}
              />
            </label>
          </div>
          <DialogFooter className="gap-2 sm:justify-between">
            <Button variant="outline" className="gap-2" disabled={!draft.id || isDeleting} onClick={deleteMemory}>
              <Trash2 size={16} />
              {copy.delete}
            </Button>
            <Button className="gap-2" disabled={isSaving} onClick={saveMemory}>
              <Save size={16} />
              {isSaving ? copy.saving : copy.save}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-muted/20 px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 truncate font-medium">{value}</div>
    </div>
  )
}

function normalizeMemoryList(value: unknown): MemoryListResponse {
  const item = value && typeof value === "object" ? value as Record<string, unknown> : {}
  return {
    memories: Array.isArray(item.memories) ? item.memories.map(normalizeMemory).filter((memory): memory is MemoryDocument => Boolean(memory)) : [],
    used_bytes: Number(item.used_bytes || 0),
    total_bytes: Number(item.total_bytes || 0),
    remaining_bytes: Number(item.remaining_bytes || 0),
  }
}

function normalizeMemory(value: unknown): MemoryDocument | null {
  const item = value && typeof value === "object" ? value as Record<string, unknown> : {}
  const id = typeof item.id === "string" ? item.id : ""
  if (!id) {
    return null
  }
  const scope = item.scope === "agent" ? "agent" : "global"
  return {
    id,
    scope,
    agent_id: typeof item.agent_id === "string" ? item.agent_id : "",
    kind: typeof item.kind === "string" ? item.kind : "facts",
    title: typeof item.title === "string" ? item.title : "",
    size: Number(item.size || 0),
    hash: typeof item.hash === "string" ? item.hash : "",
    enabled: item.enabled !== false,
    updated_by: typeof item.updated_by === "string" ? item.updated_by : "",
    created_at: typeof item.created_at === "string" ? item.created_at : "",
    updated_at: typeof item.updated_at === "string" ? item.updated_at : "",
  }
}

function normalizeMemoryContent(value: unknown): MemoryContentResponse {
  const base = normalizeMemory(value) || { ...emptyDraft, id: "", size: 0, hash: "", updated_by: "", created_at: "", updated_at: "" }
  const item = value && typeof value === "object" ? value as Record<string, unknown> : {}
  return {
    ...base,
    content: typeof item.content === "string" ? item.content : "",
    truncated: item.truncated === true,
  }
}

function normalizeAgent(value: unknown): AgentOption | null {
  const item = value && typeof value === "object" ? value as Record<string, unknown> : {}
  const id = typeof item.id === "string" ? item.id : ""
  if (!id) {
    return null
  }
  return { id, name: typeof item.name === "string" && item.name.trim() ? item.name : id }
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B"
  }
  const units = ["B", "KB", "MB", "GB"]
  let value = bytes
  let index = 0
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024
    index += 1
  }
  return `${value >= 10 || index === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[index]}`
}

function apiErrorMessage(err: unknown, fallback: string) {
  if (err && typeof err === "object" && "response" in err) {
    const response = (err as { response?: { data?: { error?: string } } }).response
    if (response?.data?.error) {
      return response.data.error
    }
  }
  if (err instanceof Error && err.message) {
    return err.message
  }
  return fallback
}

const zhCopy = {
  title: "记忆",
  subtitle: "管理全局记忆和助理记忆。记忆以 Markdown 文件保存，并计入文件存储额度。",
  refresh: "刷新",
  newMemory: "新建记忆",
  memories: "记忆文档",
  details: "详情",
  loading: "加载中",
  empty: "暂无记忆",
  selectMemory: "选择一条记忆查看详情",
  global: "全局",
  agent: "助理",
  editMemory: "编辑记忆",
  scope: "范围",
  selectAgent: "选择助理",
  kind: "类型",
  memoryTitle: "标题",
  titlePlaceholder: "例如：项目偏好",
  enabled: "启用",
  disabled: "停用",
  status: "状态",
  size: "大小",
  updatedBy: "更新者",
  content: "Markdown 内容",
  contentPlaceholder: "# Facts\n\n- 用户偏好...",
  save: "保存",
  saving: "保存中",
  delete: "删除",
  saved: "记忆已保存",
  saveFailed: "保存记忆失败",
  deleted: "记忆已删除",
  deleteFailed: "删除记忆失败",
  loadFailed: "读取记忆失败",
  contentRequired: "请填写记忆内容",
  agentRequired: "请选择助理",
}

const enCopy = {
  title: "Memory",
  subtitle: "Manage global and assistant-scoped memories. Memories are stored as Markdown files and count toward file storage.",
  refresh: "Refresh",
  newMemory: "New memory",
  memories: "Memory documents",
  details: "Details",
  loading: "Loading",
  empty: "No memories",
  selectMemory: "Select a memory to view details",
  global: "Global",
  agent: "Assistant",
  editMemory: "Edit memory",
  scope: "Scope",
  selectAgent: "Select assistant",
  kind: "Kind",
  memoryTitle: "Title",
  titlePlaceholder: "For example: Project preferences",
  enabled: "Enabled",
  disabled: "Disabled",
  status: "Status",
  size: "Size",
  updatedBy: "Updated by",
  content: "Markdown content",
  contentPlaceholder: "# Facts\n\n- User prefers...",
  save: "Save",
  saving: "Saving",
  delete: "Delete",
  saved: "Memory saved",
  saveFailed: "Failed to save memory",
  deleted: "Memory deleted",
  deleteFailed: "Failed to delete memory",
  loadFailed: "Failed to load memory",
  contentRequired: "Enter memory content",
  agentRequired: "Select an assistant",
}
