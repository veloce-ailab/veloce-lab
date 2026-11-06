import { Bell, Eraser, Trash2 } from "lucide-react"
import { useEffect, useState } from "react"
import type { DashboardContext } from "@velocelab/dashboard/frontend"
import { api, Button, Sheet, SheetContent, SheetHeader, SheetTitle, useConfirmDialog } from "@velocelab/dashboard/frontend"
import MessageSettings from "./page"
import { useI18n } from "@/lib/i18n"

type Message = { id:number; icon?:string; title:string; subtitle?:string; source:string; read:boolean; action?:{href?:string; method?:string; body?:Record<string,unknown>} }

function targetsCurrentPath(href?: string) {
  if (!href || typeof window === "undefined") return false
  try {
    const target = new URL(href, window.location.origin)
    const current = new URL(window.location.href)
    const normalize = (pathname: string) => pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname
    return target.origin === current.origin && normalize(target.pathname) === normalize(current.pathname)
  } catch {
    return false
  }
}

export function MessageButton() {
  const { t } = useI18n()
  const { confirm, confirmDialog } = useConfirmDialog()
  const [open,setOpen]=useState(false); const [messages,setMessages]=useState<Message[]>([])
  const load=async()=>{try{const response=await api.get("/user/messages"); const next=(response.data.messages||[]) as Message[]; const reached=next.filter((message) => targetsCurrentPath(message.action?.href)); if (reached.length) await Promise.allSettled(reached.map((message) => api.post("/user/messages/delete",{id:message.id}))); setMessages(next.filter((message) => !targetsCurrentPath(message.action?.href)))}catch{setMessages([])}}
  useEffect(() => { void load(); const timer = window.setInterval(() => void load(), 10000); return () => window.clearInterval(timer) }, [])
  const activate=async(message:Message)=>{if (message.action?.href) await api.post("/user/messages/delete",{id:message.id}); else await api.post("/user/messages/read",{id:message.id}); setMessages((current) => current.filter((item) => item.id !== message.id)); setOpen(false); if(message.action?.href) window.location.assign(message.action.href)}
  const remove=async(id:number)=>{await api.post("/user/messages/delete",{id}); await load()}
  const clearAll=async()=>{ if(messages.length===0) return; const confirmed=await confirm({ title: t("message.clearAll"), description: t("message.clearConfirm", { count: messages.length }), confirmLabel: t("message.clearAll"), destructive: true }); if(!confirmed) return; try { await api.post("/user/messages/clear"); setMessages([]) } catch { /* Keep the list when the request fails; the next poll will retry. */ } }
  const icon=(_message:Message)=><Bell size={16}/>
  return <>
    <Button variant="ghost" size="icon" aria-label={t("message.title")} title={t("message.title")} onClick={()=>{setOpen(true); void load()}} className="relative"><Bell size={18}/>{messages.some(m=>!m.read)&&<span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-primary"/>}</Button>
    <Sheet open={open} onOpenChange={setOpen}><SheetContent side="right" className="w-full sm:max-w-md"><SheetHeader className="flex-row items-center justify-between gap-3 pr-14"><SheetTitle className="flex items-center gap-2"><Bell size={18}/>{t("message.title")}</SheetTitle><Button variant="ghost" size="sm" className="h-7 gap-1.5 px-2 text-xs text-muted-foreground" disabled={messages.length===0} onClick={()=>void clearAll()}><Eraser size={14}/>{t("message.clearAll")}</Button></SheetHeader><div className="mt-4 space-y-2 overflow-y-auto">{messages.length===0?<div className="py-16 text-center text-sm text-muted-foreground">{t("message.empty")}</div>:messages.map(message=><div key={message.id} className="flex gap-3 rounded-lg border p-3"><button className="flex min-w-0 flex-1 gap-3 text-left" onClick={()=>void activate(message)}><span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted">{icon(message)}</span><span className="min-w-0"><span className="block truncate text-sm font-medium">{message.title}</span><span className="mt-1 block text-xs text-muted-foreground">{message.subtitle}</span><span className="mt-2 block text-[11px] text-muted-foreground">{t("message.from", { source: message.source === "message" ? t("message.title") : message.source })}</span></span></button><Button variant="ghost" size="icon" aria-label={t("message.delete")} title={t("message.delete")} onClick={()=>void remove(message.id)}><Trash2 size={15}/></Button></div>)}</div></SheetContent></Sheet>
    {confirmDialog}
  </>
}
export function apply(ctx: DashboardContext) {
  ctx.slot("topbar.actions", MessageButton, "message.button", 30)
  ctx.page({ frame: "settings", path: "/settings/messages", component: MessageSettings, minimumPermissionLevel: 10, nav: { id: "message.settings", labelKey: "message.title", icon: Bell, order: 35, minimumPermissionLevel: 10, scope: "settings", group: "general" } })
}
export default apply
