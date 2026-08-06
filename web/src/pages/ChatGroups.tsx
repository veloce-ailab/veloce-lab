import { useEffect, useMemo, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useNavigate, useParams } from "react-router-dom"
import { ArrowLeft, Bot, Folder, FolderGit2, GitBranch, MessageCircle, Monitor, PanelRightOpen, Plus, RefreshCw, Send, Settings, Trash2, Users, X } from "lucide-react"
import api from "@/lib/api"
import { useI18n } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import { GitChangeList } from "@/components/chat/GitChangeList"
import { ResizableSidebar } from "@/components/layout/ResizableSidebar"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useToast } from "@/components/ui/toast"
import { useConfirmDialog } from "@/components/ui/confirm-dialog"

interface Agent { id: string; name: string; default_model?: string; user_channel_id?: number }
interface GroupMember { id: string; agent_id: string; agent_name: string; model_name?: string; user_channel_id?: number; connector_device_id?: string; status: "idle" | "working"; run_id?: string; updated_at?: string }
interface UpstreamChannel { id: number; name: string; models: string[] }
interface ConnectorDevice { id: string; name: string; hostname?: string; online?: boolean }
interface MemberConfig { agent_id: string; model_name: string; user_channel_id: number; connector_device_id: string }
interface ChatGroup { id: string; name: string; description: string; connector_device_id?: string; connector_workspace_path?: string; members: GroupMember[]; updated_at?: string }
interface GroupMessage { id: string; sender_type: "user" | "agent"; sender_id?: string; sender_name: string; content: string; mention_member_ids: string[]; created_at: string }
interface GroupDetail { group: ChatGroup; messages: GroupMessage[] }
interface MemberActivity { member: GroupMember; run?: { status?: string; status_message?: string; current_round?: number; error_message?: string; updated_at?: string }; events: { id: number; event: string; payload: Record<string, unknown>; created_at: string }[]; output: string }
interface PrivateConversation { id: string; member_a_id: string; member_b_id: string; member_a_name: string; member_b_name: string; last_message: string; last_message_at: string }
interface PrivateMessage { id: string; sender_member_id: string; sender_name: string; recipient_member_id: string; content: string; created_at: string }
interface PrivateConversationDetail { conversation: PrivateConversation; messages: PrivateMessage[] }
interface GroupGitFile { path: string; status: string; additions: number; deletions: number; diff?: string }
interface GroupGitStatus { current_branch: string; changed_files: number; additions: number; deletions: number; clean: boolean; files: GroupGitFile[] }
interface GroupMemoryDocument { id: string; kind: string; title: string; size: number; enabled: boolean; updated_by: string; updated_at: string }
interface GroupMemoryListResponse { memories: GroupMemoryDocument[] }
interface GroupMemoryContentResponse extends GroupMemoryDocument { content: string }
interface GroupMemoryDraft { id: string; kind: string; title: string; content: string; enabled: boolean }

const groupsKey = ["advanced-chat-chat-groups"] as const
const groupMemoryKinds = ["profile", "preferences", "facts", "projects", "rules", "scratch", "custom"]
const emptyGroupMemoryDraft: GroupMemoryDraft = { id: "", kind: "facts", title: "", content: "", enabled: true }

export default function ChatGroups() {
  const { groupID = "" } = useParams()
  const navigate = useNavigate()
  const { language } = useI18n()
  const zh = language === "zh"
  const { success, error } = useToast()
  const { confirm, confirmDialog } = useConfirmDialog()
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState("")
  const [mentions, setMentions] = useState<string[]>([])
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [agentIDs, setAgentIDs] = useState<string[]>([])
  const [groupDeviceID, setGroupDeviceID] = useState("")
  const [groupWorkspacePath, setGroupWorkspacePath] = useState("")
  const [memberConfigs, setMemberConfigs] = useState<Record<string, MemberConfig>>({})
  const [activeMember, setActiveMember] = useState<GroupMember | null>(null)
  const [activePrivateConversation, setActivePrivateConversation] = useState<PrivateConversation | null>(null)
  const [isSending, setIsSending] = useState(false)
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [activeSidebarPanel, setActiveSidebarPanel] = useState<"group" | "environment">("group")
  const [settingsName, setSettingsName] = useState("")
  const [settingsDescription, setSettingsDescription] = useState("")
  const [settingsAgentIDs, setSettingsAgentIDs] = useState<string[]>([])
  const [settingsMemberConfigs, setSettingsMemberConfigs] = useState<Record<string, MemberConfig>>({})
  const [settingsDeviceID, setSettingsDeviceID] = useState("")
  const [settingsWorkspacePath, setSettingsWorkspacePath] = useState("")
  const [isSavingSettings, setIsSavingSettings] = useState(false)
  const [settingsTab, setSettingsTab] = useState<"basic" | "members" | "memory">("basic")
  const [isAddMemberOpen, setIsAddMemberOpen] = useState(false)
  const [editingMemberAgentID, setEditingMemberAgentID] = useState("")
  const [selectedGroupMemoryID, setSelectedGroupMemoryID] = useState("")
  const [groupMemoryDraft, setGroupMemoryDraft] = useState<GroupMemoryDraft>(emptyGroupMemoryDraft)
  const [isSavingGroupMemory, setIsSavingGroupMemory] = useState(false)
  const [isDeletingGroupMemory, setIsDeletingGroupMemory] = useState(false)

  const { data: groups = [], isFetching } = useQuery<ChatGroup[]>({
    queryKey: groupsKey,
    refetchInterval: groupID ? 2000 : false,
    queryFn: async () => {
      const data = (await api.get("/user/advanced-chat/chat-groups")).data
      return Array.isArray(data) ? data : []
    },
  })
  const { data: agents = [] } = useQuery<Agent[]>({
    queryKey: ["advanced-chat-agents"],
    queryFn: async () => {
      const data = (await api.get("/user/advanced-chat/agents")).data
      return Array.isArray(data) ? data : []
    },
  })
  const { data: catalog = [] } = useQuery<UpstreamChannel[]>({
    queryKey: ["catalog"],
    queryFn: async () => { const data = (await api.get("/user/catalog")).data; return Array.isArray(data) ? data : [] },
  })
  const { data: devices = [] } = useQuery<ConnectorDevice[]>({
    queryKey: ["advanced-chat-devices"],
    refetchInterval: 5000,
    queryFn: async () => { const data = (await api.get("/user/advanced-chat/devices")).data; return Array.isArray(data) ? data : [] },
  })
  const { data: detail } = useQuery<GroupDetail>({
    queryKey: ["advanced-chat-chat-group", groupID],
    enabled: Boolean(groupID),
    refetchInterval: 1200,
    queryFn: async () => (await api.get(`/user/advanced-chat/chat-groups/${encodeURIComponent(groupID)}`)).data,
  })
  const groupMemoriesQuery = useQuery<GroupMemoryListResponse>({
    queryKey: ["chat-group-memories", detail?.group.id],
    enabled: isSettingsOpen && Boolean(detail?.group.id),
    queryFn: async () => (await api.get(`/user/advanced-chat/chat-groups/${encodeURIComponent(String(detail?.group.id || ""))}/memories`)).data,
  })
  const members = detail?.group.members || []
	const { data: privateConversations = [] } = useQuery<PrivateConversation[]>({
		queryKey: ["chat-group-private-conversations", groupID],
		enabled: Boolean(groupID),
		refetchInterval: 1500,
		queryFn: async () => {
			const data = (await api.get(`/user/advanced-chat/chat-groups/${encodeURIComponent(groupID)}/private-conversations`)).data
			return Array.isArray(data) ? data : []
		},
	})
  const mentionedMembers = useMemo(() => members.filter((member) => mentions.includes(member.id)), [members, mentions])

  useEffect(() => {
    if (!selectedGroupMemoryID || !detail?.group.id) return
    let cancelled = false
    api.get(`/user/advanced-chat/chat-groups/${encodeURIComponent(detail.group.id)}/memories/${encodeURIComponent(selectedGroupMemoryID)}`)
      .then((response) => {
        if (cancelled) return
        const memory = response.data as GroupMemoryContentResponse
        setGroupMemoryDraft({ id: memory.id, kind: memory.kind || "facts", title: memory.title || "", content: memory.content || "", enabled: memory.enabled !== false })
      })
      .catch((err) => error(apiError(err, zh ? "加载共同记忆失败" : "Failed to load shared memory")))
    return () => { cancelled = true }
  }, [detail?.group.id, error, selectedGroupMemoryID, zh])

  const createGroup = async () => {
    if (!name.trim() || agentIDs.length === 0) return
    try {
      const response = await api.post("/user/advanced-chat/chat-groups", { name: name.trim(), description: description.trim(), connector_device_id: groupDeviceID, connector_workspace_path: groupWorkspacePath, agent_ids: agentIDs, member_configs: agentIDs.map((id) => memberConfigs[id] || defaultMemberConfig(agents.find((agent) => agent.id === id))) })
      setIsCreateOpen(false)
      setName("")
      setDescription("")
      setAgentIDs([])
      setMemberConfigs({})
      setGroupDeviceID("")
      setGroupWorkspacePath("")
      await queryClient.invalidateQueries({ queryKey: groupsKey })
      navigate(`/chat/groups/${encodeURIComponent(String(response.data.id))}`)
      success(zh ? "群组已创建" : "Group created")
    } catch (err) {
      error(apiError(err, zh ? "创建群组失败" : "Failed to create group"))
    }
  }

  const deleteGroup = async (group: ChatGroup) => {
    if (!await confirm({ description: zh ? `确定删除群组“${group.name}”吗？` : `Delete group “${group.name}”?` })) return
    try {
      await api.delete(`/user/advanced-chat/chat-groups/${encodeURIComponent(group.id)}`)
      await queryClient.invalidateQueries({ queryKey: groupsKey })
      navigate("/chat/groups")
    } catch (err) {
      error(apiError(err, zh ? "删除群组失败" : "Failed to delete group"))
    }
  }

  const openGroupSettings = (group: ChatGroup) => {
    setSettingsName(group.name)
    setSettingsDescription(group.description)
    setSettingsDeviceID(group.connector_device_id || "")
    setSettingsWorkspacePath(group.connector_workspace_path || "")
    setSettingsAgentIDs(group.members.map((member) => member.agent_id))
    setSettingsMemberConfigs(Object.fromEntries(group.members.map((member) => [member.agent_id, { agent_id: member.agent_id, model_name: member.model_name || agents.find((agent) => agent.id === member.agent_id)?.default_model || "", user_channel_id: member.user_channel_id || agents.find((agent) => agent.id === member.agent_id)?.user_channel_id || 0, connector_device_id: member.connector_device_id || "" }])))
    setSettingsTab("basic")
    setIsAddMemberOpen(false)
    setEditingMemberAgentID(group.members[0]?.agent_id || "")
    setSelectedGroupMemoryID("")
    setGroupMemoryDraft(emptyGroupMemoryDraft)
    setIsSettingsOpen(true)
  }

  const addSettingsMember = (agent: Agent) => {
    if (settingsAgentIDs.includes(agent.id)) return
    setSettingsAgentIDs((current) => [...current, agent.id])
    setSettingsMemberConfigs((current) => ({ ...current, [agent.id]: current[agent.id] || defaultMemberConfig(agent) }))
    setEditingMemberAgentID(agent.id)
    setIsAddMemberOpen(false)
  }

  const removeSettingsMember = (agentID: string) => {
    setSettingsAgentIDs((current) => current.filter((id) => id !== agentID))
    setSettingsMemberConfigs((current) => {
      const { [agentID]: _removed, ...remaining } = current
      return remaining
    })
    setEditingMemberAgentID((current) => current === agentID ? settingsAgentIDs.find((id) => id !== agentID) || "" : current)
  }

  const saveGroupSettings = async () => {
    if (!detail || !settingsName.trim() || settingsAgentIDs.length === 0 || isSavingSettings) return
    setIsSavingSettings(true)
    try {
      await api.put(`/user/advanced-chat/chat-groups/${encodeURIComponent(detail.group.id)}`, { name: settingsName.trim(), description: settingsDescription.trim(), connector_device_id: settingsDeviceID, connector_workspace_path: settingsWorkspacePath, agent_ids: settingsAgentIDs, member_configs: settingsAgentIDs.map((id) => settingsMemberConfigs[id] || defaultMemberConfig(agents.find((agent) => agent.id === id))) })
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: groupsKey }),
        queryClient.invalidateQueries({ queryKey: ["advanced-chat-chat-group", detail.group.id] }),
        queryClient.invalidateQueries({ queryKey: ["chat-group-private-conversations", detail.group.id] }),
      ])
      setIsSettingsOpen(false)
      success(zh ? "群组设置已保存" : "Group settings saved")
    } catch (err) {
      error(apiError(err, zh ? "保存群组设置失败" : "Failed to save group settings"))
    } finally {
      setIsSavingSettings(false)
    }
  }

  const startNewGroupMemory = () => {
    setSelectedGroupMemoryID("")
    setGroupMemoryDraft(emptyGroupMemoryDraft)
  }

  const saveGroupMemory = async () => {
    if (!detail?.group.id || !groupMemoryDraft.content.trim() || isSavingGroupMemory) return
    setIsSavingGroupMemory(true)
    try {
      const payload = { kind: groupMemoryDraft.kind, title: groupMemoryDraft.title.trim(), content: groupMemoryDraft.content, enabled: groupMemoryDraft.enabled }
      const response = groupMemoryDraft.id
        ? await api.put(`/user/advanced-chat/chat-groups/${encodeURIComponent(detail.group.id)}/memories/${encodeURIComponent(groupMemoryDraft.id)}`, payload)
        : await api.post(`/user/advanced-chat/chat-groups/${encodeURIComponent(detail.group.id)}/memories`, payload)
      const saved = response.data as GroupMemoryDocument
      setSelectedGroupMemoryID(saved.id)
      setGroupMemoryDraft((current) => ({ ...current, id: saved.id }))
      await groupMemoriesQuery.refetch()
      success(zh ? "共同记忆已保存" : "Shared memory saved")
    } catch (err) {
      error(apiError(err, zh ? "保存共同记忆失败" : "Failed to save shared memory"))
    } finally {
      setIsSavingGroupMemory(false)
    }
  }

  const deleteGroupMemory = async () => {
    if (!detail?.group.id || !groupMemoryDraft.id || isDeletingGroupMemory) return
    setIsDeletingGroupMemory(true)
    try {
      await api.delete(`/user/advanced-chat/chat-groups/${encodeURIComponent(detail.group.id)}/memories/${encodeURIComponent(groupMemoryDraft.id)}`)
      startNewGroupMemory()
      await groupMemoriesQuery.refetch()
      success(zh ? "共同记忆已删除" : "Shared memory deleted")
    } catch (err) {
      error(apiError(err, zh ? "删除共同记忆失败" : "Failed to delete shared memory"))
    } finally {
      setIsDeletingGroupMemory(false)
    }
  }

  const sendMessage = async () => {
    if (!groupID || !draft.trim() || isSending) return
    setIsSending(true)
    try {
      await api.post(`/user/advanced-chat/chat-groups/${encodeURIComponent(groupID)}/messages`, { content: draft.trim(), mention_member_ids: mentions })
      setDraft("")
      setMentions([])
      await queryClient.invalidateQueries({ queryKey: ["advanced-chat-chat-group", groupID] })
    } catch (err) {
      error(apiError(err, zh ? "消息发送失败" : "Failed to send message"))
    } finally {
      setIsSending(false)
    }
  }

  const createDialog = (
    <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader><DialogTitle>{zh ? "新建聊天群组" : "New chat group"}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <Input value={name} onChange={(event) => setName(event.target.value)} placeholder={zh ? "群组名称" : "Group name"} />
          <textarea value={description} onChange={(event) => setDescription(event.target.value)} className="min-h-20 w-full rounded-md border bg-background px-3 py-2 text-sm" placeholder={zh ? "群组描述" : "Description"} />
          <GroupEnvironmentFields deviceID={groupDeviceID} workspacePath={groupWorkspacePath} devices={devices} onDeviceChange={setGroupDeviceID} onWorkspaceChange={setGroupWorkspacePath} zh={zh} />
          <div>
            <div className="mb-2 text-sm font-medium">{zh ? "选择助理" : "Select assistants"}</div>
            <div className="max-h-56 space-y-1 overflow-y-auto rounded-md border p-2">
              {agents.map((agent) => (
                <label key={agent.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-2 hover:bg-muted">
                  <Checkbox checked={agentIDs.includes(agent.id)} onCheckedChange={() => { setAgentIDs((current) => current.includes(agent.id) ? current.filter((id) => id !== agent.id) : [...current, agent.id]); setMemberConfigs((current) => current[agent.id] ? current : { ...current, [agent.id]: defaultMemberConfig(agent) }) }} />
                  <Bot size={15} />
                  <span className="text-sm">{agent.name}</span>
                </label>
              ))}
            </div>
          </div>
          <MemberConfigFields agentIDs={agentIDs} agents={agents} catalog={catalog} configs={memberConfigs} onChange={setMemberConfigs} zh={zh} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setIsCreateOpen(false)}>{zh ? "取消" : "Cancel"}</Button>
          <Button disabled={!name.trim() || agentIDs.length === 0} onClick={createGroup}>{zh ? "创建" : "Create"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )

  const settingsDialog = detail && (
    <Dialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader><DialogTitle>{zh ? "群组设置" : "Group settings"}</DialogTitle></DialogHeader>
        <Tabs value={settingsTab} onValueChange={(value) => setSettingsTab(value as "basic" | "members" | "memory")}>
          <TabsList className="w-full">
            <TabsTrigger value="basic">{zh ? "基础信息" : "Basic"}</TabsTrigger>
            <TabsTrigger value="members">{zh ? "成员信息" : "Members"}</TabsTrigger>
            <TabsTrigger value="memory">{zh ? "共同记忆" : "Shared memory"}</TabsTrigger>
          </TabsList>
          <TabsContent value="basic" className="space-y-4 pt-2">
            <div className="space-y-1.5"><label className="text-sm font-medium">{zh ? "群组名称" : "Group name"}</label><Input value={settingsName} onChange={(event) => setSettingsName(event.target.value)} /></div>
            <div className="space-y-1.5"><label className="text-sm font-medium">{zh ? "群组描述" : "Description"}</label><textarea value={settingsDescription} onChange={(event) => setSettingsDescription(event.target.value)} className="min-h-20 w-full rounded-md border bg-background px-3 py-2 text-sm" /></div>
            <GroupEnvironmentFields deviceID={settingsDeviceID} workspacePath={settingsWorkspacePath} devices={devices} onDeviceChange={setSettingsDeviceID} onWorkspaceChange={setSettingsWorkspacePath} zh={zh} />
            <div className="border-t pt-4"><Button variant="outline" className="gap-2 text-destructive hover:text-destructive" onClick={() => { setIsSettingsOpen(false); void deleteGroup(detail.group) }}><Trash2 size={15} />{zh ? "删除群组" : "Delete group"}</Button></div>
          </TabsContent>
          <TabsContent value="members" className="space-y-3 pt-2">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium">{zh ? "群组成员" : "Members"}</span>
              <Button size="sm" className="gap-1.5" onClick={() => setIsAddMemberOpen(true)}><Plus size={15} />{zh ? "添加成员" : "Add member"}</Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
              <div className="max-h-64 space-y-1 overflow-y-auto rounded-md border p-1.5">
                {settingsAgentIDs.map((agentID) => {
                  const agent = agents.find((item) => item.id === agentID)
                  if (!agent) return null
                  return <button key={agentID} type="button" className={cn("flex w-full items-center gap-2 rounded px-2 py-2 text-left text-sm", editingMemberAgentID === agentID ? "bg-muted font-medium" : "hover:bg-muted")} onClick={() => setEditingMemberAgentID(agentID)}><Bot size={15} className="shrink-0" /><span className="truncate">{agent.name}</span></button>
                })}
                {settingsAgentIDs.length === 0 && <div className="px-2 py-6 text-center text-xs text-muted-foreground">{zh ? "尚未添加成员" : "No members added"}</div>}
              </div>
              {(() => {
                const agent = agents.find((item) => item.id === editingMemberAgentID)
                if (!agent || !settingsAgentIDs.includes(agent.id)) return <div className="flex min-h-40 items-center justify-center rounded-md border border-dashed px-4 text-center text-sm text-muted-foreground">{zh ? "选择一个成员以更改模型或移除成员" : "Select a member to change its model or remove it"}</div>
                const config = settingsMemberConfigs[agent.id] || defaultMemberConfig(agent)
                return <div className="rounded-md border p-3"><div className="mb-3 flex items-center justify-between gap-2"><span className="flex min-w-0 items-center gap-2 text-sm font-medium"><Bot size={15} /><span className="truncate">{agent.name}</span></span><Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-destructive hover:text-destructive" onClick={() => removeSettingsMember(agent.id)}><Trash2 size={14} />{zh ? "移除" : "Remove"}</Button></div><MemberConfigEditor agentID={agent.id} config={config} catalog={catalog} onChange={(nextConfig) => setSettingsMemberConfigs((current) => ({ ...current, [agent.id]: nextConfig }))} zh={zh} /></div>
              })()}
            </div>
          </TabsContent>
          <TabsContent value="memory" className="space-y-3 pt-2">
            <div className="flex items-center justify-between gap-3">
              <div><div className="text-sm font-medium">{zh ? "群组共同记忆" : "Shared group memory"}</div><p className="mt-1 text-xs text-muted-foreground">{zh ? "所有群成员均可读取、添加和修改这些记忆。" : "Every group member can read, add, and update these memories."}</p></div>
              <div className="flex gap-1"><Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => groupMemoriesQuery.refetch()} title={zh ? "刷新" : "Refresh"}><RefreshCw size={15} /></Button><Button size="sm" className="gap-1.5" onClick={startNewGroupMemory}><Plus size={15} />{zh ? "新建" : "New"}</Button></div>
            </div>
            <div className="grid min-h-[360px] gap-3 md:grid-cols-[190px_minmax(0,1fr)]">
              <div className="max-h-[56vh] space-y-1 overflow-y-auto rounded-md border p-1.5">
                {(groupMemoriesQuery.data?.memories || []).map((memory) => <button key={memory.id} type="button" className={cn("flex w-full flex-col rounded px-2 py-2 text-left hover:bg-muted", selectedGroupMemoryID === memory.id && "bg-muted font-medium")} onClick={() => setSelectedGroupMemoryID(memory.id)}><span className="w-full truncate text-sm">{memory.title || memory.kind}</span><span className="mt-0.5 text-xs text-muted-foreground">{memory.kind}{memory.enabled ? "" : (zh ? " · 已停用" : " · Disabled")}</span></button>)}
                {!groupMemoriesQuery.isLoading && (groupMemoriesQuery.data?.memories || []).length === 0 && <div className="px-2 py-8 text-center text-xs text-muted-foreground">{zh ? "暂无共同记忆" : "No shared memories"}</div>}
              </div>
              <div className="space-y-3 rounded-md border p-3">
                <div className="grid gap-3 sm:grid-cols-[140px_minmax(0,1fr)]"><label className="space-y-1"><span className="text-xs text-muted-foreground">{zh ? "类型" : "Kind"}</span><Select value={groupMemoryDraft.kind} onValueChange={(kind) => setGroupMemoryDraft((current) => ({ ...current, kind }))}><SelectTrigger className="h-9 w-full"><SelectValue /></SelectTrigger><SelectContent>{groupMemoryKinds.map((kind) => <SelectItem key={kind} value={kind}>{kind}</SelectItem>)}</SelectContent></Select></label><label className="space-y-1"><span className="text-xs text-muted-foreground">{zh ? "标题" : "Title"}</span><Input value={groupMemoryDraft.title} onChange={(event) => setGroupMemoryDraft((current) => ({ ...current, title: event.target.value }))} placeholder={zh ? "例如：项目决策" : "For example: Project decisions"} /></label></div>
                <label className="flex items-center gap-2 text-sm"><Switch checked={groupMemoryDraft.enabled} onCheckedChange={(enabled) => setGroupMemoryDraft((current) => ({ ...current, enabled }))} />{zh ? "启用此记忆" : "Enable this memory"}</label>
                <textarea className="min-h-[230px] w-full rounded-md border bg-background px-3 py-2 font-mono text-sm outline-none focus:ring-2 focus:ring-ring" value={groupMemoryDraft.content} onChange={(event) => setGroupMemoryDraft((current) => ({ ...current, content: event.target.value }))} placeholder={zh ? "使用 Markdown 记录全体成员需要长期共享的决策、事实和规则。" : "Use Markdown for decisions, facts, and rules shared by the group."} />
                <div className="flex items-center justify-between gap-2"><Button variant="outline" className="gap-1.5 text-destructive hover:text-destructive" disabled={!groupMemoryDraft.id || isDeletingGroupMemory} onClick={deleteGroupMemory}><Trash2 size={15} />{zh ? "删除" : "Delete"}</Button><Button disabled={!groupMemoryDraft.content.trim() || isSavingGroupMemory} onClick={saveGroupMemory}>{isSavingGroupMemory ? (zh ? "保存中..." : "Saving...") : (zh ? "保存记忆" : "Save memory")}</Button></div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
        {settingsTab !== "memory" && <DialogFooter><Button variant="outline" onClick={() => setIsSettingsOpen(false)}>{zh ? "取消" : "Cancel"}</Button><Button disabled={!settingsName.trim() || settingsAgentIDs.length === 0 || isSavingSettings} onClick={saveGroupSettings}>{isSavingSettings ? (zh ? "保存中..." : "Saving...") : (zh ? "保存" : "Save")}</Button></DialogFooter>}
        <Dialog open={isAddMemberOpen} onOpenChange={setIsAddMemberOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>{zh ? "添加成员" : "Add member"}</DialogTitle></DialogHeader>
            <div className="max-h-72 space-y-1 overflow-y-auto rounded-md border p-1.5">
              {agents.filter((agent) => !settingsAgentIDs.includes(agent.id)).map((agent) => <button key={agent.id} type="button" className="flex w-full items-center gap-2 rounded px-2 py-2 text-left text-sm hover:bg-muted" onClick={() => addSettingsMember(agent)}><Bot size={15} /><span className="truncate">{agent.name}</span></button>)}
              {agents.every((agent) => settingsAgentIDs.includes(agent.id)) && <div className="px-2 py-8 text-center text-sm text-muted-foreground">{zh ? "所有助理均已添加" : "All assistants are already added"}</div>}
            </div>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  )

  if (!groupID) {
    return (
      <div className="space-y-6">
        {confirmDialog}
        {createDialog}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">{zh ? "聊天群组" : "Chat groups"}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{zh ? "把多个助理放入独立群聊，让他们按空闲状态协作处理消息。" : "Bring assistants into independent group chats where they collaborate when available."}</p>
          </div>
          <Button className="gap-2" onClick={() => setIsCreateOpen(true)}><Plus size={16} />{zh ? "新建群组" : "New group"}</Button>
        </div>
        <div className="divide-y border-y">
          {groups.map((group) => (
            <button key={group.id} type="button" className="flex w-full items-center gap-4 px-2 py-4 text-left hover:bg-muted/50" onClick={() => navigate(`/chat/groups/${encodeURIComponent(group.id)}`)}>
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border bg-muted"><Users size={18} /></span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{group.name}</span>
                <span className="mt-1 block truncate text-sm text-muted-foreground">{group.description || (zh ? "暂无描述" : "No description")}</span>
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">{group.members.length} {zh ? "位助理" : "assistants"}</span>
            </button>
          ))}
          {groups.length === 0 && <div className="py-20 text-center text-sm text-muted-foreground">{isFetching ? (zh ? "加载中..." : "Loading...") : (zh ? "暂无群组" : "No groups")}</div>}
        </div>
      </div>
    )
  }

  return (
    <div className="-m-4 flex h-[calc(100dvh-4rem)] min-h-80 overflow-hidden border-y sm:-m-6 lg:-m-8">
      {confirmDialog}
      {settingsDialog}
      <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background">
        {detail ? (
          <>
            <header className="flex h-14 shrink-0 items-center justify-between border-b px-3">
              <div className="flex min-w-0 items-center gap-2">
                <Button size="icon" variant="ghost" className="h-8 w-8 lg:hidden" onClick={() => setIsMobileSidebarOpen(true)} title={zh ? "展开群组信息" : "Open group details"}><PanelRightOpen size={17} /></Button>
                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => navigate("/chat/groups")} title={zh ? "返回群组列表" : "Back to groups"}><ArrowLeft size={17} /></Button>
                <div className="min-w-0"><div className="truncate text-sm font-semibold">{detail.group.name}</div><div className="truncate text-xs text-muted-foreground">{detail.group.description}</div></div>
              </div>
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openGroupSettings(detail.group)} title={zh ? "群组设置" : "Group settings"}><Settings size={16} /></Button>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
              <div className="mx-auto max-w-3xl space-y-4">
                {detail.messages.map((message) => (
                  <div key={message.id} className={cn("flex gap-3", message.sender_type === "user" && "flex-row-reverse")}>
                    <button type="button" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border bg-muted" onClick={() => message.sender_type === "agent" && setActiveMember(members.find((member) => member.id === message.sender_id) || null)}>{message.sender_type === "agent" ? <Bot size={15} /> : <Users size={15} />}</button>
                    <div className={cn("max-w-[78%]", message.sender_type === "user" && "text-right")}>
                      <div className="mb-1 text-xs text-muted-foreground">{message.sender_name} · {formatTime(message.created_at)}</div>
                      <div className={cn("whitespace-pre-wrap rounded-md px-3 py-2 text-left text-sm", message.sender_type === "user" ? "bg-primary text-primary-foreground" : "border bg-card")}>{message.content}</div>
                    </div>
                  </div>
                ))}
                {detail.messages.length === 0 && <div className="py-20 text-center text-sm text-muted-foreground">{zh ? "发送第一条消息，空闲助理会自行判断是否处理" : "Send the first message. Idle assistants will decide whether to act."}</div>}
              </div>
            </div>
            <div className="shrink-0 border-t p-3">
              <div className="mx-auto max-w-3xl">
                {mentionedMembers.length > 0 && <div className="mb-2 flex flex-wrap gap-1">{mentionedMembers.map((member) => <button type="button" key={member.id} className="flex items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-xs text-primary" onClick={() => setMentions((current) => current.filter((id) => id !== member.id))}>@{member.agent_name}<X size={12} /></button>)}</div>}
                <div className="flex items-end gap-2">
                  <textarea value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void sendMessage() } }} className="max-h-40 min-h-10 flex-1 resize-none rounded-md border bg-background px-3 py-2 text-sm outline-none focus:border-ring" placeholder={zh ? "发送消息；右侧点击 @ 可强制通知忙碌助理" : "Send a message; use @ to interrupt a busy assistant"} />
                  <Button size="icon" disabled={!draft.trim() || isSending} onClick={sendMessage}><Send size={16} /></Button>
                </div>
              </div>
            </div>
          </>
        ) : <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">{zh ? "加载群组..." : "Loading group..."}</div>}
      </section>

      <div className="hidden shrink-0 lg:flex">
        <ResizableSidebar storageKey="chat-group-details" side="right" defaultWidth={320} minWidth={256} maxWidth={560} className="h-full">
          <div className="h-full min-h-0 overflow-hidden bg-card">
            {activeSidebarPanel === "group" ? <GroupSidebar className="h-full w-full border-l-0" members={members} mentions={mentions} privateConversations={privateConversations} zh={zh} onMember={setActiveMember} onMention={(id) => setMentions((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id])} onPrivateConversation={setActivePrivateConversation} /> : <GroupEnvironmentSidebar className="h-full w-full border-l-0" group={detail?.group} devices={devices} zh={zh} />}
          </div>
        </ResizableSidebar>
        <aside className="flex w-12 flex-col items-center gap-2 border-l bg-card py-3">
          <button type="button" className={cn("flex h-9 w-9 items-center justify-center rounded-md", activeSidebarPanel === "group" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")} onClick={() => setActiveSidebarPanel("group")} title={zh ? "群组信息" : "Group information"}><Users size={17} /></button>
          <button type="button" className={cn("flex h-9 w-9 items-center justify-center rounded-md", activeSidebarPanel === "environment" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")} onClick={() => setActiveSidebarPanel("environment")} title={zh ? "环境信息" : "Environment"}><FolderGit2 size={17} /></button>
        </aside>
      </div>
      <div className={cn("fixed inset-0 z-40 lg:hidden", isMobileSidebarOpen ? "pointer-events-auto" : "pointer-events-none")} aria-hidden={!isMobileSidebarOpen}>
        <button type="button" className={cn("absolute inset-0 bg-black/35 transition-opacity", isMobileSidebarOpen ? "opacity-100" : "opacity-0")} onClick={() => setIsMobileSidebarOpen(false)} aria-label={zh ? "关闭群组信息" : "Close group details"} />
        <div className={cn("absolute right-0 top-0 h-full w-80 max-w-[85vw] transition-transform duration-200", isMobileSidebarOpen ? "translate-x-0" : "translate-x-full")}>
          <div className="flex h-full flex-col bg-card"><div className="flex h-12 shrink-0 items-center gap-1 border-b px-2"><button type="button" className={cn("flex h-8 flex-1 items-center justify-center rounded text-xs", activeSidebarPanel === "group" ? "bg-primary text-primary-foreground" : "hover:bg-muted")} onClick={() => setActiveSidebarPanel("group")}>{zh ? "群组" : "Group"}</button><button type="button" className={cn("flex h-8 flex-1 items-center justify-center rounded text-xs", activeSidebarPanel === "environment" ? "bg-primary text-primary-foreground" : "hover:bg-muted")} onClick={() => setActiveSidebarPanel("environment")}>{zh ? "环境" : "Environment"}</button><Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setIsMobileSidebarOpen(false)}><X size={16} /></Button></div>{activeSidebarPanel === "group" ? <GroupSidebar className="min-h-0 flex-1" members={members} mentions={mentions} privateConversations={privateConversations} zh={zh} onMember={(member) => { setIsMobileSidebarOpen(false); setActiveMember(member) }} onMention={(id) => setMentions((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id])} onPrivateConversation={(conversation) => { setIsMobileSidebarOpen(false); setActivePrivateConversation(conversation) }} /> : <GroupEnvironmentSidebar className="min-h-0 flex-1" group={detail?.group} devices={devices} zh={zh} />}</div>
        </div>
      </div>
      {activeMember && detail && <MemberActivityDialog groupID={detail.group.id} member={activeMember} onClose={() => setActiveMember(null)} zh={zh} />}
	  {activePrivateConversation && detail && <PrivateConversationDialog groupID={detail.group.id} conversation={activePrivateConversation} onClose={() => setActivePrivateConversation(null)} zh={zh} />}
    </div>
  )
}

function GroupSidebar({ className, members, mentions, privateConversations, zh, onClose, onMember, onMention, onPrivateConversation }: { className?: string; members: GroupMember[]; mentions: string[]; privateConversations: PrivateConversation[]; zh: boolean; onClose?: () => void; onMember: (member: GroupMember) => void; onMention: (id: string) => void; onPrivateConversation: (conversation: PrivateConversation) => void }) {
  return (
    <aside className={cn("overflow-y-auto border-l bg-card", className)}>
      <div className="flex h-14 items-center justify-between border-b px-4 text-sm font-semibold"><span>{zh ? "群组成员" : "Members"}</span>{onClose && <Button size="icon" variant="ghost" className="h-8 w-8" onClick={onClose} title={zh ? "关闭" : "Close"}><X size={16} /></Button>}</div>
      <div className="space-y-1 p-2">
        {members.map((member) => (
          <div key={member.id} className="flex items-center gap-2 rounded-md px-2 py-2 hover:bg-muted">
            <button type="button" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border bg-background" onClick={() => onMember(member)} title={zh ? "查看工作详情" : "View activity"}><Bot size={15} /></button>
            <button type="button" className="min-w-0 flex-1 text-left" onClick={() => onMember(member)}><div className="truncate text-sm font-medium">{member.agent_name}</div><div className={cn("text-xs", member.status === "working" ? "text-primary" : "text-muted-foreground")}>{member.status === "working" ? (zh ? "正在工作" : "Working") : (zh ? "空闲" : "Idle")}</div></button>
            <Button size="sm" variant={mentions.includes(member.id) ? "secondary" : "ghost"} className="h-7 px-2 text-xs" onClick={() => onMention(member.id)}>@</Button>
          </div>
        ))}
      </div>
      <div className="mt-2 border-t">
        <div className="flex h-11 items-center px-4 text-sm font-semibold">{zh ? "助理私聊" : "Assistant chats"}</div>
        <div className="space-y-1 px-2 pb-3">
          {privateConversations.map((conversation) => (
            <button key={conversation.id} type="button" className="flex w-full items-start gap-2 rounded-md px-2 py-2 text-left hover:bg-muted" onClick={() => onPrivateConversation(conversation)}>
              <MessageCircle size={15} className="mt-0.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1"><span className="block truncate text-xs font-medium">{conversation.member_a_name} · {conversation.member_b_name}</span><span className="mt-0.5 block truncate text-xs text-muted-foreground">{conversation.last_message}</span></span>
            </button>
          ))}
          {privateConversations.length === 0 && <div className="px-2 py-5 text-center text-xs text-muted-foreground">{zh ? "暂无助理私聊" : "No private chats"}</div>}
        </div>
      </div>
    </aside>
  )
}

function GroupEnvironmentFields({ deviceID, workspacePath, devices, onDeviceChange, onWorkspaceChange, zh }: { deviceID: string; workspacePath: string; devices: ConnectorDevice[]; onDeviceChange: (value: string) => void; onWorkspaceChange: (value: string) => void; zh: boolean }) {
  return <div className="space-y-3 rounded-md border bg-muted/20 p-3"><div className="flex items-center gap-2 text-sm font-medium"><Monitor size={15} />{zh ? "群组运行环境" : "Group environment"}</div><p className="text-xs text-muted-foreground">{zh ? "一个群组只能绑定一个设备，所有成员在同一环境中执行。" : "A group uses one device shared by every member."}</p><label className="block space-y-1"><span className="text-xs text-muted-foreground">{zh ? "设备" : "Device"}</span><Select value={deviceID || "__shadcn_empty__"} onValueChange={(value) => onDeviceChange(value === "__shadcn_empty__" ? "" : value)}><SelectTrigger className="h-9 w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="__shadcn_empty__">{zh ? "无设备环境" : "No device"}</SelectItem>{devices.map((device) => <SelectItem key={device.id} value={device.id}>{device.name}{device.hostname ? ` · ${device.hostname}` : ""}{device.online === false ? (zh ? "（离线）" : " (offline)") : ""}</SelectItem>)}</SelectContent></Select></label><label className="block space-y-1"><span className="text-xs text-muted-foreground">{zh ? "工作目录" : "Workspace path"}</span><Input value={workspacePath} disabled={!deviceID} onChange={(event) => onWorkspaceChange(event.target.value)} placeholder={zh ? "例如 D:\\workspace\\project" : "e.g. /workspace/project"} /></label></div>
}

function MemberConfigFields({ agentIDs, agents, catalog, configs, onChange, zh }: { agentIDs: string[]; agents: Agent[]; catalog: UpstreamChannel[]; configs: Record<string, MemberConfig>; onChange: (value: Record<string, MemberConfig>) => void; zh: boolean }) {
  if (agentIDs.length === 0) return null
  return (
    <div className="space-y-2 border-t pt-4">
      <div className="text-sm font-medium">{zh ? "助理运行环境" : "Assistant runtime"}</div>
      {agentIDs.map((agentID) => {
        const agent = agents.find((item) => item.id === agentID)
        if (!agent) return null
        const config = configs[agentID] || defaultMemberConfig(agent)
        return (
          <div key={agentID} className="rounded-md border p-3">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium"><Bot size={15} />{agent.name}</div>
            <MemberConfigEditor agentID={agentID} config={config} catalog={catalog} onChange={(nextConfig) => onChange({ ...configs, [agentID]: nextConfig })} zh={zh} />
          </div>
        )
      })}
    </div>
  )
}

function GroupEnvironmentSidebar({ className, group, devices, zh }: { className?: string; group?: ChatGroup; devices: ConnectorDevice[]; zh: boolean }) {
  const device = devices.find((item) => item.id === group?.connector_device_id)
  const canInspect = Boolean(group?.connector_device_id && group?.connector_workspace_path)
  const gitStatus = useQuery<GroupGitStatus>({
    queryKey: ["chat-group-git-status", group?.id, group?.connector_device_id, group?.connector_workspace_path],
    enabled: canInspect,
    queryFn: async () => (await api.get("/user/advanced-chat/workspace/git/status", { params: { connector_device_id: group?.connector_device_id, connector_workspace_path: group?.connector_workspace_path } })).data,
  })
  const gitCopy = zh
    ? { changes: "文件变更", clean: "工作目录干净，没有待提交改动。", untracked: "未跟踪文件，尚无 Git diff。", noDiff: "当前比较范围没有可展示的文本差异。", added: "新增", modified: "修改", deleted: "删除", renamed: "重命名" }
    : { changes: "File changes", clean: "Working tree is clean.", untracked: "Untracked file; no Git diff yet.", noDiff: "No text diff is available for this comparison.", added: "Added", modified: "Modified", deleted: "Deleted", renamed: "Renamed" }
  return <aside className={cn("overflow-y-auto border-l bg-card", className)}>
    <div className="flex h-14 items-center justify-between border-b px-4"><span className="flex items-center gap-2 text-sm font-semibold"><FolderGit2 size={16} />{zh ? "环境信息" : "Environment"}</span><Button variant="ghost" size="icon" className="h-8 w-8" disabled={!canInspect || gitStatus.isFetching} onClick={() => void gitStatus.refetch()} title={zh ? "刷新 Git 状态" : "Refresh Git status"}><RefreshCw size={15} className={gitStatus.isFetching ? "animate-spin" : ""} /></Button></div>
    <div className="space-y-4 p-3">
      <div className="overflow-hidden rounded-md border"><div className="flex items-center gap-2 border-b px-3 py-2"><Monitor size={15} className="text-muted-foreground" /><span className="text-xs text-muted-foreground">{zh ? "执行设备" : "Execution device"}</span></div><div className="px-3 py-2 text-sm font-medium">{device?.name || (zh ? "未绑定设备" : "No device bound")}</div>{device?.hostname && <div className="px-3 pb-2 text-xs text-muted-foreground">{device.hostname}</div>}<div className="flex items-center gap-2 border-t px-3 py-2"><Folder size={15} className="text-primary" /><span className="min-w-0 truncate font-mono text-xs">{group?.connector_workspace_path || (zh ? "未设置工作目录" : "No workspace path")}</span></div></div>
      {!canInspect ? <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">{zh ? "在群组设置中绑定设备和工作目录后，可在这里查看 Git 变更。" : "Bind a device and workspace in group settings to inspect Git changes here."}</div> : gitStatus.isLoading ? <div className="py-10 text-center text-sm text-muted-foreground">{zh ? "正在读取 Git 状态..." : "Loading Git status..."}</div> : gitStatus.isError ? <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{zh ? "无法读取 Git 状态。" : "Unable to read Git status."}</div> : <>
        <div className="rounded-md border p-3"><div className="flex items-center gap-2 text-sm font-medium"><GitBranch size={15} />{gitStatus.data?.current_branch || "-"}</div><div className="mt-2 flex items-center gap-2 text-xs tabular-nums"><span className="text-primary">+{gitStatus.data?.additions || 0}</span><span className="text-destructive">-{gitStatus.data?.deletions || 0}</span><span className="text-muted-foreground">{gitStatus.data?.changed_files || 0} {zh ? "个文件" : "files"}</span></div></div>
        <GitChangeList files={gitStatus.data?.files || []} clean={gitStatus.data?.clean} copy={gitCopy} />
      </>}</div>
  </aside>
}

function MemberConfigEditor({ agentID, config, catalog, onChange, zh }: { agentID: string; config: MemberConfig; catalog: UpstreamChannel[]; onChange: (value: MemberConfig) => void; zh: boolean }) {
  const selectedChannel = catalog.find((channel) => channel.id === config.user_channel_id && channel.models.includes(config.model_name))
  const selectedModelValue = selectedChannel ? JSON.stringify([selectedChannel.id, config.model_name]) : "current"
  return (
    <div className="grid gap-2">
      <label className="space-y-1"><span className="text-xs text-muted-foreground">{zh ? "上级渠道 / 模型" : "Upstream / model"}</span><Select value={selectedModelValue} onValueChange={(value) => { if (value === "current") return; const [channelID, modelName] = JSON.parse(value) as [number, string]; onChange({ ...config, agent_id: agentID, user_channel_id: channelID, model_name: modelName }) }}><SelectTrigger className="h-9 w-full"><SelectValue /></SelectTrigger><SelectContent>{!selectedChannel && config.model_name && <SelectItem value="current">{config.model_name}</SelectItem>}{catalog.flatMap((channel) => channel.models.map((model) => <SelectItem key={`${channel.id}-${model}`} value={JSON.stringify([channel.id, model])}>{channel.name} / {model}</SelectItem>))}</SelectContent></Select></label>
    </div>
  )
}

function defaultMemberConfig(agent?: Agent): MemberConfig {
  return { agent_id: agent?.id || "", model_name: agent?.default_model || "", user_channel_id: agent?.user_channel_id || 0, connector_device_id: "" }
}

function PrivateConversationDialog({ groupID, conversation, onClose, zh }: { groupID: string; conversation: PrivateConversation; onClose: () => void; zh: boolean }) {
	const { data } = useQuery<PrivateConversationDetail>({
		queryKey: ["chat-group-private-conversation", groupID, conversation.id],
		refetchInterval: 1200,
		queryFn: async () => (await api.get(`/user/advanced-chat/chat-groups/${encodeURIComponent(groupID)}/private-conversations/${encodeURIComponent(conversation.id)}`)).data,
	})
	return (
		<Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
			<DialogContent className="max-h-[85vh] max-w-xl overflow-hidden">
				<DialogHeader><DialogTitle>{conversation.member_a_name} · {conversation.member_b_name}</DialogTitle></DialogHeader>
				<div className="max-h-[65vh] min-h-80 space-y-3 overflow-y-auto rounded-md border p-3">
					{data?.messages.map((message) => {
						const fromA = message.sender_member_id === conversation.member_a_id
						return <div key={message.id} className={cn("flex", !fromA && "justify-end")}><div className="max-w-[82%]"><div className={cn("mb-1 text-xs text-muted-foreground", !fromA && "text-right")}>{message.sender_name} · {formatTime(message.created_at)}</div><div className={cn("whitespace-pre-wrap rounded-md px-3 py-2 text-sm", fromA ? "border bg-background" : "bg-primary text-primary-foreground")}>{message.content}</div></div></div>
					})}
					{data?.messages.length === 0 && <div className="py-16 text-center text-sm text-muted-foreground">{zh ? "暂无消息" : "No messages"}</div>}
				</div>
				<div className="text-xs text-muted-foreground">{zh ? "私聊绑定当前群组，仅双方助理与用户可见。" : "This conversation belongs to this group and is visible only to both assistants and the user."}</div>
			</DialogContent>
		</Dialog>
	)
}

function MemberActivityDialog({ groupID, member, onClose, zh }: { groupID: string; member: GroupMember; onClose: () => void; zh: boolean }) {
  const { data } = useQuery<MemberActivity>({
    queryKey: ["chat-group-member-activity", groupID, member.id],
    refetchInterval: member.status === "working" ? 800 : 3000,
    queryFn: async () => (await api.get(`/user/advanced-chat/chat-groups/${encodeURIComponent(groupID)}/members/${encodeURIComponent(member.id)}/activity`)).data,
  })
  const working = data?.member.status === "working"
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-hidden">
        <DialogHeader><DialogTitle>{zh ? "执行状态" : "Work status"}</DialogTitle></DialogHeader>
        <div className="flex max-h-[70vh] min-h-[20rem] flex-col rounded-md border">
          <div className="border-b px-3 py-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium">{member.agent_name}</span>
              <span className={cn("rounded px-2 py-0.5 text-xs", working ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>{working ? (zh ? "正在工作" : "Working") : (zh ? "空闲" : "Idle")}</span>
              {data?.run?.status_message && <span className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">{data.run.status_message}</span>}
            </div>
            {(data?.run?.updated_at || data?.member.updated_at) && <div className="mt-1 text-xs text-muted-foreground">{zh ? "更新时间" : "Updated"}: {formatTime(data.run?.updated_at || data.member.updated_at || "")}</div>}
          </div>
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
            {!data?.run ? (
              <div className="rounded-md border border-dashed px-3 py-10 text-center text-sm text-muted-foreground">{zh ? "该助理当前空闲，暂无执行记录" : "This assistant is idle with no active work."}</div>
            ) : (
              <>
                {data.output && <WorkMessage label={zh ? "助理输出" : "Assistant output"} content={data.output} />}
                {data.events.map((event) => <WorkMessage key={event.id} label={eventLabel(event.event, zh)} meta={formatTime(event.created_at)} content={eventContent(event.payload)} />)}
                {data.run.error_message && <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{data.run.error_message}</div>}
                {!data.output && data.events.length === 0 && <div className="rounded-md border border-dashed px-3 py-10 text-center text-sm text-muted-foreground">{zh ? "等待执行输出" : "Waiting for work output"}</div>}
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function WorkMessage({ label, meta, content }: { label: string; meta?: string; content: string }) {
  return <div className="rounded-md border bg-background p-3 text-sm"><div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground"><span className="rounded bg-muted px-1.5 py-0.5">{label}</span>{meta && <span className="ml-auto">{meta}</span>}</div><div className="whitespace-pre-wrap break-words">{content}</div></div>
}

function eventLabel(event: string, zh: boolean) {
  if (event === "status") return zh ? "状态" : "Status"
  if (event === "text") return zh ? "输出" : "Output"
  if (event === "tool_call") return zh ? "工具调用" : "Tool call"
  if (event === "error") return zh ? "错误" : "Error"
  return event
}

function eventContent(payload: Record<string, unknown>) {
  const preferred = payload.delta || payload.message || payload.error || payload.name || payload.tool
  if (typeof preferred === "string" && preferred.trim()) return preferred
  return JSON.stringify(payload, null, 2)
}

function formatTime(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? "" : date.toLocaleString() }
function apiError(err: unknown, fallback: string) { const value = err as { response?: { data?: { error?: string } }; message?: string }; return value?.response?.data?.error || value?.message || fallback }
