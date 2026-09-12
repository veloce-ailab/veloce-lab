import type { ReactNode } from "react"
import { useEffect, useState } from "react"
import { Globe2, Info, KeyRound, Save, ShieldCheck } from "lucide-react"
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Input,
  Switch,
  api,
  useMutation,
  useQuery,
  useQueryClient,
  useToast,
} from "@velocelab/dashboard/frontend"

export type SystemSettingsSection = "proxy" | "about"

interface SystemSettings {
  /** Kept in the round-trip payload: the message-channel toggle lives on the chat settings page. */
  message_channel_enabled: boolean
  http_proxy: string
  backend_version?: string
}

const defaults: SystemSettings = {
  message_channel_enabled: true,
  http_proxy: "",
}

/**
 * Upstream proxy and build information. This page is owned by the settings
 * plugin: the proxy applies to every model upstream request, so it is a
 * platform-wide setting rather than a capability of another package.
 */
export default function SystemSettings({ section = "proxy" }: { section?: SystemSettingsSection }) {
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

  const page = section === "about"
    ? { title: "软件信息", description: "查看当前服务端和桌面端构建版本。" }
    : { title: "网络代理", description: "配置群组和模型上游请求使用的网络代理。" }
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">{page.title}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{page.description}</p>
        </div>
        <div className="flex gap-2">
          <Button className="gap-2" disabled={save.isPending || settings.isLoading} onClick={() => save.mutate()}><Save size={16} />保存更改</Button>
        </div>
      </div>

      {section === "proxy" && <>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Globe2 size={18} />网络代理</CardTitle>
            <CardDescription>所有模型上游请求使用的全局代理。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1">
            <SettingsRow title="启用代理" description="开启后通过代理服务器访问外部网络"><Switch checked={proxyEnabled} onCheckedChange={setProxyEnabled} aria-label="启用代理" /></SettingsRow>
            <div className="flex flex-col gap-4 border-b py-3 last:border-b-0">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div><div className="text-sm font-medium">代理类型</div><div className="mt-0.5 text-xs text-muted-foreground">选择代理服务器支持的协议。</div></div>
                <div className="flex rounded-md border p-1">
                  {(["http", "https", "socks5"] as const).map((type) => <button type="button" key={type} onClick={() => setProxyType(type)} className={`px-3 py-1.5 text-xs font-medium transition-colors ${proxyType === type ? "rounded bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>{type.toUpperCase()}</button>)}
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-[1fr_180px]">
                <Field label="服务器地址" hint="例如 127.0.0.1"><Input value={proxyHost} disabled={!proxyEnabled} onChange={(event) => setProxyHost(event.target.value)} placeholder="127.0.0.1" /></Field>
                <Field label="端口" hint="1 - 65535"><Input type="number" min={1} max={65535} value={proxyPort} disabled={!proxyEnabled} onChange={(event) => setProxyPort(event.target.value)} placeholder="7890" /></Field>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><KeyRound size={18} />代理认证</CardTitle>
            <CardDescription>代理服务器需要账号密码时填写。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1">
            <SettingsRow title="需要认证" description="使用代理用户名和密码建立连接"><Switch checked={proxyAuthEnabled} disabled={!proxyEnabled} onCheckedChange={setProxyAuthEnabled} aria-label="需要认证" /></SettingsRow>
            {proxyAuthEnabled && <div className="grid gap-4 border-b py-3 last:border-b-0 sm:grid-cols-2"><Field label="用户名"><Input value={proxyUsername} disabled={!proxyEnabled} onChange={(event) => setProxyUsername(event.target.value)} /></Field><Field label="密码"><Input type="password" value={proxyPassword} disabled={!proxyEnabled} onChange={(event) => setProxyPassword(event.target.value)} /></Field></div>}
          </CardContent>
          <CardFooter className="gap-3 border-t text-xs text-muted-foreground"><Info size={17} className="shrink-0" /><span>代理配置保存后立即对新的上游请求生效。修改后如仍无法连接，请检查地址、端口和代理协议。</span></CardFooter>
        </Card>
      </>}

      {section === "about" &&
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><ShieldCheck size={18} />软件信息</CardTitle>
            <CardDescription>当前服务端和桌面端构建版本。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1">
            <SettingsRow title="后端版本" description="服务端 API 构建版本"><span className="font-mono text-sm">{form.backend_version || "dev"}</span></SettingsRow>
            <SettingsRow title="Desktop 前端版本" description="Electron 应用内置 Web 前端版本"><span className="font-mono text-sm">{import.meta.env.VITE_APP_VERSION || "0.1.0"}</span></SettingsRow>
            <SettingsRow title="站点名称" description="产品名称固定为 Veloce"><span className="text-sm text-muted-foreground">Veloce</span></SettingsRow>
          </CardContent>
        </Card>}
    </div>
  )
}

function buildProxyURL(input: { proxyType: string; proxyHost: string; proxyPort: string; proxyAuthEnabled: boolean; proxyUsername: string; proxyPassword: string }) {
  const auth = input.proxyAuthEnabled && input.proxyUsername ? `${encodeURIComponent(input.proxyUsername)}:${encodeURIComponent(input.proxyPassword)}@` : ""
  return `${input.proxyType}://${auth}${input.proxyHost.trim()}:${input.proxyPort.trim()}`
}

function SettingsRow({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return <div className="flex min-h-16 items-center gap-3 border-b py-3 last:border-b-0"><div className="min-w-0 flex-1"><div className="text-sm font-medium">{title}</div><div className="mt-0.5 text-xs text-muted-foreground">{description}</div></div><div className="shrink-0">{children}</div></div>
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return <label className="space-y-1.5"><span className="block text-sm font-medium">{label}</span>{children}{hint && <span className="block text-xs text-muted-foreground">{hint}</span>}</label>
}

function apiError(cause: unknown) {
  const value = cause as { response?: { data?: { error?: string } }; message?: string }
  return value.response?.data?.error || value.message || "保存失败"
}
