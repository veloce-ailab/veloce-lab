// The image studio page: one form, one task list.
//
// Generation takes long enough that the page cannot wait for it, so submitting
// only creates a task. The list polls while anything is queued or running, and
// a finished task shows the pictures it produced — which are library files by
// then, hence the link to the file library.
import { useEffect, useMemo, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Link } from "react-router-dom"
import { ImageOff, Loader2, RefreshCw, Sparkles, Trash2, Wand2, X } from "lucide-react"
import { api } from "@/lib/api"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { PageInlineSlot, PageTitleSlot } from "@/components/layout/PageTitleSlot"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/components/ui/toast"
import { useI18n } from "@/lib/i18n"

interface CatalogEntry {
  id: number
  name: string
  models: string[]
  model_icons: Record<string, string>
}

interface TaskFile {
  id: string
  name: string
  type: string
  size: number
  download_url: string
}

interface ImageTask {
  id: string
  status: "queued" | "running" | "completed" | "failed"
  model: string
  channel_id: number
  channel_name: string
  operation: string
  prompt: string
  negative_prompt: string
  size: string
  quality: string
  style: string
  count: number
  seed: number | null
  reference_file_id: string
  error_message: string
  files: TaskFile[]
  created_at: string
  started_at: string | null
  finished_at: string | null
}

interface StoredImage {
  id: string
  name: string
  type: string
  download_url: string
}

const SIZE_PRESETS = ["1024x1024", "1280x720", "720x1280", "1536x1024", "1024x1536", "512x512"]
/** Radix selects reject an empty value, so "no preference" is carried by a named one. */
const defaultChoice = "__default__"
const tasksQueryKey = ["image-tasks"] as const
// Deliberately not `["advanced-chat-files"]`: the chat pages cache that key with
// their own shape, and reading someone else's cache is what made this page call
// `.filter` on an object.
const filesQueryKey = ["image-studio-files"] as const

export default function ImageStudio() {
  const { language } = useI18n()
  const copy = language === "zh" ? zhCopy : enCopy
  const { success, error } = useToast()
  const queryClient = useQueryClient()

  const [prompt, setPrompt] = useState("")
  const [negativePrompt, setNegativePrompt] = useState("")
  const [target, setTarget] = useState("")
  const [size, setSize] = useState(SIZE_PRESETS[0])
  const [customSize, setCustomSize] = useState("")
  const [count, setCount] = useState("1")
  const [quality, setQuality] = useState("")
  const [style, setStyle] = useState("")
  const [seed, setSeed] = useState("")
  const [reference, setReference] = useState<StoredImage | null>(null)
  const [pickingReference, setPickingReference] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [preview, setPreview] = useState<TaskFile | null>(null)
  const [deletingID, setDeletingID] = useState("")

  const catalogQuery = useQuery<CatalogEntry[]>({
    queryKey: ["user-catalog"],
    queryFn: async () => {
      const res = await api.get("/user/catalog")
      return Array.isArray(res.data) ? res.data.map(normalizeCatalog).filter((entry): entry is CatalogEntry => Boolean(entry)) : []
    },
  })

  const options = useMemo(() => {
    const entries = Array.isArray(catalogQuery.data) ? catalogQuery.data : []
    return entries.flatMap((entry) =>
      entry.models.map((model) => ({
        key: `${entry.id}:${model}`,
        label: `${model} · ${entry.name}`,
        channelId: entry.id,
        model,
      })),
    )
  }, [catalogQuery.data])

  // Prefer the model that was used last, so the page opens ready to go; fall
  // back to the first entry so the form is usable without touching the picker.
  useEffect(() => {
    if (target || options.length === 0) return
    const saved = typeof localStorage === "undefined" ? "" : localStorage.getItem("image-studio-target") || ""
    setTarget(saved && options.some((option) => option.key === saved) ? saved : options[0].key)
  }, [options, target])

  const tasksQuery = useQuery<ImageTask[]>({
    queryKey: tasksQueryKey,
    queryFn: async () => {
      const res = await api.get("/image/tasks")
      const items = isRecord(res.data) && Array.isArray(res.data.tasks) ? res.data.tasks : []
      return items.map(normalizeTask).filter((task): task is ImageTask => Boolean(task))
    },
    // A queued task changes without the page doing anything.
    refetchInterval: (query) => {
      const tasks = query.state.data
      return Array.isArray(tasks) && tasks.some((task) => task.status === "queued" || task.status === "running") ? 2500 : false
    },
  })

  const filesQuery = useQuery<StoredImage[]>({
    queryKey: filesQueryKey,
    enabled: pickingReference,
    queryFn: async () => {
      const res = await api.get("/user/advanced-chat/files")
      return imageList(res.data)
    },
  })

  const images = imageList(filesQuery.data).filter((file) => file.type.startsWith("image/"))
  const effectiveSize = size === "custom" ? customSize.trim() : size

  const submit = async () => {
    const text = prompt.trim()
    if (!text || submitting) return
    const selected = options.find((option) => option.key === target)
    if (!selected) {
      error(copy.modelRequired)
      return
    }
    if (!/^\d{2,5}x\d{2,5}$/.test(effectiveSize)) {
      error(copy.sizeInvalid)
      return
    }
    setSubmitting(true)
    try {
      await api.post("/image/tasks", {
        prompt: text,
        negativePrompt: negativePrompt.trim(),
        model: selected.model,
        channelId: selected.channelId,
        size: effectiveSize,
        count: Number(count) || 1,
        quality,
        style,
        seed: seed.trim() === "" ? null : Number(seed),
        referenceFileId: reference?.id || "",
      })
      success(copy.queued)
      if (typeof localStorage !== "undefined") localStorage.setItem("image-studio-target", selected.key)
      await queryClient.invalidateQueries({ queryKey: tasksQueryKey })
    } catch (err) {
      error(apiErrorMessage(err, copy.submitFailed))
    } finally {
      setSubmitting(false)
    }
  }

  const removeTask = async (task: ImageTask) => {
    if (deletingID) return
    setDeletingID(task.id)
    try {
      await api.delete(`/image/tasks/${encodeURIComponent(task.id)}`)
      await queryClient.invalidateQueries({ queryKey: tasksQueryKey })
    } catch (err) {
      error(apiErrorMessage(err, copy.deleteFailed))
    } finally {
      setDeletingID("")
    }
  }

  /** Fill the form from a finished task, so a good result can be varied. */
  const reuse = (task: ImageTask) => {
    setPrompt(task.prompt)
    setNegativePrompt(task.negative_prompt || "")
    const option = options.find((entry) => entry.model === task.model && entry.channelId === task.channel_id)
      || options.find((entry) => entry.model === task.model)
    if (option) setTarget(option.key)
    if (SIZE_PRESETS.includes(task.size)) setSize(task.size)
    else if (task.size) {
      setSize("custom")
      setCustomSize(task.size)
    }
    setCount(String(task.count || 1))
    setQuality(task.quality || "")
    setStyle(task.style || "")
    setSeed(task.seed === null || task.seed === undefined ? "" : String(task.seed))
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  const tasks = tasksQuery.data || []

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{copy.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {copy.subtitle}
          {" "}
          <Link to="/chat/files" className="text-primary underline underline-offset-4">{copy.libraryLink}</Link>
        </p>
      </div>

      <PageTitleSlot />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><Wand2 size={16} />{copy.formTitle}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="image-prompt">{copy.prompt}</Label>
              <Textarea
                id="image-prompt"
                className="min-h-28"
                value={prompt}
                placeholder={copy.promptPlaceholder}
                onChange={(event) => setPrompt(event.target.value)}
                onKeyDown={(event) => {
                  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                    event.preventDefault()
                    void submit()
                  }
                }}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="image-negative-prompt">{copy.negativePrompt}</Label>
              <Input
                id="image-negative-prompt"
                value={negativePrompt}
                placeholder={copy.negativePromptPlaceholder}
                onChange={(event) => setNegativePrompt(event.target.value)}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="image-model">{copy.model}</Label>
                <Select value={target} onValueChange={setTarget} disabled={options.length === 0}>
                  <SelectTrigger id="image-model" className="w-full">
                    <SelectValue placeholder={catalogQuery.isLoading ? copy.loading : copy.noModels} />
                  </SelectTrigger>
                  <SelectContent>
                    {options.map((option) => <SelectItem key={option.key} value={option.key}>{option.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="image-size">{copy.size}</Label>
                <Select value={size} onValueChange={setSize}>
                  <SelectTrigger id="image-size" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SIZE_PRESETS.map((preset) => <SelectItem key={preset} value={preset}>{preset}</SelectItem>)}
                    <SelectItem value="custom">{copy.customSize}</SelectItem>
                  </SelectContent>
                </Select>
                {size === "custom" && (
                  <Input
                    className="mt-1"
                    value={customSize}
                    placeholder="1024x1536"
                    aria-label={copy.customSize}
                    onChange={(event) => setCustomSize(event.target.value)}
                  />
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="image-count">{copy.count}</Label>
                <Select value={count} onValueChange={setCount}>
                  <SelectTrigger id="image-count" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 4].map((value) => <SelectItem key={value} value={String(value)}>{value}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="image-quality">{copy.quality}</Label>
                {/* Radix selects refuse an empty item value, so `default` carries the empty option. */}
                <Select value={quality || defaultChoice} onValueChange={(value) => setQuality(value === defaultChoice ? "" : value)}>
                  <SelectTrigger id="image-quality" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={defaultChoice}>{copy.defaultOption}</SelectItem>
                    <SelectItem value="standard">standard</SelectItem>
                    <SelectItem value="hd">hd</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="image-style">{copy.style}</Label>
                <Select value={style || defaultChoice} onValueChange={(value) => setStyle(value === defaultChoice ? "" : value)}>
                  <SelectTrigger id="image-style" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={defaultChoice}>{copy.defaultOption}</SelectItem>
                    <SelectItem value="vivid">vivid</SelectItem>
                    <SelectItem value="natural">natural</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="image-seed">{copy.seed}</Label>
                <Input
                  id="image-seed"
                  value={seed}
                  inputMode="numeric"
                  placeholder={copy.seedPlaceholder}
                  onChange={(event) => setSeed(event.target.value.replace(/[^\d]/g, ""))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <span className="text-sm font-medium">{copy.reference}</span>
              <div className="flex flex-wrap items-center gap-2">
                {reference ? (
                  <Badge variant="secondary" className="h-9 max-w-full gap-2 pl-1 pr-1">
                    <FileThumb file={reference} className="h-7 w-7 rounded object-cover" />
                    <span className="max-w-48 truncate font-normal">{reference.name}</span>
                    <button type="button" className="rounded p-0.5 hover:bg-background" onClick={() => setReference(null)} aria-label={copy.clearReference}>
                      <X size={13} />
                    </button>
                  </Badge>
                ) : (
                  <span className="text-xs text-muted-foreground">{copy.referenceHint}</span>
                )}
                <Button type="button" variant="outline" size="sm" onClick={() => setPickingReference(true)}>{copy.chooseReference}</Button>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 pt-1">
              <span className="text-xs text-muted-foreground">{copy.submitHint}</span>
              <Button type="button" className="gap-2" disabled={submitting || !prompt.trim()} onClick={() => void submit()}>
                {submitting ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                {submitting ? copy.submitting : copy.submit}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between gap-2 text-base">
              <span className="flex items-center gap-2">
                <span>{copy.tasksTitle}</span>
                {tasks.some((task) => task.status === "queued" || task.status === "running") && <Loader2 size={14} className="animate-spin text-muted-foreground" />}
              </span>
              <Button variant="ghost" size="icon" onClick={() => void tasksQuery.refetch()} aria-label={copy.refresh} title={copy.refresh}>
                <RefreshCw size={15} />
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {tasks.length === 0 ? (
              <div className="flex min-h-40 flex-col items-center justify-center gap-2 rounded-md border border-dashed text-center text-sm text-muted-foreground">
                <ImageOff size={22} />
                <span>{tasksQuery.isLoading ? copy.loading : copy.noTasks}</span>
              </div>
            ) : (
              tasks.slice(0, 12).map((task) => (
                <div key={task.id} className="rounded-md border p-2 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <Badge variant={statusVariant(task.status)}>{statusLabel(task.status, copy)}</Badge>
                    <span className="truncate text-muted-foreground">{task.model}</span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-foreground">{task.prompt}</p>
                  <p className="mt-1 text-muted-foreground">{paramSummary(task, copy)}</p>
                  {task.error_message && <p className="mt-1 break-words text-destructive">{task.error_message}</p>}
                  <div className="mt-2 flex gap-1">
                    {task.files.map((file) => (
                      <button key={file.id} type="button" className="overflow-hidden rounded border" onClick={() => setPreview(file)} title={file.name}>
                        <FileThumb file={file} className="h-10 w-10 object-cover" />
                      </button>
                    ))}
                  </div>
                  <div className="mt-2 flex justify-end gap-1">
                    <Button variant="ghost" size="sm" className="h-6 px-2" onClick={() => reuse(task)}>{copy.reuse}</Button>
                    <Button variant="ghost" size="icon" className="h-6 w-6" disabled={deletingID === task.id || task.status === "running"} onClick={() => void removeTask(task)} aria-label={copy.remove} title={copy.remove}>
                      <Trash2 size={13} />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <div className="space-y-3">
        <h2 className="text-base font-semibold">{copy.resultsTitle}</h2>
        {tasks.every((task) => task.files.length === 0) ? (
          <div className="flex min-h-48 flex-col items-center justify-center gap-2 rounded-lg border border-dashed text-center text-sm text-muted-foreground">
            <ImageOff size={26} />
            <span>{copy.noResults}</span>
          </div>
        ) : (
          tasks.filter((task) => task.files.length > 0).map((task) => (
            <div key={task.id} className="rounded-lg border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <span className="max-w-full truncate text-foreground">{task.prompt}</span>
                <span>{task.model} · {paramSummary(task, copy)} · {formatDate(task.finished_at || task.created_at)}</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {task.files.map((file) => (
                  <button key={file.id} type="button" className="overflow-hidden rounded-md border" onClick={() => setPreview(file)} title={file.name}>
                    <FileThumb file={file} className="h-36 w-36 object-cover sm:h-44 sm:w-44" />
                  </button>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      <Dialog open={preview !== null} onOpenChange={(open) => { if (!open) setPreview(null) }}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="truncate text-sm">{preview?.name}</DialogTitle>
          </DialogHeader>
          {preview && <PreviewImage file={preview} alt={preview.name} />}
          {preview && (
            <div className="flex justify-end gap-2">
              <Link to="/chat/files" className="text-sm text-primary underline underline-offset-4">{copy.libraryLink}</Link>
              <Button size="sm" onClick={() => void downloadFile(preview, copy.downloadFailed, error)}>{copy.download}</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={pickingReference} onOpenChange={setPickingReference}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-sm">{copy.chooseReference}</DialogTitle>
          </DialogHeader>
          {images.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">{filesQuery.isLoading ? copy.loading : copy.noImages}</p>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {images.map((file) => (
                <button
                  key={file.id}
                  type="button"
                  className="overflow-hidden rounded-md border hover:ring-2 hover:ring-ring"
                  onClick={() => { setReference(file); setPickingReference(false) }}
                  title={file.name}
                >
                  <FileThumb file={file} className="h-24 w-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <PageInlineSlot slotKey="primary" />
      <PageInlineSlot slotKey="secondary" />
    </div>
  )
}

/**
 * A picture from the file library, fetched with the API client so the request
 * carries the session's credentials — an `<img src>` would be an anonymous
 * request and get a 401.
 */
function FileThumb({ file, className, alt }: { file: { download_url: string; name?: string }; className?: string; alt?: string }) {
  const src = useFileObjectURL(file.download_url)
  if (!src) return <span className={`flex items-center justify-center bg-muted ${className || ""}`}><Loader2 size={14} className="animate-spin text-muted-foreground" /></span>
  return <img src={src} alt={alt || file.name || ""} className={className} loading="lazy" />
}

function PreviewImage({ file, alt }: { file: { download_url: string; name?: string }; alt: string }) {
  const src = useFileObjectURL(file.download_url)
  if (!src) return <div className="flex h-64 items-center justify-center rounded-md border bg-muted"><Loader2 size={18} className="animate-spin text-muted-foreground" /></div>
  return <img src={src} alt={alt} className="mx-auto max-h-[60vh] w-auto rounded-md border object-contain" />
}

function useFileObjectURL(downloadURL: string) {
  const [src, setSrc] = useState("")
  useEffect(() => {
    if (!downloadURL) return
    let active = true
    let objectURL = ""
    const path = downloadURL.replace(/^\/api/, "")
    void api.get(path, { responseType: "blob" })
      .then((res) => {
        if (!active) return
        objectURL = URL.createObjectURL(res.data)
        setSrc(objectURL)
      })
      .catch(() => undefined)
    return () => {
      active = false
      if (objectURL) URL.revokeObjectURL(objectURL)
      setSrc("")
    }
  }, [downloadURL])
  return src
}

async function downloadFile(file: { download_url: string; name?: string }, failure: string, onError: (message: string) => void) {
  try {
    const res = await api.get(file.download_url.replace(/^\/api/, ""), { responseType: "blob" })
    const url = URL.createObjectURL(res.data)
    const link = document.createElement("a")
    link.href = url
    link.download = file.name || "image"
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  } catch {
    onError(failure)
  }
}

function paramSummary(task: ImageTask, copy: typeof zhCopy) {
  const parts = [
    task.size,
    `${task.count}${copy.imageUnit}`,
    task.quality,
    task.style,
    task.seed === null || task.seed === undefined ? "" : `${copy.seedLabel} ${task.seed}`,
    task.operation === "edit" ? copy.editOperation : "",
  ]
  return parts.filter(Boolean).join(" · ")
}

function statusLabel(status: ImageTask["status"], copy: typeof zhCopy) {
  if (status === "queued") return copy.statusQueued
  if (status === "running") return copy.statusRunning
  if (status === "completed") return copy.statusCompleted
  return copy.statusFailed
}

function statusVariant(status: ImageTask["status"]): "default" | "secondary" | "destructive" | "outline" {
  if (status === "running") return "default"
  if (status === "completed") return "secondary"
  if (status === "failed") return "destructive"
  return "outline"
}

function normalizeCatalog(value: unknown): CatalogEntry | null {
  if (!isRecord(value)) return null
  const id = Number(value.id || 0)
  if (!id) return null
  return {
    id,
    name: typeof value.name === "string" ? value.name : `Channel ${id}`,
    models: Array.isArray(value.models) ? value.models.map(String).filter(Boolean) : [],
    model_icons: isRecord(value.model_icons) ? value.model_icons as Record<string, string> : {},
  }
}

function normalizeTask(value: unknown): ImageTask | null {
  if (!isRecord(value) || typeof value.id !== "string") return null
  const status = typeof value.status === "string" && ["queued", "running", "completed", "failed"].includes(value.status)
    ? value.status as ImageTask["status"]
    : "failed"
  return {
    id: value.id,
    status,
    model: typeof value.model === "string" ? value.model : "",
    channel_id: Number(value.channel_id || 0),
    channel_name: typeof value.channel_name === "string" ? value.channel_name : "",
    operation: typeof value.operation === "string" ? value.operation : "generate",
    prompt: typeof value.prompt === "string" ? value.prompt : "",
    negative_prompt: typeof value.negative_prompt === "string" ? value.negative_prompt : "",
    size: typeof value.size === "string" ? value.size : "",
    quality: typeof value.quality === "string" ? value.quality : "",
    style: typeof value.style === "string" ? value.style : "",
    count: Number(value.count || 1),
    seed: value.seed === null || value.seed === undefined ? null : Number(value.seed),
    reference_file_id: typeof value.reference_file_id === "string" ? value.reference_file_id : "",
    error_message: typeof value.error_message === "string" ? value.error_message : "",
    files: Array.isArray(value.files) ? value.files.map(normalizeImage).filter((file): file is StoredImage => Boolean(file)) : [],
    created_at: typeof value.created_at === "string" ? value.created_at : "",
    started_at: typeof value.started_at === "string" ? value.started_at : null,
    finished_at: typeof value.finished_at === "string" ? value.finished_at : null,
  }
}

/** The file list arrives as `{ files: [...] }`; a cache may hold either shape. */
function imageList(value: unknown): StoredImage[] {
  const items = Array.isArray(value)
    ? value
    : isRecord(value) && Array.isArray(value.files)
      ? value.files
      : []
  return items.map(normalizeImage).filter((file): file is StoredImage => Boolean(file))
}

function normalizeImage(value: unknown): StoredImage | null {
  if (!isRecord(value) || typeof value.id !== "string") return null
  return {
    id: value.id,
    name: typeof value.name === "string" ? value.name : value.id,
    type: typeof value.type === "string" ? value.type : "",
    download_url: typeof value.download_url === "string" ? value.download_url : "",
  }
}

function formatDate(value: string) {
  if (!value) return ""
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

function apiErrorMessage(err: unknown, fallback: string) {
  if (isRecord(err) && isRecord(err.response) && isRecord(err.response.data) && typeof err.response.data.error === "string" && err.response.data.error) {
    return err.response.data.error
  }
  return err instanceof Error && err.message ? err.message : fallback
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null
}

const zhCopy = {
  title: "图片生成",
  subtitle: "按参数提交生成任务，完成后自动存入",
  libraryLink: "文件库",
  formTitle: "生成参数",
  prompt: "提示词",
  promptPlaceholder: "描述你想要的画面：主体、构图、光线、风格……",
  negativePrompt: "反向提示词",
  negativePromptPlaceholder: "不想出现的内容（可选）",
  model: "模型",
  size: "尺寸",
  customSize: "自定义…",
  sizeInvalid: "尺寸格式应为 宽x高，例如 1024x1024",
  count: "张数",
  quality: "质量",
  style: "风格",
  defaultOption: "默认",
  seed: "种子",
  seedPlaceholder: "留空随机",
  seedLabel: "种子",
  reference: "参考图",
  referenceHint: "选一张库内图片，走图生图（取决于渠道是否支持）",
  chooseReference: "选择参考图",
  clearReference: "移除参考图",
  noImages: "文件库里还没有图片",
  submit: "开始生成",
  submitting: "提交中",
  submitHint: "生成在后台进行，完成后自动保存到文件库",
  queued: "任务已创建",
  submitFailed: "创建任务失败",
  modelRequired: "请选择一个模型",
  tasksTitle: "任务",
  noTasks: "还没有任务",
  resultsTitle: "生成结果",
  noResults: "还没有生成结果",
  refresh: "刷新",
  loading: "加载中",
  noModels: "没有可用的模型",
  reuse: "套用参数",
  remove: "删除任务",
  deleteFailed: "删除任务失败",
  download: "下载",
  downloadFailed: "下载失败",
  imageUnit: "张",
  editOperation: "图生图",
  statusQueued: "等待中",
  statusRunning: "生成中",
  statusCompleted: "已完成",
  statusFailed: "失败",
}

const enCopy: typeof zhCopy = {
  title: "Image studio",
  subtitle: "Submit a generation with its parameters; results are saved to the",
  libraryLink: "file library",
  formTitle: "Parameters",
  prompt: "Prompt",
  promptPlaceholder: "Describe the picture: subject, framing, light, style…",
  negativePrompt: "Negative prompt",
  negativePromptPlaceholder: "What should not appear (optional)",
  model: "Model",
  size: "Size",
  customSize: "Custom…",
  sizeInvalid: "Size must be width x height, for example 1024x1024",
  count: "Images",
  quality: "Quality",
  style: "Style",
  defaultOption: "Default",
  seed: "Seed",
  seedPlaceholder: "Random",
  seedLabel: "seed",
  reference: "Reference image",
  referenceHint: "Pick an image from the library for image-to-image (channel dependent)",
  chooseReference: "Choose a reference",
  clearReference: "Remove the reference",
  noImages: "No images in the file library yet",
  submit: "Generate",
  submitting: "Submitting",
  submitHint: "Generation runs in the background and is saved to the file library",
  queued: "Task created",
  submitFailed: "Failed to create the task",
  modelRequired: "Choose a model",
  tasksTitle: "Tasks",
  noTasks: "No tasks yet",
  resultsTitle: "Results",
  noResults: "No results yet",
  refresh: "Refresh",
  loading: "Loading",
  noModels: "No model available",
  reuse: "Reuse parameters",
  remove: "Delete task",
  deleteFailed: "Failed to delete the task",
  download: "Download",
  downloadFailed: "Download failed",
  imageUnit: " img",
  editOperation: "image-to-image",
  statusQueued: "Queued",
  statusRunning: "Generating",
  statusCompleted: "Done",
  statusFailed: "Failed",
}
