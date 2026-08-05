import { Switch } from "@/components/ui/switch"
import { Component, useMemo, useState, type ReactNode } from "react"
import { useMutation, useQuery } from "@tanstack/react-query"
import { useParams } from "react-router-dom"
import api from "@/lib/api"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useToast } from "@/components/ui/toast"

interface PluginFrontendItem {
  id: string
  name: string
  frontend?: unknown
}

interface PluginSettingsResponse {
  config?: unknown
}

export default function PluginRoute() {
  const { pluginId = "", "*": rest = "" } = useParams()
  const routePath = rest || ""

  const { data: pluginExtensions, isFetching } = useQuery<unknown>({
    queryKey: ["plugins-frontend"],
    queryFn: async () => {
      const res = await api.get("/user/plugins/frontend")
      return res.data
    },
  })

  const plugins = useMemo(() => normalizePluginFrontendItems(pluginExtensions), [pluginExtensions])
  const plugin = plugins.find((item) => item.id === pluginId)
  const route = useMemo(() => findPluginRoute(plugin, routePath), [plugin, routePath])
  const settingsQuery = useQuery<PluginSettingsResponse>({
    queryKey: ["plugin-settings", pluginId],
    enabled: Boolean(pluginId),
    queryFn: async () => (await api.get(`/user/plugins/${encodeURIComponent(pluginId)}/settings`)).data,
  })
  const settings = isRecord(settingsQuery.data?.config) ? settingsQuery.data.config : {}

  if (!plugin && !isFetching) {
    return <div className="rounded-md border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">插件不存在或未启用</div>
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{stringValue(recordValue(route, "title")) || plugin?.name || "Plugin"}</h1>
        {stringValue(recordValue(route, "description")) && <p className="mt-1 text-sm text-muted-foreground">{stringValue(recordValue(route, "description"))}</p>}
      </div>
      <PluginPageBoundary key={`${pluginId}:${routePath}`}>
        <DeclarativePluginView pluginId={pluginId} schema={recordValue(route, "page") || route || recordValue(plugin?.frontend, "page")} settings={settings} settingsLoading={settingsQuery.isLoading} />
      </PluginPageBoundary>
    </div>
  )
}

class PluginPageBoundary extends Component<{ children: ReactNode }, { message: string }> {
  state = { message: "" }

  static getDerivedStateFromError(error: unknown) {
    return { message: error instanceof Error ? error.message : "未知渲染错误" }
  }

  render() {
    if (this.state.message) {
      return (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 px-4 py-5 text-sm">
          <div className="font-medium">插件页面暂时无法渲染</div>
          <p className="mt-1 text-muted-foreground">{this.state.message}</p>
        </div>
      )
    }
    return this.props.children
  }
}

export function DeclarativePluginView({ pluginId, schema, settings = {}, settingsLoading = false }: { pluginId: string; schema: unknown; settings?: Record<string, unknown>; settingsLoading?: boolean }) {
  if (!schema) {
    return <div className="rounded-md border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">插件没有声明页面</div>
  }
  return <DeclarativeNode pluginId={pluginId} node={schema} settings={settings} settingsLoading={settingsLoading} />
}

function DeclarativeNode({ pluginId, node, settings, settingsLoading }: { pluginId: string; node: unknown; settings: Record<string, unknown>; settingsLoading: boolean }) {
  if (typeof node === "string" || typeof node === "number" || typeof node === "boolean") {
    return <div className="text-sm">{String(node)}</div>
  }
  if (Array.isArray(node)) {
    return <div className="space-y-3">{node.map((child, index) => <DeclarativeNode key={index} pluginId={pluginId} node={child} settings={settings} settingsLoading={settingsLoading} />)}</div>
  }
  if (!isRecord(node)) {
    return null
  }
  const type = stringValue(node.type || "page")
  if (type === "page" || type === "section") {
    const content = node.children ?? node.body ?? node.content
    return (
      <div className="space-y-4">
        {stringValue(node.title) && <h2 className="text-xl font-semibold">{stringValue(node.title)}</h2>}
        {content === undefined || content === null ? (
          <div className="rounded-md border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">插件没有提供可渲染的页面内容</div>
        ) : <DeclarativeNode pluginId={pluginId} node={content} settings={settings} settingsLoading={settingsLoading} />}
      </div>
    )
  }
  if (type === "card") {
    return (
      <Card>
        {stringValue(node.title) && <CardHeader><CardTitle className="text-base">{stringValue(node.title)}</CardTitle></CardHeader>}
        <CardContent className="space-y-3">
          <DeclarativeNode pluginId={pluginId} node={node.children || node.body || node.content} settings={settings} settingsLoading={settingsLoading} />
        </CardContent>
      </Card>
    )
  }
  if (type === "text") {
    return <p className="text-sm text-muted-foreground">{stringValue(node.text || node.content)}</p>
  }
  if (type === "alert") {
    return <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">{stringValue(node.text || node.content)}</div>
  }
  if (type === "settings_summary") {
    return <DeclarativeSettingsSummary node={node} settings={settings} loading={settingsLoading} />
  }
  if (type === "settings_list") {
    return <DeclarativeSettingsList node={node} settings={settings} loading={settingsLoading} />
  }
  if (type === "form") {
    return <DeclarativeForm pluginId={pluginId} node={node} />
  }
  if (type === "button") {
    return <DeclarativeActionButton pluginId={pluginId} node={node} values={{}} />
  }
  if (type === "json") {
    return <pre className="overflow-auto rounded-md border bg-muted/20 p-3 text-xs">{JSON.stringify(node.value || node, null, 2)}</pre>
  }
  return <pre className="overflow-auto rounded-md border bg-muted/20 p-3 text-xs">{JSON.stringify(node, null, 2)}</pre>
}

function DeclarativeSettingsSummary({ node, settings, loading }: { node: Record<string, unknown>; settings: Record<string, unknown>; loading: boolean }) {
  const fields = Array.isArray(node.fields) ? node.fields.filter(isRecord) : []
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">{stringValue(node.title) || "活动信息"}</CardTitle></CardHeader>
      <CardContent>
        {loading ? <div className="py-6 text-center text-sm text-muted-foreground">加载活动配置中...</div> : (
          <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
            {fields.map((field, index) => {
              const name = stringValue(field.name)
              const value = settings[name] ?? field.default
              return <div key={name || index} className="min-w-0"><div className="text-xs text-muted-foreground">{stringValue(field.label) || name}</div><div className="mt-1 break-words text-sm font-medium">{formatSettingValue(value, field)}</div></div>
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function DeclarativeSettingsList({ node, settings, loading }: { node: Record<string, unknown>; settings: Record<string, unknown>; loading: boolean }) {
  const name = stringValue(node.name)
  const configured = settings[name] ?? node.default
  const rows = Array.isArray(configured) ? configured.filter(isRecord).filter((row) => node.enabled_only !== true || row.enabled !== false) : []
  const columns = Array.isArray(node.columns) ? node.columns.filter(isRecord) : []
  const totalWeight = rows.reduce((total, row) => total + Math.max(0, Number(row.weight) || 0), 0)
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{stringValue(node.title) || "列表"}</CardTitle>
        {stringValue(node.description) && <p className="text-sm text-muted-foreground">{stringValue(node.description)}</p>}
      </CardHeader>
      <CardContent>
        {loading ? <div className="py-6 text-center text-sm text-muted-foreground">加载奖池中...</div> : rows.length ? (
          <Table>
            <TableHeader><TableRow>{columns.map((column, index) => <TableHead key={stringValue(column.key) || index}>{stringValue(column.label) || stringValue(column.key)}</TableHead>)}</TableRow></TableHeader>
            <TableBody>{rows.map((row, rowIndex) => <TableRow key={stringValue(row.id) || rowIndex}>{columns.map((column, columnIndex) => <TableCell key={stringValue(column.key) || columnIndex}>{formatListValue(row, column, totalWeight)}</TableCell>)}</TableRow>)}</TableBody>
          </Table>
        ) : <div className="rounded-md border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">{stringValue(node.empty_text) || "暂无可展示项目"}</div>}
      </CardContent>
    </Card>
  )
}

function formatSettingValue(value: unknown, field: Record<string, unknown>) {
  const format = stringValue(field.format)
  if (format === "boolean") return value ? <Badge>开放中</Badge> : <Badge variant="secondary">未开放</Badge>
  if (format === "datetime") {
    const raw = stringValue(value)
    if (!raw) return stringValue(field.empty_text) || "未设置"
    const date = new Date(raw)
    return Number.isNaN(date.getTime()) ? raw : date.toLocaleString()
  }
  if ((value === 0 || value === "0") && stringValue(field.zero_text)) return stringValue(field.zero_text)
  const text = stringValue(value) || stringValue(field.empty_text) || "未设置"
  return `${text}${stringValue(field.suffix)}`
}

function formatListValue(row: Record<string, unknown>, column: Record<string, unknown>, totalWeight: number) {
  const key = stringValue(column.key)
  const value = row[key]
  const format = stringValue(column.format)
  if (format === "weight_percent") {
    const weight = Math.max(0, Number(value) || 0)
    return totalWeight > 0 ? `${((weight / totalWeight) * 100).toFixed(2).replace(/\.00$/, "")}%` : "0%"
  }
  if (format === "boolean") return value ? <Badge variant="secondary">启用</Badge> : <Badge variant="outline">停用</Badge>
  return `${stringValue(value) || "-"}${stringValue(column.suffix)}`
}

function DeclarativeForm({ pluginId, node }: { pluginId: string; node: Record<string, unknown> }) {
  const fields = Array.isArray(node.fields) ? node.fields.filter(isRecord) : []
  const defaults = isRecord(node.values) ? node.values : {}
  const [values, setValues] = useState<Record<string, unknown>>(() => {
    const next: Record<string, unknown> = {}
    for (const field of fields) {
      const name = stringValue(field.name)
      if (name) next[name] = defaults[name] ?? field.default ?? ""
    }
    return next
  })
  return (
    <div className="space-y-4 rounded-md border p-4">
      {fields.map((field) => {
        const name = stringValue(field.name)
        if (!name) return null
        const type = stringValue(field.type || "input")
        const label = stringValue(field.label || name)
        if (type === "switch" || type === "checkbox") {
          return (
            <label key={name} className="flex items-center gap-2 text-sm">
              <Switch checked={Boolean(values[name])} onCheckedChange={(checked) => setValues((current) => ({ ...current, [name]: checked }))} />
              {label}
            </label>
          )
        }
        if (type === "textarea") {
          return (
            <label key={name} className="block space-y-1 text-sm">
              <span>{label}</span>
              <textarea className="min-h-24 w-full rounded-md border bg-background p-2" value={String(values[name] || "")} onChange={(event) => setValues((current) => ({ ...current, [name]: event.target.value }))} />
            </label>
          )
        }
        return (
          <label key={name} className="block space-y-1 text-sm">
            <span>{label}</span>
            <Input value={String(values[name] || "")} onChange={(event) => setValues((current) => ({ ...current, [name]: event.target.value }))} />
          </label>
        )
      })}
      <DeclarativeActionButton pluginId={pluginId} node={node} values={values} />
    </div>
  )
}

function DeclarativeActionButton({ pluginId, node, values }: { pluginId: string; node: Record<string, unknown>; values: Record<string, unknown> }) {
  const { success, error } = useToast()
  const action = stringValue(node.action || node.submit_action)
  const label = stringValue(node.submit_label || node.label || "运行")
  const runAction = useMutation({
    mutationFn: async () => {
      const requestID = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`
      const res = await api.post(`/user/plugins/${encodeURIComponent(pluginId)}/actions/${encodeURIComponent(action)}`, { values }, { headers: { "Idempotency-Key": requestID } })
      return res.data
    },
    onSuccess: (data) => success(stringValue(recordValue(data, "message")) || "插件操作已完成"),
    onError: (err) => error(apiErrorMessage(err, "插件操作失败")),
  })
  if (!action) return null
  return <Button disabled={runAction.isPending} onClick={() => runAction.mutate()}>{runAction.isPending ? "运行中" : label}</Button>
}

function findPluginRoute(plugin: PluginFrontendItem | undefined, routePath: string) {
  const frontend = isRecord(plugin?.frontend) ? plugin?.frontend : {}
  const routes = Array.isArray(frontend.routes) ? frontend.routes.filter(isRecord) : []
  if (!routes.length) return frontend
  const normalizedCurrent = normalizePluginRoutePath(routePath)
  return routes.find((route) => normalizePluginRoutePath(stringValue(route.path)) === normalizedCurrent) || routes[0]
}

function normalizePluginRoutePath(value: string) {
  let text = value.trim()
  text = text.replace(/^\/dashboard\/plugins\/[^/]+\/?/, "")
  text = text.replace(/^\/plugins\/[^/]+\/?/, "")
  text = text.replace(/^\/+/, "")
  return text
}

function normalizePluginFrontendItems(value: unknown): PluginFrontendItem[] {
  const source = Array.isArray(value) ? value : Array.isArray(recordValue(value, "plugins")) ? recordValue(value, "plugins") : []
  return Array.isArray(source) ? source.map(normalizePluginFrontendItem).filter((item): item is PluginFrontendItem => Boolean(item)) : []
}

function normalizePluginFrontendItem(value: unknown): PluginFrontendItem | null {
  if (!isRecord(value)) return null
  const id = stringValue(value.id)
  if (!id) return null
  return {
    id,
    name: stringValue(value.name),
    frontend: value.frontend,
  }
}

function recordValue(value: unknown, key: string) {
  return isRecord(value) ? value[key] : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value))
}

function stringValue(value: unknown) {
  if (typeof value === "string") return value.trim()
  if (typeof value === "number" && Number.isFinite(value)) return String(value)
  if (typeof value === "boolean") return value ? "true" : "false"
  return ""
}

function apiErrorMessage(err: unknown, fallback: string) {
  const anyErr = err as { response?: { data?: { error?: unknown; message?: unknown } }; message?: unknown }
  return String(anyErr?.response?.data?.error || anyErr?.response?.data?.message || anyErr?.message || fallback)
}
