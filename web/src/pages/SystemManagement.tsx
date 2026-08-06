import { useEffect, useState } from "react"
import type { ReactNode } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Bot, ChevronDown, Globe2, HardDrive, Info, KeyRound, Paperclip, Save, Server, ShieldCheck, SlidersHorizontal, Wifi } from "lucide-react"
import AdvancedChatManagement from "./AdvancedChatManagement"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useToast } from "@/components/ui/toast"
import api from "@/lib/api"

type SystemSection = "general" | "advancedChat"

interface SystemSettings {
  message_channel_enabled: boolean
  http_proxy: string
  backend_version?: string
}

const defaults: SystemSettings = {
  message_channel_enabled: true,
  http_proxy: "",
}

export default function SystemManagement({ section = "general" }: { section?: SystemSection }) {
  if (section === "advancedChat") {
    return <AdvancedChatSettings />
  }
  return <GeneralSettings />
}

function GeneralSettings() {
  const queryClient = useQueryClient()
  const { success, error } = useToast()
  const [form, setForm] = useState<SystemSettings>(defaults)
  const [proxyEnabled, setProxyEnabled] = useState(false)
  const [proxyType, setProxyType] = useState<"http" | "https" | "socks5">("http")
  const [proxyHost, setProxyHost] = useState("127.0.0.1")
  const [proxyPort, setProxyPort] = useState("7890")
  const [proxyAuthEnabled, setProxyAuthEnabled] = useState(false)
  const [proxyUsername, setProxyUsername] = useState("")
  const [proxyPassword, setProxyPassword] = useState("")
  const settings = useQuery<SystemSettings>({
    queryKey: ["system-settings"],
    queryFn: async () => (await api.get("/settings")).data,
  })

  useEffect(() => {
    if (settings.data) {
      setForm({ ...defaults, ...settings.data })
      const raw = settings.data.http_proxy?.trim() || ""
      if (raw) {
        try {
          const parsed = new URL(raw)
          setProxyEnabled(true)
          setProxyType((parsed.protocol.replace(":", "") as "http" | "https" | "socks5") || "http")
          setProxyHost(parsed.hostname || "127.0.0.1")
          setProxyPort(parsed.port || "7890")
          setProxyAuthEnabled(Boolean(parsed.username || parsed.password))
          setProxyUsername(decodeURIComponent(parsed.username))
          setProxyPassword(decodeURIComponent(parsed.password))
        } catch {
          setProxyEnabled(true)
          setProxyHost(raw)
        }
      }
    }
  }, [settings.data])

  const save = useMutation({
    mutationFn: async () => api.put("/settings", { ...form, http_proxy: proxyEnabled ? buildProxyURL({ proxyType, proxyHost, proxyPort, proxyAuthEnabled, proxyUsername, proxyPassword }) : "" }),
    onSuccess: () => {
      success("系统设置已保存")
      queryClient.invalidateQueries({ queryKey: ["system-settings"] })
      queryClient.invalidateQueries({ queryKey: ["public-settings"] })
    },
    onError: (cause: unknown) => error(apiError(cause)),
  })

  return (
    <div className="mx-auto max-w-5xl space-y-7 pb-10">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b pb-6">
        <div><div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground"><SlidersHorizontal size={14} />系统 / 设置</div><h1 className="text-3xl font-semibold tracking-tight">系统设置</h1><p className="mt-2 text-sm text-muted-foreground">管理网络、消息通道、存储与运行环境。</p></div>
        <Button className="gap-2" disabled={save.isPending || settings.isLoading} onClick={() => save.mutate()}><Save size={16} />保存更改</Button>
      </div>

      <SettingGroup icon={<Globe2 size={18} />} title="网络代理" description="所有模型上游请求使用的全局代理。">
        <SettingRow title="启用代理" description="开启后通过代理服务器访问外部网络"><Switch checked={proxyEnabled} onCheckedChange={setProxyEnabled} /></SettingRow>
        <div className="space-y-5 border-t px-5 py-5">
          <div className="flex flex-wrap items-center justify-between gap-3"><div><div className="text-sm font-medium">代理类型</div><p className="mt-1 text-xs text-muted-foreground">选择代理服务器支持的协议。</p></div><div className="flex rounded-md border p-1">{(["http", "https", "socks5"] as const).map((type) => <button type="button" key={type} onClick={() => setProxyType(type)} className={`px-3 py-1.5 text-xs font-medium transition-colors ${proxyType === type ? "rounded bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>{type.toUpperCase()}</button>)}</div></div>
          <div className="grid gap-4 sm:grid-cols-[1fr_180px]"><Field label="服务器地址" hint="例如 127.0.0.1"><Input value={proxyHost} disabled={!proxyEnabled} onChange={(event) => setProxyHost(event.target.value)} placeholder="127.0.0.1" /></Field><Field label="端口" hint="1 - 65535"><Input type="number" min={1} max={65535} value={proxyPort} disabled={!proxyEnabled} onChange={(event) => setProxyPort(event.target.value)} placeholder="7890" /></Field></div>
        </div>
      </SettingGroup>

      <SettingGroup icon={<KeyRound size={18} />} title="代理认证" description="代理服务器需要账号密码时填写。">
        <SettingRow title="需要认证" description="使用代理用户名和密码建立连接"><Switch checked={proxyAuthEnabled} disabled={!proxyEnabled} onCheckedChange={setProxyAuthEnabled} /></SettingRow>
        {proxyAuthEnabled && <div className="grid gap-4 border-t px-5 py-5 sm:grid-cols-2"><Field label="用户名"><Input value={proxyUsername} disabled={!proxyEnabled} onChange={(event) => setProxyUsername(event.target.value)} /></Field><Field label="密码"><Input type="password" value={proxyPassword} disabled={!proxyEnabled} onChange={(event) => setProxyPassword(event.target.value)} /></Field></div>}
      </SettingGroup>

      <SettingGroup icon={<Wifi size={18} />} title="消息通道" description="控制外部消息通道和群组消息的处理能力.">
        <SettingRow title="启用消息通道" description="允许通过已配置的消息平台收发消息"><Switch checked={form.message_channel_enabled} onCheckedChange={(checked) => setForm({ ...form, message_channel_enabled: checked })} /></SettingRow>
      </SettingGroup>

      <SettingGroup icon={<HardDrive size={18} />} title="数据与存储" description="运行日志、Token 记录和会话数据的保存策略。">
        <SettingRow title="Token 使用记录" description="用于统计页面的用量与费用图表"><span className="text-sm text-emerald-600">已启用</span></SettingRow>
        <SettingRow title="记忆模块" description="聊天记忆和助理上下文由系统统一管理"><span className="text-sm text-emerald-600">正常</span></SettingRow>
      </SettingGroup>

      <SettingGroup icon={<ShieldCheck size={18} />} title="软件信息" description="当前服务端和桌面端构建版本。">
        <SettingRow title="后端版本" description="服务端 API 构建版本"><span className="font-mono text-sm">{form.backend_version || "dev"}</span></SettingRow>
        <SettingRow title="Desktop 前端版本" description="Electron 应用内置 Web 前端版本"><span className="font-mono text-sm">{import.meta.env.VITE_APP_VERSION || "0.1.0"}</span></SettingRow>
        <SettingRow title="站点名称" description="产品名称固定为 Veloce"><span className="text-sm text-muted-foreground">Veloce</span></SettingRow>
      </SettingGroup>

      <div className="flex items-start gap-3 rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground"><Info size={17} className="mt-0.5 shrink-0" /><p>代理配置保存后立即对新的上游请求生效。修改后如仍无法连接，请检查地址、端口和代理协议。</p></div>
    </div>
  )
}

function buildProxyURL(input: { proxyType: string; proxyHost: string; proxyPort: string; proxyAuthEnabled: boolean; proxyUsername: string; proxyPassword: string }) {
  const auth = input.proxyAuthEnabled && input.proxyUsername ? `${encodeURIComponent(input.proxyUsername)}:${encodeURIComponent(input.proxyPassword)}@` : ""
  return `${input.proxyType}://${auth}${input.proxyHost.trim()}:${input.proxyPort.trim()}`
}

function SettingGroup({ icon, title, description, children }: { icon: ReactNode; title: string; description: string; children: ReactNode }) {
  return <details open className="group overflow-hidden rounded-lg border bg-card shadow-sm"><summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-4 [&::-webkit-details-marker]:hidden"><span className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">{icon}</span><span className="min-w-0 flex-1"><span className="block font-semibold">{title}</span><span className="mt-0.5 block text-xs text-muted-foreground">{description}</span></span><ChevronDown size={17} className="text-muted-foreground transition-transform group-open:rotate-180" /></summary><div className="border-t">{children}</div></details>
}

function SettingRow({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return <div className="flex min-h-[72px] items-center justify-between gap-5 px-5 py-4"><div className="min-w-0"><div className="text-sm font-medium">{title}</div><p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p></div><div className="shrink-0">{children}</div></div>
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return <label className="space-y-1.5"><span className="block text-sm font-medium">{label}</span>{children}{hint && <span className="block text-xs text-muted-foreground">{hint}</span>}</label>
}

function AdvancedChatSettings() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">高级聊天设置</h1>
        <p className="mt-1 text-sm text-muted-foreground">管理聊天助理、附件处理和 MCP 工具。</p>
      </div>
      <Tabs defaultValue="assistant">
        <TabsList>
          <TabsTrigger value="assistant"><Bot size={15} />助理</TabsTrigger>
          <TabsTrigger value="attachments"><Paperclip size={15} />附件</TabsTrigger>
          <TabsTrigger value="mcp"><Server size={15} />MCP</TabsTrigger>
        </TabsList>
        <TabsContent value="assistant"><AdvancedChatManagement mode="assistant" /></TabsContent>
        <TabsContent value="attachments"><AdvancedChatManagement mode="attachments" /></TabsContent>
        <TabsContent value="mcp"><AdvancedChatManagement mode="mcp" /></TabsContent>
      </Tabs>
    </div>
  )
}

function apiError(cause: unknown) {
  const value = cause as { response?: { data?: { error?: string } }; message?: string }
  return value.response?.data?.error || value.message || "保存失败"
}
