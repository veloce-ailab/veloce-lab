import { useMemo, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { ArrowLeft, Download, FileText, Folder, HardDrive, RefreshCw, Trash2, Upload } from "lucide-react"
import api from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { PageInlineSlot, PageTitleSlot } from "@/components/layout/PageTitleSlot"
import { useToast } from "@/components/ui/toast"
import { useI18n } from "@/lib/i18n"
import type { PublicSettings } from "@/lib/public-settings"
import { withPublicSettingsDefaults } from "@/lib/public-settings"

interface AdvancedChatSettings {
  file_storage_enabled: boolean
  file_storage_total_mb: number
  file_storage_used_bytes: number
}

interface StoredFile {
  id: string
  name: string
  type: string
  size: number
  source: string
  text_available: boolean
  created_at: string
  updated_at: string
}

interface FileListResponse {
  files: StoredFile[]
  used_bytes: number
  total_bytes: number
  remaining_bytes: number
}

interface EnterpriseSharedPool {
  id: number
  scope_type: "task" | "department" | string
  name: string
}

const filesQueryKey = ["advanced-chat-files"] as const

export default function AdvancedChatFiles() {
  const { language } = useI18n()
  const copy = language === "zh" ? zhCopy : enCopy
  const queryClient = useQueryClient()
  const { success, error } = useToast()
  const { data: publicSettings } = useQuery<PublicSettings>({ queryKey: ["public-settings"], queryFn: async () => (await api.get("/public/settings")).data })
  const enterpriseMode = String(withPublicSettingsDefaults(publicSettings).system_mode).toLowerCase() === "enterprise"
  const [isUploading, setIsUploading] = useState(false)
  const [deletingID, setDeletingID] = useState("")
  const [downloadingID, setDownloadingID] = useState("")
  const [searchParams, setSearchParams] = useSearchParams()
  const selectedPoolID = searchParams.get("pool") || ""
  const openPool = (poolID: number) => setSearchParams({ pool: String(poolID) })
  const closePool = () => setSearchParams({})

  const { data: settings } = useQuery<AdvancedChatSettings>({
    queryKey: ["advanced-chat-file-settings"],
    queryFn: async () => {
      const res = await api.get("/user/advanced-chat/settings")
      return normalizeSettings(res.data)
    },
  })

  const storageEnabled = settings?.file_storage_enabled !== false
  const filesQuery = useQuery<FileListResponse>({
    queryKey: filesQueryKey,
    enabled: storageEnabled,
    queryFn: async () => {
      const res = await api.get("/user/advanced-chat/files")
      return normalizeFileListResponse(res.data)
    },
  })

  const { data: sharedPools = [] } = useQuery<EnterpriseSharedPool[]>({
    queryKey: ["enterprise-shared-pools", "files"],
    enabled: enterpriseMode,
    queryFn: async () => {
      const res = await api.get("/user/enterprise/shared-pools")
      const items = isRecord(res.data) && Array.isArray(res.data.pools) ? res.data.pools : []
      return items.map(normalizeSharedPool).filter((pool): pool is EnterpriseSharedPool => Boolean(pool))
    },
  })
  const { data: sharedFiles = [], isLoading: sharedFilesLoading, isFetching: sharedFilesFetching, refetch: refetchSharedFiles } = useQuery<StoredFile[]>({
    queryKey: ["enterprise-shared-pool-files", selectedPoolID],
    enabled: enterpriseMode && Boolean(selectedPoolID),
    queryFn: async () => {
      const res = await api.get(`/user/enterprise/shared-pools/${encodeURIComponent(selectedPoolID)}/files`)
      const items = isRecord(res.data) && Array.isArray(res.data.files) ? res.data.files : []
      return items.map(normalizeFile).filter((file): file is StoredFile => Boolean(file))
    },
  })
  const isSharedPoolView = enterpriseMode && Boolean(selectedPoolID)
  const visibleFiles = isSharedPoolView ? sharedFiles : filesQuery.data?.files || []

  const usage = useMemo(() => {
    const used = filesQuery.data?.used_bytes ?? settings?.file_storage_used_bytes ?? 0
    const total = filesQuery.data?.total_bytes ?? Math.max(0, Number(settings?.file_storage_total_mb || 0)) * 1024 * 1024
    return { used, total, percent: total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0 }
  }, [filesQuery.data?.total_bytes, filesQuery.data?.used_bytes, settings?.file_storage_total_mb, settings?.file_storage_used_bytes])

  const uploadFiles = async (files: FileList | null) => {
    if (!files?.length || isUploading) {
      return
    }
    setIsUploading(true)
    try {
      let uploaded = 0
      for (const file of Array.from(files)) {
        const formData = new FormData()
        formData.append("file", file)
        const res = await api.post("/user/advanced-chat/files", formData)
        const uploadedFile = normalizeFile(res.data?.file)
        if (selectedPoolID && uploadedFile) {
          await api.post(`/user/enterprise/shared-pools/${encodeURIComponent(selectedPoolID)}/files`, { id: uploadedFile.id })
        }
        uploaded += 1
      }
      success(copy.uploaded.replace("{count}", String(uploaded)))
      await queryClient.invalidateQueries({ queryKey: filesQueryKey })
      if (selectedPoolID) {
        await queryClient.invalidateQueries({ queryKey: ["enterprise-shared-pool-files", selectedPoolID] })
      }
      await queryClient.invalidateQueries({ queryKey: ["advanced-chat-file-settings"] })
    } catch (err) {
      error(apiErrorMessage(err, copy.uploadFailed))
    } finally {
      setIsUploading(false)
    }
  }

  const deleteFile = async (file: StoredFile) => {
    if (deletingID) {
      return
    }
    setDeletingID(file.id)
    try {
      await api.delete(`/user/advanced-chat/files/${encodeURIComponent(file.id)}`)
      success(copy.deleted)
      await queryClient.invalidateQueries({ queryKey: filesQueryKey })
      await queryClient.invalidateQueries({ queryKey: ["advanced-chat-file-settings"] })
    } catch (err) {
      error(apiErrorMessage(err, copy.deleteFailed))
    } finally {
      setDeletingID("")
    }
  }

  const downloadFile = async (file: StoredFile) => {
    if (downloadingID) {
      return
    }
    setDownloadingID(file.id)
    try {
      const source = selectedPoolID
        ? `/user/enterprise/shared-pools/${encodeURIComponent(selectedPoolID)}/files/${encodeURIComponent(file.id)}/download`
        : `/user/advanced-chat/files/${encodeURIComponent(file.id)}/download`
      const res = await api.get(source, { responseType: "blob" })
      const url = URL.createObjectURL(res.data)
      const link = document.createElement("a")
      link.href = url
      link.download = file.name || "file"
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">{copy.title}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{copy.subtitle}</p>
        </div>
        {storageEnabled && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="gap-2" disabled={isSharedPoolView ? sharedFilesFetching : filesQuery.isFetching} onClick={() => isSharedPoolView ? refetchSharedFiles() : filesQuery.refetch()}>
              <RefreshCw size={16} />
              {copy.refresh}
            </Button>
            <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
              <Upload size={16} />
              {isUploading ? copy.uploading : copy.upload}
              <Input className="sr-only" type="file" multiple disabled={isUploading} onChange={(event) => {
                uploadFiles(event.target.files)
                event.target.value = ""
              }} />
            </label>
          </div>
        )}
      </div>

      <PageTitleSlot />

      {!storageEnabled ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">{copy.disabled}</CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <HardDrive size={18} />
                {copy.storage}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div className="h-full bg-primary transition-all" style={{ width: `${usage.percent}%` }} />
              </div>
              <div className="flex flex-col gap-1 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                <span>{formatBytes(usage.used)} / {formatBytes(usage.total)}</span>
                <span>{usage.percent}%</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><span className="flex items-center gap-2">{isSharedPoolView && <Folder size={18} className={sharedPools.find((pool) => String(pool.id) === selectedPoolID)?.scope_type === "task" ? "text-teal-600" : "text-amber-600"} />}{isSharedPoolView ? sharedPoolLabel(sharedPools.find((pool) => String(pool.id) === selectedPoolID) || { id: 0, scope_type: "", name: copy.files }, language) : copy.files}</span>{isSharedPoolView && <Button size="sm" variant="outline" onClick={closePool}><ArrowLeft className="mr-1 h-4 w-4" />{language === "zh" ? "返回文件根目录" : "Back to file root"}</Button>}</CardTitle>
            </CardHeader>
            <CardContent>
              {!isSharedPoolView && sharedPools.length > 0 && <div className="mb-4 grid gap-2 border-b pb-4 sm:grid-cols-2"><div className="col-span-full px-1 pb-1 text-xs font-medium text-muted-foreground">{language === "zh" ? "任务与部门文件夹" : "Task and department folders"}</div>{sharedPools.map((pool) => <button key={pool.id} type="button" className="flex min-h-16 items-center gap-3 rounded-md border px-4 text-left text-sm hover:bg-muted" onClick={() => openPool(pool.id)}><Folder size={22} className={pool.scope_type === "task" ? "shrink-0 text-teal-600" : "shrink-0 text-amber-600"} /><span className="min-w-0"><span className="block truncate font-medium">{pool.name}</span><span className="mt-1 block text-xs text-muted-foreground">{pool.scope_type === "task" ? (language === "zh" ? "任务文件夹" : "Task folder") : (language === "zh" ? "部门文件夹" : "Department folder")}</span></span></button>)}</div>}
              {visibleFiles.length === 0 ? (
                <div className="flex min-h-72 flex-col items-center justify-center gap-3 rounded-md border border-dashed text-center text-sm text-muted-foreground">
                  <FileText className="h-8 w-8" />
                  <div>{isSharedPoolView ? (sharedFilesLoading ? copy.loading : copy.empty) : (filesQuery.isLoading ? copy.loading : copy.empty)}</div>
                </div>
              ) : (
                <div className="grid gap-3">
                  {visibleFiles.map((file) => (
                    <div key={file.id} className="flex flex-col gap-3 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex min-w-0 items-center gap-2">
                          <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                          <span className="truncate text-sm font-medium">{file.name}</span>
                          {file.text_available && <span className="shrink-0 rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">{copy.text}</span>}
                        </div>
                        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          <span>{file.type || "application/octet-stream"}</span>
                          <span>{formatBytes(file.size)}</span>
                          <span>{formatDate(file.created_at)}</span>
                        </div>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <Button variant="outline" size="icon" disabled={downloadingID === file.id} onClick={() => downloadFile(file)} title={copy.download} aria-label={copy.download}>
                          <Download size={16} />
                        </Button>
                        {!isSharedPoolView && <Button variant="outline" size="icon" disabled={deletingID === file.id} onClick={() => deleteFile(file)} title={copy.delete} aria-label={copy.delete}>
                          <Trash2 size={16} />
                        </Button>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      <PageInlineSlot slotKey="primary" />
      <PageInlineSlot slotKey="secondary" />
    </div>
  )
}

function normalizeSettings(value: unknown): AdvancedChatSettings {
  const item = isRecord(value) ? value : {}
  return {
    file_storage_enabled: item.file_storage_enabled !== false,
    file_storage_total_mb: Number(item.file_storage_total_mb || 0),
    file_storage_used_bytes: Number(item.file_storage_used_bytes || 0),
  }
}

function normalizeFileListResponse(value: unknown): FileListResponse {
  const item = isRecord(value) ? value : {}
  return {
    files: Array.isArray(item.files) ? item.files.map(normalizeFile).filter((file): file is StoredFile => Boolean(file)) : [],
    used_bytes: Number(item.used_bytes || 0),
    total_bytes: Number(item.total_bytes || 0),
    remaining_bytes: Number(item.remaining_bytes || 0),
  }
}

function normalizeFile(value: unknown): StoredFile | null {
  const item = isRecord(value) ? value : {}
  const id = typeof item.id === "string" ? item.id : ""
  if (!id) {
    return null
  }
  return {
    id,
    name: typeof item.name === "string" ? item.name : id,
    type: typeof item.type === "string" ? item.type : "",
    size: Number(item.size || 0),
    source: typeof item.source === "string" ? item.source : "",
    text_available: item.text_available === true,
    created_at: typeof item.created_at === "string" ? item.created_at : "",
    updated_at: typeof item.updated_at === "string" ? item.updated_at : "",
  }
}

function normalizeSharedPool(value: unknown): EnterpriseSharedPool | null {
  const item = isRecord(value) ? value : {}
  const id = Number(item.id || 0)
  if (!Number.isFinite(id) || id <= 0) {
    return null
  }
  return {
    id,
    scope_type: typeof item.scope_type === "string" ? item.scope_type : "",
    name: typeof item.name === "string" && item.name ? item.name : `Pool ${id}`,
  }
}

function sharedPoolLabel(pool: EnterpriseSharedPool, language: string) {
  const scope = pool.scope_type === "task" ? (language === "zh" ? "任务文件夹" : "Task folder") : (language === "zh" ? "部门文件夹" : "Department folder")
  return `${scope}: ${pool.name}`
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B"
  }
  if (bytes < 1024) {
    return `${bytes} B`
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`
  }
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  }
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`
}

function formatDate(value: string) {
  if (!value) {
    return "-"
  }
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

function apiErrorMessage(err: unknown, fallback: string) {
  if (isRecord(err)) {
    const response = err.response
    if (isRecord(response)) {
      const data = response.data
      if (isRecord(data) && typeof data.error === "string" && data.error) {
        return data.error
      }
    }
  }
  return err instanceof Error && err.message ? err.message : fallback
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

const zhCopy = {
  title: "文件库",
  subtitle: "管理助理聊天可复用的附件和自动保存的生成结果。",
  storage: "存储空间",
  files: "文件",
  personalFiles: "个人文件",
  upload: "上传文件",
  uploading: "上传中",
  uploaded: "已上传 {count} 个文件",
  uploadFailed: "上传文件失败",
  refresh: "刷新",
  loading: "加载中",
  empty: "暂无文件",
  text: "文本",
  download: "下载",
  downloadFailed: "下载失败",
  delete: "删除",
  deleted: "文件已删除",
  deleteFailed: "删除文件失败",
  disabled: "管理员已关闭文件存储功能。",
}

const enCopy: typeof zhCopy = {
  title: "Files",
  subtitle: "Manage reusable attachments and auto-saved generation results for agent chat.",
  storage: "Storage",
  files: "Files",
  personalFiles: "Personal files",
  upload: "Upload files",
  uploading: "Uploading",
  uploaded: "Uploaded {count} files",
  uploadFailed: "Failed to upload files",
  refresh: "Refresh",
  loading: "Loading",
  empty: "No files yet",
  text: "Text",
  download: "Download",
  downloadFailed: "Download failed",
  delete: "Delete",
  deleted: "File deleted",
  deleteFailed: "Failed to delete file",
  disabled: "File storage is disabled by the administrator.",
}
