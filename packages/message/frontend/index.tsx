import { Bell, PackageUp, Trash2 } from "lucide-react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { api } from "@velocelab/dashboard/frontend"
import type { DashboardContext } from "@velocelab/dashboard/frontend"

type Message = { id:number; icon?:string; title:string; subtitle?:string; source:string; read:boolean; action?:{href?:string; method?:string; body?:Record<string,unknown>} }
function MessageButton() {
  const [open,setOpen]=useState(false); const client=useQueryClient()
  const query=useQuery<{messages:Message[]}>({queryKey:["messages"],queryFn:async()=> (await api.get("/user/messages")).data})
  const remove=useMutation({mutationFn:async(id:number)=>api.post("/user/messages/delete",{id}),onSuccess:()=>client.invalidateQueries({queryKey:["messages"]})})
  const read=useMutation({mutationFn:async(id:number)=>api.post("/user/messages/read",{id}),onSuccess:()=>client.invalidateQueries({queryKey:["messages"]})})
  const messages=query.data?.messages||[]
  const activate=async(message:Message)=>{read.mutate(message.id); setOpen(false); if(message.action?.href){if((message.action.method||"GET")==="GET") window.location.assign(message.action.href); else await api.request({url:message.action.href,method:message.action.method||"POST",data:message.action.body})}}
  const icon=(message:Message)=>message.icon==="package-up"?<PackageUp size={16}/>:<Bell size={16}/>
  return <>
    <button type="button" aria-label="Messages" title="Messages" onClick={()=>setOpen(true)} className="relative inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-accent"><Bell size={18}/>{messages.some(m=>!m.read)&&<span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-primary"/>}</button>
    {open && <div className="fixed inset-0 z-50 bg-black/40" onClick={()=>setOpen(false)}>
      <aside role="dialog" aria-label="Messages" className="absolute right-0 top-0 h-full w-full max-w-md overflow-y-auto border-l bg-background p-6 shadow-xl" onClick={event=>event.stopPropagation()}>
        <div className="flex items-center justify-between"><h2 className="flex items-center gap-2 text-lg font-semibold"><Bell size={18}/>Messages</h2><button type="button" aria-label="Close messages" onClick={()=>setOpen(false)} className="rounded-md px-2 py-1 text-xl hover:bg-accent">&times;</button></div>
        <div className="mt-4 space-y-2">{messages.length===0?<div className="py-16 text-center text-sm text-muted-foreground">No messages</div>:messages.map(message=><div key={message.id} className="flex gap-3 rounded-lg border p-3"><button className="flex min-w-0 flex-1 gap-3 text-left" onClick={()=>void activate(message)}><span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted">{icon(message)}</span><span className="min-w-0"><span className="block truncate text-sm font-medium">{message.title}</span><span className="mt-1 block text-xs text-muted-foreground">{message.subtitle}</span><span className="mt-2 block text-[11px] text-muted-foreground">From {message.source}</span></span></button><button type="button" aria-label="Delete message" title="Delete message" className="h-8 w-8 rounded-md hover:bg-accent" onClick={()=>remove.mutate(message.id)}><Trash2 size={15}/></button></div>)}</div>
      </aside>
    </div>}
  </>
}
export function apply(ctx: DashboardContext) { ctx.slot("header.actions", MessageButton, "message.button", 30) }
export default apply
