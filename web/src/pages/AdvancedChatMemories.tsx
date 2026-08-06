import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useEffect, useMemo, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Brain, FolderKanban, Heart, Home, Lightbulb, Plus, RefreshCw, Save, ScrollText, Shapes, StickyNote, Trash2, UserRound } from "lucide-react"
import api from "@/lib/api"
import { Button } from "@/components/ui/button"
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
type MemoryKind = typeof memoryKinds[number]
type MemoryFilter = "all" | MemoryKind

const memoryKindMeta = {
  profile: { icon: UserRound, zh: "身份", en: "Profile" },
  preferences: { icon: Heart, zh: "偏好", en: "Preferences" },
  facts: { icon: Lightbulb, zh: "事实", en: "Facts" },
  projects: { icon: FolderKanban, zh: "项目", en: "Projects" },
  rules: { icon: ScrollText, zh: "规则", en: "Rules" },
  scratch: { icon: StickyNote, zh: "草稿", en: "Scratch" },
  custom: { icon: Shapes, zh: "自定义", en: "Custom" },
} satisfies Record<MemoryKind, { icon: typeof Brain; zh: string; en: string }>

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
  const [selectedFilter, setSelectedFilter] = useState<MemoryFilter>("all")
  const [draft, setDraft] = useState(emptyDraft)
  const [isNewDialogOpen, setIsNewDialogOpen] = useState(false)
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

  const filteredMemories = useMemo(() => {
    const memories = memoriesQuery.data?.memories || []
    return selectedFilter === "all" ? memories : memories.filter((memory) => memory.kind === selectedFilter)
  }, [memoriesQuery.data?.memories, selectedFilter])
  const selectedMemory = useMemo(() => filteredMemories.find((item) => item.id === selectedID), [filteredMemories, selectedID])
  const kindCounts = useMemo(() => {
    const counts = Object.fromEntries(memoryKinds.map((kind) => [kind, 0])) as Record<MemoryKind, number>
    for (const memory of memoriesQuery.data?.memories || []) {
      if (memory.kind in counts) counts[memory.kind as MemoryKind] += 1
    }
    return counts
  }, [memoriesQuery.data?.memories])
  const usage = useMemo(() => {
    const used = memoriesQuery.data?.used_bytes || 0
    const total = memoriesQuery.data?.total_bytes || 0
    return { used, total, percent: total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0 }
  }, [memoriesQuery.data?.total_bytes, memoriesQuery.data?.used_bytes])

  useEffect(() => {
    if (selectedID || filteredMemories.length === 0) {
      return
    }
    setSelectedID(filteredMemories[0].id)
  }, [filteredMemories, selectedID])

  useEffect(() => {
    if (isNewDialogOpen || !selectedMemory) {
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
  }, [copy.loadFailed, error, isNewDialogOpen, selectedMemory])

  const startNew = () => {
    setDraft({ ...emptyDraft, kind: selectedFilter === "all" ? "facts" : selectedFilter })
    setIsNewDialogOpen(true)
  }

  const selectFilter = (filter: MemoryFilter) => {
    setSelectedFilter(filter)
    setSelectedID("")
    setDraft({ ...emptyDraft })
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
        setSelectedFilter(saved.kind in memoryKindMeta ? saved.kind as MemoryKind : "all")
      }
      setIsNewDialogOpen(false)
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
      setIsNewDialogOpen(false)
      await queryClient.invalidateQueries({ queryKey: memoriesQueryKey })
    } catch (err) {
      error(apiErrorMessage(err, copy.deleteFailed))
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <div className="min-h-[calc(100dvh-10rem)]">
      <header className="flex min-h-14 items-center justify-between gap-3 border-b px-4">
        <div className="flex min-w-0 items-center gap-2.5"><Brain size={18} className="shrink-0 text-primary" /><div className="min-w-0"><h1 className="truncate text-sm font-semibold">{copy.title}</h1><p className="hidden truncate text-xs text-muted-foreground sm:block">{copy.subtitle}</p></div></div>
        <div className="flex shrink-0 gap-1.5"><Button size="icon" variant="ghost" disabled={memoriesQuery.isFetching} onClick={() => void memoriesQuery.refetch()} title={copy.refresh}><RefreshCw size={16} className={memoriesQuery.isFetching ? "animate-spin" : ""} /></Button><Button size="sm" className="gap-1.5" onClick={startNew}><Plus size={15} />{copy.newMemory}</Button></div>
      </header>

      <div className="grid min-h-[calc(100dvh-13.5rem)] lg:grid-cols-[220px_280px_minmax(0,1fr)]">
        <aside className="border-b bg-muted/20 p-2 lg:border-b-0 lg:border-r">
          <div className="mb-2 px-2 pt-1 text-xs font-medium text-muted-foreground">{copy.memoryTypes}</div>
          <div className="grid grid-cols-2 gap-1 sm:grid-cols-4 lg:grid-cols-1">
            <MemoryTypeButton icon={Home} label={copy.allMemories} count={memoriesQuery.data?.memories.length || 0} active={selectedFilter === "all"} onClick={() => selectFilter("all")} />
            {memoryKinds.map((kind) => {
              const meta = memoryKindMeta[kind]
              return <MemoryTypeButton key={kind} icon={meta.icon} label={language === "zh" ? meta.zh : meta.en} count={kindCounts[kind]} active={selectedFilter === kind} onClick={() => selectFilter(kind)} />
            })}
          </div>
          <div className="mt-4 hidden rounded-md border bg-background p-3 lg:block"><div className="flex items-center justify-between text-xs text-muted-foreground"><span>{copy.storage}</span><span>{usage.percent}%</span></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary transition-all" style={{ width: `${usage.percent}%` }} /></div><div className="mt-2 text-xs text-muted-foreground">{formatBytes(usage.used)} / {formatBytes(usage.total)}</div></div>
        </aside>

        <section className="min-h-0 border-b lg:border-b-0 lg:border-r">
          <div className="flex h-12 items-center justify-between border-b px-3"><div className="min-w-0"><div className="truncate text-sm font-medium">{selectedFilter === "all" ? copy.allMemories : (language === "zh" ? memoryKindMeta[selectedFilter].zh : memoryKindMeta[selectedFilter].en)}</div><div className="text-xs text-muted-foreground">{filteredMemories.length} {copy.items}</div></div><Button size="icon" variant="ghost" className="h-8 w-8" onClick={startNew} title={copy.newMemory}><Plus size={16} /></Button></div>
          <div className="max-h-[34vh] overflow-y-auto p-2 lg:max-h-none lg:h-[calc(100dvh-16.5rem)]">
            {memoriesQuery.isLoading ? <div className="px-3 py-10 text-center text-sm text-muted-foreground">{copy.loading}</div> : filteredMemories.length === 0 ? <div className="px-3 py-10 text-center text-sm text-muted-foreground">{copy.emptyKind}</div> : <div className="space-y-1">{filteredMemories.map((memory) => <button key={memory.id} type="button" className={cn("w-full rounded-md px-3 py-2.5 text-left transition-colors hover:bg-muted", selectedID === memory.id && "bg-primary/10 text-primary")} onClick={() => setSelectedID(memory.id)}><div className="flex items-center justify-between gap-2"><span className="truncate text-sm font-medium">{memory.title || memoryKindLabel(memory.kind, language)}</span><span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", memory.enabled ? "bg-emerald-500" : "bg-muted-foreground/50")} /></div><div className="mt-1 truncate text-xs text-muted-foreground">{memory.scope === "global" ? copy.global : copy.agent}{memory.agent_id ? ` · ${memory.agent_id}` : ""}</div></button>)}</div>}
          </div>
        </section>

        <section className="flex min-h-[460px] min-w-0 flex-col">
          {selectedMemory ? <>
            <div className="flex h-12 items-center justify-between gap-3 border-b px-4"><div className="min-w-0"><div className="truncate text-sm font-medium">{draft.title || memoryKindLabel(draft.kind, language)}</div><div className="truncate text-xs text-muted-foreground">{`${formatBytes(selectedMemory.size)} · ${copy.updatedBy} ${selectedMemory.updated_by || "-"}`}</div></div><label className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground"><Switch checked={draft.enabled} onCheckedChange={(checked) => setDraft((current) => ({ ...current, enabled: checked }))} />{draft.enabled ? copy.enabled : copy.disabled}</label></div>
            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <label className="space-y-1.5"><span className="text-xs font-medium text-muted-foreground">{copy.memoryTitle}</span><Input value={draft.title} placeholder={copy.titlePlaceholder} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} /></label>
                <label className="space-y-1.5"><span className="text-xs font-medium text-muted-foreground">{copy.kind}</span><Select value={draft.kind} onValueChange={(kind) => setDraft((current) => ({ ...current, kind }))}><SelectTrigger className="h-9 w-full"><SelectValue /></SelectTrigger><SelectContent>{memoryKinds.map((kind) => <SelectItem key={kind} value={kind}>{memoryKindLabel(kind, language)}</SelectItem>)}</SelectContent></Select></label>
                <label className="space-y-1.5"><span className="text-xs font-medium text-muted-foreground">{copy.scope}</span><Select value={draft.scope} onValueChange={(scope) => setDraft((current) => ({ ...current, scope: scope as "global" | "agent" }))}><SelectTrigger className="h-9 w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="global">{copy.global}</SelectItem><SelectItem value="agent">{copy.agent}</SelectItem></SelectContent></Select></label>
                <label className="space-y-1.5"><span className="text-xs font-medium text-muted-foreground">{copy.agent}</span><Select value={draft.agent_id || "__shadcn_empty__"} disabled={draft.scope !== "agent"} onValueChange={(agentID) => setDraft((current) => ({ ...current, agent_id: agentID === "__shadcn_empty__" ? "" : agentID }))}><SelectTrigger className="h-9 w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="__shadcn_empty__">{copy.selectAgent}</SelectItem>{(agentsQuery.data || []).map((agent) => <SelectItem key={agent.id} value={agent.id}>{agent.name}</SelectItem>)}</SelectContent></Select></label>
              </div>
              <label className="flex min-h-[280px] flex-1 flex-col gap-1.5"><span className="text-xs font-medium text-muted-foreground">{copy.content}</span><textarea className="min-h-[280px] flex-1 resize-none rounded-md border bg-background px-3 py-2 font-mono text-sm leading-6 outline-none focus:ring-2 focus:ring-ring" value={draft.content} placeholder={copy.contentPlaceholder} onChange={(event) => setDraft((current) => ({ ...current, content: event.target.value }))} /></label>
            </div>
            <div className="flex items-center justify-between gap-3 border-t px-4 py-3"><Button variant="ghost" className="gap-1.5 text-destructive hover:text-destructive" disabled={!draft.id || isDeleting} onClick={() => void deleteMemory()}><Trash2 size={15} />{copy.delete}</Button><Button className="gap-1.5" disabled={isSaving} onClick={() => void saveMemory()}><Save size={15} />{isSaving ? copy.saving : copy.save}</Button></div>
          </> : <div className="flex flex-1 items-center justify-center p-8"><div className="max-w-md text-center"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-md border bg-muted/30 text-muted-foreground"><Brain size={28} /></div><h2 className="mt-5 text-xl font-semibold">{copy.empty}</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">{copy.emptyDescription}</p><Button className="mt-5 gap-1.5" onClick={startNew}><Plus size={15} />{copy.newMemory}</Button></div></div>}
        </section>
      </div>
      <Dialog open={isNewDialogOpen} onOpenChange={setIsNewDialogOpen}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader><DialogTitle>{copy.newMemory}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1.5"><span className="text-sm font-medium">{copy.memoryTitle}</span><Input value={draft.title} placeholder={copy.titlePlaceholder} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} /></label>
              <label className="space-y-1.5"><span className="text-sm font-medium">{copy.kind}</span><Select value={draft.kind} onValueChange={(kind) => setDraft((current) => ({ ...current, kind }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{memoryKinds.map((kind) => <SelectItem key={kind} value={kind}>{memoryKindLabel(kind, language)}</SelectItem>)}</SelectContent></Select></label>
              <label className="space-y-1.5"><span className="text-sm font-medium">{copy.scope}</span><Select value={draft.scope} onValueChange={(scope) => setDraft((current) => ({ ...current, scope: scope as "global" | "agent" }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="global">{copy.global}</SelectItem><SelectItem value="agent">{copy.agent}</SelectItem></SelectContent></Select></label>
              <label className="space-y-1.5"><span className="text-sm font-medium">{copy.agent}</span><Select value={draft.agent_id || "__shadcn_empty__"} disabled={draft.scope !== "agent"} onValueChange={(agentID) => setDraft((current) => ({ ...current, agent_id: agentID === "__shadcn_empty__" ? "" : agentID }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="__shadcn_empty__">{copy.selectAgent}</SelectItem>{(agentsQuery.data || []).map((agent) => <SelectItem key={agent.id} value={agent.id}>{agent.name}</SelectItem>)}</SelectContent></Select></label>
            </div>
            <label className="flex items-center gap-2 text-sm"><Switch checked={draft.enabled} onCheckedChange={(checked) => setDraft((current) => ({ ...current, enabled: checked }))} />{copy.enabled}</label>
            <label className="flex min-h-[340px] flex-col gap-1.5"><span className="text-sm font-medium">{copy.content}</span><textarea className="min-h-[340px] flex-1 resize-none rounded-md border bg-background px-3 py-2 font-mono text-sm leading-6 outline-none focus:ring-2 focus:ring-ring" value={draft.content} placeholder={copy.contentPlaceholder} onChange={(event) => setDraft((current) => ({ ...current, content: event.target.value }))} /></label>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setIsNewDialogOpen(false)}>{copy.cancel}</Button><Button className="gap-1.5" disabled={isSaving} onClick={() => void saveMemory()}><Save size={15} />{isSaving ? copy.saving : copy.save}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function MemoryTypeButton({ icon: Icon, label, count, active, onClick }: { icon: typeof Brain; label: string; count: number; active: boolean; onClick: () => void }) {
  return (
    <button type="button" className={cn("flex h-9 min-w-0 items-center gap-2 rounded-md px-2 text-left text-sm transition-colors", active ? "bg-primary text-primary-foreground shadow-sm" : "hover:bg-muted")} onClick={onClick}><Icon size={15} className="shrink-0" /><span className="min-w-0 flex-1 truncate">{label}</span><span className={cn("text-xs tabular-nums", active ? "text-primary-foreground/75" : "text-muted-foreground")}>{count}</span></button>
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

function memoryKindLabel(kind: string, language: string) {
  const meta = memoryKindMeta[kind as MemoryKind]
  if (!meta) return kind || "facts"
  return language === "zh" ? meta.zh : meta.en
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
  memoryTypes: "记忆类型",
  allMemories: "首页",
  items: "条",
  storage: "存储空间",
  details: "详情",
  loading: "加载中",
  empty: "暂无记忆",
  emptyKind: "这个类型暂无记忆",
  emptyDescription: "将长期有价值的信息整理成记忆，助理会在后续对话中读取相应范围内的内容。",
  newMemoryHint: "选择类型、范围并填写 Markdown 内容。",
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
  cancel: "取消",
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
  memoryTypes: "Memory types",
  allMemories: "Home",
  items: "items",
  storage: "Storage",
  details: "Details",
  loading: "Loading",
  empty: "No memories",
  emptyKind: "No memories in this type",
  emptyDescription: "Save information with lasting value. Assistants read memories that apply to their current scope in later conversations.",
  newMemoryHint: "Choose a type and scope, then add Markdown content.",
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
  cancel: "Cancel",
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
