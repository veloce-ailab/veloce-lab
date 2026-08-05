import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { type ReactNode, useEffect, useMemo, useState } from "react"
import { Link, Navigate, Route, Routes, useNavigate, useParams } from "react-router-dom"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { ArrowLeft, BriefcaseBusiness, Pencil, Plus, Save, Trash2, Users } from "lucide-react"
import api from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { useToast } from "@/components/ui/toast"
import { useConfirmDialog } from "@/components/ui/confirm-dialog"
import { useI18n } from "@/lib/i18n"

interface ChatAgent {
  id: string
  name: string
}

interface AgentGroup {
  id: string
  name: string
  description?: string
  agents: AgentGroupAgent[]
  updated_at?: string
}

interface AgentGroupAgent {
  id: string
  name: string
  type: "chief" | "worker" | "critic" | "reviewer" | "checker"
  chat_agent_id?: string
}

interface DraftGroup {
  id: string
  name: string
  description: string
  agents: AgentGroupAgent[]
}

interface AgentGroupsData {
  copy: typeof enCopy
  groups: AgentGroup[]
  chatAgents: ChatAgent[]
  isFetchingGroups: boolean
  refetchGroups: () => void
}

const chatAgentsQueryKey = ["advanced-chat-agents"] as const
const agentGroupsQueryKey = ["advanced-chat-agent-groups"] as const
const emptyAgent = (): AgentGroupAgent => ({ id: "", name: "", type: "worker", chat_agent_id: "" })
const emptyDraft = (): DraftGroup => ({
  id: "",
  name: "",
  description: "",
  agents: [
    { id: "chief", name: "Chief", type: "chief", chat_agent_id: "" },
    { id: "checker", name: "Checker", type: "checker", chat_agent_id: "" },
  ],
})

export default function AgentGroupsPage() {
  const data = useAgentGroupsData()

  return (
    <Routes>
      <Route index element={<AgentGroupList data={data} />} />
      <Route path="new" element={<AgentGroupEditor data={data} mode="new" />} />
      <Route path=":groupID" element={<Navigate to="operations" replace />} />
    </Routes>
  )
}

function useAgentGroupsData(): AgentGroupsData {
  const { language } = useI18n()
  const copy = language === "zh" ? { ...enCopy, ...zhCopy } : enCopy

  const { data: chatAgents = [] } = useQuery<ChatAgent[]>({
    queryKey: chatAgentsQueryKey,
    queryFn: async () => {
      const res = await api.get("/user/advanced-chat/agents")
      const rawAgents: unknown[] = Array.isArray(res.data) ? res.data : []
      return rawAgents.map(normalizeChatAgent).filter((item): item is ChatAgent => Boolean(item))
    },
  })

  const { data: groups = [], isFetching: isFetchingGroups, refetch } = useQuery<AgentGroup[]>({
    queryKey: agentGroupsQueryKey,
    queryFn: async () => {
      const res = await api.get("/user/advanced-chat/agent-groups")
      const data = isRecord(res.data) ? res.data : {}
      const rawGroups: unknown[] = Array.isArray(data.groups) ? data.groups : []
      return rawGroups.map(normalizeGroup).filter((item): item is AgentGroup => Boolean(item))
    },
  })

  return {
    copy,
    groups,
    chatAgents,
    isFetchingGroups,
    refetchGroups: () => {
      void refetch()
    },
  }
}

function AgentGroupList({ data }: { data: AgentGroupsData }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { success, error } = useToast()
  const { confirm, confirmDialog } = useConfirmDialog()
  const [deletingID, setDeletingID] = useState("")
  const { copy, groups, isFetchingGroups, refetchGroups } = data

  const newGroupHref = "/chat/agent-groups/new"

  const deleteGroup = async (group: AgentGroup) => {
    if (!await confirm({ description: copy.deleteConfirm.replace("{name}", group.name) })) {
      return
    }
    setDeletingID(group.id)
    try {
      await api.delete(`/user/advanced-chat/agent-groups/${encodeURIComponent(group.id)}`)
      await queryClient.invalidateQueries({ queryKey: agentGroupsQueryKey })
      success(copy.deleted)
    } catch (err) {
      error(apiErrorMessage(err, copy.deleteFailed))
    } finally {
      setDeletingID("")
    }
  }

  return (
    <div className="space-y-6">
      {confirmDialog}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold">{copy.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{copy.subtitle}</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button variant="outline" className="gap-2" disabled={isFetchingGroups} onClick={refetchGroups}>
            {copy.refresh}
          </Button>
          <Button asChild className="gap-2">
            <Link to={newGroupHref}>
              <Plus size={16} />
              {copy.newGroup}
            </Link>
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Users size={18} />
            {copy.studioList}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {groups.length === 0 ? (
            <EmptyState>{isFetchingGroups ? copy.loading : copy.empty}</EmptyState>
          ) : (
            groups.map((group) => (
              <div key={group.id} className="grid gap-3 rounded-md border p-3 md:grid-cols-[1fr_auto] md:items-start">
                <button
                  type="button"
                  className="min-w-0 text-left"
                  onClick={() => navigate(`/chat/agent-groups/${encodeURIComponent(group.id)}/operations`)}
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <Users className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="truncate text-sm font-semibold">{group.name}</span>
                    <span className="shrink-0 rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">{group.id}</span>
                  </div>
                  {group.description && <div className="mt-1 line-clamp-2 text-sm text-muted-foreground">{group.description}</div>}
                  <div className="mt-2 flex flex-wrap gap-1">
                    {group.agents.map((agent) => (
                      <span key={agent.id} className="rounded border px-2 py-0.5 text-xs text-muted-foreground">
                        {agent.type}: {agent.name || agent.id}
                      </span>
                    ))}
                  </div>
                </button>
                <div className="flex gap-1">
                  <Button asChild variant="ghost" size="icon" title={copy.operations}>
                    <Link to={`/chat/agent-groups/${encodeURIComponent(group.id)}/operations`}>
                      <BriefcaseBusiness size={15} />
                    </Link>
                  </Button>
                  <Button variant="ghost" size="icon" disabled={deletingID === group.id} onClick={() => deleteGroup(group)} title={copy.deleteGroup}>
                    <Trash2 size={15} />
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function AgentGroupEditor({ data, mode }: { data: AgentGroupsData; mode: "new" | "edit" }) {
  const { groupID = "" } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { success, error } = useToast()
  const [draft, setDraft] = useState<DraftGroup>(() => emptyDraft())
  const [loadedKey, setLoadedKey] = useState("")
  const [isSaving, setIsSaving] = useState(false)
  const [editingAgentIndex, setEditingAgentIndex] = useState<number | null>(null)
  const [agentDraft, setAgentDraft] = useState<AgentGroupAgent>(() => emptyAgent())
  const [isAgentDialogOpen, setIsAgentDialogOpen] = useState(false)
  const { copy, groups, chatAgents, isFetchingGroups } = data
  const activeGroup = useMemo(() => groups.find((group) => group.id === groupID), [groups, groupID])
  const editorKey = `${mode}:${groupID}`

  useEffect(() => {
    if (loadedKey === editorKey) {
      return
    }
    if (mode === "new") {
      setDraft(emptyDraft())
      setLoadedKey(editorKey)
      return
    }
    if (activeGroup) {
      setDraft(groupToDraft(activeGroup))
      setLoadedKey(editorKey)
    }
  }, [activeGroup, editorKey, loadedKey, mode])

  const saveGroup = async () => {
    const usedIDs = new Set<string>()
    const payload = {
      id: draft.id.trim(),
      name: draft.name.trim(),
      description: draft.description.trim(),
      agents: draft.agents.map((agent, index) => normalizeDraftAgentForSave(agent, index, chatAgents, usedIDs)),
    }
    if (!payload.name) {
      error(copy.nameRequired)
      return
    }
    if (payload.agents.length === 0 || payload.agents.some((agent) => !agent.chat_agent_id)) {
      error(copy.agentRequired)
      return
    }
    const roleError = studioRoleValidationError(payload.agents, copy)
    if (roleError) {
      error(roleError)
      return
    }
    setIsSaving(true)
    try {
      const path = mode === "edit" ? `/user/advanced-chat/agent-groups/${encodeURIComponent(groupID)}` : "/user/advanced-chat/agent-groups"
      const res = mode === "edit" ? await api.put(path, payload) : await api.post(path, payload)
      const saved = normalizeGroup(res.data)
      await queryClient.invalidateQueries({ queryKey: agentGroupsQueryKey })
      success(copy.saved)
      if (saved) {
        navigate(`/chat/agent-groups/${encodeURIComponent(saved.id)}`, { replace: mode === "new" })
      }
    } catch (err) {
      error(apiErrorMessage(err, copy.saveFailed))
    } finally {
      setIsSaving(false)
    }
  }

  const removeAgent = (index: number) => {
    setDraft((current) => ({ ...current, agents: current.agents.filter((_, itemIndex) => itemIndex !== index) }))
  }

  const openCreateAgent = () => {
    setEditingAgentIndex(null)
    setAgentDraft(emptyAgent())
    setIsAgentDialogOpen(true)
  }

  const openEditAgent = (agent: AgentGroupAgent, index: number) => {
    setEditingAgentIndex(index)
    setAgentDraft({ ...agent })
    setIsAgentDialogOpen(true)
  }

  const saveAgentDraft = () => {
    const normalizedAgent = {
      ...agentDraft,
      name: agentDraft.name.trim(),
      chat_agent_id: (agentDraft.chat_agent_id || "").trim(),
    }
    if (!normalizedAgent.chat_agent_id) {
      error(copy.agentRequired)
      return
    }
    if (studioUniqueRoleConflict(draft.agents, normalizedAgent.type, editingAgentIndex)) {
      error(uniqueStudioRoleMessage(normalizedAgent.type, copy))
      return
    }
    setDraft((current) => {
      if (editingAgentIndex === null) {
        return { ...current, agents: [...current.agents, normalizedAgent] }
      }
      return {
        ...current,
        agents: current.agents.map((agent, index) => (index === editingAgentIndex ? normalizedAgent : agent)),
      }
    })
    setIsAgentDialogOpen(false)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <Button asChild variant="ghost" className="mb-2 gap-2 px-0">
            <Link to="/chat/agent-groups">
              <ArrowLeft size={16} />
              {copy.backToList}
            </Link>
          </Button>
          <h1 className="text-3xl font-bold">{mode === "new" ? copy.newGroup : copy.editGroup}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{copy.editSubtitle}</p>
        </div>
        <Button className="gap-2" disabled={isSaving} onClick={saveGroup}>
          <Save size={16} />
          {isSaving ? copy.saving : copy.save}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Users size={18} />
            {copy.groupSettings}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label={copy.groupID}>
              <Input value={draft.id} placeholder={copy.groupIDPlaceholder} disabled={mode === "edit"} onChange={(event) => setDraft({ ...draft, id: event.target.value })} />
            </Field>
          </div>

          {mode === "edit" && !activeGroup && !isFetchingGroups ? (
            <EmptyState>{copy.groupNotFound}</EmptyState>
          ) : (
            <>
              <div className="grid gap-4 md:grid-cols-2">
                <Field label={copy.groupName}>
                  <Input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
                </Field>
              </div>
              <Field label={copy.description}>
                <textarea className="min-h-20 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} />
              </Field>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-3 text-base">
            <span>{copy.agents}</span>
            <Button variant="outline" size="sm" className="gap-2" onClick={openCreateAgent}>
              <Plus size={15} />
              {copy.addAgent}
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {draft.agents.length === 0 ? (
            <EmptyState>{copy.noAgentsConfigured}</EmptyState>
          ) : (
            draft.agents.map((agent, index) => {
              const chatAgentName = chatAgents.find((item) => item.id === agent.chat_agent_id)?.name || agent.chat_agent_id || ""
              return (
                <div key={`${agent.id || "agent"}-${index}`} className="grid gap-3 rounded-md border p-3 md:grid-cols-[1fr_auto] md:items-center">
                  <button type="button" className="min-w-0 text-left" onClick={() => openEditAgent(agent, index)}>
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-semibold">{agent.name || agent.id || copy.unnamedAgent}</span>
                      <span className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">{agent.type}</span>
                    </div>
                    <div className="mt-1 truncate text-xs text-muted-foreground">
                      {chatAgentName ? `${copy.chatAgent}: ${chatAgentName}` : copy.noChatAgentSelected}
                    </div>
                  </button>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => openEditAgent(agent, index)} title={copy.editAgent}>
                      <Pencil size={15} />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => removeAgent(index)} title={copy.removeAgent}>
                      <Trash2 size={15} />
                    </Button>
                  </div>
                </div>
              )
            })
          )}
        </CardContent>
      </Card>

      <AgentDialog
        open={isAgentDialogOpen}
        copy={copy}
        agent={agentDraft}
        chatAgents={chatAgents}
        isEditing={editingAgentIndex !== null}
        onOpenChange={setIsAgentDialogOpen}
        onAgentChange={(nextAgent) => {
          if (nextAgent.type !== agentDraft.type && studioUniqueRoleConflict(draft.agents, nextAgent.type, editingAgentIndex)) {
            error(uniqueStudioRoleMessage(nextAgent.type, copy))
            return
          }
          setAgentDraft(nextAgent)
        }}
        onSave={saveAgentDraft}
      />
    </div>
  )
}

function AgentDialog({
  open,
  copy,
  agent,
  chatAgents,
  isEditing,
  onOpenChange,
  onAgentChange,
  onSave,
}: {
  open: boolean
  copy: typeof enCopy
  agent: AgentGroupAgent
  chatAgents: ChatAgent[]
  isEditing: boolean
  onOpenChange: (open: boolean) => void
  onAgentChange: (agent: AgentGroupAgent) => void
  onSave: () => void
}) {
  const updateAgent = (patch: Partial<AgentGroupAgent>) => onAgentChange({ ...agent, ...patch })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? copy.editAgent : copy.newAgent}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <Field label={copy.chatAgent}>
            <Select value={String((agent.chat_agent_id || "") || "__shadcn_empty__")} onValueChange={(value) => {
                const chatAgent = chatAgents.find((item) => item.id === (value === "__shadcn_empty__" ? "" : value))
                updateAgent({
                  chat_agent_id: (value === "__shadcn_empty__" ? "" : value),
                  id: agentMemberID(chatAgent),
                  name: chatAgent?.name || agent.name || "",
                })
              }}><SelectTrigger className="h-10 w-full rounded-2xl border border-border bg-background px-3 text-sm"><SelectValue /></SelectTrigger><SelectContent>
              <SelectItem value="__shadcn_empty__">{copy.noChatAgentSelected}</SelectItem>
              {chatAgents.map((item) => (
                <SelectItem key={item.id} value={String(item.id)}>
                  {item.name}
                </SelectItem>
              ))}
            </SelectContent></Select>
          </Field>
          <div className="grid gap-3 md:grid-cols-[1fr_140px]">
            <Field label={copy.agentName}>
              <Input value={agent.name} onChange={(event) => updateAgent({ name: event.target.value })} />
            </Field>
            <Field label={copy.agentType}>
              <Select value={String((agent.type) || "__shadcn_empty__")} onValueChange={(value) => updateAgent({ type: (value === "__shadcn_empty__" ? "" : value) as AgentGroupAgent["type"] })}><SelectTrigger className="h-10 w-full rounded-2xl border border-border bg-background px-3 text-sm"><SelectValue /></SelectTrigger><SelectContent>
                <SelectItem value="chief">chief</SelectItem>
                <SelectItem value="worker">worker</SelectItem>
                <SelectItem value="critic">critic</SelectItem>
                <SelectItem value="reviewer">reviewer</SelectItem>
                <SelectItem value="checker">checker</SelectItem>
              </SelectContent></Select>
            </Field>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>{copy.cancel}</Button>
          <Button className="gap-2" onClick={onSave}>
            <Save size={16} />
            {copy.done}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="space-y-1 text-sm">
      <span className="font-medium">{label}</span>
      {children}
    </label>
  )
}

function EmptyState({ children }: { children: ReactNode }) {
  return <div className="rounded-md border border-dashed px-3 py-8 text-center text-sm text-muted-foreground">{children}</div>
}

function groupToDraft(group: AgentGroup): DraftGroup {
  return {
    id: group.id,
    name: group.name,
    description: group.description || "",
    agents: group.agents.length ? group.agents.map((agent) => ({ ...agent })) : [emptyAgent()],
  }
}

function normalizeDraftAgentForSave(agent: AgentGroupAgent, index: number, chatAgents: ChatAgent[], usedIDs: Set<string>) {
  const chatAgentID = (agent.chat_agent_id || "").trim()
  const chatAgent = chatAgents.find((item) => item.id === chatAgentID)
  const id = uniqueAgentMemberID(agentMemberID(chatAgent) || `agent-${index + 1}`, usedIDs)
  return {
    id,
    name: agent.name.trim() || chatAgent?.name || id,
    type: agent.type,
    chat_agent_id: chatAgentID,
  }
}

function uniqueAgentMemberID(base: string, usedIDs: Set<string>) {
  const cleanBase = base || "agent"
  let candidate = cleanBase
  for (let index = 2; usedIDs.has(candidate); index += 1) {
    candidate = `${cleanBase}-${index}`
  }
  usedIDs.add(candidate)
  return candidate
}

function normalizeChatAgent(value: unknown): ChatAgent | null {
  if (!isRecord(value)) return null
  const id = stringValue(value.id)
  if (!id) return null
  return {
    id,
    name: stringValue(value.name) || id,
  }
}

function normalizeGroup(value: unknown): AgentGroup | null {
  if (!isRecord(value)) return null
  const id = stringValue(value.id)
  if (!id) return null
  const agents = Array.isArray(value.agents) ? value.agents.map(normalizeAgent).filter((agent): agent is AgentGroupAgent => Boolean(agent)) : []
  return { id, name: stringValue(value.name) || id, description: stringValue(value.description), agents, updated_at: stringValue(value.updated_at) }
}

function normalizeAgent(value: unknown): AgentGroupAgent | null {
  if (!isRecord(value)) return null
  const id = stringValue(value.id)
  if (!id) return null
  const type = stringValue(value.type)
  return {
    id,
    name: stringValue(value.name) || id,
    type: type === "chief" || type === "critic" || type === "reviewer" || type === "checker" ? type : "worker",
    chat_agent_id: stringValue(value.chat_agent_id),
  }
}

function studioUniqueRoleConflict(agents: AgentGroupAgent[], type: AgentGroupAgent["type"], editingIndex: number | null) {
  if (type !== "chief" && type !== "checker") return false
  return agents.some((agent, index) => index !== editingIndex && agent.type === type)
}

function studioRoleValidationError(agents: AgentGroupAgent[], copy: typeof enCopy) {
  const chiefCount = agents.filter((agent) => agent.type === "chief").length
  if (chiefCount !== 1) return copy.exactlyOneChief
  const checkerCount = agents.filter((agent) => agent.type === "checker").length
  if (checkerCount !== 1) return copy.exactlyOneChecker
  return ""
}

function uniqueStudioRoleMessage(type: AgentGroupAgent["type"], copy: typeof enCopy) {
  return type === "chief" ? copy.onlyOneChief : type === "checker" ? copy.onlyOneChecker : ""
}

function apiErrorMessage(err: unknown, fallback: string) {
  if (isRecord(err) && isRecord(err.response) && isRecord(err.response.data) && typeof err.response.data.error === "string") {
    return err.response.data.error
  }
  return err instanceof Error && err.message ? err.message : fallback
}

function stringValue(value: unknown) {
  if (typeof value === "string") return value
  if (typeof value === "number" && Number.isFinite(value)) return String(value)
  return ""
}

function agentMemberID(agent?: ChatAgent) {
  const source = agent?.name || agent?.id || "agent"
  const normalized = source.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "")
  return normalized || `agent-${agent?.id || "1"}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

const zhCopy = {
  title: "\u5de5\u4f5c\u5ba4",
  subtitle: "\u5de5\u4f5c\u5ba4\u5b58\u50a8\u5728\u6570\u636e\u5e93\u4e2d\uff0c\u8fde\u63a5\u5668\u53ea\u7528\u4e8e\u8fd0\u884c\u65f6\u5de5\u4f5c\u76ee\u5f55\u548c\u5de5\u5177\u6267\u884c\u3002",
  editSubtitle: "编辑当前工作室的基础信息和成员代理。成员只绑定现有代理；skill 和 MCP 在代理中配置。",
  selectDevice: "选择连接器",
  offline: "离线",
  refresh: "刷新",
  newGroup: "新建工作室",
  editGroup: "编辑工作室",
  operations: "工作室运营",
  studioList: "\u5de5\u4f5c\u5ba4\u5217\u8868",
  loading: "正在加载工作室...",
  empty: "\u6682\u65e0\u5de5\u4f5c\u5ba4",
  groupNotFound: "\u672a\u627e\u5230\u8be5\u5de5\u4f5c\u5ba4\uff0c\u8bf7\u786e\u8ba4\u5de5\u4f5c\u5ba4\u9009\u62e9\u662f\u5426\u6b63\u786e\u3002",
  deleteGroup: "删除工作室",
  deleteConfirm: "确定删除工作室 {name} 吗？",
  deleted: "工作室已删除",
  deleteFailed: "删除工作室失败",
  saved: "工作室已保存",
  saveFailed: "保存工作室失败",
  nameRequired: "请输入工作室名称",
  agentRequired: "每个工作室成员都必须选择一个代理",
  exactlyOneChief: "每个工作室必须且只能有一个 Chief",
  exactlyOneChecker: "每个工作室必须且只能有一个 Checker",
  onlyOneChief: "每个工作室只能添加一个 Chief",
  onlyOneChecker: "每个工作室只能添加一个 Checker",
  backToList: "返回工作室",
  groupSettings: "工作室设置",
  groupID: "工作室 ID",
  groupIDPlaceholder: "留空自动生成",
  groupName: "工作室名称",
  description: "描述",
  agents: "成员",
  addAgent: "添加成员",
  newAgent: "新建成员",
  editAgent: "编辑成员",
  noAgentsConfigured: "还没有成员，点击添加成员并选择代理。",
  unnamedAgent: "未命名成员",
  chatAgent: "代理",
  noChatAgentSelected: "未选择代理",
  agentName: "名称",
  agentType: "类型",
  removeAgent: "移除成员",
  cancel: "取消",
  done: "完成",
  save: "保存",
  saving: "保存中...",
}

const enCopy = {
  title: "Agent Studios",
  subtitle: "Agent Studios are stored in the database. Connectors are only used at runtime for workspace paths and tool execution.",
  editSubtitle: "Edit the current studio details and members. Each member only binds an existing agent; skills and MCP servers are configured on the agent.",
  refresh: "Refresh",
  newGroup: "New studio",
  editGroup: "Edit studio",
  operations: "Studio operations",
  studioList: "Studio list",
  loading: "Loading studios...",
  empty: "No studios yet",
  groupNotFound: "Studio not found. Check the selected studio.",
  deleteGroup: "Delete studio",
  deleteConfirm: "Delete studio {name}?",
  deleted: "Studio deleted",
  deleteFailed: "Failed to delete studio",
  saved: "Studio saved",
  saveFailed: "Failed to save studio",
  nameRequired: "Studio name is required",
  agentRequired: "Each studio member must select an agent",
  exactlyOneChief: "Each studio must contain exactly one Chief",
  exactlyOneChecker: "Each studio must contain exactly one Checker",
  onlyOneChief: "Each studio can only have one Chief",
  onlyOneChecker: "Each studio can only have one Checker",
  backToList: "Back to studios",
  groupSettings: "Studio settings",
  groupID: "Studio ID",
  groupIDPlaceholder: "Leave empty to generate",
  groupName: "Studio name",
  description: "Description",
  agents: "Members",
  addAgent: "Add member",
  newAgent: "New member",
  editAgent: "Edit member",
  noAgentsConfigured: "No members yet. Add a member and select an agent.",
  unnamedAgent: "Unnamed member",
  chatAgent: "Agent",
  noChatAgentSelected: "No chat agent selected",
  agentName: "Name",
  agentType: "Type",
  streamAgent: "Stream agent calls",
  streaming: "Streaming",
  removeAgent: "Remove agent",
  cancel: "Cancel",
  done: "Done",
  save: "Save",
  saving: "Saving...",
}
