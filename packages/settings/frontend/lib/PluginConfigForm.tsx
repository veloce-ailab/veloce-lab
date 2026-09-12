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
  onChange: (next: Record<string, unknown>) => void
  /** Reports fields whose JSON text does not parse, so saving can be blocked. */
  onValidity: (path: string, valid: boolean) => void
}

/**
 * Renders a plugin's configuration schema with the values that are actually
 * running. yumeri schemas describe a field with `description`, so it doubles as
 * the visible label, and the key stays visible next to it because that is what
 * appears in the configuration file.
 */
export default function PluginConfigForm({ schema, value, onChange, onValidity }: FormProps) {
  const { t } = useI18n()
  const properties = schema.properties ?? {}
  const keys = Object.keys(properties)

  if (!keys.length) {
    return <p className="text-sm text-muted-foreground">{t("settings.plugins.noOptions")}</p>
  }

  const set = (key: string, next: unknown) => onChange({ ...value, [key]: next })

  return (
    <div className="space-y-4">
      {keys.map((key) => (
        <SchemaField
          key={key}
          name={key}
          path={key}
          schema={properties[key]}
          value={value[key]}
          onChange={(next) => set(key, next)}
          onValidity={onValidity}
        />
      ))}
    </div>
  )
}

function SchemaField({ name, path, schema, value, onChange, onValidity }: {
  name: string
  path: string
  schema: PluginSchema
  value: unknown
  onChange: (next: unknown) => void
  onValidity: (path: string, valid: boolean) => void
}) {
  const { t } = useI18n()

  // A nested object with declared properties is a section of its own; one
  // without a schema is free-form and falls through to the JSON editor.
  if (schema.type === "object" && schema.properties && Object.keys(schema.properties).length) {
    const nested = (value && typeof value === "object" && !Array.isArray(value) ? value : {}) as Record<string, unknown>
    return (
      <fieldset className="rounded-lg border p-4">
        <legend className="px-1 text-sm font-medium">{schema.description || name}</legend>
        <div className="space-y-4 pt-1">
          {Object.keys(schema.properties).map((key) => (
            <SchemaField
              key={key}
              name={key}
              path={`${path}.${key}`}
              schema={schema.properties![key]}
              value={nested[key]}
              onChange={(next) => onChange({ ...nested, [key]: next })}
              onValidity={onValidity}
            />
          ))}
        </div>
      </fieldset>
    )
  }

  return (
    <div className="space-y-1.5 border-b pb-4 last:border-b-0 last:pb-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">{schema.description || name}</span>
        <code className="font-mono text-xs text-muted-foreground">{name}</code>
        {schema.isRequired && <Badge variant="outline">{t("settings.plugins.required")}</Badge>}
        {schema.defaultValue !== undefined && (
          <span className="text-xs text-muted-foreground">
            {t("settings.plugins.defaultValue")}: <code className="font-mono">{JSON.stringify(schema.defaultValue)}</code>
          </span>
        )}
      </div>
      {schema.enum?.length ? (
        <Select value={value === undefined || value === null ? "" : String(value)} onValueChange={(next) => onChange(coerce(next, schema.enum![0]))}>
          <SelectTrigger className="w-full sm:max-w-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {schema.enum.map((option) => <SelectItem key={String(option)} value={String(option)}>{String(option)}</SelectItem>)}
          </SelectContent>
        </Select>
      ) : schema.type === "boolean" ? (
        <Switch checked={value === true} onCheckedChange={(next) => onChange(next)} aria-label={name} />
      ) : schema.type === "number" ? (
        <Input
          type="number"
          className="w-full sm:max-w-xs"
          value={value === undefined || value === null ? "" : String(value)}
          onChange={(event) => onChange(event.target.value === "" ? undefined : Number(event.target.value))}
        />
      ) : schema.type === "string" ? (
        <Input value={value === undefined || value === null ? "" : String(value)} onChange={(event) => onChange(event.target.value)} />
      ) : schema.type === "array" ? (
        <ArrayField name={name} path={path} schema={schema.items} value={Array.isArray(value) ? value : []} onChange={onChange} onValidity={onValidity} />
      ) : (
        <JsonField path={path} value={value} onChange={onChange} onValidity={onValidity} />
      )}
    </div>
  )
}

function ArrayField({ name, path, schema, value, onChange, onValidity }: {
  name: string
  path: string
  schema?: PluginSchema
  value: unknown[]
  onChange: (next: unknown) => void
  onValidity: (path: string, valid: boolean) => void
}) {
  const { t } = useI18n()
  const scalar = schema?.type === "string" || schema?.type === "number"
  const replace = (index: number, next: unknown) => onChange(value.map((item, current) => (current === index ? next : item)))

  return (
    <div className="space-y-2">
      {value.map((item, index) => (
        <div key={index} className="flex items-start gap-2">
          {scalar ? (
            <Input
              type={schema?.type === "number" ? "number" : "text"}
              value={item === undefined || item === null ? "" : String(item)}
              onChange={(event) => replace(index, schema?.type === "number" ? Number(event.target.value) : event.target.value)}
            />
          ) : (
            <JsonField path={`${path}.${index}`} value={item} onChange={(next) => replace(index, next)} onValidity={onValidity} inline />
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={t("settings.plugins.removeItem")}
            onClick={() => onChange(value.filter((_, current) => current !== index))}
          >
            <Trash2 size={15} />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-2"
        aria-label={`${t("settings.plugins.addItem")} ${name}`}
        onClick={() => onChange([...value, schema?.type === "number" ? 0 : schema?.type === "boolean" ? false : schema?.type === "object" || schema?.type === "array" ? {} : ""])}
      >
        <Plus size={15} />{t("settings.plugins.addItem")}
      </Button>
    </div>
  )
}

/**
 * Free-form values are edited as JSON. The text is kept locally so a half-typed
 * document stays visible; the draft only ever receives values that parse.
 */
function JsonField({ path, value, onChange, onValidity, inline }: {
  path: string
  value: unknown
  onChange: (next: unknown) => void
  onValidity: (path: string, valid: boolean) => void
  inline?: boolean
}) {
  const { t } = useI18n()
  const [text, setText] = useState(() => stringify(value))
  const [error, setError] = useState(false)

  return (
    <div className={cn("space-y-1", inline && "flex-1")}>
      <Textarea
        className="min-h-24 font-mono text-xs"
        value={text}
        onChange={(event) => {
          const next = event.target.value
          setText(next)
          if (!next.trim()) {
            setError(false)
            onValidity(path, true)
            onChange(schemaFallback(value))
            return
          }
          try {
            onChange(JSON.parse(next))
            setError(false)
            onValidity(path, true)
          } catch {
            setError(true)
            onValidity(path, false)
          }
        }}
      />
      {error && <p className="text-xs text-destructive">{t("settings.plugins.invalidJson")}</p>}
    </div>
  )
}

function stringify(value: unknown) {
  try {
    return value === undefined ? "" : JSON.stringify(value, null, 2)
  } catch {
    return ""
  }
}

/** Keeps the previous shape when a JSON field is emptied. */
function schemaFallback(value: unknown) {
  return Array.isArray(value) ? [] : value && typeof value === "object" ? {} : ""
}

/** An enum holds whatever type its first member has. */
function coerce(text: string, sample: unknown) {
  return typeof sample === "number" ? Number(text) : text
}
