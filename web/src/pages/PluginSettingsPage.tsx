import { useEffect, useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Link, useParams } from "react-router-dom"
import { ChevronLeft, Pencil, Plus, Save, SlidersHorizontal, Trash2 } from "lucide-react"
import api from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { PageTab, PageTabs } from "@/components/layout/PageTabs"
import { TabTransition } from "@/components/layout/TabTransition"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useToast } from "@/components/ui/toast"

interface PluginDetail {
  id: string
  name: string
  version: string
  description: string
  settings?: unknown
}

interface PluginSettingsResponse {
  schema: unknown
  config: unknown
}

interface PluginSettingsField {
  name: string
  label: string
  type: string
  description: string
  placeholder: string
  required: boolean
  defaultValue: unknown
  options: Array<{ label: string; value: string }>
  min?: number
  max?: number
  step?: number
  tab: string
}

interface PluginSettingsTab {
  id: string
  label: string
  description: string
  fields: PluginSettingsField[]
}

export default function PluginSettingsPage() {
  const { pluginId = "" } = useParams()
  const { success, error } = useToast()
  const queryClient = useQueryClient()
  const [values, setValues] = useState<Record<string, unknown>>({})
  const [rawText, setRawText] = useState("{}")
  const [rawMode, setRawMode] = useState(false)
  const [activeTab, setActiveTab] = useState("")

  const pluginQuery = useQuery<PluginDetail>({
    queryKey: ["plugin", pluginId],
    enabled: Boolean(pluginId),
    queryFn: async () => normalizePluginDetail((await api.get(`/user/plugins/${encodeURIComponent(pluginId)}`)).data),
  })
  const settingsQuery = useQuery<PluginSettingsResponse>({
    queryKey: ["plugin-settings", pluginId],
    enabled: Boolean(pluginId),
    queryFn: async () => normalizePluginSettings((await api.get(`/user/plugins/${encodeURIComponent(pluginId)}/settings`)).data),
  })

  const schema = settingsQuery.data?.schema || pluginQuery.data?.settings || {}
  const fields = useMemo(() => normalizeSettingsFields(schema), [schema])
  const tabs = useMemo(() => normalizeSettingsTabs(schema, fields), [fields, schema])
  const currentTab = tabs.find((tab) => tab.id === activeTab) || tabs[0]

  useEffect(() => {
    if (!settingsQuery.data) return
    const config = isRecord(settingsQuery.data.config) ? settingsQuery.data.config : {}
    const nextValues = buildSettingsValues(fields, config)
    setValues(nextValues)
    setRawText(JSON.stringify(nextValues, null, 2))
    setRawMode(fields.length === 0)
    setActiveTab((current) => tabs.some((tab) => tab.id === current) ? current : tabs[0]?.id || "")
  }, [fields, settingsQuery.data, tabs])

  const saveSettings = useMutation({
    mutationFn: async () => {
      const payload = rawMode ? parseSettingsJSON(rawText) : values
      await api.put(`/user/plugins/${encodeURIComponent(pluginId)}/settings`, payload)
    },
    onSuccess: async () => {
      success("插件设置已保存")
      await queryClient.invalidateQueries({ queryKey: ["plugin-settings", pluginId] })
    },
    onError: (err) => error(apiErrorMessage(err, "插件设置保存失败")),
  })

  if (pluginQuery.isError || settingsQuery.isError) {
    return <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-10 text-center text-sm text-destructive">无法加载插件配置。请确认插件已启用且你有访问权限。</div>
  }

  const plugin = pluginQuery.data
  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <Button asChild variant="ghost" size="sm" className="-ml-2 mb-2 gap-1.5"><Link to="/dashboard/plugins"><ChevronLeft size={16} />返回插件</Link></Button>
          <div className="flex min-w-0 items-center gap-2"><SlidersHorizontal size={20} className="shrink-0 text-muted-foreground" /><h1 className="truncate text-2xl font-semibold">{plugin?.name || "插件配置"}</h1></div>
          {plugin?.description && <p className="mt-1 text-sm text-muted-foreground">{plugin.description}</p>}
        </div>
        <Button className="gap-2" disabled={saveSettings.isPending || settingsQuery.isLoading} onClick={() => saveSettings.mutate()}><Save size={16} />{saveSettings.isPending ? "保存中" : "保存配置"}</Button>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between gap-4 space-y-0">
          <div><CardTitle className="text-base">{plugin?.name || "插件"} 配置</CardTitle><div className="mt-1 text-xs text-muted-foreground">{plugin?.version ? <Badge variant="secondary">版本 {plugin.version}</Badge> : "按当前账号保存"}</div></div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!fields.length && rawMode}
            onClick={() => {
              if (!rawMode) {
                setRawText(JSON.stringify(values, null, 2))
                setRawMode(true)
                return
              }
              try {
                const parsed = parseSettingsJSON(rawText)
                setValues(parsed)
                setRawMode(false)
              } catch (err) {
                error(apiErrorMessage(err, "JSON 格式不正确"))
              }
            }}
          >{rawMode && fields.length ? "表单配置" : "JSON 配置"}</Button>
        </CardHeader>
        <CardContent>
          {settingsQuery.isLoading || pluginQuery.isLoading ? <div className="py-12 text-center text-sm text-muted-foreground">加载配置中...</div> : rawMode ? (
            <Textarea className="min-h-[28rem] font-mono" value={rawText} onChange={(event) => setRawText(event.target.value)} />
          ) : tabs.length ? (
            <div className="space-y-5">
              <PageTabs aria-label="插件设置分类">
                {tabs.map((tab) => <PageTab key={tab.id} active={currentTab?.id === tab.id} onClick={() => setActiveTab(tab.id)}>{tab.label}</PageTab>)}
              </PageTabs>
              {currentTab && <TabTransition activeKey={currentTab.id} order={tabs.map((tab) => tab.id)}><div className="space-y-5"><div>{currentTab.description && <p className="text-sm text-muted-foreground">{currentTab.description}</p>}</div><PluginSettingsForm fields={currentTab.fields} values={values} onChange={(name, value) => setValues((current) => ({ ...current, [name]: value }))} /></div></TabTransition>}
            </div>
          ) : <div className="rounded-md border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">这个插件没有声明可视化配置项</div>}
        </CardContent>
      </Card>
    </div>
  )
}

function PluginSettingsForm({ fields, values, onChange }: { fields: PluginSettingsField[]; values: Record<string, unknown>; onChange: (name: string, value: unknown) => void }) {
  return <div className="space-y-4">{fields.map((field) => <PluginSettingsFieldControl key={field.name} field={field} value={values[field.name]} values={values} onChange={(value) => onChange(field.name, value)} />)}</div>
}

function PluginSettingsFieldControl({ field, value, values, onChange }: { field: PluginSettingsField; value: unknown; values: Record<string, unknown>; onChange: (value: unknown) => void }) {
  const label = <div className="space-y-1"><Label className="text-sm font-medium">{field.label}{field.required && <span className="ml-1 text-destructive">*</span>}</Label>{field.description && <div className="text-xs text-muted-foreground">{field.description}</div>}</div>
  if (field.type === "editable_list") return <EditableListFieldControl field={field} value={value} values={values} onChange={onChange} label={label} />
  if (field.type === "switch") return <div className="flex items-start justify-between gap-4 rounded-md border p-3">{label}<Switch className="mt-0.5 shrink-0" checked={Boolean(value)} onCheckedChange={onChange} /></div>
  if (["checkbox", "boolean"].includes(field.type)) return <label className="flex items-start justify-between gap-4 rounded-md border p-3">{label}<Checkbox className="mt-1 shrink-0" checked={Boolean(value)} onCheckedChange={(checked) => onChange(checked === true)} /></label>
  if (["textarea", "text"].includes(field.type)) return <div className="space-y-2">{label}<Textarea className="min-h-28" value={String(value ?? "")} placeholder={field.placeholder} onChange={(event) => onChange(event.target.value)} /></div>
  if (["number", "integer"].includes(field.type)) return <div className="space-y-2">{label}<Input type="number" value={value === undefined || value === null ? "" : String(value)} placeholder={field.placeholder} min={field.min} max={field.max} step={field.step ?? (field.type === "integer" ? 1 : undefined)} onChange={(event) => { const raw = event.target.value; onChange(raw === "" ? "" : field.type === "integer" ? Math.trunc(Number(raw)) : Number(raw)) }} /></div>
  if (["select", "enum"].includes(field.type)) return <div className="space-y-2">{label}<Select value={String(value ?? "")} onValueChange={(next) => onChange(next === "__unset__" ? "" : next)}><SelectTrigger><SelectValue placeholder={field.required ? field.placeholder : "不设置"} /></SelectTrigger><SelectContent>{!field.required && <SelectItem value="__unset__">不设置</SelectItem>}{field.options.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent></Select></div>
  if (["multiselect", "multi_select", "tags"].includes(field.type)) { const selected = Array.isArray(value) ? value.map(String) : []; const toggleOption = (optionValue: string, checked: boolean) => onChange(checked ? [...selected, optionValue] : selected.filter((item) => item !== optionValue)); return <div className="space-y-2">{label}<div className="grid gap-2 rounded-2xl bg-input/50 p-3">{field.options.map((option) => <label key={option.value} className="flex cursor-pointer items-center gap-2 text-sm"><Checkbox checked={selected.includes(option.value)} onCheckedChange={(checked) => toggleOption(option.value, checked === true)} />{option.label}</label>)}</div></div> }
  if (["json", "object", "array"].includes(field.type)) return <div className="space-y-2">{label}<Textarea key={JSON.stringify(value ?? null)} className="min-h-28 font-mono" defaultValue={JSON.stringify(value ?? (field.type === "array" ? [] : {}), null, 2)} onBlur={(event) => { try { onChange(JSON.parse(event.target.value || (field.type === "array" ? "[]" : "{}"))) } catch { onChange(event.target.value) } }} /></div>
  return <div className="space-y-2">{label}<Input type={field.type === "password" || field.type === "secret" ? "password" : "text"} value={String(value ?? "")} placeholder={field.placeholder} onChange={(event) => onChange(event.target.value)} /></div>
}

function EditableListFieldControl({ field, value, values, onChange, label }: { field: PluginSettingsField; value: unknown; values: Record<string, unknown>; onChange: (value: unknown) => void; label: React.ReactNode }) {
  const items = Array.isArray(value) ? value.filter(isRecord) : []
  const columns = field.options
  const [draft, setDraft] = useState<{ index: number | null; item: Record<string, unknown> } | null>(null)
  const openNew = () => setDraft({ index: null, item: createEditableListItem(field) })
  const saveDraft = () => {
    if (!draft || !editableListDraftValid(draft, items, columns)) return
    const next = [...items]
    if (draft.index === null) next.push(draft.item)
    else next[draft.index] = draft.item
    onChange(next)
    setDraft(null)
  }
  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-4">
        {label}
        <Button type="button" size="sm" variant="outline" className="shrink-0 gap-1.5" onClick={openNew}><Plus size={15} />添加{field.label}</Button>
      </div>
      {items.length ? (
        <div className="rounded-md border">
          <Table>
            <TableHeader><TableRow>{columns.map((column) => <TableHead key={column.value}>{column.label}</TableHead>)}<TableHead className="w-24 text-right">操作</TableHead></TableRow></TableHeader>
            <TableBody>{items.map((item, index) => (
              <TableRow key={stringValue(item.id) || index}>
                {columns.map((column) => <TableCell key={column.value}>{editableListCellValue(item[column.value], column.value)}</TableCell>)}
                <TableCell><div className="flex justify-end gap-1"><Button type="button" size="icon" variant="ghost" aria-label={`编辑${field.label}`} onClick={() => setDraft({ index, item: { ...item } })}><Pencil size={15} /></Button><Button type="button" size="icon" variant="ghost" className="text-destructive hover:text-destructive" aria-label={`删除${field.label}`} onClick={() => { if (window.confirm(`确定删除${field.label}吗？`)) onChange(items.filter((_, itemIndex) => itemIndex !== index)) }}><Trash2 size={15} /></Button></div></TableCell>
              </TableRow>
            ))}</TableBody>
          </Table>
        </div>
      ) : <div className="rounded-md border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">暂无{field.label}，点击“添加{field.label}”开始配置。</div>}
      <Dialog open={Boolean(draft)} onOpenChange={(open) => { if (!open) setDraft(null) }}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader><DialogTitle>{draft?.index === null ? `添加${field.label}` : `编辑${field.label}`}</DialogTitle></DialogHeader>
          {draft && <div className="space-y-4">{columns.map((column) => {
            const current = draft.item[column.value]
            const type = editableListValueType(field, column.value, current)
            if (type === "boolean") return <div key={column.value} className="flex items-center justify-between gap-4 rounded-md border p-3"><Label>{column.label}</Label><Switch checked={Boolean(current)} onCheckedChange={(checked) => setDraft({ ...draft, item: { ...draft.item, [column.value]: checked } })} /></div>
            if (field.name === "accounts" && column.value === "pool_id") return <div key={column.value} className="space-y-2"><Label>{column.label}</Label><Select value={String(current || "__unset__")} onValueChange={(next) => setDraft({ ...draft, item: { ...draft.item, pool_id: next === "__unset__" ? "" : next } })}><SelectTrigger><SelectValue placeholder="选择账号池" /></SelectTrigger><SelectContent><SelectItem value="__unset__">选择账号池</SelectItem>{editableListPoolOptions(values).map((pool) => <SelectItem key={pool.value} value={pool.value}>{pool.label}</SelectItem>)}</SelectContent></Select></div>
            if (type === "textarea") return <div key={column.value} className="space-y-2"><Label>{column.label}</Label><Textarea className="min-h-40 font-mono" placeholder={column.value === "credentials_json" ? '{"access_token":"...","refresh_token":"...","account_id":"...","expired":"2026-01-02T15:04:05Z"}' : undefined} value={current === undefined || current === null ? "" : String(current)} onChange={(event) => setDraft({ ...draft, item: { ...draft.item, [column.value]: event.target.value } })} />{column.value === "credentials_json" && <p className="text-xs text-muted-foreground">粘贴单个 Codex OAuth 登录凭据 JSON，不要粘贴数组。</p>}</div>
            return <div key={column.value} className="space-y-2"><Label>{column.label}</Label><Input type={type === "number" ? "number" : "text"} min={column.value === "weight" ? 1 : undefined} step={column.value === "weight" ? 1 : column.value === "reward" ? "0.000001" : undefined} value={current === undefined || current === null ? "" : String(current)} onChange={(event) => setDraft({ ...draft, item: { ...draft.item, [column.value]: type === "number" ? (event.target.value === "" ? "" : Number(event.target.value)) : event.target.value } })} /></div>
          })}</div>}
          <DialogFooter><Button type="button" variant="outline" onClick={() => setDraft(null)}>取消</Button><Button type="button" disabled={!draft || !editableListDraftValid(draft, items, columns)} onClick={saveDraft}>保存{field.label}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function createEditableListItem(field: PluginSettingsField) {
  const template = Array.isArray(field.defaultValue) && isRecord(field.defaultValue[0]) ? field.defaultValue[0] : {}
  const item: Record<string, unknown> = {}
  for (const column of field.options) {
    const sample = template[column.value]
    if (column.value === "id") item[column.value] = `item-${Date.now()}`
    else if (column.value === "enabled") item[column.value] = true
    else if (column.value === "weight") item[column.value] = 1
    else if (column.value === "reward") item[column.value] = "0"
    else if (typeof sample === "boolean") item[column.value] = false
    else if (typeof sample === "number") item[column.value] = 0
    else item[column.value] = ""
  }
  return item
}

function editableListValueType(field: PluginSettingsField, key: string, value: unknown) {
	if (typeof value === "boolean") return "boolean"
	if (typeof value === "number") return "number"
	if (key.endsWith("_json")) return "textarea"
  const template = Array.isArray(field.defaultValue) && isRecord(field.defaultValue[0]) ? field.defaultValue[0][key] : undefined
  if (typeof template === "boolean" || key === "enabled") return "boolean"
  if (typeof template === "number" || key === "weight") return "number"
  return "text"
}

function editableListItemValid(item: Record<string, unknown>, columns: Array<{ label: string; value: string }>) {
  return columns.every((column) => {
    const value = item[column.value]
    if (typeof value === "boolean") return true
    if (typeof value === "number") return Number.isFinite(value) && (column.value !== "weight" || value > 0)
    const text = String(value ?? "").trim()
    if (!text) return false
		if (column.value.endsWith("_json")) {
			try { if (!isRecord(JSON.parse(text))) return false } catch { return false }
		}
    if (column.value === "reward") return /^(?:\d{1,14})(?:\.\d{1,6})?$/.test(text)
    return true
  })
}

function editableListDraftValid(draft: { index: number | null; item: Record<string, unknown> }, items: Record<string, unknown>[], columns: Array<{ label: string; value: string }>) {
  if (!editableListItemValid(draft.item, columns)) return false
  const id = String(draft.item.id ?? "").trim()
  return !id || !items.some((item, index) => index !== draft.index && String(item.id ?? "").trim() === id)
}

function editableListCellValue(value: unknown, key = "") {
	if (key.endsWith("_json")) return String(value ?? "").trim() ? <Badge variant="secondary">已配置</Badge> : "-"
  if (typeof value === "boolean") return value ? <Badge variant="secondary">启用</Badge> : <Badge variant="outline">停用</Badge>
  return stringValue(value) || "-"
}

function editableListPoolOptions(values: Record<string, unknown>) {
	const pools = Array.isArray(values.pools) ? values.pools.filter(isRecord) : []
	return pools.flatMap((pool) => {
		if (pool.enabled === false) return []
		const value = stringValue(pool.id)
		return value ? [{ value, label: stringValue(pool.name) || value }] : []
	})
}

function normalizePluginDetail(value: unknown): PluginDetail {
  const item = isRecord(value) ? value : {}
  return { id: stringValue(item.id), name: stringValue(item.name), version: stringValue(item.version), description: stringValue(item.description), settings: item.settings }
}

function normalizePluginSettings(value: unknown): PluginSettingsResponse {
  const item = isRecord(value) ? value : {}
  return { schema: item.schema || {}, config: item.config || {} }
}

function normalizeSettingsTabs(schema: unknown, fields: PluginSettingsField[]): PluginSettingsTab[] {
  const root = schemaRoot(schema)
  if (!isRecord(root)) return fields.length ? [{ id: "general", label: "通用", description: "", fields }] : []
  const declared = Array.isArray(root.tabs) ? root.tabs.filter(isRecord) : []
  const tabs: PluginSettingsTab[] = declared.map((raw, index) => {
    const id = stringValue(raw.id || raw.key || raw.name || raw.label) || `tab-${index + 1}`
    const label = stringValue(raw.label || raw.title || raw.name) || id
    const tabFields = normalizeSettingsFields(raw)
    return { id, label, description: stringValue(raw.description || raw.help), fields: tabFields.length ? tabFields : fields.filter((field) => field.tab === id || field.tab === label) }
  })
  if (tabs.length) {
    const assigned = new Set(tabs.flatMap((tab) => tab.fields.map((field) => field.name)))
    const remaining = fields.filter((field) => !assigned.has(field.name))
    if (remaining.length) tabs.unshift({ id: "general", label: "通用", description: "", fields: remaining })
    return tabs.filter((tab) => tab.fields.length)
  }
  const grouped = new Map<string, PluginSettingsTab>()
  for (const field of fields) {
    const id = field.tab || "general"
    const existing = grouped.get(id) || { id, label: id === "general" ? "通用" : id, description: "", fields: [] }
    existing.fields.push(field)
    grouped.set(id, existing)
  }
  return [...grouped.values()]
}

function normalizeSettingsFields(schema: unknown): PluginSettingsField[] {
  const root = schemaRoot(schema)
  if (!isRecord(root)) return []
  const fields = Array.isArray(root.fields) ? root.fields : Array.isArray(root.children) ? root.children : []
  if (fields.length) return fields.map((field) => normalizeSettingsField(field)).filter((field): field is PluginSettingsField => Boolean(field))
  const properties = isRecord(root.properties) ? root.properties : {}
  const required = Array.isArray(root.required) ? root.required.map(String) : []
  return Object.entries(properties).map(([name, field]) => normalizeSettingsField(field, name, required.includes(name))).filter((field): field is PluginSettingsField => Boolean(field))
}

function normalizeSettingsField(value: unknown, fallbackName = "", required = false): PluginSettingsField | null {
  if (!isRecord(value)) return null
  const name = stringValue(value.name) || fallbackName
  if (!name) return null
  const options = normalizeSettingsOptions(value.options || value.enum || value.values)
  return { name, label: stringValue(value.label || value.title) || name, type: normalizeSettingsFieldType(stringValue(value.type || value.widget || value.component || "input").toLowerCase(), options), description: stringValue(value.description || value.help || value.hint), placeholder: stringValue(value.placeholder), required: Boolean(value.required) || required, defaultValue: value.default, options, min: numberOrUndefined(value.minimum ?? value.min), max: numberOrUndefined(value.maximum ?? value.max), step: numberOrUndefined(value.step), tab: stringValue(value.tab || value.group || value.category) }
}

function normalizeSettingsOptions(value: unknown): Array<{ label: string; value: string }> {
  if (!Array.isArray(value)) return []
  return value.map((option) => { if (isRecord(option)) { const optionValue = stringValue(option.value ?? option.id ?? option.name ?? option.label); return { label: stringValue(option.label ?? option.name ?? optionValue) || optionValue, value: optionValue } }; const text = stringValue(option); return { label: text, value: text } }).filter((option) => option.value !== "")
}

function normalizeSettingsFieldType(type: string, options: Array<{ label: string; value: string }>) {
  if (type === "string") return options.length ? "select" : "input"
  if (type === "bool" || type === "boolean") return "switch"
  if (type === "int") return "integer"
  if (type === "float") return "number"
  return ["select", "enum", "multiselect", "multi_select", "tags", "textarea", "text", "number", "integer", "json", "object", "array", "editable_list", "password", "secret", "switch", "checkbox"].includes(type) ? type : "input"
}

function buildSettingsValues(fields: PluginSettingsField[], config: Record<string, unknown>) {
  const values: Record<string, unknown> = {}
  for (const field of fields) values[field.name] = config[field.name] ?? field.defaultValue ?? defaultSettingsFieldValue(field)
  for (const [key, value] of Object.entries(config)) if (!(key in values)) values[key] = value
  return values
}

function defaultSettingsFieldValue(field: PluginSettingsField) {
  if (["switch", "checkbox", "boolean"].includes(field.type)) return false
  if (["number", "integer"].includes(field.type)) return ""
  if (["multiselect", "multi_select", "tags", "array", "editable_list"].includes(field.type)) return []
  if (["json", "object"].includes(field.type)) return {}
  return ""
}

function parseSettingsJSON(raw: string) {
  const value = JSON.parse(raw || "{}")
  if (!isRecord(value)) throw new Error("设置必须是 JSON 对象")
  return value
}

function schemaRoot(schema: unknown) { return isRecord(schema) && isRecord(schema.schema) ? schema.schema : schema }
function isRecord(value: unknown): value is Record<string, unknown> { return Boolean(value && typeof value === "object" && !Array.isArray(value)) }
function stringValue(value: unknown) { if (typeof value === "string") return value.trim(); if (typeof value === "number" && Number.isFinite(value)) return String(value); if (typeof value === "boolean") return value ? "true" : "false"; return "" }
function numberOrUndefined(value: unknown) { const number = Number(value); return Number.isFinite(number) ? number : undefined }
function apiErrorMessage(err: unknown, fallback: string) { const anyErr = err as { response?: { data?: { error?: unknown; message?: unknown } }; message?: unknown }; return String(anyErr?.response?.data?.error || anyErr?.response?.data?.message || anyErr?.message || fallback) }
