import { useEffect, useState } from "react";
import { Bot, FileText, Plus, RefreshCw, Settings2 } from "lucide-react";
import { Link } from "react-router-dom";
import api from "@/lib/api";
import { Button } from "@velocelab/dashboard/frontend";

type Integration = { id: number; name: string; provider: string; enabled: boolean };
export default function CompanionList() {
  const [items, setItems] = useState<Integration[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const load = async () => { setBusy(true); setError(""); try { const res = await api.get("/user/companions"); setItems(Array.isArray(res.data?.integrations) ? res.data.integrations : []); } catch (cause: any) { setError(cause?.message || "加载失败"); } finally { setBusy(false); } };
  useEffect(() => { void load(); }, []);
  return <div className="w-full space-y-6">
    <header className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-3xl font-bold">聊天陪伴管理</h1><p className="mt-2 text-sm text-muted-foreground">管理平台接入、陪伴人格和消息日志。</p></div><div className="flex gap-2"><Button onClick={() => void load()} disabled={busy} variant="outline"><RefreshCw size={15} className={busy ? "animate-spin" : ""} />刷新</Button><Button asChild><Link to="/chat/companions/add"><Plus size={15} />添加接入</Link></Button></div></header>
    {error && <div role="alert" className="rounded-md border border-destructive/40 px-3 py-2 text-sm text-destructive">{error}</div>}
    {busy && !items.length ? <div role="status" className="py-12 text-center text-sm text-muted-foreground">正在加载接入…</div> : error && !items.length ? null : items.length ? <section className="divide-y rounded-lg border bg-card">{items.map((item) => <article key={item.id} className="flex flex-wrap items-center gap-4 px-4 py-4"><div className="flex min-w-0 flex-1 items-center gap-3"><span className="rounded-md bg-muted p-2"><Bot size={18} className="text-primary" /></span><div className="min-w-0"><div className="truncate font-medium">{item.name}</div><div className="mt-1 text-xs text-muted-foreground">{item.provider === "qq_official" ? "QQ 官方机器人" : `OneBot ${item.provider === "onebot_v12" ? "v12" : "v11"}`} · {item.enabled ? "已启用" : "已停用"}</div></div></div><div className="flex gap-2"><Button asChild variant="outline"><Link to={`/chat/companions/${item.id}`}><Settings2 size={15} />管理</Link></Button><Button asChild variant="outline"><Link to={`/chat/companions/${item.id}/logs`}><FileText size={15} />日志</Link></Button></div></article>)}</section> : <section className="rounded-lg border border-dashed p-10 text-center"><Bot className="mx-auto mb-3 text-muted-foreground" /><h2 className="font-semibold">还没有聊天平台接入</h2><p className="my-2 text-sm text-muted-foreground">添加 OneBot v11、OneBot v12 或 QQ 官方机器人接入。</p><Button asChild className="mt-3"><Link to="/chat/companions/add"><Plus size={15} />添加接入</Link></Button></section>}
  </div>;
}
