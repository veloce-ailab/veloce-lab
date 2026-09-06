import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { type ReactNode, useEffect, useMemo, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Plus, RefreshCcw, Save, Trash2, Users } from "lucide-react"
import api from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { useToast } from "@/components/ui/toast"
import { useConfirmDialog } from "@/components/ui/confirm-dialog"
import { useI18n } from "@/lib/i18n"
import { cn } from "@/lib/utils"

interface ConnectorDevice {
  id: string
  name: string
  online: boolean
  os?: string
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

interface ChatAgent {
  id: string
  name: string
}

interface DraftGroup {
  id: string
  name: string
  description: string
  agents: AgentGroupAgent[]
}

const devicesQueryKey = ["advanced-chat-connector-devices"] as const
const chatAgentsQueryKey = ["advanced-chat-agents"] as const
const agentGroupsQueryKey = (deviceID: string) => ["advanced-chat-agent-groups", deviceID] as const
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

export default function AgentGroups() {
  const { language } = useI18n()
  const copy = language === "zh" ? zhCopy : language === "ja" ? jaCopy : enCopy
  const queryClient = useQueryClient()
  const { success, error } = useToast()
  const { confirm, confirmDialog } = useConfirmDialog()
  const [selectedDeviceID, setSelectedDeviceID] = useState("")
  const [activeGroupID, setActiveGroupID] = useState("")
  const [isEditorOpen, setIsEditorOpen] = useState(false)
  const [draft, setDraft] = useState<DraftGroup>(() => emptyDraft())
  const [isSaving, setIsSaving] = useState(false)
  const [deletingID, setDeletingID] = useState("")

  const { data: devices = [] } = useQuery<ConnectorDevice[]>({
    queryKey: devicesQueryKey,
    refetchInterval: 5000,
    queryFn: async () => {
      const res = await api.get("/user/advanced-chat/devices")
      const rawDevices: unknown[] = Array.isArray(res.data) ? res.data : []
      return rawDevices.map(normalizeDevice).filter((item): item is ConnectorDevice => Boolean(item))
    },
  })

  const { data: chatAgents = [] } = useQuery<ChatAgent[]>({
    queryKey: chatAgentsQueryKey,
    queryFn: async () => {
      const res = await api.get("/user/advanced-chat/agents")
      const rawAgents: unknown[] = Array.isArray(res.data) ? res.data : []
      return rawAgents.map(normalizeChatAgent).filter((item): item is ChatAgent => Boolean(item))
    },
  })

  useEffect(() => {
    if (selectedDeviceID && devices.some((device) => device.id === selectedDeviceID)) {
      return
    }
    const firstOnline = devices.find((device) => device.online)
    setSelectedDeviceID(firstOnline?.id || devices[0]?.id || "")
  }, [devices, selectedDeviceID])

  const { data: groups = [], isFetching, refetch } = useQuery<AgentGroup[]>({
    queryKey: agentGroupsQueryKey(selectedDeviceID),
    enabled: Boolean(selectedDeviceID),
    queryFn: async () => {
      const res = await api.get("/user/advanced-chat/agent-groups")
      const data = isRecord(res.data) ? res.data : {}
      const rawGroups: unknown[] = Array.isArray(data.groups) ? data.groups : []
      return rawGroups.map(normalizeGroup).filter((item): item is AgentGroup => Boolean(item))
    },
  })

  const selectedDevice = useMemo(() => devices.find((device) => device.id === selectedDeviceID), [devices, selectedDeviceID])

  const openCreate = () => {
    if (!selectedDeviceID) {
      error(copy.deviceRequired)
      return
    }
    setActiveGroupID("")
    setDraft(emptyDraft())
    setIsEditorOpen(true)
  }

  const openEdit = (group: AgentGroup) => {
    setActiveGroupID(group.id)
    setDraft({
      id: group.id,
      name: group.name,
      description: group.description || "",
      agents: group.agents.length ? group.agents.map((agent) => ({ ...agent })) : [emptyAgent()],
    })
    setIsEditorOpen(true)
  }

  const updateAgent = (index: number, patch: Partial<AgentGroupAgent>) => {
    if (patch.type && studioUniqueRoleConflict(draft.agents, patch.type, index)) {
      error(uniqueStudioRoleMessage(patch.type, copy))
      return
    }
    setDraft((current) => ({
      ...current,
      agents: current.agents.map((agent, itemIndex) => (itemIndex === index ? { ...agent, ...patch } : agent)),
    }))
  }

  const selectChatAgent = (index: number, chatAgentID: string) => {
    const chatAgent = chatAgents.find((agent) => agent.id === chatAgentID)
    updateAgent(index, {
      chat_agent_id: chatAgentID,
      id: agentMemberID(chatAgent),
      name: chatAgent?.name || draft.agents[index]?.name || "",
    })
  }

  const removeAgent = (index: number) => {
    setDraft((current) => ({ ...current, agents: current.agents.filter((_, itemIndex) => itemIndex !== index) }))
  }

  const saveGroup = async () => {
    if (!selectedDeviceID) {
      error(copy.deviceRequired)
      return
    }
    const payload = {
      id: draft.id.trim(),
      name: draft.name.trim(),
      description: draft.description.trim(),
      agents: draft.agents.map((agent) => ({
        id: agent.id.trim() || agentMemberID(chatAgents.find((item) => item.id === agent.chat_agent_id)),
        name: agent.name.trim() || chatAgents.find((item) => item.id === agent.chat_agent_id)?.name || "",
        type: agent.type,
        chat_agent_id: (agent.chat_agent_id || "").trim(),
      })),
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
      const path = activeGroupID ? `/user/advanced-chat/agent-groups/${encodeURIComponent(activeGroupID)}` : "/user/advanced-chat/agent-groups"
      const res = activeGroupID ? await api.put(path, payload) : await api.post(path, payload)
      const saved = normalizeGroup(res.data)
      await queryClient.invalidateQueries({ queryKey: agentGroupsQueryKey(selectedDeviceID) })
      if (saved) {
        setActiveGroupID(saved.id)
      }
      setIsEditorOpen(false)
      success(copy.saved)
    } catch (err) {
      error(apiErrorMessage(err, copy.saveFailed))
    } finally {
      setIsSaving(false)
    }
  }

  const deleteGroup = async (group: AgentGroup) => {
    if (!selectedDeviceID || !await confirm({ description: copy.deleteConfirm.replace("{name}", group.name) })) {
      return
    }
    setDeletingID(group.id)
    try {
      await api.delete(`/user/advanced-chat/agent-groups/${encodeURIComponent(group.id)}`)
      await queryClient.invalidateQueries({ queryKey: agentGroupsQueryKey(selectedDeviceID) })
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
          <Select value={String((selectedDeviceID) || "__shadcn_empty__")} onValueChange={(value) => setSelectedDeviceID((value === "__shadcn_empty__" ? "" : value))}><SelectTrigger className="h-10 min-w-60 rounded-2xl border border-border bg-background px-3 text-sm"><SelectValue /></SelectTrigger><SelectContent>
            <SelectItem value="__shadcn_empty__">{copy.selectDevice}</SelectItem>
            {devices.map((device) => (
              <SelectItem key={device.id} value={String(device.id)}>
                {device.name}{device.online ? "" : ` (${copy.offline})`}
              </SelectItem>
            ))}
          </SelectContent></Select>
          <Button variant="outline" className="gap-2" disabled={!selectedDeviceID || isFetching} onClick={() => refetch()}>
            <RefreshCcw size={16} />
            {copy.refresh}
          </Button>
          <Button className="gap-2" disabled={!selectedDeviceID} onClick={openCreate}>
            <Plus size={16} />
            {copy.newGroup}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Users size={18} />
            {selectedDevice ? selectedDevice.name : copy.noDevice}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {!selectedDeviceID ? (
            <div className="rounded-md border border-dashed px-3 py-8 text-center text-sm text-muted-foreground">{copy.deviceRequired}</div>
          ) : groups.length === 0 ? (
            <div className="rounded-md border border-dashed px-3 py-8 text-center text-sm text-muted-foreground">{isFetching ? copy.loading : copy.empty}</div>
          ) : (
            groups.map((group) => (
              <div key={group.id} className={cn("grid gap-3 rounded-md border p-3 md:grid-cols-[1fr_auto] md:items-start", activeGroupID === group.id && "border-primary bg-primary/5")}>
                <button type="button" className="min-w-0 text-left" onClick={() => openEdit(group)}>
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
                <Button variant="ghost" size="sm" disabled={deletingID === group.id} onClick={() => deleteGroup(group)} title={copy.deleteGroup}>
                  <Trash2 size={15} />
                </Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Dialog open={isEditorOpen} onOpenChange={setIsEditorOpen}>
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{activeGroupID ? copy.editGroup : copy.newGroup}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <Field label={copy.groupID}>
                <Input value={draft.id} placeholder={copy.groupIDPlaceholder} disabled={Boolean(activeGroupID)} onChange={(event) => setDraft({ ...draft, id: event.target.value })} />
              </Field>
              <Field label={copy.groupName}>
                <Input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
              </Field>
              <Field label={copy.connector}>
                <Input value={selectedDevice?.name || selectedDeviceID} disabled />
              </Field>
            </div>
            <Field label={copy.description}>
              <textarea className="min-h-20 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} />
            </Field>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold">{copy.agents}</div>
                <Button variant="outline" size="sm" className="gap-2" onClick={() => setDraft((current) => ({ ...current, agents: [...current.agents, emptyAgent()] }))}>
                  <Plus size={15} />
                  {copy.addAgent}
                </Button>
              </div>
              {draft.agents.map((agent, index) => (
                <div key={index} className="rounded-md border p-3">
                  <div className="grid gap-3 md:grid-cols-[1fr_140px_1fr_auto]">
                    <Field label={copy.agentName}>
                      <Input value={agent.name} onChange={(event) => updateAgent(index, { name: event.target.value })} />
                    </Field>
                    <Field label={copy.agentType}>
                      <Select value={String((agent.type) || "__shadcn_empty__")} onValueChange={(value) => updateAgent(index, { type: (value === "__shadcn_empty__" ? "" : value) as AgentGroupAgent["type"] })}><SelectTrigger className="h-10 w-full rounded-2xl border border-border bg-background px-3 text-sm"><SelectValue /></SelectTrigger><SelectContent>
                        <SelectItem value="chief">chief</SelectItem>
                        <SelectItem value="worker">worker</SelectItem>
                        <SelectItem value="critic">critic</SelectItem>
                        <SelectItem value="reviewer">reviewer</SelectItem>
                        <SelectItem value="checker">checker</SelectItem>
                      </SelectContent></Select>
                    </Field>
                    <Field label={copy.boundAgent}>
                      <Select value={String((agent.chat_agent_id || "") || "__shadcn_empty__")} onValueChange={(value) => selectChatAgent(index, (value === "__shadcn_empty__" ? "" : value))}><SelectTrigger className="h-10 w-full rounded-2xl border border-border bg-background px-3 text-sm"><SelectValue /></SelectTrigger><SelectContent>
                        <SelectItem value="__shadcn_empty__">{chatAgents.length ? copy.selectAgent : copy.noAgents}</SelectItem>
                        {chatAgents.map((item) => (
                          <SelectItem key={item.id} value={String(item.id)}>
                            {item.name}
                          </SelectItem>
                        ))}
                      </SelectContent></Select>
                    </Field>
                    <div className="flex items-end">
                      <Button variant="ghost" size="icon" disabled={draft.agents.length <= 1} onClick={() => removeAgent(index)} title={copy.removeAgent}>
                        <Trash2 size={16} />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsEditorOpen(false)}>{copy.cancel}</Button>
            <Button className="gap-2" disabled={isSaving} onClick={saveGroup}>
              <Save size={16} />
              {isSaving ? copy.saving : copy.save}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
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

function normalizeDevice(value: unknown): ConnectorDevice | null {
  if (!isRecord(value)) return null
  const id = stringValue(value.id)
  return id ? { id, name: stringValue(value.name) || id, online: value.online === true, os: stringValue(value.os) } : null
}

function normalizeChatAgent(value: unknown): ChatAgent | null {
  if (!isRecord(value)) return null
  const id = stringValue(value.id)
  return id ? { id, name: stringValue(value.name) || id } : null
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

function studioUniqueRoleConflict(agents: AgentGroupAgent[], type: AgentGroupAgent["type"], editingIndex: number) {
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

function agentMemberID(agent?: ChatAgent) {
  const source = agent?.name || agent?.id || "agent"
  const normalized = source.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "")
  return normalized || `agent-${agent?.id || "1"}`
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

/*
const legacyZhCopy = {
  title: "工作室",
  subtitle: "工作室存储在数据库中，连接器只用于运行时工作目录和工具执行。",
  selectDevice: "选择连接器",
  offline: "离线",
  refresh: "刷新",
  newGroup: "新建工作室",
  editGroup: "编辑工作室",
  noDevice: "未选择连接器",
  deviceRequired: "请先选择一个在线连接器",
  loading: "正在加载工作室...",
  empty: "该连接器暂无工作室",
  deleteGroup: "删除工作室",
  deleteConfirm: "确定删除工作室 {name} 吗？",
  deleted: "工作室已删除",
  deleteFailed: "删除工作室失败",
  saved: "工作室已保存",
  saveFailed: "保存工作室失败",
  nameRequired: "请输入工作室名称",
  agentRequired: "每个工作室成员都必须选择一个代理",
  groupID: "工作室 ID",
  groupIDPlaceholder: "留空自动生成",
  groupName: "工作室名称",
  connector: "连接器",
  description: "描述",
  agents: "Agents",
  addAgent: "添加 agent",
  agentName: "名称",
  agentType: "类型",
  defaultModel: "默认模型",
  removeAgent: "移除 agent",
  prompt: "提示词",
  cancel: "取消",
  save: "保存",
  saving: "保存中...",
}

void legacyZhCopy
*/

const zhCopy = {
  title: "\u5de5\u4f5c\u5ba4",
  subtitle: "\u5de5\u4f5c\u5ba4\u5b58\u50a8\u5728\u6570\u636e\u5e93\u4e2d\uff0c\u8fde\u63a5\u5668\u53ea\u7528\u4e8e\u8fd0\u884c\u65f6\u5de5\u4f5c\u76ee\u5f55\u548c\u5de5\u5177\u6267\u884c\u3002",
  selectDevice: "\u9009\u62e9\u8fde\u63a5\u5668",
  offline: "\u79bb\u7ebf",
  refresh: "\u5237\u65b0",
  newGroup: "\u65b0\u5efa\u5de5\u4f5c\u5ba4",
  editGroup: "\u7f16\u8f91\u5de5\u4f5c\u5ba4",
  noDevice: "\u672a\u9009\u62e9\u8fde\u63a5\u5668",
  deviceRequired: "\u8bf7\u5148\u9009\u62e9\u4e00\u4e2a\u5728\u7ebf\u8fde\u63a5\u5668",
  loading: "\u6b63\u5728\u52a0\u8f7d\u5de5\u4f5c\u5ba4...",
  empty: "\u8be5\u8fde\u63a5\u5668\u6682\u65e0\u5de5\u4f5c\u5ba4",
  deleteGroup: "\u5220\u9664\u5de5\u4f5c\u5ba4",
  deleteConfirm: "\u786e\u5b9a\u5220\u9664\u5de5\u4f5c\u5ba4 {name} \u5417\uff1f",
  deleted: "\u5de5\u4f5c\u5ba4\u5df2\u5220\u9664",
  deleteFailed: "\u5220\u9664\u5de5\u4f5c\u5ba4\u5931\u8d25",
  saved: "\u5de5\u4f5c\u5ba4\u5df2\u4fdd\u5b58",
  saveFailed: "\u4fdd\u5b58\u5de5\u4f5c\u5ba4\u5931\u8d25",
  nameRequired: "\u8bf7\u8f93\u5165\u5de5\u4f5c\u5ba4\u540d\u79f0",
  agentRequired: "\u6bcf\u4e2a\u5de5\u4f5c\u5ba4\u6210\u5458\u90fd\u5fc5\u987b\u9009\u62e9\u4e00\u4e2a\u4ee3\u7406",
  exactlyOneChief: "\u6bcf\u4e2a\u5de5\u4f5c\u5ba4\u5fc5\u987b\u4e14\u53ea\u80fd\u6709\u4e00\u4e2a Chief",
  exactlyOneChecker: "\u6bcf\u4e2a\u5de5\u4f5c\u5ba4\u5fc5\u987b\u4e14\u53ea\u80fd\u6709\u4e00\u4e2a Checker",
  onlyOneChief: "\u6bcf\u4e2a\u5de5\u4f5c\u5ba4\u53ea\u80fd\u6dfb\u52a0\u4e00\u4e2a Chief",
  onlyOneChecker: "\u6bcf\u4e2a\u5de5\u4f5c\u5ba4\u53ea\u80fd\u6dfb\u52a0\u4e00\u4e2a Checker",
  groupID: "\u5de5\u4f5c\u5ba4 ID",
  groupIDPlaceholder: "\u7559\u7a7a\u81ea\u52a8\u751f\u6210",
  groupName: "\u5de5\u4f5c\u5ba4\u540d\u79f0",
  connector: "\u8fde\u63a5\u5668",
  description: "\u63cf\u8ff0",
  agents: "\u6210\u5458",
  addAgent: "\u6dfb\u52a0\u6210\u5458",
  agentName: "\u540d\u79f0",
  agentType: "\u7c7b\u578b",
  boundAgent: "\u4ee3\u7406",
  noAgents: "\u6682\u65e0\u4ee3\u7406",
  selectAgent: "\u9009\u62e9\u4ee3\u7406",
  streamAgent: "\u6d41\u5f0f",
  removeAgent: "\u79fb\u9664\u6210\u5458",
  cancel: "\u53d6\u6d88",
  save: "\u4fdd\u5b58",
  saving: "\u4fdd\u5b58\u4e2d...",
}

const enCopy = {
  title: "Agent Studios",
  subtitle: "Studios are stored in the database. Connectors are only used at runtime for workspace paths and tool execution.",
  selectDevice: "Select connector",
  offline: "offline",
  refresh: "Refresh",
  newGroup: "New studio",
  editGroup: "Edit studio",
  noDevice: "No connector selected",
  deviceRequired: "Select an online connector first",
  loading: "Loading agent groups...",
  empty: "No studios on this connector",
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
  groupID: "Group ID",
  groupIDPlaceholder: "Leave empty to generate",
  groupName: "Studio name",
  connector: "Connector",
  description: "Description",
  agents: "Agents",
  addAgent: "Add agent",
  agentName: "Name",
  agentType: "Type",
  boundAgent: "Agent",
  noAgents: "No agents",
  selectAgent: "Select agent",
  streamAgent: "Stream",
  removeAgent: "Remove agent",
  cancel: "Cancel",
  save: "Save",
  saving: "Saving...",
}

const jaCopy = enCopy
