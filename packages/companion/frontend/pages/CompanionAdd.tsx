import { useState } from "react";
import { Bot, ChevronLeft, MessageCircleHeart, Save } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import api from "@/lib/api";

type Provider = "onebot_v11" | "onebot_v12" | "qq_official";

export default function CompanionAdd() {
  const navigate = useNavigate();
  const [provider, setProvider] = useState<Provider>("onebot_v11");
  const [name, setName] = useState("OneBot 机器人");
  const [baseURL, setBaseURL] = useState("http://127.0.0.1:3000");
  const [appID, setAppID] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [transport, setTransport] = useState("reverse_http");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const choose = (value: Provider) => { setProvider(value); setName(value === "qq_official" ? "QQ 官方机器人" : `OneBot ${value === "onebot_v12" ? "v12" : "v11"} 机器人`); };
  const submit = async () => {
    setBusy(true); setError("");
    try {
      const res = await api.post("/user/companions", { provider, name, onebot_transport: transport, base_url: provider === "qq_official" ? "https://api.bot.qq.com" : baseURL, app_id: appID, app_secret: appSecret, access_token: accessToken });
      navigate(`/chat/companions/${res.data.id}`);
    } catch (cause: any) { setError(cause?.response?.data?.error || cause?.message || "创建失败"); }
    finally { setBusy(false); }
  };
  return <div className="mx-auto w-full max-w-3xl space-y-6">
    <header className="flex items-center gap-3"><Link to="/chat/companions" className="rounded-md border p-2" aria-label="返回管理"><ChevronLeft size={17} /></Link><div><div className="flex items-center gap-2"><MessageCircleHeart size={22} className="text-primary" /><h1 className="text-2xl font-bold">添加聊天接入</h1></div><p className="mt-1 text-sm text-muted-foreground">选择协议并填写连接凭据，创建后再进入管理页面完善人格和过滤规则。</p></div></header>
    <section className="space-y-5 rounded-lg border bg-card p-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <button type="button" onClick={() => choose("onebot_v11")} className={`rounded-md border p-4 text-left ${provider === "onebot_v11" ? "border-primary bg-primary/10" : ""}`}><Bot size={19} className="mb-2 text-primary" /><div className="font-medium">OneBot v11</div><div className="mt-1 text-xs text-muted-foreground">HTTP API + 反向 Webhook</div></button>
        <button type="button" onClick={() => choose("onebot_v12")} className={`rounded-md border p-4 text-left ${provider === "onebot_v12" ? "border-primary bg-primary/10" : ""}`}><Bot size={19} className="mb-2 text-primary" /><div className="font-medium">OneBot v12</div><div className="mt-1 text-xs text-muted-foreground">统一 Action API + 事件上报</div></button>
        <button type="button" onClick={() => choose("qq_official")} className={`rounded-md border p-4 text-left ${provider === "qq_official" ? "border-primary bg-primary/10" : ""}`}><MessageCircleHeart size={19} className="mb-2 text-primary" /><div className="font-medium">QQ 官方机器人</div><div className="mt-1 text-xs text-muted-foreground">官方 Gateway + REST API</div></button>
      </div>
      <label className="grid gap-1.5 text-sm"><span className="font-medium">接入名称</span><input className="h-9 rounded-md border bg-background px-3" value={name} onChange={(event) => setName(event.target.value)} /></label>
      {provider === "onebot_v11" || provider === "onebot_v12" ? <><label className="grid gap-1.5 text-sm"><span className="font-medium">连接方式</span><select className="h-9 rounded-md border bg-background px-3" value={transport} onChange={(event) => setTransport(event.target.value)}><option value="forward_http">正向 HTTP：服务端调用 Bot API</option><option value="reverse_http">反向 HTTP：Bot POST 事件到本服务</option><option value="forward_ws">正向 WebSocket：服务端连接 Bot</option><option value="reverse_ws">反向 WebSocket：Bot 连接本服务</option></select></label><label className="grid gap-1.5 text-sm"><span className="font-medium">OneBot HTTP / WebSocket 地址</span><input className="h-9 rounded-md border bg-background px-3" value={baseURL} onChange={(event) => setBaseURL(event.target.value)} placeholder={transport.includes("ws") ? "ws://127.0.0.1:6700" : "http://127.0.0.1:3000"} /></label><label className="grid gap-1.5 text-sm"><span className="font-medium">Access Token（可选）</span><input type="password" autoComplete="new-password" className="h-9 rounded-md border bg-background px-3" value={accessToken} onChange={(event) => setAccessToken(event.target.value)} /></label><div className="rounded-md bg-muted/40 p-3 text-xs text-muted-foreground">{transport === "reverse_http" ? "创建后会生成反向 HTTP Webhook 地址。" : "连接方式已保存；WebSocket upgrade 接口接入后即可建立长连接。"}{provider === "onebot_v12" ? "发送使用 OneBot v12 Action API。" : "发送使用 OneBot v11 API。"}</div></> : <><label className="grid gap-1.5 text-sm"><span className="font-medium">Bot AppID</span><input className="h-9 rounded-md border bg-background px-3" value={appID} onChange={(event) => setAppID(event.target.value)} /></label><label className="grid gap-1.5 text-sm"><span className="font-medium">ClientSecret</span><input type="password" autoComplete="new-password" className="h-9 rounded-md border bg-background px-3" value={appSecret} onChange={(event) => setAppSecret(event.target.value)} /></label></>}
      {error && <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>}
      <div className="flex justify-end"><button type="button" disabled={busy || !name.trim()} onClick={() => void submit()} className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50"><Save size={15} />{busy ? "创建中…" : "创建接入"}</button></div>
    </section>
  </div>;
}
