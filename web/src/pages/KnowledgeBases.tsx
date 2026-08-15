import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useMemo, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { ArrowLeft, Download, FileText, FolderOpen, HardDrive, Pencil, Plus, RefreshCw, Trash2, Upload } from "lucide-react"
import api from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { PageInlineSlot, PageTitleSlot } from "@/components/layout/PageTitleSlot"
import { useToast } from "@/components/ui/toast"
import { useI18n } from "@/lib/i18n"

interface KnowledgeBase {
  id: string
  name: string
  description: string
  document_count: number
  storage_bytes: number
  embedding_model_name: string
  embedding_user_channel_id: number
  vectorized: boolean
  created_at: string
  updated_at: string
}

interface KnowledgeDocument {
  id: string
  file_id: string
  name: string
  type: string
  size: number
  text_available: boolean
  embedding_status: string
  embedding_error: string
  chunk_count: number
  download_url: string
  editable: boolean
  created_at: string
}

interface StorageSettings {
  file_storage_enabled: boolean
}

interface UserChannelCatalog { id: number; name: string; models: string[] }

interface KnowledgeDocumentsResponse {
  documents: KnowledgeDocument[]
  used_bytes: number
  total_bytes: number
  remaining_bytes: number
}

const knowledgeBasesQueryKey = ["knowledge-bases"] as const

export default function KnowledgeBases() {
  const { language, t } = useI18n()
  const copy = language === "zh" ? zhCopy : enCopy
  const { success, error } = useToast()
  const queryClient = useQueryClient()
  const [selectedID, setSelectedID] = useState("")
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingBase, setEditingBase] = useState<KnowledgeBase | null>(null)
  const [draftName, setDraftName] = useState("")
  const [draftDescription, setDraftDescription] = useState("")
  const [isSaving, setIsSaving] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [deletingID, setDeletingID] = useState("")
  const [downloadingID, setDownloadingID] = useState("")
  const [embeddingModel, setEmbeddingModel] = useState("")
  const [embeddingChannelID, setEmbeddingChannelID] = useState(0)
  const [embeddingSettingsEdited, setEmbeddingSettingsEdited] = useState(false)
  const [isVectorizing, setIsVectorizing] = useState(false)
  const [isTextEditorOpen, setIsTextEditorOpen] = useState(false)
  const [editingDocument, setEditingDocument] = useState<KnowledgeDocument | null>(null)
  const [textDocumentName, setTextDocumentName] = useState("")
  const [textDocumentContent, setTextDocumentContent] = useState("")
  const [isTextEditorLoading, setIsTextEditorLoading] = useState(false)
  const [isTextEditorSaving, setIsTextEditorSaving] = useState(false)

  const basesQuery = useQuery<KnowledgeBase[]>({
    queryKey: knowledgeBasesQueryKey,
    queryFn: async () => {
      const res = await api.get("/user/advanced-chat/knowledge-bases")
      return normalizeKnowledgeBases(res.data)
    },
  })
  const bases = basesQuery.data || []
  const selectedBase = useMemo(() => bases.find((base) => base.id === selectedID) || null, [bases, selectedID])
  const { data: settings } = useQuery<StorageSettings>({
    queryKey: ["advanced-chat-file-settings"],
    queryFn: async () => normalizeStorageSettings((await api.get("/user/advanced-chat/settings")).data),
  })
  const storageEnabled = settings?.file_storage_enabled !== false
  const { data: catalog = [] } = useQuery<UserChannelCatalog[]>({
    queryKey: ["catalog"],
    queryFn: async () => {
      const res = await api.get("/user/catalog")
      return Array.isArray(res.data) ? res.data.map(normalizeCatalogItem) : []
    },
  })
  const documentsQuery = useQuery<KnowledgeDocumentsResponse>({
    queryKey: ["knowledge-documents", selectedID],
    enabled: Boolean(selectedID),
    queryFn: async () => normalizeKnowledgeDocuments((await api.get(`/user/advanced-chat/knowledge-bases/${encodeURIComponent(selectedID)}/documents`)).data),
  })
  const usage = documentsQuery.data

  const openCreate = () => {
    setEditingBase(null)
    setDraftName("")
    setDraftDescription("")
    setIsDialogOpen(true)
  }

  const openEdit = (base: KnowledgeBase) => {
    setEditingBase(base)
    setDraftName(base.name)
    setDraftDescription(base.description)
    setIsDialogOpen(true)
  }

  const saveBase = async () => {
    const name = draftName.trim()
    if (!name) {
      error(copy.nameRequired)
      return
    }
    setIsSaving(true)
    try {
      if (editingBase) {
        await api.put(`/user/advanced-chat/knowledge-bases/${encodeURIComponent(editingBase.id)}`, { name, description: draftDescription.trim() })
        success(copy.updated)
      } else {
        const res = await api.post("/user/advanced-chat/knowledge-bases", { name, description: draftDescription.trim() })
        const created = normalizeKnowledgeBase(res.data)
        if (created) setSelectedID(created.id)
        success(copy.created)
      }
      setIsDialogOpen(false)
      await queryClient.invalidateQueries({ queryKey: knowledgeBasesQueryKey })
    } catch (err) {
      error(apiErrorMessage(err, editingBase ? copy.updateFailed : copy.createFailed))
    } finally {
      setIsSaving(false)
    }
  }

  const deleteBase = async (base: KnowledgeBase) => {
    if (deletingID) return
    setDeletingID(base.id)
    try {
      await api.delete(`/user/advanced-chat/knowledge-bases/${encodeURIComponent(base.id)}`)
      if (selectedID === base.id) setSelectedID("")
      await queryClient.invalidateQueries({ queryKey: knowledgeBasesQueryKey })
      await queryClient.invalidateQueries({ queryKey: ["advanced-chat-file-settings"] })
      success(copy.deleted)
    } catch (err) {
      error(apiErrorMessage(err, copy.deleteFailed))
    } finally {
      setDeletingID("")
    }
  }

  const uploadDocuments = async (files: FileList | null) => {
    if (!selectedBase || !files?.length || isUploading) return
    setIsUploading(true)
    try {
      let uploaded = 0
      for (const file of Array.from(files)) {
        const body = new FormData()
        body.append("file", file)
        await api.post(`/user/advanced-chat/knowledge-bases/${encodeURIComponent(selectedBase.id)}/documents`, body)
        uploaded += 1
      }
      await queryClient.invalidateQueries({ queryKey: knowledgeBasesQueryKey })
      await queryClient.invalidateQueries({ queryKey: ["knowledge-documents", selectedBase.id] })
      await queryClient.invalidateQueries({ queryKey: ["advanced-chat-file-settings"] })
      success(copy.uploaded.replace("{count}", String(uploaded)))
    } catch (err) {
      error(apiErrorMessage(err, copy.uploadFailed))
    } finally {
      setIsUploading(false)
    }
  }

  const openTextEditor = async (document?: KnowledgeDocument) => {
    if (!selectedBase) return
    setEditingDocument(document || null)
    setTextDocumentName(document?.name || "未命名文档.md")
    setTextDocumentContent("")
    setIsTextEditorOpen(true)
    if (!document) return
    setIsTextEditorLoading(true)
    try {
      const res = await api.get(`/user/advanced-chat/knowledge-bases/${encodeURIComponent(selectedBase.id)}/documents/${encodeURIComponent(document.id)}/content`)
      setTextDocumentName(typeof res.data?.document?.name === "string" ? res.data.document.name : document.name)
      setTextDocumentContent(typeof res.data?.content === "string" ? res.data.content : "")
    } catch (err) {
      error(apiErrorMessage(err, "读取文档失败"))
      setIsTextEditorOpen(false)
    } finally {
      setIsTextEditorLoading(false)
    }
  }

  const saveTextDocument = async () => {
    if (!selectedBase || !textDocumentName.trim() || isTextEditorSaving) return
    setIsTextEditorSaving(true)
    try {
      if (editingDocument) {
        await api.put(`/user/advanced-chat/knowledge-bases/${encodeURIComponent(selectedBase.id)}/documents/${encodeURIComponent(editingDocument.id)}/content`, { name: textDocumentName.trim(), content: textDocumentContent })
      } else {
        await api.post(`/user/advanced-chat/knowledge-bases/${encodeURIComponent(selectedBase.id)}/documents/text`, { name: textDocumentName.trim(), content: textDocumentContent })
      }
      await queryClient.invalidateQueries({ queryKey: knowledgeBasesQueryKey })
      await queryClient.invalidateQueries({ queryKey: ["knowledge-documents", selectedBase.id] })
      success(editingDocument ? "文档已保存" : "文档已创建")
      setIsTextEditorOpen(false)
    } catch (err) {
      error(apiErrorMessage(err, editingDocument ? "保存文档失败" : "创建文档失败"))
    } finally {
      setIsTextEditorSaving(false)
    }
  }

  const deleteDocument = async (document: KnowledgeDocument) => {
    if (!selectedBase || deletingID) return
    setDeletingID(document.id)
    try {
      await api.delete(`/user/advanced-chat/knowledge-bases/${encodeURIComponent(selectedBase.id)}/documents/${encodeURIComponent(document.id)}`)
      await queryClient.invalidateQueries({ queryKey: knowledgeBasesQueryKey })
      await queryClient.invalidateQueries({ queryKey: ["knowledge-documents", selectedBase.id] })
      await queryClient.invalidateQueries({ queryKey: ["advanced-chat-file-settings"] })
      success(copy.documentDeleted)
    } catch (err) {
      error(apiErrorMessage(err, copy.documentDeleteFailed))
    } finally {
      setDeletingID("")
    }
  }

  const downloadDocument = async (knowledgeDocument: KnowledgeDocument) => {
    if (downloadingID) return
    setDownloadingID(knowledgeDocument.id)
    try {
      const res = await api.get(`/user/advanced-chat/files/${encodeURIComponent(knowledgeDocument.file_id)}/download`, { responseType: "blob" })
      const url = URL.createObjectURL(res.data)
      const link = document.createElement("a")
      link.href = url
      link.download = knowledgeDocument.name || "document"
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      error(apiErrorMessage(err, copy.downloadFailed))
    } finally {
      setDownloadingID("")
    }
  }

  const vectorizeKnowledgeBase = async (modelName: string, userChannelID: number) => {
    if (!selectedBase || isVectorizing || !modelName.trim()) return
    setIsVectorizing(true)
    try {
      await api.post(`/user/advanced-chat/knowledge-bases/${encodeURIComponent(selectedBase.id)}/vectorize`, { model_name: modelName.trim(), user_channel_id: userChannelID || 0 })
      setEmbeddingSettingsEdited(false)
      await queryClient.invalidateQueries({ queryKey: knowledgeBasesQueryKey })
      await queryClient.invalidateQueries({ queryKey: ["knowledge-documents", selectedID] })
      success(copy.vectorizationQueued)
    } catch (err) {
      error(apiErrorMessage(err, copy.vectorizationFailed))
    } finally {
      setIsVectorizing(false)
    }
  }

  if (selectedBase) {
    const documents = usage?.documents || []
    const percent = usage?.total_bytes ? Math.min(100, Math.round(((usage.used_bytes || 0) / usage.total_bytes) * 100)) : 0
    const currentEmbeddingModel = embeddingSettingsEdited ? embeddingModel : selectedBase.embedding_model_name || ""
    const currentEmbeddingChannelID = embeddingSettingsEdited ? embeddingChannelID : selectedBase.embedding_user_channel_id || 0
		const availableModels = currentEmbeddingChannelID
			? catalog.find((channel) => channel.id === currentEmbeddingChannelID)?.models || []
			: Array.from(new Set(catalog.flatMap((channel) => channel.models)))
		const modelOptions = currentEmbeddingModel && !availableModels.includes(currentEmbeddingModel) ? [currentEmbeddingModel, ...availableModels] : availableModels
    return (
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <Button variant="outline" size="icon" onClick={() => setSelectedID("")} title={copy.back} aria-label={copy.back}><ArrowLeft size={16} /></Button>
            <div className="min-w-0"><h1 className="truncate text-3xl font-bold">{selectedBase.name}</h1>{selectedBase.description && <p className="mt-2 text-sm text-muted-foreground">{selectedBase.description}</p>}</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="icon" onClick={() => documentsQuery.refetch()} title={copy.refresh} aria-label={copy.refresh}><RefreshCw size={16} /></Button>
            <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">
              <Upload size={16} />{isUploading ? copy.uploading : copy.upload}
              <Input className="sr-only" type="file" multiple disabled={isUploading || !storageEnabled} onChange={(event) => { uploadDocuments(event.target.files); event.target.value = "" }} />
            </label>
          </div>
        </div>
        <PageTitleSlot />
        {!storageEnabled ? <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">{copy.storageDisabled}</CardContent></Card> : <>
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2 text-base"><HardDrive size={18} />{copy.storage}</CardTitle></CardHeader>
            <CardContent className="space-y-3"><div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary" style={{ width: `${percent}%` }} /></div><div className="flex justify-between text-sm text-muted-foreground"><span>{formatBytes(usage?.used_bytes || 0)} / {formatBytes(usage?.total_bytes || 0)}</span><span>{percent}%</span></div></CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">{copy.embedding}</CardTitle></CardHeader>
            <CardContent className="grid gap-3 lg:grid-cols-[180px_minmax(0,1fr)_auto]"><label className="grid gap-2 text-sm"><span>{copy.embeddingChannel}</span><Select value={String((currentEmbeddingChannelID || "") || "__shadcn_empty__")} onValueChange={(value) => { setEmbeddingSettingsEdited(true); setEmbeddingChannelID(Number((value === "__shadcn_empty__" ? "" : value)) || 0); setEmbeddingModel("") }}><SelectTrigger className="h-10 rounded-2xl border border-border bg-background px-3 text-sm"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="__shadcn_empty__">{copy.autoChannel}</SelectItem>{catalog.map((channel) => <SelectItem key={channel.id} value={String(channel.id)}>{channel.name}</SelectItem>)}</SelectContent></Select></label><label className="grid gap-2 text-sm"><span>{copy.embeddingModel}</span><Select value={String((currentEmbeddingModel) || "__shadcn_empty__")} onValueChange={(value) => { setEmbeddingSettingsEdited(true); setEmbeddingModel((value === "__shadcn_empty__" ? "" : value)) }}><SelectTrigger className="h-10 rounded-2xl border border-border bg-background px-3 text-sm"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="__shadcn_empty__">{copy.selectEmbeddingModel}</SelectItem>{modelOptions.map((model) => <SelectItem key={model} value={String(model)}>{model}</SelectItem>)}</SelectContent></Select></label><div className="flex items-end"><Button disabled={isVectorizing || !currentEmbeddingModel.trim() || documents.length === 0} onClick={() => vectorizeKnowledgeBase(currentEmbeddingModel, currentEmbeddingChannelID)}>{isVectorizing ? copy.vectorizing : selectedBase.vectorized ? copy.revectorize : copy.vectorize}</Button></div><p className="lg:col-span-3 text-xs text-muted-foreground">{copy.embeddingHint}</p></CardContent>
          </Card>
          <section className="border-t pt-5"><div className="mb-3 flex items-center gap-2"><FileText size={18} /><h2 className="text-base font-semibold">{copy.documents}</h2><Button size="sm" className="ml-auto gap-2" onClick={() => openTextEditor()}><Plus size={15} />新建文档</Button></div>
            {documentsQuery.isLoading ? <div className="py-10 text-center text-sm text-muted-foreground">{copy.loading}</div> : documents.length === 0 ? <div className="flex min-h-64 flex-col items-center justify-center gap-3 border border-dashed text-center text-sm text-muted-foreground"><FileText className="h-8 w-8" />{copy.emptyDocuments}</div> : <div className="grid gap-2">{documents.map((document) => <div key={document.id} className="flex flex-col gap-3 border p-3 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><div className="flex items-center gap-2"><FileText className="h-4 w-4 shrink-0 text-muted-foreground" /><span className="truncate text-sm font-medium">{document.name}</span>{document.text_available && <span className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">{copy.text}</span>}<span className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">{knowledgeEmbeddingStatusLabel(document.embedding_status, copy)}</span></div><div className="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground"><span>{document.type || "application/octet-stream"}</span><span>{formatBytes(document.size)}</span><span>{document.chunk_count} {copy.chunkUnit}</span><span>{formatDate(document.created_at)}</span></div>{document.embedding_status === "failed" && document.embedding_error && <p className="mt-1 truncate text-xs text-destructive" title={document.embedding_error}>{document.embedding_error}</p>}</div><div className="flex shrink-0 gap-2"><Button variant="outline" size="icon" disabled={downloadingID === document.id} onClick={() => downloadDocument(document)} title={copy.download} aria-label={copy.download}><Download size={16} /></Button>{document.editable && <Button variant="outline" size="icon" onClick={() => openTextEditor(document)} title="编辑" aria-label="编辑"><Pencil size={16} /></Button>}<Button variant="outline" size="icon" disabled={deletingID === document.id} onClick={() => deleteDocument(document)} title={copy.delete} aria-label={copy.delete}><Trash2 size={16} /></Button></div></div>)}</div>}
          </section>
        </>}
        <Dialog open={isTextEditorOpen} onOpenChange={setIsTextEditorOpen}>
          <DialogContent className="flex h-[min(84vh,760px)] max-w-4xl flex-col">
            <DialogHeader><DialogTitle>{editingDocument ? "编辑文档" : "新建文档"}</DialogTitle><DialogDescription>文本内容会保存到知识库，并在保存后重新进入向量化队列。</DialogDescription></DialogHeader>
            <div className="grid min-h-0 flex-1 gap-3">
              <Input value={textDocumentName} maxLength={255} placeholder="文档名称，例如：产品说明.md" onChange={(event) => setTextDocumentName(event.target.value)} disabled={isTextEditorLoading} />
              <textarea className="min-h-0 w-full flex-1 resize-none rounded-md border bg-background p-3 font-mono text-sm outline-none focus:ring-2 focus:ring-ring" value={textDocumentContent} onChange={(event) => setTextDocumentContent(event.target.value)} disabled={isTextEditorLoading} placeholder="开始编写知识库文档…" />
            </div>
            <DialogFooter><Button variant="ghost" onClick={() => setIsTextEditorOpen(false)}>取消</Button><Button disabled={isTextEditorLoading || isTextEditorSaving || !textDocumentName.trim()} onClick={saveTextDocument}>{isTextEditorSaving ? "保存中…" : "保存"}</Button></DialogFooter>
          </DialogContent>
        </Dialog>
        <PageInlineSlot slotKey="primary" /><PageInlineSlot slotKey="secondary" />
      </div>
    )
  }

  return <div className="space-y-6"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><h1 className="text-3xl font-bold">{t("nav.knowledgeBases")}</h1><p className="mt-2 text-sm text-muted-foreground">{copy.subtitle}</p></div><div className="flex gap-2"><Button variant="outline" size="icon" onClick={() => basesQuery.refetch()} title={copy.refresh} aria-label={copy.refresh}><RefreshCw size={16} /></Button><Button className="gap-2" onClick={openCreate}><Plus size={16} />{copy.newBase}</Button></div></div><PageTitleSlot />{basesQuery.isLoading ? <div className="py-16 text-center text-sm text-muted-foreground">{copy.loading}</div> : bases.length === 0 ? <div className="flex min-h-80 flex-col items-center justify-center gap-3 border border-dashed text-center text-sm text-muted-foreground"><FolderOpen className="h-9 w-9" /><span>{copy.emptyBases}</span><Button variant="outline" onClick={openCreate}>{copy.newBase}</Button></div> : <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{bases.map((base) => <article key={base.id} className="flex min-h-44 flex-col border p-4"><button type="button" className="min-w-0 text-left" onClick={() => setSelectedID(base.id)}><div className="flex items-center gap-2"><FolderOpen className="h-5 w-5 shrink-0 text-primary" /><h2 className="truncate font-semibold">{base.name}</h2></div><p className="mt-3 line-clamp-3 min-h-10 text-sm text-muted-foreground">{base.description || copy.noDescription}</p></button><div className="mt-auto flex items-center justify-between pt-4 text-xs text-muted-foreground"><span>{base.document_count} {copy.documentUnit} · {formatBytes(base.storage_bytes)}</span><span className="flex gap-1"><Button variant="ghost" size="sm" onClick={() => openEdit(base)} title={copy.edit} aria-label={copy.edit}><Pencil size={15} /></Button><Button variant="ghost" size="sm" disabled={deletingID === base.id} onClick={() => deleteBase(base)} title={copy.delete} aria-label={copy.delete}><Trash2 size={15} /></Button></span></div></article>)}</div>}<PageInlineSlot slotKey="primary" /><PageInlineSlot slotKey="secondary" /><Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}><DialogContent><DialogHeader><DialogTitle>{editingBase ? copy.editBase : copy.newBase}</DialogTitle><DialogDescription>{copy.dialogDescription}</DialogDescription></DialogHeader><div className="grid gap-4"><label className="grid gap-2 text-sm font-medium">{copy.name}<Input value={draftName} maxLength={120} onChange={(event) => setDraftName(event.target.value)} autoFocus /></label><label className="grid gap-2 text-sm font-medium">{copy.description}<textarea className="min-h-28 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" value={draftDescription} maxLength={5000} onChange={(event) => setDraftDescription(event.target.value)} /></label></div><DialogFooter><Button variant="ghost" onClick={() => setIsDialogOpen(false)}>{t("common.cancel")}</Button><Button disabled={isSaving} onClick={saveBase}>{isSaving ? t("common.saving") : t("common.save")}</Button></DialogFooter></DialogContent></Dialog></div>
}

function normalizeKnowledgeBases(value: unknown): KnowledgeBase[] { const source = isRecord(value) && Array.isArray(value.knowledge_bases) ? value.knowledge_bases : []; return source.map(normalizeKnowledgeBase).filter((base): base is KnowledgeBase => Boolean(base)) }
function normalizeKnowledgeBase(value: unknown): KnowledgeBase | null { if (!isRecord(value) || typeof value.id !== "string" || !value.id) return null; return { id: value.id, name: typeof value.name === "string" ? value.name : value.id, description: typeof value.description === "string" ? value.description : "", document_count: Number(value.document_count || 0), storage_bytes: Number(value.storage_bytes || 0), embedding_model_name: typeof value.embedding_model_name === "string" ? value.embedding_model_name : "", embedding_user_channel_id: Number(value.embedding_user_channel_id || 0), vectorized: value.vectorized === true, created_at: typeof value.created_at === "string" ? value.created_at : "", updated_at: typeof value.updated_at === "string" ? value.updated_at : "" } }
function normalizeKnowledgeDocuments(value: unknown): KnowledgeDocumentsResponse { const item = isRecord(value) ? value : {}; const documents = Array.isArray(item.documents) ? item.documents.map(normalizeKnowledgeDocument).filter((document): document is KnowledgeDocument => Boolean(document)) : []; return { documents, used_bytes: Number(item.used_bytes || 0), total_bytes: Number(item.total_bytes || 0), remaining_bytes: Number(item.remaining_bytes || 0) } }
function normalizeKnowledgeDocument(value: unknown): KnowledgeDocument | null { if (!isRecord(value) || typeof value.id !== "string" || typeof value.file_id !== "string") return null; return { id: value.id, file_id: value.file_id, name: typeof value.name === "string" ? value.name : value.id, type: typeof value.type === "string" ? value.type : "", size: Number(value.size || 0), text_available: value.text_available === true, embedding_status: typeof value.embedding_status === "string" ? value.embedding_status : "pending", embedding_error: typeof value.embedding_error === "string" ? value.embedding_error : "", chunk_count: Number(value.chunk_count || 0), download_url: typeof value.download_url === "string" ? value.download_url : "", editable: value.editable === true, created_at: typeof value.created_at === "string" ? value.created_at : "" } }
function normalizeStorageSettings(value: unknown): StorageSettings { const item = isRecord(value) ? value : {}; return { file_storage_enabled: item.file_storage_enabled !== false } }
function normalizeCatalogItem(value: unknown): UserChannelCatalog { const item = isRecord(value) ? value : {}; return { id: Number(item.id || 0), name: typeof item.name === "string" ? item.name : `#${Number(item.id || 0)}`, models: Array.isArray(item.models) ? item.models.filter((model): model is string => typeof model === "string") : [] } }
function knowledgeEmbeddingStatusLabel(status: string, copy: typeof zhCopy) { if (status === "ready") return copy.ready; if (status === "processing") return copy.processing; if (status === "failed") return copy.failed; if (status === "skipped") return copy.skipped; return copy.pending }
function formatBytes(bytes: number) { if (!Number.isFinite(bytes) || bytes <= 0) return "0 B"; if (bytes < 1024) return `${bytes} B`; if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`; return `${(bytes / 1024 / 1024).toFixed(1)} MB` }
function formatDate(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString() }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null }
function apiErrorMessage(err: unknown, fallback: string) { if (isRecord(err) && isRecord(err.response) && isRecord(err.response.data) && typeof err.response.data.error === "string") return err.response.data.error; return err instanceof Error && err.message ? err.message : fallback }

const zhCopy = { subtitle: "创建个人知识库，集中管理参考文档。文档与文件库共用存储空间。", newBase: "新建知识库", editBase: "编辑知识库", dialogDescription: "知识库仅对当前账号可见。", name: "名称", description: "描述", nameRequired: "请输入知识库名称", created: "知识库已创建", createFailed: "创建知识库失败", updated: "知识库已更新", updateFailed: "更新知识库失败", delete: "删除", deleted: "知识库已删除", deleteFailed: "删除知识库失败", edit: "编辑", loading: "加载中...", refresh: "刷新", emptyBases: "还没有知识库", noDescription: "未填写描述", documentUnit: "份文档", chunkUnit: "个切片", back: "返回知识库", storage: "存储空间", storageDisabled: "管理员已关闭文件存储功能，暂时无法上传知识库文档。", documents: "知识库文档", emptyDocuments: "暂未上传文档", upload: "上传文档", uploading: "上传中", uploaded: "已上传 {count} 份文档", uploadFailed: "上传文档失败", documentDeleted: "文档已删除", documentDeleteFailed: "删除文档失败", download: "下载", downloadFailed: "下载失败", text: "文本", embedding: "向量化", embeddingModel: "嵌入模型", embeddingChannel: "渠道", autoChannel: "自动路由", selectEmbeddingModel: "选择嵌入模型", embeddingHint: "手动向量化会按所选模型价格扣除额度。上传新文档后需再次向量化。", vectorize: "向量化", revectorize: "重新向量化", vectorizing: "向量化中", vectorizationQueued: "已加入向量化队列", vectorizationFailed: "向量化失败", pending: "未向量化", processing: "处理中", ready: "已向量化", failed: "处理失败", skipped: "无可提取文本" }
const enCopy: typeof zhCopy = { subtitle: "Create personal knowledge bases for reference documents. Documents share the file-storage quota.", newBase: "New knowledge base", editBase: "Edit knowledge base", dialogDescription: "Knowledge bases are visible only to your account.", name: "Name", description: "Description", nameRequired: "Enter a knowledge base name", created: "Knowledge base created", createFailed: "Failed to create knowledge base", updated: "Knowledge base updated", updateFailed: "Failed to update knowledge base", delete: "Delete", deleted: "Knowledge base deleted", deleteFailed: "Failed to delete knowledge base", edit: "Edit", loading: "Loading...", refresh: "Refresh", emptyBases: "No knowledge bases yet", noDescription: "No description", documentUnit: "documents", chunkUnit: "chunks", back: "Back to knowledge bases", storage: "Storage", storageDisabled: "File storage is disabled by the administrator, so documents cannot be uploaded yet.", documents: "Documents", emptyDocuments: "No documents uploaded yet", upload: "Upload documents", uploading: "Uploading", uploaded: "Uploaded {count} documents", uploadFailed: "Failed to upload documents", documentDeleted: "Document deleted", documentDeleteFailed: "Failed to delete document", download: "Download", downloadFailed: "Failed to download", text: "Text", embedding: "Vectorization", embeddingModel: "Embedding model", embeddingChannel: "Channel", autoChannel: "Auto routing", selectEmbeddingModel: "Select embedding model", embeddingHint: "Manual vectorization is billed at the selected model price. Vectorize again after uploading documents.", vectorize: "Vectorize", revectorize: "Re-vectorize", vectorizing: "Vectorizing", vectorizationQueued: "Added to vectorization queue", vectorizationFailed: "Failed to vectorize", pending: "Not vectorized", processing: "Processing", ready: "Vectorized", failed: "Failed", skipped: "No extractable text" }
