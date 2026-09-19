import { useState } from "react"
import { Plus, Trash2 } from "lucide-react"
import {
  Badge,
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Textarea,
  cn,
  useI18n,
} from "@velocelab/dashboard/frontend"

/** A plugin configuration schema as the server serialises it. */
export interface PluginSchema {
  type: string
  description?: string
  isRequired?: boolean
  defaultValue?: unknown
  properties?: Record<string, PluginSchema>
  items?: PluginSchema
  enum?: unknown[]
}

interface FormProps {
  schema: PluginSchema
  value: Record<string, unknown>
  /** Runtime choices keyed by top-level config path, for capability-driven fields. */
  dynamicEnums?: Record<string, unknown[]>
  onChange: (next: Record<string, unknown>) => void
  /** Reports fields whose JSON text does not parse, so saving can be blocked. */
  onValidity: (path: string, valid: boolean) => void
}

/**
 * Renders a plugin's configuration schema with the values that are actually
 * running. `dynamicEnums` deliberately lives outside Schema: a plugin module's
 * exported schema is static, while auth provider availability changes at runtime.
 */
export default function PluginConfigForm({ schema, value, dynamicEnums, onChange, onValidity }: FormProps) {
  const { t } = useI18n()
  const properties = schema.properties ?? {}
  const keys = Object.keys(properties)
  if (!keys.length) return <p className="text-sm text-muted-foreground">{t("settings.plugins.noOptions")}</p>
  const set = (key: string, next: unknown) => onChange({ ...value, [key]: next })
  return (
    <div className="space-y-4">
      {keys.map((key) => (
        <SchemaField
          key={key}
          name={key}
          path={key}
          schema={properties[key]}
          dynamicEnum={dynamicEnums?.[key]}
          value={value[key]}
          onChange={(next) => set(key, next)}
          onValidity={onValidity}
        />
      ))}
    </div>
  )
}

function SchemaField({ name, path, schema, dynamicEnum, value, onChange, onValidity }: {
  name: string
  path: string
  schema: PluginSchema
  dynamicEnum?: unknown[]
  value: unknown
  onChange: (next: unknown) => void
  onValidity: (path: string, valid: boolean) => void
}) {
  const { t } = useI18n()
  if (schema.type === "object" && schema.properties && Object.keys(schema.properties).length) {
    const nested = (value && typeof value === "object" && !Array.isArray(value) ? value : {}) as Record<string, unknown>
    return (
      <fieldset className="rounded-lg border p-4">
        <legend className="px-1 text-sm font-medium">{schema.description || name}</legend>
        <div className="space-y-4 pt-1">
          {Object.keys(schema.properties).map((key) => (
            <SchemaField key={key} name={key} path={`${path}.${key}`} schema={schema.properties![key]} value={nested[key]} onChange={(next) => onChange({ ...nested, [key]: next })} onValidity={onValidity} />
          ))}
        </div>
      </fieldset>
    )
  }
  const enumValues = dynamicEnum?.length ? dynamicEnum : schema.enum
  return (
    <div className="space-y-1.5 border-b pb-4 last:border-b-0 last:pb-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">{schema.description || name}</span>
        <code className="font-mono text-xs text-muted-foreground">{name}</code>
        {schema.isRequired && <Badge variant="outline">{t("settings.plugins.required")}</Badge>}
        {schema.defaultValue !== undefined && <span className="text-xs text-muted-foreground">{t("settings.plugins.defaultValue")}: <code className="font-mono">{JSON.stringify(schema.defaultValue)}</code></span>}
      </div>
      {enumValues?.length ? (
        <Select value={value === undefined || value === null ? "" : String(value)} onValueChange={(next) => onChange(coerce(next, enumValues[0]))}>
          <SelectTrigger className="w-full sm:max-w-xs"><SelectValue /></SelectTrigger>
          <SelectContent>{enumValues.map((option) => <SelectItem key={String(option)} value={String(option)}>{String(option)}</SelectItem>)}</SelectContent>
        </Select>
      ) : schema.type === "boolean" ? (
        <Switch checked={value === true} onCheckedChange={(next) => onChange(next)} aria-label={name} />
      ) : schema.type === "number" ? (
        <Input type="number" className="w-full sm:max-w-xs" value={value === undefined || value === null ? "" : String(value)} onChange={(event) => onChange(event.target.value === "" ? undefined : Number(event.target.value))} />
      ) : schema.type === "string" ? (
        <Input value={value === undefined || value === null ? "" : String(value)} onChange={(event) => onChange(event.target.value)} />
      ) : schema.type === "array" ? (
        <ArrayField name={name} path={path} schema={schema.items} dynamicEnum={dynamicEnum} value={Array.isArray(value) ? value : []} onChange={onChange} onValidity={onValidity} />
      ) : <JsonField path={path} value={value} onChange={onChange} onValidity={onValidity} />}
    </div>
  )
}

function ArrayField({ name, path, schema, dynamicEnum, value, onChange, onValidity }: {
  name: string
  path: string
  schema?: PluginSchema
  dynamicEnum?: unknown[]
  value: unknown[]
  onChange: (next: unknown) => void
  onValidity: (path: string, valid: boolean) => void
}) {
  const { t } = useI18n()
  const scalar = schema?.type === "string" || schema?.type === "number"
  const replace = (index: number, next: unknown) => onChange(value.map((item, current) => current === index ? next : item))
  // Dynamic provider lists render as toggles. A native Select cannot express a
  // multi-select accessibly with the dashboard primitive, and this preserves
  // unavailable saved IDs instead of silently deleting configuration.
  if (dynamicEnum?.length) {
    const listed = [...new Set([...dynamicEnum.map(String), ...value.map(String)])]
    return <div className="space-y-2">{listed.map((option) => <label key={option} className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm"><code className="font-mono">{option}</code><Switch checked={value.map(String).includes(option)} onCheckedChange={(checked) => onChange(checked ? [...value, option] : value.filter((item) => String(item) !== option))} aria-label={option} /></label>)}</div>
  }
  if (schema?.type === "object" && schema.properties && Object.keys(schema.properties).length) {
    return <div className="space-y-3">{value.map((item, index) => {
      const objectValue = (item && typeof item === "object" && !Array.isArray(item) ? item : {}) as Record<string, unknown>
      return <fieldset key={index} className="rounded-lg border p-4"><legend className="px-1 text-sm font-medium">{name} {index + 1}</legend><div className="space-y-4">{Object.entries(schema.properties!).map(([key, fieldSchema]) => <SchemaField key={key} name={key} path={`${path}.${index}.${key}`} schema={fieldSchema} value={objectValue[key]} onChange={(next) => replace(index, { ...objectValue, [key]: next })} onValidity={onValidity} />)}</div><Button type="button" variant="ghost" size="sm" className="mt-3 gap-2" onClick={() => onChange(value.filter((_, current) => current !== index))}><Trash2 size={15} />{t("settings.plugins.removeItem")}</Button></fieldset>
    })}<Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => onChange([...value, {}])}><Plus size={15} />{t("settings.plugins.addItem")}</Button></div>
  }
  return (
    <div className="space-y-2">
      {value.map((item, index) => <div key={index} className="flex items-start gap-2">{scalar ? <Input type={schema?.type === "number" ? "number" : "text"} value={item === undefined || item === null ? "" : String(item)} onChange={(event) => replace(index, schema?.type === "number" ? Number(event.target.value) : event.target.value)} /> : <JsonField path={`${path}.${index}`} value={item} onChange={(next) => replace(index, next)} onValidity={onValidity} inline />}<Button type="button" variant="ghost" size="icon" aria-label={t("settings.plugins.removeItem")} onClick={() => onChange(value.filter((_, current) => current !== index))}><Trash2 size={15} /></Button></div>)}
      <Button type="button" variant="outline" size="sm" className="gap-2" aria-label={`${t("settings.plugins.addItem")} ${name}`} onClick={() => onChange([...value, schema?.type === "number" ? 0 : schema?.type === "boolean" ? false : schema?.type === "object" || schema?.type === "array" ? {} : ""])}><Plus size={15} />{t("settings.plugins.addItem")}</Button>
    </div>
  )
}

function JsonField({ path, value, onChange, onValidity, inline }: { path: string; value: unknown; onChange: (next: unknown) => void; onValidity: (path: string, valid: boolean) => void; inline?: boolean }) {
  const { t } = useI18n()
  const [text, setText] = useState(() => stringify(value))
  const [error, setError] = useState(false)
  return <div className={cn("space-y-1", inline && "flex-1")}><Textarea className="min-h-24 font-mono text-xs" value={text} onChange={(event) => { const next = event.target.value; setText(next); if (!next.trim()) { setError(false); onValidity(path, true); onChange(schemaFallback(value)); return } try { onChange(JSON.parse(next)); setError(false); onValidity(path, true) } catch { setError(true); onValidity(path, false) } }} />{error && <p className="text-xs text-destructive">{t("settings.plugins.invalidJson")}</p>}</div>
}
function stringify(value: unknown) { try { return value === undefined ? "" : JSON.stringify(value, null, 2) } catch { return "" } }
function schemaFallback(value: unknown) { return Array.isArray(value) ? [] : value && typeof value === "object" ? {} : "" }
function coerce(text: string, sample: unknown) { return typeof sample === "number" ? Number(text) : text }
