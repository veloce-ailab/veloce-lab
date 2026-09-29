import { Bell, Check, Trash2 } from "lucide-react"
import { useEffect, useState } from "react"
import { api, Button } from "@velocelab/dashboard/frontend"

type Message = { id: number; title: string; subtitle?: string; source: string; read: boolean }

export default function MessageSettings() {
  const [messages, setMessages] = useState<Message[]>([])
  const load = async () => { try { setMessages((await api.get("/user/messages")).data.messages || []) } catch { setMessages([]) } }
  useEffect(() => { void load() }, [])
  const markRead = async (id: number) => { await api.post("/user/messages/read", { id }); await load() }
  const remove = async (id: number) => { await api.post("/user/messages/delete", { id }); await load() }
  return <div className="mx-auto max-w-2xl space-y-6">
    <div><h1 className="text-3xl font-bold">消息</h1><p className="mt-2 text-sm text-muted-foreground">查看和管理来自 Veloce 各功能的消息。</p></div>
    <div className="space-y-2">{messages.length === 0 ? <div className="rounded-lg border py-16 text-center text-sm text-muted-foreground">暂无消息</div> : messages.map(message => <div key={message.id} className="flex items-center gap-3 rounded-lg border p-4"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted"><Bell size={16} /></span><div className="min-w-0 flex-1"><p className="truncate font-medium">{message.title}</p><p className="mt-1 text-sm text-muted-foreground">{message.subtitle || message.source}</p></div>{!message.read && <Button variant="ghost" size="icon" aria-label="标记已读" title="标记已读" onClick={() => void markRead(message.id)}><Check size={16} /></Button>}<Button variant="ghost" size="icon" aria-label="删除消息" title="删除消息" onClick={() => void remove(message.id)}><Trash2 size={16} /></Button></div>)}</div>
  </div>
}
