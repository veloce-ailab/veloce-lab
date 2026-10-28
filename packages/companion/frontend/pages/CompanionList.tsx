import { useEffect, useState } from "react";
import { Bot, FileText, Plus, RefreshCw, Settings2 } from "lucide-react";
import { Link } from "react-router-dom";
import api from "@/lib/api";

type Integration = { id: number; name: string; provider: string; enabled: boolean };
export default function CompanionList() {
  const [items, setItems] = useState<Integration[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const load = async () => { setBusy(true); setError(""); try { const res = await api.get("/user/companions"); setItems(Array.isArray(res.data?.integrations) ? res.data.integrations : []); } catch (cause: any) { setError(cause?.message || "加载失败"); } finally { setBusy(false); } };
  useEffect(() => { void load(); }, []);
  return <div className="mx-auto w-full max-w-5xl space-y-6">
    <header className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-bold">聊天陪伴管理</h1><p className="mt-1 text-sm text-muted-foreground">管理平台接入、陪伴人格和消息日志。</p></div><div className="flex gap-2"><button onClick={() => void load()} disabled={busy} className="inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm"><RefreshCw size={15} className={busy ? "animate-spin" : ""} />刷新</button><Link to="/chat/companions/add" className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-sm text-primary-foreground"><Plus size={15} />添加接入</Link></div></header>
    {error && <div role="alert" className="rounded-md border border-destructive/40 px-3 py-2 text-sm text-destructive">{error}</div>}
    {items.length ? <section className="divide-y rounded-lg border bg-card">{items.map((item) => <article key={item.id} className="flex flex-wrap items-center gap-4 px-4 py-4"><div className="flex min-w-0 flex-1 items-center gap-3"><span className="rounded-md bg-muted p-2"><Bot size={18} className="text-primary" /></span><div className="min-w-0"><div className="truncate font-medium">{item.name}</div><div className="mt-1 text-xs text-muted-foreground">{item.provider === "qq_official" ? "QQ 官方机器人" : `OneBot ${item.provider === "onebot_v12" ? "v12" : "v11"}`} · {item.enabled ? "已启用" : "已停用"}</div></div></div><div className="flex gap-2"><Link to={`/chat/companions/${item.id}`} className="inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm"><Settings2 size={15} />管理</Link><Link to={`/chat/companions/${item.id}/logs`} className="inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm"><FileText size={15} />日志</Link></div></article>)}</section> : <section className="rounded-lg border border-dashed p-10 text-center"><Bot className="mx-auto mb-3 text-muted-foreground" /><h2 className="font-semibold">还没有聊天平台接入</h2><p className="my-2 text-sm text-muted-foreground">添加 OneBot v11、OneBot v12 或 QQ 官方机器人接入。</p><Link to="/chat/companions/add" className="mt-3 inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-sm text-primary-foreground"><Plus size={15} />添加接入</Link></section>}
  </div>;
}
