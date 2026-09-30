import { Bell, Check, Send, Trash2 } from "lucide-react"
import { useEffect, useState } from "react"
import { api, Button, Switch } from "@velocelab/dashboard/frontend"
import { useI18n } from "@/lib/i18n"

type Message = { id: number; title: string; subtitle?: string; source: string; type: string; read: boolean }
type MessageType = { id: string; plugin: string; label: string; labelKey?: string }

export default function MessageSettings() {
  const { language, t } = useI18n()
  const [messages, setMessages] = useState<Message[]>([])
  const [types, setTypes] = useState<MessageType[]>([])
  const [preferences, setPreferences] = useState<Array<{ plugin: string; type: string; enabled: boolean }>>([])
  const load = async () => { try { setMessages((await api.get("/user/messages")).data.messages || []) } catch { setMessages([]) } }
  const loadTypes = async () => { const response = await api.get("/user/messages/types"); setTypes(response.data.types || []); setPreferences(response.data.preferences || []) }
  useEffect(() => { void load(); void loadTypes() }, [])
  const markRead = async (id: number) => { await api.post("/user/messages/read", { id }); await load() }
  const remove = async (id: number) => { await api.post("/user/messages/delete", { id }); await load() }
  const test = async () => { await api.post("/user/messages/test", { language }); await load() }
  const enabled = (plugin: string, type = "") => preferences.find(item => item.plugin === plugin && item.type === type)?.enabled ?? true
  const setEnabled = async (plugin: string, type: string, value: boolean) => { await api.post("/user/messages/preferences", { plugin, type, enabled: value }); await loadTypes() }
  const groups = [...new Set(types.map(type => type.plugin))]
  const pluginLabel = (plugin: string) => plugin === "message" ? t("message.title") : plugin
  const typeLabel = (type: MessageType) => type.labelKey ? t(type.labelKey) : type.label
  const typeById = new Map(types.map(type => [type.id, type]))
  const messageGroups = messages.reduce<Record<string, Message[]>>((result, message) => {
    const type = typeById.get(message.type)
    const key = `${type?.plugin || message.source}::${type ? typeLabel(type) : t("message.other")}`
    result[key] = [...(result[key] || []), message]
    return result
  }, {})
  return <div className="mx-auto max-w-2xl space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-3xl font-bold">{t("message.title")}</h1><p className="mt-2 text-sm text-muted-foreground">{t("message.description")}</p></div><Button variant="outline" onClick={() => void test()}><Send size={16} />{t("message.sendTest")}</Button></div>
    <section className="space-y-3"><h2 className="text-lg font-semibold">{t("message.types")}</h2>{groups.map(plugin => <div key={plugin} className="rounded-lg border p-4"><div className="flex items-center justify-between gap-3"><h3 className="min-w-0 break-words font-medium">{pluginLabel(plugin)}</h3><Switch aria-label={t("message.enablePlugin", { plugin: pluginLabel(plugin) })} checked={enabled(plugin)} onCheckedChange={value => void setEnabled(plugin, "", value)} /></div><div className="mt-3 divide-y">{types.filter(type => type.plugin === plugin).map(type => <div key={type.id} className="flex items-center justify-between gap-3 py-2"><span className="min-w-0 break-words text-sm text-muted-foreground">{typeLabel(type)}</span><Switch aria-label={t("message.enableType", { type: typeLabel(type) })} checked={enabled(plugin, type.id)} disabled={!enabled(plugin)} onCheckedChange={value => void setEnabled(plugin, type.id, value)} /></div>)}</div></div>)}</section>
    <div className="space-y-5">{messages.length === 0 ? <div className="rounded-lg border py-16 text-center text-sm text-muted-foreground">{t("message.empty")}</div> : Object.entries(messageGroups).map(([key, items]) => { const [plugin, label] = key.split("::"); return <section key={key} className="space-y-2"><h2 className="text-sm font-semibold">{pluginLabel(plugin)} <span className="font-normal text-muted-foreground">/ {label}</span></h2>{items.map(message => <div key={message.id} className="flex items-center gap-3 rounded-lg border p-4"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted"><Bell size={16} /></span><div className="min-w-0 flex-1"><p className="truncate font-medium">{message.title}</p><p className="mt-1 text-sm text-muted-foreground">{message.subtitle || pluginLabel(message.source)}</p></div>{!message.read && <Button variant="ghost" size="icon" aria-label={t("message.markRead")} title={t("message.markRead")} onClick={() => void markRead(message.id)}><Check size={16} /></Button>}<Button variant="ghost" size="icon" aria-label={t("message.delete")} title={t("message.delete")} onClick={() => void remove(message.id)}><Trash2 size={16} /></Button></div>)}</section> })}</div>
  </div>
}
