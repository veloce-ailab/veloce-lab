import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useState } from "react"
import type { ReactNode } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Mail, Pencil, Plus, Save, Send, Trash2, Webhook } from "lucide-react"
import api from "@/lib/api"
import { useI18n } from "@/lib/i18n"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { useToast } from "@/components/ui/toast"
import { useConfirmDialog } from "@/components/ui/confirm-dialog"

interface Delivery {
  id: string
  name: string
  description: string
  method: "webhook" | "email"
  webhook_url?: string
  webhook_headers?: string
  email_to?: string
  smtp_host?: string
  smtp_port?: string
  smtp_username?: string
  smtp_password?: string
  smtp_from?: string
  enabled: boolean
  created_at?: string
  updated_at?: string
}

interface DeliveryForm {
  id: string
  name: string
  description: string
  method: "webhook" | "email"
  webhook_url: string
  webhook_headers: string
  email_to: string
  smtp_host: string
  smtp_port: string
  smtp_username: string
  smtp_password: string
  smtp_from: string
  enabled: boolean
}

interface AdvancedChatSettings {
  message_delivery_enabled: boolean
  delivery_system_smtp_enabled: boolean
}

const deliveriesQueryKey = ["advanced-chat-deliveries"] as const

const defaultForm: DeliveryForm = {
  id: "",
  name: "",
  description: "",
  method: "webhook",
  webhook_url: "",
  webhook_headers: "{}",
  email_to: "",
  smtp_host: "",
  smtp_port: "587",
  smtp_username: "",
  smtp_password: "",
  smtp_from: "",
  enabled: true,
}

export default function AdvancedChatDeliveries() {
  const { language } = useI18n()
  const copy = language === "zh" ? zhCopy : language === "ja" ? jaCopy : enCopy
  const queryClient = useQueryClient()
  const { success, error } = useToast()
  const { confirm, confirmDialog } = useConfirmDialog()
  const [form, setForm] = useState<DeliveryForm>(defaultForm)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [deletingID, setDeletingID] = useState("")

  const { data: settings = { message_delivery_enabled: true, delivery_system_smtp_enabled: true } } = useQuery<AdvancedChatSettings>({
    queryKey: ["advanced-chat-user-settings"],
    queryFn: async () => {
      const res = await api.get("/user/advanced-chat/settings")
      return {
        message_delivery_enabled: res.data?.message_delivery_enabled !== false,
        delivery_system_smtp_enabled: res.data?.delivery_system_smtp_enabled !== false,
      }
    },
  })

  const { data: deliveries = [] } = useQuery<Delivery[]>({
    queryKey: deliveriesQueryKey,
    enabled: settings.message_delivery_enabled,
    queryFn: async () => {
      const res = await api.get("/user/advanced-chat/deliveries")
      return Array.isArray(res.data) ? res.data.map(normalizeDelivery).filter((item): item is Delivery => Boolean(item)) : []
    },
  })

  const dialogTitle = form.id ? copy.edit : copy.create

  const openCreate = () => {
    setForm({ ...defaultForm, name: copy.defaultName })
    setIsDialogOpen(true)
  }

  const openEdit = (delivery: Delivery) => {
    setForm({
      id: delivery.id,
      name: delivery.name,
      description: delivery.description,
      method: delivery.method,
      webhook_url: delivery.webhook_url || "",
      webhook_headers: delivery.webhook_headers || "{}",
      email_to: delivery.email_to || "",
      smtp_host: delivery.smtp_host || "",
      smtp_port: delivery.smtp_port || "587",
      smtp_username: delivery.smtp_username || "",
      smtp_password: delivery.smtp_password || "",
      smtp_from: delivery.smtp_from || "",
      enabled: delivery.enabled,
    })
    setIsDialogOpen(true)
  }

  const saveDelivery = async () => {
    const payload = {
      name: form.name.trim(),
      description: form.description.trim(),
      method: form.method,
      webhook_url: form.webhook_url.trim(),
      webhook_headers: form.webhook_headers.trim(),
      email_to: form.email_to.trim(),
      smtp_host: form.smtp_host.trim(),
      smtp_port: form.smtp_port.trim() || "587",
      smtp_username: form.smtp_username.trim(),
      smtp_password: form.smtp_password,
      smtp_from: form.smtp_from.trim(),
      enabled: form.enabled,
    }
    if (!payload.name) {
      error(copy.nameRequired)
      return
    }
    if (payload.method === "webhook" && !payload.webhook_url) {
      error(copy.webhookRequired)
      return
    }
    if (payload.method === "email" && !payload.email_to) {
      error(copy.emailRequired)
      return
    }
    if (payload.method === "email" && !settings.delivery_system_smtp_enabled && (!payload.smtp_host || !payload.smtp_from)) {
      error(copy.smtpRequired)
      return
    }
    setIsSaving(true)
    try {
      if (form.id) {
        await api.put(`/user/advanced-chat/deliveries/${encodeURIComponent(form.id)}`, payload)
      } else {
        await api.post("/user/advanced-chat/deliveries", payload)
      }
      success(copy.saved)
      setIsDialogOpen(false)
      await queryClient.invalidateQueries({ queryKey: deliveriesQueryKey })
    } catch (err) {
      error(apiErrorMessage(err, copy.saveFailed))
    } finally {
      setIsSaving(false)
    }
  }

  const deleteDelivery = async (delivery: Delivery) => {
    if (!await confirm({ description: copy.deleteConfirm.replace("{name}", delivery.name) })) {
      return
    }
    setDeletingID(delivery.id)
    try {
      await api.delete(`/user/advanced-chat/deliveries/${encodeURIComponent(delivery.id)}`)
      success(copy.deleted)
      await queryClient.invalidateQueries({ queryKey: deliveriesQueryKey })
    } catch (err) {
      error(apiErrorMessage(err, copy.deleteFailed))
    } finally {
      setDeletingID("")
    }
  }

  return (
    <div className="space-y-6">
      {confirmDialog}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">{copy.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{copy.subtitle}</p>
        </div>
        <Button className="gap-2" onClick={openCreate} disabled={!settings.message_delivery_enabled}>
          <Plus size={16} />
          {copy.create}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Send size={18} />
            {copy.list}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!settings.message_delivery_enabled ? (
            <div className="rounded-md border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">{copy.disabledByAdmin}</div>
          ) : deliveries.length === 0 ? (
            <div className="rounded-md border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">{copy.empty}</div>
          ) : (
            <div className="space-y-3">
              {deliveries.map((delivery) => (
                <div key={delivery.id} className="rounded-md border p-4">
                  <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-center">
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-center gap-2">
                        {delivery.method === "email" ? <Mail size={16} /> : <Webhook size={16} />}
                        <span className="truncate text-sm font-medium">{delivery.name}</span>
                        <span className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">{methodLabel(delivery.method, copy)}</span>
                        <span className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">{delivery.enabled ? copy.enabled : copy.disabled}</span>
                      </div>
                      {delivery.description && <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">{delivery.description}</div>}
                      <div className="mt-1 truncate text-xs text-muted-foreground">
                        {delivery.method === "email" ? delivery.email_to : delivery.webhook_url}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 md:justify-end">
                      <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => openEdit(delivery)} title={copy.edit}>
                        <Pencil size={15} />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        disabled={deletingID === delivery.id}
                        onClick={() => deleteDelivery(delivery)}
                        title={copy.delete}
                      >
                        <Trash2 size={15} />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{dialogTitle}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label={copy.name}><Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></Field>
              <Field label={copy.method}>
                <Select value={String((form.method) || "__shadcn_empty__")} onValueChange={(value) => setForm({ ...form, method: (value === "__shadcn_empty__" ? "" : value) as DeliveryForm["method"] })}><SelectTrigger className="h-10 w-full rounded-2xl border border-border bg-background px-3 text-sm"><SelectValue /></SelectTrigger><SelectContent>
                  <SelectItem value="webhook">{copy.webhook}</SelectItem>
                  <SelectItem value="email">{copy.email}</SelectItem>
                </SelectContent></Select>
              </Field>
            </div>
            <Field label={copy.description}>
              <textarea className="min-h-20 w-full rounded-md border bg-background px-3 py-2 text-sm" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
            </Field>
            {form.method === "webhook" ? (
              <>
                <Field label={copy.webhookURL}><Input value={form.webhook_url} placeholder="https://example.com/webhook" onChange={(event) => setForm({ ...form, webhook_url: event.target.value })} /></Field>
                <Field label={copy.webhookHeaders}>
                  <textarea className="min-h-24 w-full rounded-md border bg-background px-3 py-2 font-mono text-sm" value={form.webhook_headers} onChange={(event) => setForm({ ...form, webhook_headers: event.target.value })} />
                </Field>
              </>
            ) : (
              <>
                <Field label={copy.emailTo}><Input value={form.email_to} placeholder="ops@example.com" onChange={(event) => setForm({ ...form, email_to: event.target.value })} /></Field>
                <div className="rounded-md border p-3">
                  <div className="text-sm font-medium">{copy.smtpSettings}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {settings.delivery_system_smtp_enabled ? copy.smtpOptionalHint : copy.smtpRequiredHint}
                  </div>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <Field label={copy.smtpHost}><Input value={form.smtp_host} onChange={(event) => setForm({ ...form, smtp_host: event.target.value })} /></Field>
                    <Field label={copy.smtpPort}><Input value={form.smtp_port} onChange={(event) => setForm({ ...form, smtp_port: event.target.value })} /></Field>
                    <Field label={copy.smtpUsername}><Input value={form.smtp_username} onChange={(event) => setForm({ ...form, smtp_username: event.target.value })} /></Field>
                    <Field label={copy.smtpPassword}><Input type="password" value={form.smtp_password} onChange={(event) => setForm({ ...form, smtp_password: event.target.value })} /></Field>
                    <Field label={copy.smtpFrom}><Input value={form.smtp_from} onChange={(event) => setForm({ ...form, smtp_from: event.target.value })} /></Field>
                  </div>
                </div>
              </>
            )}
            <label className="flex items-center gap-2 rounded-md border bg-muted/30 p-3 text-sm">
              <Switch checked={form.enabled} onCheckedChange={(checked) => setForm({ ...form, enabled: checked })} />
              <span className="font-medium">{copy.enabled}</span>
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>{copy.cancel}</Button>
            <Button className="gap-2" disabled={isSaving} onClick={saveDelivery}>
              <Save size={16} />
              {isSaving ? copy.saving : copy.save}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="space-y-1 text-sm"><span className="font-medium">{label}</span>{children}</label>
}

function methodLabel(method: Delivery["method"], copy: typeof zhCopy) {
  return method === "email" ? copy.email : copy.webhook
}

function normalizeDelivery(value: unknown): Delivery | null {
  if (!isRecord(value)) {
    return null
  }
  const id = stringFromUnknown(value.id)
  if (!id) {
    return null
  }
  return {
    id,
    name: stringFromUnknown(value.name) || "",
    description: stringFromUnknown(value.description) || "",
    method: value.method === "email" ? "email" : "webhook",
    webhook_url: stringFromUnknown(value.webhook_url) || undefined,
    webhook_headers: stringFromUnknown(value.webhook_headers) || "{}",
    email_to: stringFromUnknown(value.email_to) || undefined,
    smtp_host: stringFromUnknown(value.smtp_host) || undefined,
    smtp_port: stringFromUnknown(value.smtp_port) || undefined,
    smtp_username: stringFromUnknown(value.smtp_username) || undefined,
    smtp_password: stringFromUnknown(value.smtp_password) || undefined,
    smtp_from: stringFromUnknown(value.smtp_from) || undefined,
    enabled: value.enabled !== false,
    created_at: stringFromUnknown(value.created_at) || undefined,
    updated_at: stringFromUnknown(value.updated_at) || undefined,
  }
}

function apiErrorMessage(err: unknown, fallback: string) {
  if (isRecord(err) && isRecord(err.response) && isRecord(err.response.data) && typeof err.response.data.error === "string") {
    return err.response.data.error
  }
  return err instanceof Error && err.message ? err.message : fallback
}

function stringFromUnknown(value: unknown) {
  if (typeof value === "string") {
    return value
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value)
  }
  return ""
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

const zhCopy = {
  title: "结果投递",
  subtitle: "配置计划任务完成后的投递目标，任务运行时会把投递工具暴露给 AI。",
  list: "投递列表",
  empty: "暂无投递配置",
  create: "新建投递",
  edit: "编辑投递",
  delete: "删除投递",
  defaultName: "新投递",
  name: "名称",
  description: "描述",
  method: "方式",
  webhook: "Webhook",
  email: "邮箱",
  webhookURL: "Webhook 地址",
  webhookHeaders: "Webhook 请求头",
  emailTo: "收件邮箱",
  smtpSettings: "SMTP 设置",
  smtpOptionalHint: "可以留空并使用管理员允许的系统 SMTP；填写后会优先使用这里的 SMTP。",
  smtpRequiredHint: "管理员不允许使用系统 SMTP，请填写自己的 SMTP。",
  smtpHost: "SMTP 主机",
  smtpPort: "SMTP 端口",
  smtpUsername: "SMTP 用户名",
  smtpPassword: "SMTP 密码",
  smtpFrom: "发件邮箱",
  enabled: "启用",
  disabled: "停用",
  save: "保存",
  saving: "保存中...",
  saved: "投递配置已保存",
  saveFailed: "保存投递配置失败",
  deleted: "投递配置已删除",
  deleteFailed: "删除投递配置失败",
  deleteConfirm: "确定删除投递配置“{name}”吗？",
  nameRequired: "请输入投递名称",
  webhookRequired: "请输入 Webhook 地址",
  emailRequired: "请输入收件邮箱",
  smtpRequired: "请填写 SMTP 主机和发件邮箱",
  disabledByAdmin: "管理员已关闭消息投递",
  cancel: "取消",
}

const enCopy: typeof zhCopy = {
  title: "Result Delivery",
  subtitle: "Configure destinations for scheduled task results. The task exposes a delivery tool to the AI.",
  list: "Delivery list",
  empty: "No delivery configurations",
  create: "New delivery",
  edit: "Edit delivery",
  delete: "Delete delivery",
  defaultName: "New delivery",
  name: "Name",
  description: "Description",
  method: "Method",
  webhook: "Webhook",
  email: "Email",
  webhookURL: "Webhook URL",
  webhookHeaders: "Webhook headers",
  emailTo: "Recipient email",
  smtpSettings: "SMTP settings",
  smtpOptionalHint: "Leave blank to use the system SMTP when allowed. Custom SMTP takes priority when filled.",
  smtpRequiredHint: "System SMTP is not allowed by the administrator. Configure your own SMTP.",
  smtpHost: "SMTP host",
  smtpPort: "SMTP port",
  smtpUsername: "SMTP username",
  smtpPassword: "SMTP password",
  smtpFrom: "From email",
  enabled: "Enabled",
  disabled: "Disabled",
  save: "Save",
  saving: "Saving...",
  saved: "Delivery saved",
  saveFailed: "Failed to save delivery",
  deleted: "Delivery deleted",
  deleteFailed: "Failed to delete delivery",
  deleteConfirm: 'Delete delivery "{name}"?',
  nameRequired: "Delivery name is required",
  webhookRequired: "Webhook URL is required",
  emailRequired: "Recipient email is required",
  smtpRequired: "SMTP host and from email are required",
  disabledByAdmin: "Message delivery is disabled by the administrator",
  cancel: "Cancel",
}

const jaCopy: typeof zhCopy = {
  ...enCopy,
  title: "結果配信",
  subtitle: "スケジュールタスク完了後の配信先を設定します。",
  list: "配信一覧",
  empty: "配信設定はありません",
  create: "配信を作成",
  edit: "配信を編集",
  delete: "配信を削除",
  defaultName: "新しい配信",
  enabled: "有効",
  disabled: "無効",
  cancel: "キャンセル",
}
