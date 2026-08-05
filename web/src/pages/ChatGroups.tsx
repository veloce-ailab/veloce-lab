import { useEffect, useMemo, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Bot, MessageSquareText, Plus, Send, Trash2, Users, X } from "lucide-react"
import api from "@/lib/api"
import { useI18n } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { useToast } from "@/components/ui/toast"
import { useConfirmDialog } from "@/components/ui/confirm-dialog"

interface Agent { id: string; name: string }
interface GroupMember { id: string; agent_id: string; agent_name: string; status: "idle" | "working"; run_id?: string }
interface ChatGroup { id: string; name: string; description: string; members: GroupMember[]; updated_at?: string }
interface GroupMessage { id: string; sender_type: "user" | "agent"; sender_id?: string; sender_name: string; content: string; mention_member_ids: string[]; created_at: string }
interface GroupDetail { group: ChatGroup; messages: GroupMessage[] }
interface MemberActivity { member: GroupMember; run?: { status?: string; status_message?: string; current_round?: number; error_message?: string }; events: { id: number; event: string; payload: Record<string, unknown>; created_at: string }[]; output: string }

const groupsKey = ["advanced-chat-chat-groups"] as const

export default function ChatGroups() {
  const { language } = useI18n()
  const zh = language === "zh"
  const { success, error } = useToast()
  const { confirm, confirmDialog } = useConfirmDialog()
  const queryClient = useQueryClient()
  const [selectedID, setSelectedID] = useState("")
  const [draft, setDraft] = useState("")
  const [mentions, setMentions] = useState<string[]>([])
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [agentIDs, setAgentIDs] = useState<string[]>([])
  const [activeMember, setActiveMember] = useState<GroupMember | null>(null)
  const [isSending, setIsSending] = useState(false)

  const { data: groups = [] } = useQuery<ChatGroup[]>({
    queryKey: groupsKey,
    refetchInterval: 2000,
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
  useEffect(() => {
    if (!selectedID && groups[0]) setSelectedID(groups[0].id)
    if (selectedID && groups.length > 0 && !groups.some((group) => group.id === selectedID)) setSelectedID(groups[0].id)
  }, [groups, selectedID])

  const { data: detail } = useQuery<GroupDetail>({
    queryKey: ["advanced-chat-chat-group", selectedID],
    enabled: Boolean(selectedID),
    refetchInterval: 1200,
    queryFn: async () => (await api.get(`/user/advanced-chat/chat-groups/${encodeURIComponent(selectedID)}`)).data,
  })
  const members = detail?.group.members || []
  const mentionedMembers = useMemo(() => members.filter((member) => mentions.includes(member.id)), [members, mentions])

  const createGroup = async () => {
    if (!name.trim() || agentIDs.length === 0) return
    try {
      const response = await api.post("/user/advanced-chat/chat-groups", { name: name.trim(), description: description.trim(), agent_ids: agentIDs })
      setIsCreateOpen(false); setName(""); setDescription(""); setAgentIDs([])
      await queryClient.invalidateQueries({ queryKey: groupsKey })
      setSelectedID(response.data.id)
      success(zh ? "群组已创建" : "Group created")
    } catch (err) { error(apiError(err, zh ? "创建群组失败" : "Failed to create group")) }
  }
  const deleteGroup = async (group: ChatGroup) => {
    if (!await confirm({ description: zh ? `确定删除群组“${group.name}”吗？` : `Delete group “${group.name}”?` })) return
    try {
      await api.delete(`/user/advanced-chat/chat-groups/${encodeURIComponent(group.id)}`)
      setSelectedID("")
      await queryClient.invalidateQueries({ queryKey: groupsKey })
    } catch (err) { error(apiError(err, zh ? "删除群组失败" : "Failed to delete group")) }
  }
  const sendMessage = async () => {
    if (!selectedID || !draft.trim() || isSending) return
    setIsSending(true)
    try {
      await api.post(`/user/advanced-chat/chat-groups/${encodeURIComponent(selectedID)}/messages`, { content: draft.trim(), mention_member_ids: mentions })
      setDraft(""); setMentions([])
      await queryClient.invalidateQueries({ queryKey: ["advanced-chat-chat-group", selectedID] })
    } catch (err) { error(apiError(err, zh ? "消息发送失败" : "Failed to send message")) } finally { setIsSending(false) }
  }

  return (
    <div className="-m-4 flex min-h-[calc(100vh-7rem)] overflow-hidden border-y sm:-m-6 lg:-m-8">
      {confirmDialog}
      <aside className="flex w-56 shrink-0 flex-col border-r bg-card">
        <div className="flex h-14 items-center justify-between border-b px-3">
          <span className="text-sm font-semibold">{zh ? "聊天群组" : "Chat groups"}</span>
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setIsCreateOpen(true)} title={zh ? "新建群组" : "New group"}><Plus size={16} /></Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {groups.map((group) => <button key={group.id} type="button" onClick={() => setSelectedID(group.id)} className={cn("mb-1 w-full rounded-md px-3 py-2 text-left", selectedID === group.id ? "bg-primary/10 text-primary" : "hover:bg-muted")}>
            <div className="truncate text-sm font-medium">{group.name}</div>
            <div className="mt-0.5 text-xs text-muted-foreground">{group.members.length} {zh ? "位助理" : "assistants"}</div>
          </button>)}
          {groups.length === 0 && <div className="px-3 py-10 text-center text-sm text-muted-foreground">{zh ? "暂无群组" : "No groups"}</div>}
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col bg-background">
        {detail ? <>
          <header className="flex h-14 shrink-0 items-center justify-between border-b px-4">
            <div className="min-w-0"><div className="truncate text-sm font-semibold">{detail.group.name}</div><div className="truncate text-xs text-muted-foreground">{detail.group.description}</div></div>
            <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => deleteGroup(detail.group)} title={zh ? "删除群组" : "Delete group"}><Trash2 size={16} /></Button>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            <div className="mx-auto max-w-3xl space-y-4">
              {detail.messages.map((message) => <div key={message.id} className={cn("flex gap-3", message.sender_type === "user" && "flex-row-reverse")}>
                <button type="button" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border bg-muted" onClick={() => message.sender_type === "agent" && setActiveMember(members.find((member) => member.id === message.sender_id) || null)}>{message.sender_type === "agent" ? <Bot size={15} /> : <Users size={15} />}</button>
                <div className={cn("max-w-[78%]", message.sender_type === "user" && "text-right")}>
                  <div className="mb-1 text-xs text-muted-foreground">{message.sender_name} · {formatTime(message.created_at)}</div>
                  <div className={cn("whitespace-pre-wrap rounded-md px-3 py-2 text-left text-sm", message.sender_type === "user" ? "bg-primary text-primary-foreground" : "border bg-card")}>{message.content}</div>
                </div>
              </div>)}
              {detail.messages.length === 0 && <div className="py-20 text-center text-sm text-muted-foreground">{zh ? "发送第一条消息，空闲助理会自行判断是否处理" : "Send the first message. Idle assistants will decide whether to act."}</div>}
            </div>
          </div>
          <div className="shrink-0 border-t p-3">
            <div className="mx-auto max-w-3xl">
              {mentionedMembers.length > 0 && <div className="mb-2 flex flex-wrap gap-1">{mentionedMembers.map((member) => <button type="button" key={member.id} className="flex items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-xs text-primary" onClick={() => setMentions((current) => current.filter((id) => id !== member.id))}>@{member.agent_name}<X size={12} /></button>)}</div>}
              <div className="flex items-end gap-2"><textarea value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void sendMessage() } }} className="max-h-40 min-h-10 flex-1 resize-none rounded-md border bg-background px-3 py-2 text-sm outline-none focus:border-ring" placeholder={zh ? "发送消息；右侧点击 @ 可强制通知忙碌助理" : "Send a message; use @ to interrupt a busy assistant"} /><Button size="icon" disabled={!draft.trim() || isSending} onClick={sendMessage}><Send size={16} /></Button></div>
            </div>
          </div>
        </> : <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground"><MessageSquareText className="mr-2" size={18} />{zh ? "选择或创建群组" : "Select or create a group"}</div>}
      </section>

      <aside className="hidden w-64 shrink-0 border-l bg-card lg:block">
        <div className="flex h-14 items-center border-b px-4 text-sm font-semibold">{zh ? "群组成员" : "Members"}</div>
        <div className="space-y-1 p-2">{members.map((member) => <div key={member.id} className="flex items-center gap-2 rounded-md px-2 py-2 hover:bg-muted">
          <button type="button" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border bg-background" onClick={() => setActiveMember(member)} title={zh ? "查看工作详情" : "View activity"}><Bot size={15} /></button>
          <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setActiveMember(member)}><div className="truncate text-sm font-medium">{member.agent_name}</div><div className={cn("text-xs", member.status === "working" ? "text-amber-600" : "text-emerald-600")}>{member.status === "working" ? (zh ? "正在工作" : "Working") : (zh ? "空闲" : "Idle")}</div></button>
          <Button size="sm" variant={mentions.includes(member.id) ? "secondary" : "ghost"} className="h-7 px-2 text-xs" onClick={() => setMentions((current) => current.includes(member.id) ? current.filter((id) => id !== member.id) : [...current, member.id])}>@</Button>
        </div>)}</div>
      </aside>

      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}><DialogContent className="max-w-lg"><DialogHeader><DialogTitle>{zh ? "新建聊天群组" : "New chat group"}</DialogTitle></DialogHeader><div className="space-y-4"><Input value={name} onChange={(event) => setName(event.target.value)} placeholder={zh ? "群组名称" : "Group name"} /><textarea value={description} onChange={(event) => setDescription(event.target.value)} className="min-h-20 w-full rounded-md border bg-background px-3 py-2 text-sm" placeholder={zh ? "群组描述" : "Description"} /><div><div className="mb-2 text-sm font-medium">{zh ? "选择助理" : "Select assistants"}</div><div className="max-h-56 space-y-1 overflow-y-auto rounded-md border p-2">{agents.map((agent) => <label key={agent.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-2 hover:bg-muted"><input type="checkbox" checked={agentIDs.includes(agent.id)} onChange={() => setAgentIDs((current) => current.includes(agent.id) ? current.filter((id) => id !== agent.id) : [...current, agent.id])} /><Bot size={15} /><span className="text-sm">{agent.name}</span></label>)}</div></div></div><DialogFooter><Button variant="outline" onClick={() => setIsCreateOpen(false)}>{zh ? "取消" : "Cancel"}</Button><Button disabled={!name.trim() || agentIDs.length === 0} onClick={createGroup}>{zh ? "创建" : "Create"}</Button></DialogFooter></DialogContent></Dialog>
      {activeMember && detail && <MemberActivityDialog groupID={detail.group.id} member={activeMember} onClose={() => setActiveMember(null)} zh={zh} />}
    </div>
  )
}

function MemberActivityDialog({ groupID, member, onClose, zh }: { groupID: string; member: GroupMember; onClose: () => void; zh: boolean }) {
  const { data } = useQuery<MemberActivity>({ queryKey: ["chat-group-member-activity", groupID, member.id], refetchInterval: member.status === "working" ? 800 : 3000, queryFn: async () => (await api.get(`/user/advanced-chat/chat-groups/${encodeURIComponent(groupID)}/members/${encodeURIComponent(member.id)}/activity`)).data })
  return <Dialog open onOpenChange={(open) => { if (!open) onClose() }}><DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto"><DialogHeader><DialogTitle className="flex items-center gap-2"><Bot size={18} />{member.agent_name}<span className={cn("text-xs font-normal", data?.member.status === "working" ? "text-amber-600" : "text-emerald-600")}>{data?.member.status === "working" ? (zh ? "正在工作" : "Working") : (zh ? "空闲" : "Idle")}</span></DialogTitle></DialogHeader>{data?.run ? <div className="space-y-4"><div className="grid grid-cols-3 gap-3 border-y py-3 text-xs"><div><span className="text-muted-foreground">{zh ? "状态" : "Status"}</span><div className="mt-1 font-medium">{data.run.status}</div></div><div><span className="text-muted-foreground">{zh ? "阶段" : "Stage"}</span><div className="mt-1 font-medium">{data.run.status_message || "-"}</div></div><div><span className="text-muted-foreground">{zh ? "轮次" : "Round"}</span><div className="mt-1 font-medium">{data.run.current_round || 0}</div></div></div>{data.output && <div><div className="mb-2 text-sm font-medium">{zh ? "当前输出" : "Current output"}</div><div className="whitespace-pre-wrap rounded-md border bg-muted/30 p-3 text-sm">{data.output}</div></div>}<div><div className="mb-2 text-sm font-medium">{zh ? "执行步骤" : "Activity"}</div><div className="space-y-2">{data.events.map((event) => <div key={event.id} className="border-l-2 pl-3 text-xs"><div className="font-medium">{event.event}</div><pre className="mt-1 overflow-x-auto whitespace-pre-wrap text-muted-foreground">{JSON.stringify(event.payload, null, 2)}</pre></div>)}</div></div>{data.run.error_message && <div className="text-sm text-destructive">{data.run.error_message}</div>}</div> : <div className="py-12 text-center text-sm text-muted-foreground">{zh ? "该助理当前空闲，暂无正在执行的工作" : "This assistant is idle with no active work."}</div>}</DialogContent></Dialog>
}

function formatTime(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? "" : date.toLocaleString() }
function apiError(err: unknown, fallback: string) { const value = err as { response?: { data?: { error?: string } }; message?: string }; return value?.response?.data?.error || value?.message || fallback }
