import { Bell, Check, Send, Trash2 } from "lucide-react"
import { useEffect, useState } from "react"
import { api, Button, Switch } from "@velocelab/dashboard/frontend"

type Message = { id: number; title: string; subtitle?: string; source: string; type: string; read: boolean }
type MessageType = { id: string; plugin: string; label: string }

export default function MessageSettings() {
  const [messages, setMessages] = useState<Message[]>([])
  const [types, setTypes] = useState<MessageType[]>([])
  const [preferences, setPreferences] = useState<Array<{ plugin: string; type: string; enabled: boolean }>>([])
  const load = async () => { try { setMessages((await api.get("/user/messages")).data.messages || []) } catch { setMessages([]) } }
  const loadTypes = async () => { const response = await api.get("/user/messages/types"); setTypes(response.data.types || []); setPreferences(response.data.preferences || []) }
  useEffect(() => { void load(); void loadTypes() }, [])
  const markRead = async (id: number) => { await api.post("/user/messages/read", { id }); await load() }
  const remove = async (id: number) => { await api.post("/user/messages/delete", { id }); await load() }
  const test = async () => { await api.post("/user/messages/test"); await load() }
  const enabled = (plugin: string, type = "") => preferences.find(item => item.plugin === plugin && item.type === type)?.enabled ?? true
  const setEnabled = async (plugin: string, type: string, value: boolean) => { await api.post("/user/messages/preferences", { plugin, type, enabled: value }); await loadTypes() }
  const groups = [...new Set(types.map(type => type.plugin))]
  const typeById = new Map(types.map(type => [type.id, type]))
  const messageGroups = messages.reduce<Record<string, Message[]>>((result, message) => {
    const type = typeById.get(message.type)
    const key = `${type?.plugin || message.source}::${type?.label || "其他消息"}`
    result[key] = [...(result[key] || []), message]
    return result
  }, {})
  return <div className="mx-auto max-w-2xl space-y-6">
    <div className="flex items-start justify-between gap-4"><div><h1 className="text-3xl font-bold">消息</h1><p className="mt-2 text-sm text-muted-foreground">查看和管理来自 Veloce 各功能的消息。</p></div><Button variant="outline" onClick={() => void test()}><Send size={16} />发送测试消息</Button></div>
    <section className="space-y-3"><h2 className="text-lg font-semibold">消息类型</h2>{groups.map(plugin => <div key={plugin} className="rounded-lg border p-4"><div className="flex items-center justify-between"><h3 className="font-medium">{plugin}</h3><Switch checked={enabled(plugin)} onCheckedChange={value => void setEnabled(plugin, "", value)} /></div><div className="mt-3 divide-y">{types.filter(type => type.plugin === plugin).map(type => <div key={type.id} className="flex items-center justify-between py-2"><span className="text-sm text-muted-foreground">{type.label}</span><Switch checked={enabled(plugin, type.id)} disabled={!enabled(plugin)} onCheckedChange={value => void setEnabled(plugin, type.id, value)} /></div>)}</div></div>)}</section>
    <div className="space-y-5">{messages.length === 0 ? <div className="rounded-lg border py-16 text-center text-sm text-muted-foreground">暂无消息</div> : Object.entries(messageGroups).map(([key, items]) => { const [plugin, label] = key.split("::"); return <section key={key} className="space-y-2"><h2 className="text-sm font-semibold">{plugin} <span className="font-normal text-muted-foreground">/ {label}</span></h2>{items.map(message => <div key={message.id} className="flex items-center gap-3 rounded-lg border p-4"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted"><Bell size={16} /></span><div className="min-w-0 flex-1"><p className="truncate font-medium">{message.title}</p><p className="mt-1 text-sm text-muted-foreground">{message.subtitle || message.source}</p></div>{!message.read && <Button variant="ghost" size="icon" aria-label="标记已读" title="标记已读" onClick={() => void markRead(message.id)}><Check size={16} /></Button>}<Button variant="ghost" size="icon" aria-label="删除消息" title="删除消息" onClick={() => void remove(message.id)}><Trash2 size={16} /></Button></div>)}</section> })}</div>
  </div>
}
