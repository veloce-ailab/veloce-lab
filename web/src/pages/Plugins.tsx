import { useEffect, useRef, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Link } from "react-router-dom"
import { Download, ExternalLink, PackageOpen, Power, RefreshCw, Settings, Store, Trash2, Upload } from "lucide-react"
import api from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useToast } from "@/components/ui/toast"
import { useI18n } from "@/lib/i18n"

interface PluginHook {
  point: string
  mode: string
  action?: string
  priority?: number
}

interface PluginItem {
  id: string
  name: string
  version: string
  description: string
  author: string
  github?: string
  enabled: boolean
  permissions: string[]
  hooks: PluginHook[]
  frontend?: unknown
  last_error?: string
}

interface PluginListResponse {
  plugins?: unknown[]
}

interface PluginUpdateStatus {
  id: string
  current_version: string
  latest_version?: string
  update_available: boolean
  error?: string
}

interface PluginUpdateProgress {
  plugin_id: string
  current_version?: string
  latest_version?: string
  in_progress: boolean
  phase: string
  progress: number
  downloaded_bytes?: number
  total_bytes?: number
  error?: string
}

const pluginsQueryKey = ["plugins"] as const

export default function Plugins() {
  const queryClient = useQueryClient()
  const { t } = useI18n()
  const { success, error } = useToast()
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const { data: plugins = [], isFetching } = useQuery<PluginItem[]>({
    queryKey: pluginsQueryKey,
    queryFn: async () => {
      const res = await api.get<PluginListResponse>("/user/plugins")
      return Array.isArray(res.data?.plugins) ? res.data.plugins.map(normalizePlugin).filter((item): item is PluginItem => Boolean(item)) : []
    },
  })
  const [updates, setUpdates] = useState<Record<string, PluginUpdateStatus>>({})
  const [updateProgress, setUpdateProgress] = useState<Record<string, PluginUpdateProgress>>({})

  const uploadPlugin = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData()
      form.append("file", file)
      await api.post("/user/plugins", form, { headers: { "Content-Type": "multipart/form-data" } })
    },
    onSuccess: async () => {
      success("插件已上传")
      await queryClient.invalidateQueries({ queryKey: pluginsQueryKey })
      if (fileInputRef.current) fileInputRef.current.value = ""
    },
    onError: (err) => error(apiErrorMessage(err, "插件上传失败")),
  })

  const togglePlugin = useMutation({
    mutationFn: async (plugin: PluginItem) => {
      await api.post(`/user/plugins/${encodeURIComponent(plugin.id)}/${plugin.enabled ? "disable" : "enable"}`)
    },
    onSuccess: async () => {
      success("插件状态已更新")
      await queryClient.invalidateQueries({ queryKey: pluginsQueryKey })
    },
    onError: (err) => error(apiErrorMessage(err, "插件状态更新失败")),
  })

  const uninstallPlugin = useMutation({
    mutationFn: async (plugin: PluginItem) => api.delete(`/user/plugins/${encodeURIComponent(plugin.id)}`),
    onSuccess: async () => {
      success("插件已卸载")
      await queryClient.invalidateQueries({ queryKey: pluginsQueryKey })
    },
    onError: (err) => error(apiErrorMessage(err, "插件卸载失败")),
  })
  const checkUpdates = useMutation({
    mutationFn: async () => (await api.get<{ items?: PluginUpdateStatus[] }>("/user/plugins/updates")).data,
    onSuccess: (data) => {
      const next: Record<string, PluginUpdateStatus> = {}
      for (const item of Array.isArray(data.items) ? data.items : []) next[item.id] = item
      setUpdates(next)
      success("插件更新检查完成")
    },
    onError: (err) => error(apiErrorMessage(err, "插件更新检查失败")),
  })
  const updatePlugin = useMutation({
    mutationFn: async (plugin: PluginItem) => (await api.post<PluginUpdateProgress>(`/user/plugins/${encodeURIComponent(plugin.id)}/update`)).data,
    onSuccess: (progress) => {
      setUpdateProgress((current) => ({ ...current, [progress.plugin_id]: progress }))
      success("插件更新已开始")
    },
    onError: (err) => error(apiErrorMessage(err, "插件更新启动失败")),
  })
  const updatingIDs = Object.values(updateProgress).filter((item) => item.in_progress).map((item) => item.plugin_id).join(",")
  useEffect(() => {
    const ids = Object.values(updateProgress).filter((item) => item.in_progress).map((item) => item.plugin_id)
    if (!ids.length) return
    const poll = async () => {
      const results = await Promise.all(ids.map(async (id) => ({ id, progress: (await api.get<PluginUpdateProgress>(`/user/plugins/${encodeURIComponent(id)}/update/progress`)).data })))
      setUpdateProgress((current) => ({ ...current, ...Object.fromEntries(results.map(({ id, progress }) => [id, progress])) }))
      if (results.some(({ progress }) => !progress.in_progress)) await queryClient.invalidateQueries({ queryKey: pluginsQueryKey })
    }
    void poll()
    const timer = window.setInterval(() => void poll(), 1000)
    return () => window.clearInterval(timer)
  }, [updatingIDs, queryClient])

  const handleUpload = (file: File | undefined) => {
    if (!file) return
    if (!file.name.toLowerCase().endsWith(".wasm")) {
      error("请上传 wasm 格式的插件")
      return
    }
    uploadPlugin.mutate(file)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">{t("nav.plugins")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">上传 WASM 插件，管理插件状态并进入各插件的独立配置页。</p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" className="gap-2">
            <Link to="/dashboard/plugins/market"><Store size={16} />插件市场</Link>
          </Button>
          <Button variant="outline" className="gap-2" disabled={checkUpdates.isPending} onClick={() => checkUpdates.mutate()}>
            <RefreshCw size={16} className={checkUpdates.isPending ? "animate-spin" : ""} />
            {checkUpdates.isPending ? "检查中" : "检查更新"}
          </Button>
          <input ref={fileInputRef} type="file" accept=".wasm,application/wasm" className="hidden" onChange={(event) => handleUpload(event.target.files?.[0])} />
          <Button className="gap-2" disabled={uploadPlugin.isPending} onClick={() => fileInputRef.current?.click()}>
            <Upload size={16} />
            {uploadPlugin.isPending ? "上传中" : "上传插件"}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">已安装插件</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {plugins.length === 0 && !isFetching ? (
            <div className="rounded-md border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">暂无插件</div>
          ) : plugins.map((plugin) => (
            <div key={plugin.id} className="rounded-md border p-4">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 space-y-2">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <PackageOpen className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{plugin.name || plugin.id}</span>
                    <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">{plugin.version}</span>
                    <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">{plugin.enabled ? "已启用" : "已禁用"}</span>
                  </div>
                  {plugin.description && <p className="text-sm text-muted-foreground">{plugin.description}</p>}
                  <div className="text-xs text-muted-foreground">{plugin.id}{plugin.author ? ` · ${plugin.author}` : ""}</div>
                  {plugin.github && <a className="inline-flex items-center gap-1 text-xs text-primary hover:underline" href={plugin.github} target="_blank" rel="noreferrer"><ExternalLink size={12} />GitHub</a>}
                  {updates[plugin.id] && <PluginUpdateNotice update={updates[plugin.id]} />}
                  {updateProgress[plugin.id] && <PluginUpdateProgressBar progress={updateProgress[plugin.id]} />}
                  {plugin.last_error && <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">{plugin.last_error}</div>}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" className="gap-2" disabled={togglePlugin.isPending} onClick={() => togglePlugin.mutate(plugin)}>
                    <Power size={14} />{plugin.enabled ? "禁用" : "启用"}
                  </Button>
                  {updates[plugin.id]?.update_available && <Button size="sm" className="gap-2" disabled={updatePlugin.isPending || updateProgress[plugin.id]?.in_progress} onClick={() => updatePlugin.mutate(plugin)}><Download size={14} />更新</Button>}
                  <Button asChild variant="outline" size="sm" className="gap-2" disabled={!plugin.enabled}>
                    <Link to={`/dashboard/plugins/${encodeURIComponent(plugin.id)}/settings`}><Settings size={14} />设置</Link>
                  </Button>
                  <Button variant="outline" size="sm" className="gap-2 text-destructive hover:text-destructive" disabled={uninstallPlugin.isPending} onClick={() => uninstallPlugin.mutate(plugin)}>
                    <Trash2 size={14} />卸载
                  </Button>
                </div>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <PluginMetaBlock title="权限" items={plugin.permissions} empty="未声明权限" />
                <PluginMetaBlock title="Hook" items={plugin.hooks.map(formatPluginHook)} empty="未声明 Hook" />
                <PluginMetaBlock title="前端声明" items={plugin.frontend ? ["已声明"] : []} empty="未声明前端扩展" />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}

function PluginMetaBlock({ title, items, empty }: { title: string; items: string[]; empty: string }) {
  return <div className="rounded-md bg-muted/30 p-3"><div className="mb-2 text-xs font-medium text-muted-foreground">{title}</div>{items.length ? <div className="flex flex-wrap gap-1.5">{items.map((item) => <span key={item} className="rounded bg-background px-1.5 py-0.5 text-xs">{item}</span>)}</div> : <div className="text-xs text-muted-foreground">{empty}</div>}</div>
}

function normalizePlugin(value: unknown): PluginItem | null {
  if (!value || typeof value !== "object") return null
  const item = value as Record<string, unknown>
  return {
    id: String(item.id || ""), name: String(item.name || ""), version: String(item.version || ""), description: String(item.description || ""), author: String(item.author || ""), enabled: Boolean(item.enabled),
    permissions: Array.isArray(item.permissions) ? item.permissions.map(String) : [],
    hooks: Array.isArray(item.hooks) ? item.hooks.map(normalizeHook).filter((hook): hook is PluginHook => Boolean(hook)) : [],
    frontend: item.frontend, last_error: String(item.last_error || ""), github: String(item.github || ""),
  }
}

function PluginUpdateNotice({ update }: { update: PluginUpdateStatus }) {
  if (update.update_available) return <div className="text-xs text-amber-600 dark:text-amber-400">发现新版本：{update.latest_version}（当前 {update.current_version}）</div>
  if (update.error) return <div className="text-xs text-muted-foreground">更新检查：{update.error}</div>
  return <div className="text-xs text-emerald-600 dark:text-emerald-400">已是最新版本{update.latest_version ? `（${update.latest_version}）` : ""}</div>
}

function PluginUpdateProgressBar({ progress }: { progress: PluginUpdateProgress }) {
  const value = Math.max(0, Math.min(100, progress.progress || 0))
  const phase = progress.phase === "checking" ? "正在检查版本" : progress.phase === "downloading" ? "正在下载更新" : progress.phase === "installing" ? "正在安装更新" : progress.phase === "completed" ? "更新完成" : progress.phase === "failed" ? "更新失败" : "等待更新"
  return <div className="max-w-md space-y-1"><div className="flex justify-between text-xs text-muted-foreground"><span>{progress.error || phase}</span><span>{progress.in_progress ? `${value}%` : progress.phase === "completed" ? "100%" : ""}</span></div><div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className={`h-full transition-[width] ${progress.phase === "failed" ? "bg-destructive" : "bg-primary"}`} style={{ width: `${progress.phase === "completed" ? 100 : value}%` }} /></div></div>
}

function normalizeHook(value: unknown): PluginHook | null {
  if (!value || typeof value !== "object") return null
  const item = value as Record<string, unknown>
  return { point: String(item.point || ""), mode: String(item.mode || ""), action: String(item.action || ""), priority: Number.isFinite(Number(item.priority)) ? Number(item.priority) : 0 }
}

function formatPluginHook(hook: PluginHook) {
  return [hook.point, hook.action, hook.mode, hook.priority ? `P${hook.priority}` : ""].filter(Boolean).join(" · ")
}

function apiErrorMessage(err: unknown, fallback: string) {
  const anyErr = err as { response?: { data?: { error?: unknown; message?: unknown } }; message?: unknown }
  return String(anyErr?.response?.data?.error || anyErr?.response?.data?.message || anyErr?.message || fallback)
}
