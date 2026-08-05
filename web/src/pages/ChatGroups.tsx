import { useMemo, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useNavigate, useParams } from "react-router-dom"
import { ArrowLeft, Bot, Plus, Send, Trash2, Users, X } from "lucide-react"
import api from "@/lib/api"
import { useI18n } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { useToast } from "@/components/ui/toast"
import { useConfirmDialog } from "@/components/ui/confirm-dialog"

interface Agent { id: string; name: string }
interface GroupMember { id: string; agent_id: string; agent_name: string; status: "idle" | "working"; run_id?: string; updated_at?: string }
interface ChatGroup { id: string; name: string; description: string; members: GroupMember[]; updated_at?: string }
interface GroupMessage { id: string; sender_type: "user" | "agent"; sender_id?: string; sender_name: string; content: string; mention_member_ids: string[]; created_at: string }
interface GroupDetail { group: ChatGroup; messages: GroupMessage[] }
interface MemberActivity { member: GroupMember; run?: { status?: string; status_message?: string; current_round?: number; error_message?: string; updated_at?: string }; events: { id: number; event: string; payload: Record<string, unknown>; created_at: string }[]; output: string }

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
  const [activeMember, setActiveMember] = useState<GroupMember | null>(null)
  const [isSending, setIsSending] = useState(false)

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
  const { data: detail } = useQuery<GroupDetail>({
    queryKey: ["advanced-chat-chat-group", groupID],
    enabled: Boolean(groupID),
    refetchInterval: 1200,
    queryFn: async () => (await api.get(`/user/advanced-chat/chat-groups/${encodeURIComponent(groupID)}`)).data,
  })
  const members = detail?.group.members || []
  const mentionedMembers = useMemo(() => members.filter((member) => mentions.includes(member.id)), [members, mentions])

  const createGroup = async () => {
    if (!name.trim() || agentIDs.length === 0) return
    try {
      const response = await api.post("/user/advanced-chat/chat-groups", { name: name.trim(), description: description.trim(), agent_ids: agentIDs })
      setIsCreateOpen(false)
      setName("")
      setDescription("")
      setAgentIDs([])
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
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{zh ? "新建聊天群组" : "New chat group"}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <Input value={name} onChange={(event) => setName(event.target.value)} placeholder={zh ? "群组名称" : "Group name"} />
          <textarea value={description} onChange={(event) => setDescription(event.target.value)} className="min-h-20 w-full rounded-md border bg-background px-3 py-2 text-sm" placeholder={zh ? "群组描述" : "Description"} />
          <div>
            <div className="mb-2 text-sm font-medium">{zh ? "选择助理" : "Select assistants"}</div>
            <div className="max-h-56 space-y-1 overflow-y-auto rounded-md border p-2">
              {agents.map((agent) => (
                <label key={agent.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-2 hover:bg-muted">
                  <input type="checkbox" checked={agentIDs.includes(agent.id)} onChange={() => setAgentIDs((current) => current.includes(agent.id) ? current.filter((id) => id !== agent.id) : [...current, agent.id])} />
                  <Bot size={15} />
                  <span className="text-sm">{agent.name}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setIsCreateOpen(false)}>{zh ? "取消" : "Cancel"}</Button>
          <Button disabled={!name.trim() || agentIDs.length === 0} onClick={createGroup}>{zh ? "创建" : "Create"}</Button>
        </DialogFooter>
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
      <section className="flex min-w-0 flex-1 flex-col bg-background">
        {detail ? (
          <>
            <header className="flex h-14 shrink-0 items-center justify-between border-b px-3">
              <div className="flex min-w-0 items-center gap-2">
                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => navigate("/chat/groups")} title={zh ? "返回群组列表" : "Back to groups"}><ArrowLeft size={17} /></Button>
                <div className="min-w-0"><div className="truncate text-sm font-semibold">{detail.group.name}</div><div className="truncate text-xs text-muted-foreground">{detail.group.description}</div></div>
              </div>
              <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => deleteGroup(detail.group)} title={zh ? "删除群组" : "Delete group"}><Trash2 size={16} /></Button>
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

      <aside className="hidden w-64 shrink-0 border-l bg-card lg:block">
        <div className="flex h-14 items-center border-b px-4 text-sm font-semibold">{zh ? "群组成员" : "Members"}</div>
        <div className="space-y-1 p-2">
          {members.map((member) => (
            <div key={member.id} className="flex items-center gap-2 rounded-md px-2 py-2 hover:bg-muted">
              <button type="button" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border bg-background" onClick={() => setActiveMember(member)} title={zh ? "查看工作详情" : "View activity"}><Bot size={15} /></button>
              <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setActiveMember(member)}><div className="truncate text-sm font-medium">{member.agent_name}</div><div className={cn("text-xs", member.status === "working" ? "text-primary" : "text-muted-foreground")}>{member.status === "working" ? (zh ? "正在工作" : "Working") : (zh ? "空闲" : "Idle")}</div></button>
              <Button size="sm" variant={mentions.includes(member.id) ? "secondary" : "ghost"} className="h-7 px-2 text-xs" onClick={() => setMentions((current) => current.includes(member.id) ? current.filter((id) => id !== member.id) : [...current, member.id])}>@</Button>
            </div>
          ))}
        </div>
      </aside>
      {activeMember && detail && <MemberActivityDialog groupID={detail.group.id} member={activeMember} onClose={() => setActiveMember(null)} zh={zh} />}
    </div>
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
