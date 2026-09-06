import { useQuery, useQueryClient } from "@tanstack/react-query"
import { KeyRound, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react"
import { useState } from "react"
import api from "@/lib/api"
import { useI18n } from "@/lib/i18n"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useConfirmDialog } from "@/components/ui/confirm-dialog"
import { useToast } from "@/components/ui/toast"

type CredentialType = "environment" | "http_header"

interface ConnectorCredential {
  id: string
  name: string
  type: CredentialType
  key: string
  value_set: boolean
  created_at: string
  updated_at: string
}

interface CredentialDraft {
  id: string
  name: string
  type: CredentialType
  key: string
  value: string
}

const queryKey = ["advanced-chat-connector-credentials"] as const
const emptyDraft: CredentialDraft = { id: "", name: "", type: "environment", key: "", value: "" }

export default function ConnectorCredentials() {
  const { language } = useI18n()
  const copy = language === "zh" ? zhCopy : enCopy
  const queryClient = useQueryClient()
  const { success, error } = useToast()
  const { confirm, confirmDialog } = useConfirmDialog()
  const [draft, setDraft] = useState<CredentialDraft>(emptyDraft)
  const [editorOpen, setEditorOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [deletingID, setDeletingID] = useState("")

  const credentialsQuery = useQuery<ConnectorCredential[]>({
    queryKey,
    queryFn: async () => {
      const res = await api.get("/user/advanced-chat/connector-credentials")
      return Array.isArray(res.data) ? res.data.map(normalizeCredential).filter((item): item is ConnectorCredential => Boolean(item)) : []
    },
  })

  const openNew = () => {
    setDraft(emptyDraft)
    setEditorOpen(true)
  }

  const openEdit = (credential: ConnectorCredential) => {
    setDraft({ id: credential.id, name: credential.name, type: credential.type, key: credential.key, value: "" })
    setEditorOpen(true)
  }

  const save = async () => {
    if (isSaving) return
    if (!draft.name.trim() || !draft.key.trim() || (!draft.id && !draft.value.trim())) {
      error(copy.required)
      return
    }
    setIsSaving(true)
    try {
      const payload = { name: draft.name.trim(), type: draft.type, key: draft.key.trim(), value: draft.value || undefined }
      if (draft.id) {
        await api.put(`/user/advanced-chat/connector-credentials/${encodeURIComponent(draft.id)}`, payload)
      } else {
        await api.post("/user/advanced-chat/connector-credentials", payload)
      }
      success(copy.saved)
      setEditorOpen(false)
      await queryClient.invalidateQueries({ queryKey })
    } catch (err) {
      error(apiErrorMessage(err, copy.saveFailed))
    } finally {
      setIsSaving(false)
    }
  }

  const remove = async (credential: ConnectorCredential) => {
    if (!await confirm({ title: copy.deleteCredential, description: copy.deleteConfirm.replace("{name}", credential.name), destructive: true })) return
    setDeletingID(credential.id)
    try {
      await api.delete(`/user/advanced-chat/connector-credentials/${encodeURIComponent(credential.id)}`)
      success(copy.deleted)
      await queryClient.invalidateQueries({ queryKey })
    } catch (err) {
      error(apiErrorMessage(err, copy.deleteFailed))
    } finally {
      setDeletingID("")
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">{copy.title}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{copy.subtitle}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="icon" aria-label={copy.refresh} title={copy.refresh} onClick={() => credentialsQuery.refetch()} disabled={credentialsQuery.isFetching}><RefreshCw size={16} /></Button>
          <Button className="gap-2" onClick={openNew}><Plus size={16} />{copy.newCredential}</Button>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><KeyRound size={18} />{copy.credentials}</CardTitle></CardHeader>
        <CardContent>
          {credentialsQuery.isLoading ? <div className="py-10 text-center text-sm text-muted-foreground">{copy.loading}</div> : (credentialsQuery.data || []).length === 0 ? (
            <div className="rounded-md border border-dashed px-4 py-12 text-center text-sm text-muted-foreground">{copy.empty}</div>
          ) : (
            <div className="divide-y rounded-md border">
              {(credentialsQuery.data || []).map((credential) => (
                <div key={credential.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2"><span className="font-medium">{credential.name}</span><span className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">{credential.type === "environment" ? copy.environment : copy.httpHeader}</span></div>
                    <div className="mt-1 truncate font-mono text-xs text-muted-foreground">{credential.key}</div>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button variant="outline" size="icon" aria-label={copy.edit} title={copy.edit} onClick={() => openEdit(credential)}><Pencil size={15} /></Button>
                    <Button variant="outline" size="icon" aria-label={copy.delete} title={copy.delete} className="text-destructive hover:text-destructive" disabled={deletingID === credential.id} onClick={() => remove(credential)}><Trash2 size={15} /></Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{draft.id ? copy.editCredential : copy.newCredential}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <label className="block space-y-1 text-sm"><span className="font-medium">{copy.name}</span><Input value={draft.name} onChange={(event) => setDraft((value) => ({ ...value, name: event.target.value }))} /></label>
            <label className="block space-y-1 text-sm"><span className="font-medium">{copy.type}</span><Select value={draft.type} onValueChange={(value) => setDraft((current) => ({ ...current, type: value as CredentialType }))}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="environment">{copy.environment}</SelectItem><SelectItem value="http_header">{copy.httpHeader}</SelectItem></SelectContent></Select></label>
            <label className="block space-y-1 text-sm"><span className="font-medium">{copy.key}</span><Input className="font-mono" value={draft.key} placeholder={draft.type === "environment" ? "API_TOKEN" : "Authorization"} onChange={(event) => setDraft((value) => ({ ...value, key: event.target.value }))} /></label>
            <label className="block space-y-1 text-sm"><span className="font-medium">{copy.value}</span><Input type="password" autoComplete="new-password" value={draft.value} placeholder={draft.id ? copy.keepValue : ""} onChange={(event) => setDraft((value) => ({ ...value, value: event.target.value }))} /><span className="text-xs text-muted-foreground">{draft.id ? copy.keepValue : copy.valueHint}</span></label>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setEditorOpen(false)}>{copy.cancel}</Button><Button disabled={isSaving} onClick={save}>{isSaving ? copy.saving : copy.save}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      {confirmDialog}
    </div>
  )
}

function normalizeCredential(value: unknown): ConnectorCredential | null {
  if (!value || typeof value !== "object") return null
  const item = value as Record<string, unknown>
  const id = typeof item.id === "string" ? item.id : ""
  if (!id) return null
  return { id, name: typeof item.name === "string" ? item.name : "", type: item.type === "http_header" ? "http_header" : "environment", key: typeof item.key === "string" ? item.key : "", value_set: item.value_set === true, created_at: typeof item.created_at === "string" ? item.created_at : "", updated_at: typeof item.updated_at === "string" ? item.updated_at : "" }
}

function apiErrorMessage(err: unknown, fallback: string) {
  if (err && typeof err === "object" && "response" in err) {
    const response = (err as { response?: { data?: { error?: unknown } } }).response
    if (typeof response?.data?.error === "string") return response.data.error
  }
  return err instanceof Error ? err.message : fallback
}

const zhCopy = { title: "凭据管理", subtitle: "凭据可绑定到连接器。执行命令时附加环境变量，发起 HTTP 请求时附加请求头。", credentials: "凭据", newCredential: "新建凭据", editCredential: "编辑凭据", name: "名称", type: "类型", environment: "环境变量", httpHeader: "HTTP 请求头", key: "键名", value: "值", valueHint: "凭据值不会在此页面或任务记录中显示。", keepValue: "留空则保持现有值不变", refresh: "刷新", loading: "加载中...", empty: "暂无凭据。新建凭据后可在连接器设备中绑定。", edit: "编辑", delete: "删除", deleteCredential: "删除凭据", deleteConfirm: "确定删除凭据“{name}”吗？关联的连接器将自动解除绑定。", saved: "凭据已保存", saveFailed: "保存凭据失败", deleted: "凭据已删除", deleteFailed: "删除凭据失败", required: "请填写名称、键名和凭据值", save: "保存", saving: "保存中...", cancel: "取消" }
const enCopy: typeof zhCopy = { title: "Credentials", subtitle: "Bind credentials to connectors. Commands receive environment variables and HTTP requests receive headers.", credentials: "Credentials", newCredential: "New credential", editCredential: "Edit credential", name: "Name", type: "Type", environment: "Environment variable", httpHeader: "HTTP header", key: "Key", value: "Value", valueHint: "Credential values are never shown here or in task history.", keepValue: "Leave blank to keep the current value", refresh: "Refresh", loading: "Loading...", empty: "No credentials yet. Create one, then bind it to a connector device.", edit: "Edit", delete: "Delete", deleteCredential: "Delete credential", deleteConfirm: 'Delete credential "{name}"? Bound connectors will be unbound.', saved: "Credential saved", saveFailed: "Failed to save credential", deleted: "Credential deleted", deleteFailed: "Failed to delete credential", required: "Enter a name, key, and credential value", save: "Save", saving: "Saving...", cancel: "Cancel" }
