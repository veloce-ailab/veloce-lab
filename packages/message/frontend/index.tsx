import { Bell, Trash2 } from "lucide-react"
import { useEffect, useState } from "react"
import type { DashboardContext } from "@velocelab/dashboard/frontend"
import { api, Button, Sheet, SheetContent, SheetHeader, SheetTitle } from "@velocelab/dashboard/frontend"
import { sendWebNotification } from "@velocelab/dashboard/frontend"

type Message = { id:number; icon?:string; title:string; subtitle?:string; source:string; read:boolean; action?:{href?:string; method?:string; body?:Record<string,unknown>} }
export function MessageButton() {
  const [open,setOpen]=useState(false); const [messages,setMessages]=useState<Message[]>([])
  const [seen,setSeen]=useState("")
  const load=async()=>{try{const response=await api.get("/user/messages"); const next=response.data.messages||[]; const newest=next.find((message:Message)=>!message.read); if (newest && newest.id !== Number(seen)) { setSeen(String(newest.id)); void sendWebNotification({ title: newest.title, body: newest.subtitle || newest.source, tag: `message-${newest.id}`, url: newest.action?.href || "/" }) } setMessages(next)}catch{setMessages([])}}
  useEffect(() => { const timer = window.setInterval(() => void load(), 60000); return () => window.clearInterval(timer) }, [])
  const activate=async(message:Message)=>{await api.post("/user/messages/read",{id:message.id}); setOpen(false); if(message.action?.href) window.location.assign(message.action.href)}
  const remove=async(id:number)=>{await api.post("/user/messages/delete",{id}); await load()}
  const icon=(_message:Message)=><Bell size={16}/>
  return <>
    <Button variant="ghost" size="icon" aria-label="Messages" title="Messages" onClick={()=>{setOpen(true); void load()}} className="relative"><Bell size={18}/>{messages.some(m=>!m.read)&&<span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-primary"/>}</Button>
    <Sheet open={open} onOpenChange={setOpen}><SheetContent side="right" className="w-full sm:max-w-md"><SheetHeader><SheetTitle className="flex items-center gap-2"><Bell size={18}/>Messages</SheetTitle></SheetHeader><div className="mt-4 space-y-2 overflow-y-auto">{messages.length===0?<div className="py-16 text-center text-sm text-muted-foreground">No messages</div>:messages.map(message=><div key={message.id} className="flex gap-3 rounded-lg border p-3"><button className="flex min-w-0 flex-1 gap-3 text-left" onClick={()=>void activate(message)}><span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted">{icon(message)}</span><span className="min-w-0"><span className="block truncate text-sm font-medium">{message.title}</span><span className="mt-1 block text-xs text-muted-foreground">{message.subtitle}</span><span className="mt-2 block text-[11px] text-muted-foreground">From {message.source}</span></span></button><Button variant="ghost" size="icon" aria-label="Delete message" title="Delete message" onClick={()=>void remove(message.id)}><Trash2 size={15}/></Button></div>)}</div></SheetContent></Sheet>
  </>
}
export function apply(ctx: DashboardContext) {
  ctx.slot("topbar.actions", MessageButton, "message.button", 30)
}
export default apply
