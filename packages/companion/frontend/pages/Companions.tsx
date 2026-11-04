import { useEffect, useMemo, useState } from "react";
import { Bot, Copy, Image, MessageCircleHeart, Plus, RefreshCw, Save, Trash2, Wifi } from "lucide-react";
import api from "@/lib/api";
import { Button, Input, Textarea, Checkbox, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, useConfirmDialog, useToast } from "@velocelab/dashboard/frontend";
import { Link, useParams } from "react-router-dom";

type Integration = {
  id: number; name: string; provider: "onebot_v11" | "onebot_v12" | "qq_official"; app_id: string; base_url: string; enabled: boolean; webhook_url: string; websocket_url?: string; onebot_transport?: string; has_access_token: boolean; has_app_secret: boolean;
  default_persona_id: string; session_mode: string; allow_image_input: boolean; allow_image_output: boolean;
  typing_delay_ms: number; multiple_messages: boolean; max_messages: number; interrupt_mode: string;
  allowed_user_ids: string; blocked_user_ids: string; allowed_group_ids: string; blocked_group_ids: string; group_personas: string;
};
type Persona = { id: string; integration_id: number; name: string; assistant_agent_id: string; base_agent_id: string; enabled: boolean };
type Agent = { id: string; name: string; prompt: string; default_model: string; user_channel_id?: number };
type Sticker = { id: string; category: string; name: string; description: string; image_url: string; created_at: string };
const blank: Omit<Integration, "id" | "webhook_url" | "has_access_token" | "has_app_secret"> = {
  name: "OneBot 机器人", provider: "onebot_v11", onebot_transport: "reverse_http", app_id: "", base_url: "http://127.0.0.1:3000", enabled: true, webhook_url: "", websocket_url: "", has_access_token: false, has_app_secret: false, default_persona_id: "", session_mode: "per_chat",
  allow_image_input: true, allow_image_output: true, typing_delay_ms: 500, multiple_messages: true, max_messages: 3, interrupt_mode: "stop",
  allowed_user_ids: "[]", blocked_user_ids: "[]", allowed_group_ids: "[]", blocked_group_ids: "[]", group_personas: "{}",
};
const parseList = (value: string) => { try { const parsed = JSON.parse(value || "[]"); return Array.isArray(parsed) ? parsed.map(String) : []; } catch { return []; } };
const listText = (value: unknown) => Array.isArray(value) ? value.join(", ") : "";
const toLines = (value: string) => value.split(/[\n,，]/).map((item) => item.trim()).filter(Boolean);

export default function Companions() {
  const { confirm, confirmDialog } = useConfirmDialog();
  const { error: toastError } = useToast();
  const { id: routeID } = useParams();
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedID, setSelectedID] = useState<number>();
  const [draft, setDraft] = useState<any>({ ...blank, access_token: "" });
  const [newName, setNewName] = useState("");
  const [newPrompt, setNewPrompt] = useState("");
  const [baseAgentID, setBaseAgentID] = useState("");
  const [stickers, setStickers] = useState<Sticker[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const selected = integrations.find((item) => item.id === selectedID);
  const selectedPersonas = useMemo(() => personas.filter((item) => item.integration_id === selectedID), [personas, selectedID]);
  const selectedAgent = agents.find((item) => item.id === baseAgentID);

  const load = async (keepSelected = true) => {
    setLoading(true); setLoadError("");
    try {
    const response = await api.get("/user/companions");
    const next = Array.isArray(response.data?.integrations) ? response.data.integrations : [];
    setIntegrations(next);
    setPersonas(Array.isArray(response.data?.personas) ? response.data.personas : []);
    const routeSelectedID = routeID ? Number(routeID) : undefined;
    const nextID = (routeSelectedID && next.find((item: Integration) => item.id === routeSelectedID)?.id) || ((keepSelected ? selectedID && next.find((item: Integration) => item.id === selectedID)?.id : undefined) ?? next[0]?.id);
    setSelectedID(nextID);
    const agentResponse = await api.get("/user/advanced-chat/agents");
    const nextAgents = Array.isArray(agentResponse.data) ? agentResponse.data.map((item: any) => ({ id: String(item.id ?? ""), name: String(item.name ?? ""), prompt: String(item.prompt ?? ""), default_model: String(item.default_model ?? ""), user_channel_id: Number(item.user_channel_id) || undefined })).filter((item: Agent) => item.id) : [];
    setAgents(nextAgents);
    setBaseAgentID((previous) => previous && nextAgents.some((agent: Agent) => agent.id === previous) ? previous : nextAgents.find((agent: Agent) => agent.default_model)?.id ?? "");
    } catch (error: any) {
      setLoadError(error?.response?.data?.error || error?.message || "加载失败");
    } finally { setLoading(false); }
  };
  useEffect(() => { void load(false); }, [routeID]);
  useEffect(() => {
    if (!selected) { setDraft({ ...blank, access_token: "" }); setStickers([]); return; }
    setDraft({ ...selected, access_token: "", app_secret: "", allowed_user_ids_text: listText(parseList(selected.allowed_user_ids)), blocked_user_ids_text: listText(parseList(selected.blocked_user_ids)), allowed_group_ids_text: listText(parseList(selected.allowed_group_ids)), blocked_group_ids_text: listText(parseList(selected.blocked_group_ids)), group_personas_text: selected.group_personas || "{}" });
    void Promise.all([
      api.get(`/user/companions/${selected.id}/stickers`).then((res) => setStickers(Array.isArray(res.data) ? res.data : [])),
    ]).catch(() => undefined);
  }, [selectedID, integrations.length]);

  const update = (key: string, value: unknown) => setDraft((current: any) => ({ ...current, [key]: value }));
  const save = async () => {
    if (!selected) return;
    setBusy(true); setStatus("");
    try {
      const payload = { ...draft,
        allowed_user_ids: toLines(draft.allowed_user_ids_text ?? listText(parseList(draft.allowed_user_ids))),
        blocked_user_ids: toLines(draft.blocked_user_ids_text ?? listText(parseList(draft.blocked_user_ids))),
        allowed_group_ids: toLines(draft.allowed_group_ids_text ?? listText(parseList(draft.allowed_group_ids))),
        blocked_group_ids: toLines(draft.blocked_group_ids_text ?? listText(parseList(draft.blocked_group_ids))),
        group_personas: draft.group_personas_text ? JSON.parse(draft.group_personas_text) : JSON.parse(draft.group_personas || "{}"),
      };
      if (!payload.access_token) delete payload.access_token;
      await api.put(`/user/companions/${selected.id}`, payload);
      setStatus("设置已保存"); await load();
    } catch (error: any) { setStatus(""); toastError(error?.response?.data?.error || error?.message || "保存失败"); }
    finally { setBusy(false); }
  };
  const createIntegration = async (provider: Integration["provider"]) => {
    setBusy(true);
    try {
      const isQQ = provider === "qq_official";
      const result = await api.post("/user/companions", { provider, name: isQQ ? "QQ 官方机器人" : "OneBot 机器人", base_url: isQQ ? "https://api.bot.qq.com" : "http://127.0.0.1:3000" });
      await load(false); setSelectedID(result.data.id); setStatus(isQQ ? "已创建 QQ 官方接入；填写 AppID 与 ClientSecret 后自动连接 Gateway" : "已创建 OneBot 接入");
    } catch (error: any) { setStatus(""); toastError(error?.response?.data?.error || error?.message || "创建失败"); }
    finally { setBusy(false); }
  };
  const addPersona = async () => {
    if (!selected || !newName.trim() || !baseAgentID) return;
    setBusy(true);
    try {
      const res = await api.post(`/user/companions/${selected.id}/personas`, { name: newName.trim(), prompt: newPrompt, base_agent_id: baseAgentID });
      if (!draft.default_persona_id) await api.put(`/user/companions/${selected.id}`, { default_persona_id: res.data.id });
      setPersonas((rows) => [...rows, res.data]); setDraft((value: any) => ({ ...value, default_persona_id: value.default_persona_id || res.data.id }));
      setNewName(""); setNewPrompt(""); setStatus("陪伴人格已创建；模型与工具沿用所选助理配置"); await load();
    } catch (error: any) { setStatus(""); toastError(error?.response?.data?.error || error?.message || "创建人格失败"); }
    finally { setBusy(false); }
  };
  const removePersona = async (persona: Persona) => {
    if (!selected || busy || !(await confirm({ description: `删除人格“${persona.name}”？其专属助理也会一并删除。`, destructive: true, confirmLabel: "删除人格" }))) return;
    setBusy(true);
    try { await api.delete(`/user/companions/${selected.id}/personas/${persona.id}`); setStatus("人格已删除"); await load(); }
    catch (error: any) { setStatus(""); toastError(error?.response?.data?.error || error?.message || "删除人格失败"); }
    finally { setBusy(false); }
  };
  const testConnection = async () => {
    if (!selected) return;
    setBusy(true);
    try { const res = await api.post(`/user/companions/${selected.id}/test`); setStatus(`${selected.provider === "qq_official" ? "QQ 官方 API" : "OneBot"} 已连接：${res.data?.bot?.nickname || res.data?.bot?.username || res.data?.bot?.user_id || res.data?.bot?.id || "OK"}`); }
    catch (error: any) { setStatus(""); toastError(error?.response?.data?.error || error?.message || "连接失败"); }
    finally { setBusy(false); }
  };
  const removeIntegration = async () => {
    if (!selected || busy || !(await confirm({ description: `删除接入“${selected.name}”及该接入下的人格、表情包和消息日志？`, destructive: true, confirmLabel: "删除接入" }))) return;
    setBusy(true);
    try { await api.delete(`/user/companions/${selected.id}`); setStatus("接入已删除"); await load(false); }
    catch (error: any) { setStatus(""); toastError(error?.response?.data?.error || error?.message || "删除接入失败"); }
    finally { setBusy(false); }
  };
  const copy = async (value: string) => { await navigator.clipboard.writeText(value); setStatus("已复制到剪贴板"); };
  const updateSticker = async (sticker: Sticker) => {
    if (!selected) return;
    try { await api.put(`/user/companions/${selected.id}/stickers/${sticker.id}`, { category: sticker.category, name: sticker.name, description: sticker.description }); setStatus("表情包名称与分类已保存"); }
    catch (error: any) { setStatus(""); toastError(error?.response?.data?.error || error?.message || "表情包保存失败"); }
  };
  const deleteSticker = async (sticker: Sticker) => {
    if (!selected || busy || !(await confirm({ description: `删除表情包“${sticker.name || sticker.category}”？`, destructive: true, confirmLabel: "删除表情包" }))) return;
    setBusy(true);
    try { await api.delete(`/user/companions/${selected.id}/stickers/${sticker.id}`); setStickers((rows) => rows.filter((row) => row.id !== sticker.id)); setStatus("表情包已删除"); }
    catch (error: any) { setStatus(""); toastError(error?.response?.data?.error || error?.message || "删除表情包失败"); }
    finally { setBusy(false); }
  };

  const addIntegrationButton = <Button asChild><Link to="/chat/companions/add"><Plus size={15} />添加接入</Link></Button>;

  const field = (label: string, key: string, placeholder = "", type = "text") => <label className="grid gap-1.5 text-sm"><span className="font-medium">{label}</span><Input type={type} value={draft[key] ?? ""} placeholder={placeholder} onChange={(event) => update(key, event.target.value)} /></label>;
  const check = (label: string, key: string) => <label className="flex items-center gap-2 text-sm"><Checkbox checked={Boolean(draft[key])} onCheckedChange={(checked) => update(key, checked === true)} />{label}</label>;
  const textarea = (label: string, key: string, placeholder: string) => <label className="grid gap-1.5 text-sm"><span className="font-medium">{label}</span><Textarea className="min-h-20" value={draft[key] ?? ""} placeholder={placeholder} onChange={(event) => update(key, event.target.value)} /></label>;
  const filters = (textKey: string) => textarea({ allowed_user_ids_text: "允许的用户 ID / QQ OpenID（逗号或换行分隔）", blocked_user_ids_text: "屏蔽的用户 ID / QQ OpenID", allowed_group_ids_text: "允许的群 ID / Group OpenID（留空表示不限）", blocked_group_ids_text: "屏蔽的群 ID / Group OpenID" }[textKey] || textKey, textKey, "例如 12345, 67890");

  return <div className="w-full space-y-6 pb-12">
    {confirmDialog}
    <header className="flex flex-wrap items-center justify-between gap-3"><div><div className="flex items-center gap-2"><MessageCircleHeart size={25} className="text-primary" /><h1 className="text-3xl font-bold">聊天陪伴管理</h1></div><p className="mt-2 max-w-3xl text-sm text-muted-foreground">配置平台接入、陪伴人格、权限过滤和聊天行为。</p></div><div className="flex items-center gap-2"><Button asChild variant="outline"><Link to="/chat/companions">返回接入列表</Link></Button><Button variant="outline" disabled={loading || busy} onClick={() => void load()}><RefreshCw size={15} />刷新</Button>{integrations.length > 0 && addIntegrationButton}</div></header>
    {loadError && <div role="alert" className="rounded-lg border border-destructive/40 px-3 py-2 text-sm text-destructive">{loadError}</div>}
    {status && <div role="status" className="rounded-md border bg-muted/40 px-3 py-2 text-sm">{status}</div>}
    {loading && !integrations.length ? <div role="status" className="py-12 text-center text-sm text-muted-foreground">正在加载接入…</div> : loadError && !integrations.length ? null : !integrations.length ? <section className="rounded-lg border border-dashed p-10 text-center"><Bot className="mx-auto mb-3 text-muted-foreground" /><h2 className="font-semibold">还没有聊天平台接入</h2><p className="mx-auto my-2 max-w-lg text-sm text-muted-foreground">选择 OneBot v11 反向 Webhook，或使用 QQ 官方开放平台 AppID/ClientSecret 连接 Gateway。</p><div className="mt-4 flex justify-center">{addIntegrationButton}</div></section> : <>
      <div className="flex flex-wrap gap-2">{integrations.map((item) => <Button key={item.id} variant="outline" disabled={busy} aria-pressed={item.id === selectedID} onClick={() => setSelectedID(item.id)} className={item.id === selectedID ? "border-primary bg-primary/10 text-primary" : undefined}>{item.name}<span className="ml-2 text-xs text-muted-foreground">{item.provider === "qq_official" ? "QQ 官方" : "OneBot"}</span>{item.enabled ? "" : " · 已停用"}</Button>)}</div>
      {selected && <>
        {selected.provider === "qq_official" ? <section className="space-y-4 rounded-lg border p-4"><div><h2 className="font-semibold">QQ 官方机器人</h2><p className="mt-1 text-sm text-muted-foreground">使用开放平台 AppID / ClientSecret 获取官方 access token，并由 Veloce Lab 持久 WebSocket Gateway 接收 QQ 群 @机器人和 C2C 私聊；回复经官方 REST API 发送。请在开放平台为机器人开通并订阅 GROUP_AND_C2C_EVENT 权限。保存凭据后自动连接，无需配置公网 Webhook。</p></div><div className="grid gap-3 md:grid-cols-2">{field("接入名称", "name")}{field("Bot AppID", "app_id", "QQ 开放平台 AppID")}<label className="grid gap-1.5 text-sm"><span className="font-medium">ClientSecret {selected.has_app_secret && <span className="text-muted-foreground">（已配置；留空保持原值）</span>}</span><Input type="password" autoComplete="new-password" value={draft.app_secret} placeholder={selected.has_app_secret ? "已保存，留空保持不变" : "QQ 开放平台 ClientSecret"} onChange={(event) => update("app_secret", event.target.value)} /></label></div><div className="flex flex-wrap gap-3">{check("启用接入", "enabled")}<Button variant="outline" onClick={() => void testConnection()} disabled={busy}><Wifi size={15} />测试 QQ 官方 API</Button></div></section> : <section className="space-y-4 rounded-lg border p-4"><div><h2 className="font-semibold">OneBot {selected.provider === "onebot_v12" ? "v12" : "v11"} 接入</h2><p className="mt-1 text-sm text-muted-foreground">选择 HTTP 或 WebSocket 传输方向。WebSocket 地址连接后，事件与 API 请求共用长连接；Webhook 模式使用下方生成的事件地址。</p></div><div className="grid gap-3 md:grid-cols-2"><label className="grid gap-1.5 text-sm"><span className="font-medium">传输方式</span><Select value={draft.onebot_transport || "reverse_http"} onValueChange={(value) => update("onebot_transport", value)}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="forward_http">正向 HTTP</SelectItem><SelectItem value="reverse_http">反向 HTTP</SelectItem><SelectItem value="forward_ws">正向 WebSocket</SelectItem><SelectItem value="reverse_ws">反向 WebSocket</SelectItem></SelectContent></Select></label>{field("OneBot 服务地址", "base_url", (draft.onebot_transport || "").includes("ws") ? "ws://127.0.0.1:6700" : "http://127.0.0.1:3000")}{field("接入名称", "name")}<label className="grid gap-1.5 text-sm"><span className="font-medium">Access Token {selected.has_access_token && <span className="text-muted-foreground">（已配置；留空保持原值）</span>}</span><Input type="password" autoComplete="new-password" value={draft.access_token} placeholder={selected.has_access_token ? "已保存，留空保持不变" : "OneBot Access Token"} onChange={(event) => update("access_token", event.target.value)} /></label>{selected.webhook_url && <label className="grid gap-1.5 text-sm"><span className="font-medium">反向 HTTP 事件地址</span><span className="flex gap-2"><Input readOnly className="min-w-0 flex-1 bg-muted text-xs" value={selected.webhook_url} /><Button variant="outline" onClick={() => void copy(`${window.location.origin}${selected.webhook_url}`)} title="复制 Webhook" aria-label="复制 Webhook" size="icon"><Copy size={15} /></Button></span></label>}{selected.websocket_url && <div className="grid gap-1.5 text-sm"><span className="font-medium">反向 WebSocket 地址</span><code className="break-all rounded-md border bg-muted px-3 py-2 text-xs">{window.location.origin.replace(/^http/, "ws")}{selected.websocket_url}</code></div>}</div><div className="flex flex-wrap gap-3">{check("启用接入", "enabled")}<Button variant="outline" onClick={() => void testConnection()} disabled={busy}><Wifi size={15} />测试 OneBot 连接</Button></div></section>}
        <section className="space-y-4 rounded-lg border p-4"><div><h2 className="font-semibold">陪伴人格</h2><p className="mt-1 text-sm text-muted-foreground">新建时克隆所选现有助理的模型、渠道、技能与 MCP 配置；可单独定制系统提示词。模型选择始终使用 Veloce Lab 已有助理/上游模型设置。</p></div><div className="grid gap-3 md:grid-cols-3"><label className="grid gap-1.5 text-sm"><span className="font-medium">基于现有助理</span><Select value={String((baseAgentID) || "__empty__")} onValueChange={(value) => setBaseAgentID((value === "__empty__" ? "" : value))}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="__empty__">选择助理</SelectItem>{agents.map((agent) => <SelectItem key={agent.id} value={agent.id} disabled={!agent.default_model}>{agent.name}{agent.default_model ? ` · ${agent.default_model}` : " · 未配置模型"}</SelectItem>)}</SelectContent></Select></label><label className="grid gap-1.5 text-sm"><span className="font-medium">人格名称</span><Input value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="例如：小葵" /></label><label className="grid gap-1.5 text-sm"><span className="font-medium">默认人格</span><Select value={String((draft.default_persona_id || "") || "__empty__")} onValueChange={(value) => update("default_persona_id", (value === "__empty__" ? "" : value))}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="__empty__">未选择</SelectItem>{selectedPersonas.map((persona) => <SelectItem key={persona.id} value={persona.id}>{persona.name}</SelectItem>)}</SelectContent></Select></label></div><label className="grid gap-1.5 text-sm"><span className="font-medium">人格设定（可选，留空继承所选助理提示词）</span><Textarea className="min-h-24" value={newPrompt} onChange={(event) => setNewPrompt(event.target.value)} placeholder={selectedAgent?.prompt || "描述陪伴人格、语气、背景和边界"} /></label><Button variant="default" disabled={!newName.trim() || !baseAgentID || busy} onClick={() => void addPersona()}><Plus size={15} />创建陪伴人格</Button><div className="grid gap-2 md:grid-cols-2">{selectedPersonas.map((persona) => <article key={persona.id} className="flex items-center justify-between gap-3 rounded-md border p-3"><div className="min-w-0"><div className="font-medium">{persona.name}{draft.default_persona_id === persona.id ? <span className="ml-2 text-xs text-primary">默认</span> : null}</div><div className="truncate text-xs text-muted-foreground">关联助理 {persona.assistant_agent_id}</div></div><Button variant="destructive" size="icon" disabled={busy} onClick={() => void removePersona(persona)} title="删除人格" aria-label="删除人格"><Trash2 size={16} /></Button></article>)}</div></section>
        <section className="space-y-4 rounded-lg border p-4"><div><h2 className="font-semibold">使用过滤器</h2><p className="mt-1 text-sm text-muted-foreground">允许列表为空时不限制；拒绝列表优先。群人格映射接受 JSON 对象：群号对应人格 ID。</p></div><div className="grid gap-3 md:grid-cols-2">{filters("allowed_user_ids_text")}{filters("blocked_user_ids_text")}{filters("allowed_group_ids_text")}{filters("blocked_group_ids_text")}</div><label className="grid gap-1.5 text-sm"><span className="font-medium">指定群使用不同人格（JSON）</span><Textarea className="min-h-20 font-mono text-xs" value={draft.group_personas_text ?? draft.group_personas ?? "{}"} onChange={(event) => update("group_personas_text", event.target.value)} placeholder={'{"群号":"人格 ID"}'} /></label></section>
        <section className="space-y-4 rounded-lg border p-4"><div><h2 className="font-semibold">聊天与媒体行为</h2><p className="mt-1 text-sm text-muted-foreground">分群/私聊会话可独立保留上下文；memory 模块会按关联助理自动注入并提供记忆读写工具。</p></div><div className="grid gap-3 md:grid-cols-3"><label className="grid gap-1.5 text-sm"><span className="font-medium">会话范围</span><Select value={draft.session_mode} onValueChange={(value) => update("session_mode", value)}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="per_chat">群聊各自独立；私聊按用户独立</SelectItem><SelectItem value="unified">该人格的群聊与私聊统一会话</SelectItem></SelectContent></Select></label><label className="grid gap-1.5 text-sm"><span className="font-medium">新消息打断方式</span><Select value={draft.interrupt_mode} onValueChange={(value) => update("interrupt_mode", value)}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="stop">中止当前回答并处理新消息</SelectItem><SelectItem value="queue">排队处理</SelectItem><SelectItem value="ignore">忙碌时忽略新消息</SelectItem></SelectContent></Select></label><label className="grid gap-1.5 text-sm"><span className="font-medium">多条输出上限</span><Input type="number" min={1} max={10} value={draft.max_messages} onChange={(event) => update("max_messages", Number(event.target.value))} /></label><label className="grid gap-1.5 text-sm"><span className="font-medium">模拟打字间隔（毫秒）</span><Input type="number" min={0} max={10000} value={draft.typing_delay_ms} onChange={(event) => update("typing_delay_ms", Number(event.target.value))} /></label></div><div className="flex flex-wrap gap-x-5 gap-y-2">{check("允许图片输入（保存为高级聊天附件并传给模型）", "allow_image_input")}{check("允许图片输出 / 输出已保存表情包", "allow_image_output")}{check("允许一次回答拆成多条消息（用单独一行 --- 分隔）", "multiple_messages")}</div></section>
        <section className="space-y-4 rounded-lg border p-4"><div className="flex items-center gap-2"><Image size={18} /><div><h2 className="font-semibold">表情包收藏与分类</h2><p className="mt-1 text-sm text-muted-foreground">每张表情包都有自己的名称，同一分类内名称需唯一。AI 会先按分类与名称精确查找，再使用 [[sticker:分类/名称]] 发送；收到的图片会进入 inbox，AI 可命名、分类并保存。</p></div></div>{stickers.length ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{stickers.map((sticker) => <article key={sticker.id} className="overflow-hidden rounded-md border"><img src={sticker.image_url} alt={sticker.name || sticker.description || sticker.category} className="h-36 w-full object-cover" loading="lazy" /><div className="space-y-2 p-3"><Input aria-label="表情包分类" value={sticker.category} onChange={(event) => setStickers((rows) => rows.map((item) => item.id === sticker.id ? { ...item, category: event.target.value } : item))} placeholder="分类" /><Input aria-label="表情包名称" value={sticker.name || ""} onChange={(event) => setStickers((rows) => rows.map((item) => item.id === sticker.id ? { ...item, name: event.target.value } : item))} placeholder={sticker.category === "inbox" ? "给这张表情包取名" : "名称"} /><p className="text-xs text-muted-foreground">{sticker.description || (sticker.category === "inbox" ? "待 AI 分类" : "尚无说明")}</p><div className="flex justify-end gap-2"><Button variant="outline" size="sm" disabled={busy} onClick={() => void updateSticker(sticker)}>保存分类与名称</Button><Button variant="destructive" size="icon" disabled={busy} onClick={() => void deleteSticker(sticker)} title="删除" aria-label="删除"><Trash2 size={15} /></Button></div></div></article>)}</div> : <p className="rounded border border-dashed p-6 text-center text-sm text-muted-foreground">还没有收到表情包图片。</p>}</section>
        <footer className="sticky bottom-3 flex flex-wrap items-center gap-2 rounded-lg border bg-background/95 p-3 shadow-sm backdrop-blur"><Button disabled={busy} onClick={() => void save()} variant="default"><Save size={15} />{busy ? "处理中…" : "保存设置"}</Button><Button asChild variant="outline"><Link to={`/chat/companions/${selected.id}/logs`}>查看日志</Link></Button>{selected.provider !== "qq_official" ? <Button onClick={() => void copy(`${window.location.origin}${selected.webhook_url}`)} variant="outline"><Copy size={15} />复制 Webhook</Button> : <span className="text-xs text-muted-foreground">QQ Gateway 在凭据保存后自动连接</span>}<Button disabled={busy} onClick={() => void removeIntegration()} variant="destructive" className="ml-auto"><Trash2 size={15} />删除接入</Button></footer>
      </>}
    </>}
  </div>;
}
