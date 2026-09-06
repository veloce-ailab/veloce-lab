import { useQuery, useQueryClient } from "@tanstack/react-query"
import { ArrowLeft, Bot, Plus, Save, Trash2 } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { Link, useParams } from "react-router-dom"
import api from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { useToast } from "@/components/ui/toast"

interface UserChannel { id: number; name: string; models: string[] }
interface PresetMessage { role: "system" | "user" | "assistant"; content: string }
interface Agent { id: string; name: string; prompt: string; default_model: string; user_channel_id?: number; stream: boolean; skill_ids: string[]; mcp_server_ids: string[]; knowledge_base_ids: string[]; preset_messages: PresetMessage[] }
interface Capability { id: string; name: string; description?: string }

const defaultAgentID = "default"

export default function AgentEditor() {
  const { id = "" } = useParams()
  const queryClient = useQueryClient()
  const { error, success } = useToast()
  const [name, setName] = useState("")
  const [prompt, setPrompt] = useState("")
  const [defaultModel, setDefaultModel] = useState("")
  const [channelID, setChannelID] = useState(0)
  const [stream, setStream] = useState(false)
  const [skillIDs, setSkillIDs] = useState<string[]>([])
  const [mcpIDs, setMcpIDs] = useState<string[]>([])
  const [knowledgeIDs, setKnowledgeIDs] = useState<string[]>([])
  const [presetMessages, setPresetMessages] = useState<PresetMessage[]>([])
  const [saving, setSaving] = useState(false)

  const agentsQuery = useQuery<Agent[]>({ queryKey: ["advanced-chat-agents", "full"], queryFn: async () => normalizeAgents((await api.get("/user/advanced-chat/agents")).data) })
  const { data: channels = [] } = useQuery<UserChannel[]>({ queryKey: ["catalog"], queryFn: async () => normalizeChannels((await api.get("/user/catalog")).data) })
  const { data: skills = [] } = useQuery<Capability[]>({ queryKey: ["advanced-chat-skills"], queryFn: async () => normalizeCapabilities((await api.get("/user/advanced-chat/skills")).data) })
  const { data: knowledgeBases = [] } = useQuery<Capability[]>({ queryKey: ["knowledge-bases"], queryFn: async () => normalizeKnowledgeBases((await api.get("/user/advanced-chat/knowledge-bases")).data) })
  const { data: mcpServers = [] } = useQuery<Capability[]>({ queryKey: ["advanced-chat-agent-mcp-servers"], queryFn: async () => normalizeMCPServers((await api.get("/user/advanced-chat/settings")).data) })
  const agent = useMemo(() => (agentsQuery.data || []).find((item) => item.id === id), [agentsQuery.data, id])
  const models = useMemo(() => channelID ? channels.find((channel) => channel.id === channelID)?.models || [] : Array.from(new Set(channels.flatMap((channel) => channel.models))).sort(), [channelID, channels])

  useEffect(() => {
    if (!agent) return
    setName(agent.name)
    setPrompt(agent.prompt)
    setDefaultModel(agent.default_model)
    setChannelID(agent.user_channel_id || 0)
    setStream(agent.stream)
    setSkillIDs(agent.skill_ids)
    setMcpIDs(agent.mcp_server_ids)
    setKnowledgeIDs(agent.knowledge_base_ids)
    setPresetMessages(Array.isArray(agent.preset_messages) ? agent.preset_messages : [])
  }, [agent])

  const save = async () => {
    if (!agent || !name.trim()) return
    setSaving(true)
    try {
      await api.put(`/user/advanced-chat/agents/${encodeURIComponent(agent.id)}`, {
        name: name.trim(), prompt: prompt.trim(), default_model: defaultModel.trim(), user_channel_id: channelID, stream,
        skill_ids: skillIDs, mcp_server_ids: mcpIDs, knowledge_base_ids: knowledgeIDs,
        preset_messages: presetMessages.map((message) => ({ role: message.role, content: message.content.trim() })).filter((message) => message.content),
      })
      await queryClient.invalidateQueries({ queryKey: ["advanced-chat-agents"] })
      success("助理已保存")
    } catch (err) {
      error(apiErrorMessage(err, "保存助理失败"))
    } finally {
      setSaving(false)
    }
  }

  if (agentsQuery.isLoading) return <div className="text-sm text-muted-foreground">正在加载助理...</div>
  if (!agent) return <div className="space-y-4"><Button asChild variant="ghost" className="gap-2"><Link to="/chat/agents"><ArrowLeft size={16} />返回助理</Link></Button><Card><CardContent className="py-10 text-center text-sm text-muted-foreground">未找到该助理。</CardContent></Card></div>

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><Button asChild variant="ghost" className="w-fit gap-2"><Link to="/chat/agents"><ArrowLeft size={16} />返回助理</Link></Button><Button className="gap-2" disabled={saving || !name.trim()} onClick={save}><Save size={16} />{saving ? "正在保存" : "保存"}</Button></div>
      <div><h1 className="text-2xl font-semibold">编辑助理</h1><p className="mt-1 text-sm text-muted-foreground">配置助理身份、能力与每次会话前使用的预设对话。</p></div>

      <Card><CardHeader><CardTitle>基本信息</CardTitle></CardHeader><CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="名称"><Input value={name} disabled={agent.id === defaultAgentID} onChange={(event) => setName(event.target.value)} /></Field>
          <Field label="渠道"><Select value={channelID ? String(channelID) : "none"} onValueChange={(value) => { const next = value === "none" ? 0 : Number(value); setChannelID(next); if (defaultModel && !(next ? channels.find((channel) => channel.id === next)?.models || [] : models).includes(defaultModel)) setDefaultModel("") }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">未指定渠道</SelectItem>{channels.map((channel) => <SelectItem key={channel.id} value={String(channel.id)}>{channel.name}</SelectItem>)}</SelectContent></Select></Field>
          <Field label="默认模型"><Select value={defaultModel || "none"} onValueChange={(value) => setDefaultModel(value === "none" ? "" : value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">未指定模型</SelectItem>{models.map((model) => <SelectItem key={model} value={model}>{model}</SelectItem>)}</SelectContent></Select></Field>
        </div>
        <label className="flex items-center gap-2 text-sm"><Switch checked={stream} onCheckedChange={setStream} /><span>流式输出</span></label>
        <Field label="系统提示词"><textarea className="min-h-64 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" value={prompt} onChange={(event) => setPrompt(event.target.value)} /></Field>
      </CardContent></Card>

      <Card><CardHeader><CardTitle>预设对话</CardTitle><CardDescription>这些消息会在系统提示词之后、用户实际对话之前发送，不会保存到用户的会话记录。</CardDescription></CardHeader><CardContent className="space-y-3">
        {presetMessages.map((message, index) => <div key={index} className="space-y-3 rounded-md border p-4"><div className="flex items-center justify-between gap-3"><Select value={message.role} onValueChange={(role: PresetMessage["role"]) => setPresetMessages((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, role } : item))}><SelectTrigger className="w-36"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="system">system</SelectItem><SelectItem value="user">user</SelectItem><SelectItem value="assistant">assistant</SelectItem></SelectContent></Select><Button variant="ghost" size="icon" onClick={() => setPresetMessages((items) => items.filter((_, itemIndex) => itemIndex !== index))} title="删除预设消息"><Trash2 size={16} /></Button></div><textarea className="min-h-28 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" value={message.content} placeholder="消息内容" onChange={(event) => setPresetMessages((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, content: event.target.value } : item))} /></div>)}
        <Button variant="outline" className="gap-2" disabled={presetMessages.length >= 24} onClick={() => setPresetMessages((items) => [...items, { role: "user", content: "" }])}><Plus size={16} />添加消息</Button>
      </CardContent></Card>

      <CapabilityCard title="技能" items={skills} selected={skillIDs} onChange={setSkillIDs} icon={<Bot size={16} />} />
      <CapabilityCard title="知识库" items={knowledgeBases} selected={knowledgeIDs} onChange={setKnowledgeIDs} icon={<Bot size={16} />} />
      <CapabilityCard title="MCP 服务器" items={mcpServers} selected={mcpIDs} onChange={setMcpIDs} icon={<Bot size={16} />} />
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="space-y-1 text-sm"><span className="font-medium">{label}</span>{children}</label> }

function CapabilityCard({ title, items, selected, onChange, icon }: { title: string; items: Capability[]; selected: string[]; onChange: (values: string[]) => void; icon: React.ReactNode }) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const selectedItems = items.filter((item) => selected.includes(item.id))
  const availableItems = items.filter((item) => !selected.includes(item.id))
  return <Card><CardHeader><CardTitle className="flex items-center gap-2">{icon}{title}</CardTitle></CardHeader><CardContent className="space-y-3">
    {selectedItems.length === 0 ? <p className="text-sm text-muted-foreground">尚未添加任何项目。</p> : <div className="space-y-2">{selectedItems.map((item) => <div key={item.id} className="flex items-start justify-between gap-3 rounded-md border p-3"><span className="min-w-0"><span className="block text-sm font-medium">{item.name}</span>{item.description && <span className="mt-1 block text-xs text-muted-foreground">{item.description}</span>}</span><Button variant="ghost" size="icon" title="移除" onClick={() => onChange(selected.filter((id) => id !== item.id))}><Trash2 size={16} /></Button></div>)}</div>}
    <Button variant="outline" className="gap-2" onClick={() => setPickerOpen(true)}><Plus size={16} />添加{title}</Button>
    <Dialog open={pickerOpen} onOpenChange={setPickerOpen}><DialogContent className="max-h-[75vh] max-w-lg overflow-y-auto"><DialogHeader><DialogTitle>添加{title}</DialogTitle></DialogHeader>{availableItems.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">没有可添加的项目。</p> : <div className="space-y-2">{availableItems.map((item) => <button key={item.id} type="button" className="flex w-full items-start justify-between gap-3 rounded-md border p-3 text-left transition-colors hover:bg-muted" onClick={() => onChange([...selected, item.id])}><span className="min-w-0"><span className="block text-sm font-medium">{item.name}</span>{item.description && <span className="mt-1 block text-xs text-muted-foreground">{item.description}</span>}</span><Plus size={16} className="mt-0.5 shrink-0 text-muted-foreground" /></button>)}</div>}</DialogContent></Dialog>
  </CardContent></Card>
}

function normalizeAgents(value: unknown): Agent[] { return Array.isArray(value) ? value.map(normalizeAgent).filter((agent): agent is Agent => Boolean(agent)) : [] }
function normalizeAgent(value: unknown): Agent | null { if (!isRecord(value) || !text(value.id)) return null; return { id: text(value.id), name: text(value.name), prompt: text(value.prompt), default_model: text(value.default_model), user_channel_id: Number(value.user_channel_id) || undefined, stream: value.stream === true, skill_ids: texts(value.skill_ids), mcp_server_ids: texts(value.mcp_server_ids), knowledge_base_ids: texts(value.knowledge_base_ids), preset_messages: Array.isArray(value.preset_messages) ? value.preset_messages.map(normalizePreset).filter((item): item is PresetMessage => Boolean(item)) : [] } }
function normalizePreset(value: unknown): PresetMessage | null { if (!isRecord(value) || !["system", "user", "assistant"].includes(text(value.role))) return null; return { role: text(value.role) as PresetMessage["role"], content: text(value.content) } }
function normalizeChannels(value: unknown): UserChannel[] { return Array.isArray(value) ? value.filter(isRecord).map((item) => ({ id: Number(item.id) || 0, name: text(item.name), models: texts(item.models) })).filter((item) => item.id > 0) : [] }
function normalizeCapabilities(value: unknown): Capability[] { return Array.isArray(value) ? value.filter(isRecord).map((item) => ({ id: text(item.id), name: text(item.name), description: text(item.description) })).filter((item) => item.id) : [] }
function normalizeKnowledgeBases(value: unknown): Capability[] { return isRecord(value) && Array.isArray(value.knowledge_bases) ? normalizeCapabilities(value.knowledge_bases).filter((item) => { const base = (value.knowledge_bases as unknown[]).find((entry) => isRecord(entry) && text(entry.id) === item.id); return !isRecord(base) || base.vectorized === true }) : [] }
function normalizeMCPServers(value: unknown): Capability[] { if (!isRecord(value)) return []; const servers = Array.isArray(value.mcp_servers) ? value.mcp_servers : [...(Array.isArray(value.builtin_mcp_servers) ? value.builtin_mcp_servers : []), ...(Array.isArray(value.custom_mcp_servers) ? value.custom_mcp_servers : [])]; return normalizeCapabilities(servers) }
function text(value: unknown) { return typeof value === "string" ? value : typeof value === "number" ? String(value) : "" }
function texts(value: unknown) { return Array.isArray(value) ? value.map(text).filter(Boolean) : [] }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null }
function apiErrorMessage(error: unknown, fallback: string) { if (isRecord(error) && isRecord(error.response) && isRecord(error.response.data)) return text(error.response.data.error) || text(error.response.data.message) || fallback; return error instanceof Error ? error.message : fallback }
