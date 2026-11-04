import { useEffect, useState } from "react";
import { ChevronLeft, RefreshCw } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import api from "@/lib/api";
import { Button } from "@velocelab/dashboard/frontend";

type Log = { id: number; direction: string; status: string; content: string; error: string; external_user_id: string; created_at: string };
export default function CompanionLogs() {
  const { id = "" } = useParams();
  const [logs, setLogs] = useState<Log[]>([]);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const load = async () => { setBusy(true); setError(""); try { const [all, detail] = await Promise.all([api.get(`/user/companions/${id}/logs?limit=100`), api.get("/user/companions")]); setLogs(Array.isArray(all.data) ? all.data : []); const item = (detail.data?.integrations || []).find((row: any) => String(row.id) === id); setName(item?.name || "聊天接入"); } catch (cause: any) { setError(cause?.response?.data?.error || cause?.message || "加载日志失败"); } finally { setBusy(false); } };
  useEffect(() => { void load(); }, [id]);
  return <div className="w-full space-y-6"><header className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3"><Button asChild variant="outline" size="icon"><Link to="/chat/companions" aria-label="返回管理"><ChevronLeft size={17} /></Link></Button><div><h1 className="text-3xl font-bold">{name} · 日志</h1><p className="mt-2 text-sm text-muted-foreground">查看最近收发消息和错误状态。</p></div></div><Button type="button" onClick={() => void load()} disabled={busy} variant="outline"><RefreshCw size={15} className={busy ? "animate-spin" : ""} />刷新</Button></header>{error && <div role="alert" className="rounded-lg border border-destructive/40 px-3 py-2 text-sm text-destructive">{error}</div>}<section className="overflow-hidden rounded-lg border bg-card"><div className="divide-y">{busy && !logs.length ? <div role="status" className="p-10 text-center text-sm text-muted-foreground">正在加载日志…</div> : error && !logs.length ? null : logs.length ? logs.map((log) => <div key={log.id} className="grid gap-2 px-4 py-3 text-sm md:grid-cols-[7rem_7rem_1fr_auto]"><span className="text-muted-foreground">{log.direction}</span><span className={log.status === "error" ? "text-destructive" : "text-foreground"}>{log.status}</span><span className="min-w-0 break-words">{log.error || log.content || "-"}</span><time className="text-xs text-muted-foreground">{new Date(log.created_at).toLocaleString()}</time></div>) : <div className="p-10 text-center text-sm text-muted-foreground">暂无日志</div>}</div></section></div>;
}
