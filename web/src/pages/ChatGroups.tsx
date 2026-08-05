import { useMemo, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useNavigate, useParams } from "react-router-dom"
import { ArrowLeft, Bot, MessageCircle, PanelRightOpen, Plus, Send, Settings, Trash2, Users, X } from "lucide-react"
import api from "@/lib/api"
import { useI18n } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { useToast } from "@/components/ui/toast"
import { useConfirmDialog } from "@/components/ui/confirm-dialog"

interface Agent { id: string; name: string; default_model?: string; user_channel_id?: number }
interface GroupMember { id: string; agent_id: string; agent_name: string; model_name?: string; user_channel_id?: number; connector_device_id?: string; status: "idle" | "working"; run_id?: string; updated_at?: string }
interface UpstreamChannel { id: number; name: string; models: string[] }
interface ConnectorDevice { id: string; name: string; hostname?: string; online?: boolean }
interface MemberConfig { agent_id: string; model_name: string; user_channel_id: number; connector_device_id: string }
interface ChatGroup { id: string; name: string; description: string; members: GroupMember[]; updated_at?: string }
interface GroupMessage { id: string; sender_type: "user" | "agent"; sender_id?: string; sender_name: string; content: string; mention_member_ids: string[]; created_at: string }
interface GroupDetail { group: ChatGroup; messages: GroupMessage[] }
interface MemberActivity { member: GroupMember; run?: { status?: string; status_message?: string; current_round?: number; error_message?: string; updated_at?: string }; events: { id: number; event: string; payload: Record<string, unknown>; created_at: string }[]; output: string }
interface PrivateConversation { id: string; member_a_id: string; member_b_id: string; member_a_name: string; member_b_name: string; last_message: string; last_message_at: string }
interface PrivateMessage { id: string; sender_member_id: string; sender_name: string; recipient_member_id: string; content: string; created_at: string }
interface PrivateConversationDetail { conversation: PrivateConversation; messages: PrivateMessage[] }

const groupsKey = ["advanced-chat-chat-groups"] as const

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
  const [memberConfigs, setMemberConfigs] = useState<Record<string, MemberConfig>>({})
  const [activeMember, setActiveMember] = useState<GroupMember | null>(null)
  const [activePrivateConversation, setActivePrivateConversation] = useState<PrivateConversation | null>(null)
  const [isSending, setIsSending] = useState(false)
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [settingsName, setSettingsName] = useState("")
  const [settingsDescription, setSettingsDescription] = useState("")
  const [settingsAgentIDs, setSettingsAgentIDs] = useState<string[]>([])
  const [settingsMemberConfigs, setSettingsMemberConfigs] = useState<Record<string, MemberConfig>>({})
  const [isSavingSettings, setIsSavingSettings] = useState(false)

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

  const createGroup = async () => {
    if (!name.trim() || agentIDs.length === 0) return
    try {
      const response = await api.post("/user/advanced-chat/chat-groups", { name: name.trim(), description: description.trim(), agent_ids: agentIDs, member_configs: agentIDs.map((id) => memberConfigs[id] || defaultMemberConfig(agents.find((agent) => agent.id === id))) })
      setIsCreateOpen(false)
      setName("")
      setDescription("")
      setAgentIDs([])
      setMemberConfigs({})
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
    setSettingsAgentIDs(group.members.map((member) => member.agent_id))
    setSettingsMemberConfigs(Object.fromEntries(group.members.map((member) => [member.agent_id, { agent_id: member.agent_id, model_name: member.model_name || agents.find((agent) => agent.id === member.agent_id)?.default_model || "", user_channel_id: member.user_channel_id || agents.find((agent) => agent.id === member.agent_id)?.user_channel_id || 0, connector_device_id: member.connector_device_id || "" }])))
    setIsSettingsOpen(true)
  }

  const saveGroupSettings = async () => {
    if (!detail || !settingsName.trim() || settingsAgentIDs.length === 0 || isSavingSettings) return
    setIsSavingSettings(true)
    try {
      await api.put(`/user/advanced-chat/chat-groups/${encodeURIComponent(detail.group.id)}`, { name: settingsName.trim(), description: settingsDescription.trim(), agent_ids: settingsAgentIDs, member_configs: settingsAgentIDs.map((id) => settingsMemberConfigs[id] || defaultMemberConfig(agents.find((agent) => agent.id === id))) })
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
          <div>
            <div className="mb-2 text-sm font-medium">{zh ? "选择助理" : "Select assistants"}</div>
            <div className="max-h-56 space-y-1 overflow-y-auto rounded-md border p-2">
              {agents.map((agent) => (
                <label key={agent.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-2 hover:bg-muted">
                  <input type="checkbox" checked={agentIDs.includes(agent.id)} onChange={() => { setAgentIDs((current) => current.includes(agent.id) ? current.filter((id) => id !== agent.id) : [...current, agent.id]); setMemberConfigs((current) => current[agent.id] ? current : { ...current, [agent.id]: defaultMemberConfig(agent) }) }} />
                  <Bot size={15} />
                  <span className="text-sm">{agent.name}</span>
                </label>
              ))}
            </div>
          </div>
          <MemberConfigFields agentIDs={agentIDs} agents={agents} catalog={catalog} devices={devices} configs={memberConfigs} onChange={setMemberConfigs} zh={zh} />
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
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader><DialogTitle>{zh ? "群组设置" : "Group settings"}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5"><label className="text-sm font-medium">{zh ? "群组名称" : "Group name"}</label><Input value={settingsName} onChange={(event) => setSettingsName(event.target.value)} /></div>
          <div className="space-y-1.5"><label className="text-sm font-medium">{zh ? "群组描述" : "Description"}</label><textarea value={settingsDescription} onChange={(event) => setSettingsDescription(event.target.value)} className="min-h-20 w-full rounded-md border bg-background px-3 py-2 text-sm" /></div>
          <div>
            <div className="mb-2 text-sm font-medium">{zh ? "群组成员" : "Members"}</div>
            <div className="max-h-52 space-y-1 overflow-y-auto rounded-md border p-2">
              {agents.map((agent) => <label key={agent.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-2 hover:bg-muted"><input type="checkbox" checked={settingsAgentIDs.includes(agent.id)} onChange={() => { setSettingsAgentIDs((current) => current.includes(agent.id) ? current.filter((id) => id !== agent.id) : [...current, agent.id]); setSettingsMemberConfigs((current) => current[agent.id] ? current : { ...current, [agent.id]: defaultMemberConfig(agent) }) }} /><Bot size={15} /><span className="text-sm">{agent.name}</span></label>)}
            </div>
          </div>
          <MemberConfigFields agentIDs={settingsAgentIDs} agents={agents} catalog={catalog} devices={devices} configs={settingsMemberConfigs} onChange={setSettingsMemberConfigs} zh={zh} />
          <div className="border-t pt-4"><Button variant="outline" className="gap-2 text-destructive hover:text-destructive" onClick={() => { setIsSettingsOpen(false); void deleteGroup(detail.group) }}><Trash2 size={15} />{zh ? "删除群组" : "Delete group"}</Button></div>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => setIsSettingsOpen(false)}>{zh ? "取消" : "Cancel"}</Button><Button disabled={!settingsName.trim() || settingsAgentIDs.length === 0 || isSavingSettings} onClick={saveGroupSettings}>{isSavingSettings ? (zh ? "保存中..." : "Saving...") : (zh ? "保存" : "Save")}</Button></DialogFooter>
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
    <div className="-m-4 flex min-h-[calc(100vh-7rem)] overflow-hidden border-y sm:-m-6 lg:-m-8">
      {confirmDialog}
      {settingsDialog}
      <section className="flex min-w-0 flex-1 flex-col bg-background">
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
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
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

      <GroupSidebar className="hidden w-72 shrink-0 lg:block" members={members} mentions={mentions} privateConversations={privateConversations} zh={zh} onMember={setActiveMember} onMention={(id) => setMentions((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id])} onPrivateConversation={setActivePrivateConversation} />
      <div className={cn("fixed inset-0 z-40 lg:hidden", isMobileSidebarOpen ? "pointer-events-auto" : "pointer-events-none")} aria-hidden={!isMobileSidebarOpen}>
        <button type="button" className={cn("absolute inset-0 bg-black/35 transition-opacity", isMobileSidebarOpen ? "opacity-100" : "opacity-0")} onClick={() => setIsMobileSidebarOpen(false)} aria-label={zh ? "关闭群组信息" : "Close group details"} />
        <GroupSidebar className={cn("absolute right-0 top-0 h-full w-72 max-w-[85vw] transition-transform duration-200", isMobileSidebarOpen ? "translate-x-0" : "translate-x-full")} members={members} mentions={mentions} privateConversations={privateConversations} zh={zh} onClose={() => setIsMobileSidebarOpen(false)} onMember={(member) => { setIsMobileSidebarOpen(false); setActiveMember(member) }} onMention={(id) => setMentions((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id])} onPrivateConversation={(conversation) => { setIsMobileSidebarOpen(false); setActivePrivateConversation(conversation) }} />
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

function MemberConfigFields({ agentIDs, agents, catalog, devices, configs, onChange, zh }: { agentIDs: string[]; agents: Agent[]; catalog: UpstreamChannel[]; devices: ConnectorDevice[]; configs: Record<string, MemberConfig>; onChange: (value: Record<string, MemberConfig>) => void; zh: boolean }) {
  if (agentIDs.length === 0) return null
  return (
    <div className="space-y-2 border-t pt-4">
      <div className="text-sm font-medium">{zh ? "助理运行环境" : "Assistant runtime"}</div>
      {agentIDs.map((agentID) => {
        const agent = agents.find((item) => item.id === agentID)
        if (!agent) return null
        const config = configs[agentID] || defaultMemberConfig(agent)
        const selectedChannel = catalog.find((channel) => channel.id === config.user_channel_id && channel.models.includes(config.model_name))
        const selectedModelValue = selectedChannel ? JSON.stringify([selectedChannel.id, config.model_name]) : "current"
        return (
          <div key={agentID} className="rounded-md border p-3">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium"><Bot size={15} />{agent.name}</div>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="space-y-1"><span className="text-xs text-muted-foreground">{zh ? "上级渠道 / 模型" : "Upstream / model"}</span><select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={selectedModelValue} onChange={(event) => { if (event.target.value === "current") return; const [channelID, modelName] = JSON.parse(event.target.value) as [number, string]; onChange({ ...configs, [agentID]: { ...config, user_channel_id: channelID, model_name: modelName } }) }}>{!selectedChannel && config.model_name && <option value="current">{config.model_name}</option>}{catalog.flatMap((channel) => channel.models.map((model) => <option key={`${channel.id}-${model}`} value={JSON.stringify([channel.id, model])}>{channel.name} / {model}</option>))}</select></label>
              <label className="space-y-1"><span className="text-xs text-muted-foreground">{zh ? "设备" : "Device"}</span><select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={config.connector_device_id} onChange={(event) => onChange({ ...configs, [agentID]: { ...config, connector_device_id: event.target.value } })}><option value="">{zh ? "无设备环境" : "No device"}</option>{devices.map((device) => <option key={device.id} value={device.id}>{device.name}{device.hostname ? ` · ${device.hostname}` : ""}{device.online === false ? (zh ? "（离线）" : " (offline)") : ""}</option>)}</select></label>
            </div>
          </div>
        )
      })}
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
