import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useEffect, useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Download, Video, WandSparkles } from "lucide-react"
import api, { apiURL } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { PageInlineSlot, PageTitleSlot } from "@/components/layout/PageTitleSlot"
import { useToast } from "@/components/ui/toast"
import { useI18n } from "@/lib/i18n"

interface UserChannelCatalog {
  id: number
  name: string
  models: string[]
  video_billing_configs: Record<string, VideoBillingConfig>
}

interface VideoBillingConfig {
  resolutions: VideoResolutionPrice[]
}

interface VideoResolutionPrice {
  resolution: string
  duration_unit_price?: string | number
  durations?: VideoDurationPrice[]
}

interface VideoDurationPrice {
  seconds: number
  price: string | number
}

interface VideoResult {
  url: string
  b64_json: string
  revised_prompt: string
  status: string
}

interface VideoTask {
  id: string
  status: string
  cost: string | number
  upstream_id: string
}

const modelStoreKey = "windypear.videos.model.v1"
const sizeStoreKey = "windypear.videos.size.v1"
const countStoreKey = "windypear.videos.count.v1"
const durationStoreKey = "windypear.videos.duration.v1"
const qualityStoreKey = "windypear.videos.quality.v1"
const responseFormatStoreKey = "windypear.videos.response_format.v1"
const aspectRatioStoreKey = "windypear.videos.aspect_ratio.v1"

const videoSizes = ["auto", "480p", "720p", "1080p", "1024x576", "576x1024", "1280x720", "720x1280", "1920x1080", "1080x1920"]
const videoQualities = ["auto", "low", "medium", "high", "standard", "hd"]
const videoResponseFormats = ["auto", "url", "b64_json"]
const videoAspectRatios = ["auto", "16:9", "9:16", "1:1", "4:3", "3:4"]

export default function Videos() {
  const { language } = useI18n()
  const copy = language === "zh" ? zhCopy : enCopy
  const taskCopy = language === "zh" ? zhTaskCopy : enTaskCopy
  const { success, error, info } = useToast()
  const [apiKey, setAPIKey] = useState("")
  const [modelName, setModelName] = useState(() => localStorage.getItem(modelStoreKey) || "")
  const [prompt, setPrompt] = useState("")
  const [size, setSize] = useState(() => localStorage.getItem(sizeStoreKey) || "auto")
  const [count, setCount] = useState(() => normalizeCount(localStorage.getItem(countStoreKey) || "1"))
  const [duration, setDuration] = useState(() => normalizeDuration(localStorage.getItem(durationStoreKey) || "5"))
  const [quality, setQuality] = useState(() => localStorage.getItem(qualityStoreKey) || "auto")
  const [responseFormat, setResponseFormat] = useState(() => localStorage.getItem(responseFormatStoreKey) || "auto")
  const [aspectRatio, setAspectRatio] = useState(() => localStorage.getItem(aspectRatioStoreKey) || "auto")
  const [fps, setFPS] = useState(0)
  const [seed, setSeed] = useState("")
  const [watermark, setWatermark] = useState(false)
  const [extraParams, setExtraParams] = useState("")
  const [results, setResults] = useState<VideoResult[]>([])
  const [currentTask, setCurrentTask] = useState<VideoTask | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [isRefreshingTask, setIsRefreshingTask] = useState(false)

  const { data: catalog = [] } = useQuery<UserChannelCatalog[]>({
    queryKey: ["catalog"],
    queryFn: async () => {
      const res = await api.get("/user/catalog")
      return Array.isArray(res.data) ? res.data.map(normalizeCatalogItem) : []
    },
  })

  const modelOptions = useMemo(() => uniqueModels(catalog), [catalog])
  const selectedVideoBillingConfig = useMemo(() => videoBillingConfigForModel(catalog, modelName), [catalog, modelName])
  const sizeOptions = useMemo(() => videoSizeOptions(selectedVideoBillingConfig), [selectedVideoBillingConfig])
  const durationOptions = useMemo(() => videoDurationOptions(selectedVideoBillingConfig, size), [selectedVideoBillingConfig, size])

  useEffect(() => {
    if (!modelName && modelOptions.length > 0) {
      setModelName(modelOptions[0])
    }
  }, [modelName, modelOptions])

  useEffect(() => {
    if (modelName) {
      localStorage.setItem(modelStoreKey, modelName)
    }
  }, [modelName])

  useEffect(() => {
    if (sizeOptions.length > 0 && !sizeOptions.includes(size)) {
      setSize(sizeOptions[0])
    }
  }, [size, sizeOptions])

  useEffect(() => {
    if (durationOptions.length > 0 && !durationOptions.includes(duration)) {
      setDuration(durationOptions[0])
    }
  }, [duration, durationOptions])

  useEffect(() => {
    localStorage.setItem(sizeStoreKey, size)
  }, [size])

  useEffect(() => {
    localStorage.setItem(countStoreKey, String(count))
  }, [count])

  useEffect(() => {
    localStorage.setItem(durationStoreKey, String(duration))
  }, [duration])

  useEffect(() => {
    localStorage.setItem(qualityStoreKey, quality)
  }, [quality])

  useEffect(() => {
    localStorage.setItem(responseFormatStoreKey, responseFormat)
  }, [responseFormat])

  useEffect(() => {
    localStorage.setItem(aspectRatioStoreKey, aspectRatio)
  }, [aspectRatio])

  const buildVideoRequestBody = () => {
    const body: Record<string, unknown> = {
      model: modelName.trim(),
      prompt: prompt.trim(),
      n: count,
      duration,
    }
    if (size !== "auto") {
      body.size = size
    }
    if (quality !== "auto") {
      body.quality = quality
    }
    if (responseFormat !== "auto") {
      body.response_format = responseFormat
    }
    if (aspectRatio !== "auto") {
      body.aspect_ratio = aspectRatio
    }
    if (fps > 0) {
      body.fps = fps
    }
    const parsedSeed = parseOptionalInt(seed)
    if (parsedSeed !== null) {
      body.seed = parsedSeed
    }
    if (watermark) {
      body.watermark = true
    }
    Object.assign(body, parseExtraParams(extraParams, copy.extraParamsInvalid))
    return body
  }

  const generateVideos = async () => {
    const rawKey = apiKey.trim()
    const cleanPrompt = prompt.trim()
    const cleanModel = modelName.trim()
    if (!rawKey) {
      error(copy.keyRequired)
      return
    }
    if (!cleanModel) {
      error(copy.modelRequired)
      return
    }
    if (!cleanPrompt) {
      error(copy.promptRequired)
      return
    }

    setIsGenerating(true)
    try {
      const body = buildVideoRequestBody()

      const response = await fetch(apiURL("/v1/video/generations"), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${rawKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      })
      const text = await response.text()
      const payload = parseJSON(text)
      if (!response.ok) {
        throw new Error(errorMessage(payload, text, response.status))
      }
      const task = videoTaskFromPayload(payload)
      setCurrentTask(task)
      const nextResults = videoResultsFromPayload(payload)
      setResults(nextResults)
      if (nextResults.length > 0) {
        success(copy.generated.replace("{count}", String(nextResults.length)))
      } else if (task) {
        info(taskCopy.taskCreated.replace("{id}", task.id))
      } else {
        info(copy.emptyResponse)
      }
    } catch (err) {
      error(err instanceof Error ? err.message : copy.generateFailed)
    } finally {
      setIsGenerating(false)
    }
  }

  const refreshTask = async () => {
    const rawKey = apiKey.trim()
    if (!rawKey) {
      error(copy.keyRequired)
      return
    }
    if (!currentTask?.id) {
      return
    }
    setIsRefreshingTask(true)
    try {
      const response = await fetch(apiURL(`/v1/video/generations/${encodeURIComponent(currentTask.id)}`), {
        headers: {
          Authorization: `Bearer ${rawKey}`,
        },
      })
      const text = await response.text()
      const payload = parseJSON(text)
      if (!response.ok) {
        throw new Error(errorMessage(payload, text, response.status))
      }
      const task = videoTaskFromPayload(payload)
      if (task) {
        setCurrentTask(task)
      }
      const nextResults = videoResultsFromPayload(payload)
      if (nextResults.length > 0) {
        setResults(nextResults)
        success(copy.generated.replace("{count}", String(nextResults.length)))
      } else {
        info(taskCopy.taskUpdated)
      }
    } catch (err) {
      error(err instanceof Error ? err.message : taskCopy.refreshFailed)
    } finally {
      setIsRefreshingTask(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-3xl font-bold">{copy.title}</h1>
        <Button className="gap-2" disabled={isGenerating || !prompt.trim()} onClick={generateVideos}>
          <WandSparkles size={16} />
          {isGenerating ? copy.generating : copy.generate}
        </Button>
      </div>

      <PageTitleSlot />
      <div className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
        <Card className="h-fit">
          <CardHeader>
            <CardTitle>{copy.config}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <label className="block space-y-2 text-sm">
              <span className="font-medium">{copy.apiKey}</span>
              <Input value={apiKey} type="password" placeholder={copy.keyPlaceholder} onChange={(event) => setAPIKey(event.target.value)} />
            </label>
            <label className="block space-y-2 text-sm">
              <span className="font-medium">{copy.model}</span>
              <Select value={String((modelName) || "__shadcn_empty__")} onValueChange={(value) => setModelName((value === "__shadcn_empty__" ? "" : value))}><SelectTrigger className="h-10 w-full rounded-2xl border border-border bg-background px-3 text-sm"><SelectValue /></SelectTrigger><SelectContent>
                <SelectItem value="__shadcn_empty__">{copy.selectModel}</SelectItem>
                {modelOptions.map((model) => (
                  <SelectItem key={model} value={String(model)}>
                    {model}
                  </SelectItem>
                ))}
              </SelectContent></Select>
            </label>
            <OptionField label={copy.size} value={size} options={sizeOptions.length > 0 ? sizeOptions : videoSizes} autoLabel={copy.auto} onChange={setSize} />
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block space-y-2 text-sm">
                <span className="font-medium">{copy.count}</span>
                <Input min={1} max={4} type="number" value={count} onChange={(event) => setCount(normalizeCount(event.target.value))} />
              </label>
              <label className="block space-y-2 text-sm">
                <span className="font-medium">{copy.duration}</span>
                {durationOptions.length > 0 ? (
                  <Select value={String((duration) || "__shadcn_empty__")} onValueChange={(value) => setDuration(normalizeDuration((value === "__shadcn_empty__" ? "" : value)))}><SelectTrigger className="h-10 w-full rounded-2xl border border-border bg-background px-3 text-sm"><SelectValue /></SelectTrigger><SelectContent>
                    {durationOptions.map((option) => (
                      <SelectItem key={option} value={String(option)}>{option}s</SelectItem>
                    ))}
                  </SelectContent></Select>
                ) : (
                  <Input min={1} max={60} type="number" value={duration} onChange={(event) => setDuration(normalizeDuration(event.target.value))} />
                )}
              </label>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <OptionField label={copy.quality} value={quality} options={videoQualities} autoLabel={copy.auto} onChange={setQuality} />
              <OptionField label={copy.responseFormat} value={responseFormat} options={videoResponseFormats} autoLabel={copy.auto} onChange={setResponseFormat} />
              <OptionField label={copy.aspectRatio} value={aspectRatio} options={videoAspectRatios} autoLabel={copy.auto} onChange={setAspectRatio} />
              <label className="block space-y-2 text-sm">
                <span className="font-medium">{copy.fps}</span>
                <Input min={0} max={120} type="number" value={fps} onChange={(event) => setFPS(normalizeFPS(event.target.value))} />
              </label>
              <label className="block space-y-2 text-sm">
                <span className="font-medium">{copy.seed}</span>
                <Input value={seed} placeholder="1234" onChange={(event) => setSeed(event.target.value)} />
              </label>
              <label className="flex items-center gap-2 self-end pb-2 text-sm">
                <Switch checked={watermark} onCheckedChange={(checked) => setWatermark(checked)} />
                {copy.watermark}
              </label>
            </div>
            <label className="block space-y-2 text-sm">
              <span className="font-medium">{copy.extraParams}</span>
              <textarea className="min-h-24 w-full rounded-md border bg-background px-3 py-2 font-mono text-xs outline-none focus:ring-2 focus:ring-ring" value={extraParams} placeholder='{"camera_fixed":true}' onChange={(event) => setExtraParams(event.target.value)} />
            </label>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{copy.prompt}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <textarea
                className="min-h-36 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                value={prompt}
                placeholder={copy.promptPlaceholder}
                onChange={(event) => setPrompt(event.target.value)}
              />
              <Button className="gap-2" disabled={isGenerating || !prompt.trim()} onClick={generateVideos}>
                <WandSparkles size={16} />
                {isGenerating ? copy.generating : copy.generate}
              </Button>
            </CardContent>
          </Card>

          {currentTask && (
            <Card>
              <CardHeader>
                <CardTitle>{taskCopy.task}</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1 text-sm">
                  <div className="font-mono text-xs">{currentTask.id}</div>
                  <div className="text-muted-foreground">{copy.status}: {currentTask.status || "-"}</div>
                  {currentTask.upstream_id && <div className="text-muted-foreground">{taskCopy.upstreamID}: {currentTask.upstream_id}</div>}
                </div>
                <Button variant="outline" disabled={isRefreshingTask} onClick={refreshTask}>
                  {isRefreshingTask ? taskCopy.refreshing : taskCopy.refreshStatus}
                </Button>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>{copy.results}</CardTitle>
            </CardHeader>
            <CardContent>
              {results.length === 0 ? (
                <div className="flex min-h-[360px] flex-col items-center justify-center gap-3 rounded-md border text-center text-sm text-muted-foreground">
                  <Video className="h-8 w-8" />
                  <div>{copy.noResults}</div>
                </div>
              ) : (
                <div className="grid gap-4 lg:grid-cols-2">
                  {results.map((result, index) => {
                    const source = videoSource(result)
                    return (
                      <div key={`${index}-${source.slice(0, 36)}-${result.status}`} className="space-y-3 rounded-md border p-3">
                        <div className="aspect-video overflow-hidden rounded-md bg-muted">
                          {source ? <video src={source} controls className="h-full w-full object-contain" /> : <div className="flex h-full items-center justify-center text-sm text-muted-foreground">{result.status || copy.noVideoURL}</div>}
                        </div>
                        {result.status && <div className="text-sm text-muted-foreground">{copy.status}: {result.status}</div>}
                        {result.revised_prompt && <div className="whitespace-pre-wrap break-words text-sm text-muted-foreground">{result.revised_prompt}</div>}
                        {source && (
                          <Button asChild variant="outline" size="sm" className="gap-2">
                            <a href={source} download={`video-${index + 1}.mp4`} target={result.url ? "_blank" : undefined} rel={result.url ? "noreferrer" : undefined}>
                              <Download size={15} />
                              {copy.download}
                            </a>
                          </Button>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
      <PageInlineSlot slotKey="primary" />
      <PageInlineSlot slotKey="secondary" />
    </div>
  )
}

function normalizeCount(value: string) {
  const count = Number.parseInt(value, 10)
  if (!Number.isFinite(count)) {
    return 1
  }
  return Math.min(4, Math.max(1, count))
}

function normalizeDuration(value: string) {
  const duration = Number.parseInt(value, 10)
  if (!Number.isFinite(duration)) {
    return 5
  }
  return Math.min(60, Math.max(1, duration))
}

function normalizeFPS(value: string) {
  const fps = Number.parseInt(value, 10)
  if (!Number.isFinite(fps)) {
    return 0
  }
  return Math.min(120, Math.max(0, fps))
}

function parseOptionalInt(value: string) {
  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }
  const parsed = Number.parseInt(trimmed, 10)
  return Number.isFinite(parsed) ? parsed : null
}

function OptionField({
  label,
  value,
  options,
  autoLabel,
  onChange,
}: {
  label: string
  value: string
  options: readonly string[]
  autoLabel: string
  onChange: (value: string) => void
}) {
  return (
    <label className="block space-y-2 text-sm">
      <span className="font-medium">{label}</span>
      <Select value={String((value) || "__shadcn_empty__")} onValueChange={(value) => onChange((value === "__shadcn_empty__" ? "" : value))}><SelectTrigger className="h-10 w-full rounded-2xl border border-border bg-background px-3 text-sm"><SelectValue /></SelectTrigger><SelectContent>
        {options.map((option) => (
          <SelectItem key={option} value={String(option)}>
            {option === "auto" ? autoLabel : option}
          </SelectItem>
        ))}
      </SelectContent></Select>
    </label>
  )
}

function parseExtraParams(value: string, invalidMessage: string) {
  const trimmed = value.trim()
  if (!trimmed) {
    return {}
  }
  const parsed = parseJSON(trimmed)
  if (!isRecord(parsed)) {
    throw new Error(invalidMessage)
  }
  return parsed
}

function normalizeCatalogItem(value: unknown): UserChannelCatalog {
  const item = isRecord(value) ? value : {}
  return {
    id: Number(item.id || 0),
    name: typeof item.name === "string" ? item.name : "",
    models: Array.isArray(item.models) ? item.models.filter((model): model is string => typeof model === "string") : [],
    video_billing_configs: normalizeVideoBillingConfigs(item.video_billing_configs),
  }
}

function uniqueModels(catalog: UserChannelCatalog[]) {
  return Array.from(new Set(catalog.flatMap((channel) => channel.models))).sort()
}

function videoBillingConfigForModel(catalog: UserChannelCatalog[], modelName: string) {
  const cleanModelName = modelName.trim()
  if (!cleanModelName) {
    return null
  }
  for (const channel of catalog) {
    const config = channel.video_billing_configs?.[cleanModelName]
    if (config) {
      return config
    }
  }
  return null
}

function videoSizeOptions(config: VideoBillingConfig | null) {
  const resolutions = config?.resolutions || []
  return resolutions.map((item) => item.resolution).filter(Boolean)
}

function videoDurationOptions(config: VideoBillingConfig | null, resolution: string) {
  const resolutionConfig = (config?.resolutions || []).find((item) => item.resolution === resolution)
  const durations = resolutionConfig?.durations || []
  return durations.map((item) => item.seconds).filter((value) => value > 0)
}

function normalizeVideoBillingConfigs(value: unknown): Record<string, VideoBillingConfig> {
  if (!isRecord(value)) {
    return {}
  }
  const configs: Record<string, VideoBillingConfig> = {}
  for (const [modelName, rawConfig] of Object.entries(value)) {
    const config = normalizeVideoBillingConfig(rawConfig)
    if (config.resolutions.length > 0) {
      configs[modelName] = config
    }
  }
  return configs
}

function normalizeVideoBillingConfig(value: unknown): VideoBillingConfig {
  const item = isRecord(value) ? value : {}
  const resolutions = Array.isArray(item.resolutions)
    ? item.resolutions.map((raw) => {
      const resolution = isRecord(raw) && typeof raw.resolution === "string" ? raw.resolution : ""
      const durations = isRecord(raw) && Array.isArray(raw.durations)
        ? raw.durations.map((duration) => {
          const seconds = isRecord(duration) ? Number(duration.seconds || 0) : 0
          const price = isRecord(duration) ? duration.price : 0
          return { seconds, price: Number(price || 0) }
        }).filter((duration) => duration.seconds > 0)
        : []
      const durationUnitPrice = isRecord(raw) ? Number(raw.duration_unit_price || 0) : 0
      return { resolution, durations, duration_unit_price: durationUnitPrice }
    }).filter((raw) => raw.resolution)
    : []
  return {
    resolutions,
  }
}

function parseJSON(text: string): unknown {
  try {
    return text ? JSON.parse(text) : null
  } catch {
    return null
  }
}

function errorMessage(payload: unknown, text: string, status: number) {
  if (isRecord(payload)) {
    if (typeof payload.error === "string") {
      return payload.error
    }
    if (isRecord(payload.error) && typeof payload.error.message === "string") {
      return payload.error.message
    }
    if (typeof payload.message === "string") {
      return payload.message
    }
  }
  return text || `HTTP ${status}`
}

function videoResultsFromPayload(payload: unknown): VideoResult[] {
  if (!isRecord(payload)) {
    return []
  }
  const taskResult = isRecord(payload.task_result) ? payload.task_result : isRecord(payload.taskResult) ? payload.taskResult : null
  if (taskResult && Array.isArray(taskResult.videos)) {
    return taskResult.videos.map(videoResultFromItem).filter((item) => item.url || item.b64_json || item.status)
  }
  if (isRecord(payload.upstream_response)) {
    const nested = videoResultsFromPayload(payload.upstream_response)
    if (nested.length > 0) {
      return nested
    }
  }
  if (Array.isArray(payload.data)) {
    return payload.data.map(videoResultFromItem).filter((item) => item.url || item.b64_json || item.status)
  }
  if (isRecord(payload.data)) {
    const nested = videoResultsFromPayload(payload.data)
    if (nested.length > 0) {
      return nested
    }
  }
  const item = videoResultFromItem(payload)
  return item.url || item.b64_json || item.status ? [item] : []
}

function videoTaskFromPayload(payload: unknown): VideoTask | null {
  if (!isRecord(payload) || typeof payload.id !== "string") {
    return null
  }
  return {
    id: payload.id,
    status: firstString(payload.status),
    cost: typeof payload.cost === "string" || typeof payload.cost === "number" ? payload.cost : 0,
    upstream_id: firstString(payload.upstream_id, payload.upstream_task_id),
  }
}

function videoResultFromItem(value: unknown): VideoResult {
  const item = isRecord(value) ? value : {}
  const nestedVideo = isRecord(item.video) ? item.video : {}
  return {
    url: firstString(item.url, item.video_url, item.output_url, nestedVideo.url),
    b64_json: firstString(item.b64_json, item.video, item.output, nestedVideo.b64_json),
    revised_prompt: firstString(item.revised_prompt, item.prompt),
    status: firstString(item.status, item.state),
  }
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value
    }
  }
  return ""
}

function videoSource(result: VideoResult) {
  if (result.url) {
    return result.url
  }
  if (result.b64_json.startsWith("data:")) {
    return result.b64_json
  }
  return result.b64_json ? `data:video/mp4;base64,${result.b64_json}` : ""
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

/*
const zhCopy = {
  title: "AI 视频",
  config: "配置",
  apiKey: "API Key",
  keyPlaceholder: "填写 sk- 令牌",
  model: "模型",
  selectModel: "选择模型",
  size: "尺寸",
  count: "数量",
  duration: "时长（秒）",
  auto: "自动",
  prompt: "提示词",
  promptPlaceholder: "输入视频生成提示词",
  generate: "生成",
  generating: "生成中",
  results: "结果",
  noResults: "暂无视频",
  noVideoURL: "响应中没有视频地址",
  status: "状态",
  download: "下载",
  keyRequired: "请填写令牌",
  modelRequired: "请选择模型",
  promptRequired: "请输入提示词",
  generateFailed: "生成失败",
  generated: "已生成 {count} 个视频",
  emptyResponse: "空响应",
}

const enCopy: typeof zhCopy = {
  title: "AI Videos",
  config: "Config",
  apiKey: "API Key",
  keyPlaceholder: "Enter sk- token",
  model: "Model",
  selectModel: "Select model",
  size: "Size",
  count: "Count",
  duration: "Duration (s)",
  auto: "Auto",
  prompt: "Prompt",
  promptPlaceholder: "Enter a video prompt",
  generate: "Generate",
  generating: "Generating",
  results: "Results",
  noResults: "No videos yet",
  noVideoURL: "No video URL in response",
  status: "Status",
  download: "Download",
  keyRequired: "Enter a token first",
  modelRequired: "Select a model",
  promptRequired: "Enter a prompt",
  generateFailed: "Generation failed",
  generated: "Generated {count} videos",
  emptyResponse: "Empty response",
}
*/

const zhCopy = {
  title: "AI 视频",
  config: "配置",
  apiKey: "API Key",
  keyPlaceholder: "填写 sk- 令牌",
  model: "模型",
  selectModel: "选择模型",
  size: "尺寸",
  count: "数量",
  duration: "时长（秒）",
  quality: "质量",
  responseFormat: "响应格式",
  aspectRatio: "宽高比",
  fps: "FPS",
  seed: "种子",
  watermark: "添加水印",
  extraParams: "额外参数 JSON",
  auto: "自动",
  prompt: "提示词",
  promptPlaceholder: "输入视频生成提示词",
  generate: "生成",
  generating: "生成中",
  results: "结果",
  noResults: "暂无视频",
  noVideoURL: "响应中没有视频地址",
  status: "状态",
  download: "下载",
  keyRequired: "请填写令牌",
  modelRequired: "请选择模型",
  promptRequired: "请输入提示词",
  generateFailed: "生成失败",
  generated: "已生成 {count} 个视频",
  emptyResponse: "空响应",
  extraParamsInvalid: "额外参数必须是 JSON 对象",
}

const enCopy: typeof zhCopy = {
  title: "AI Videos",
  config: "Config",
  apiKey: "API Key",
  keyPlaceholder: "Enter sk- token",
  model: "Model",
  selectModel: "Select model",
  size: "Size",
  count: "Count",
  duration: "Duration (s)",
  quality: "Quality",
  responseFormat: "Response format",
  aspectRatio: "Aspect ratio",
  fps: "FPS",
  seed: "Seed",
  watermark: "Add watermark",
  extraParams: "Extra params JSON",
  auto: "Auto",
  prompt: "Prompt",
  promptPlaceholder: "Enter a video prompt",
  generate: "Generate",
  generating: "Generating",
  results: "Results",
  noResults: "No videos yet",
  noVideoURL: "No video URL in response",
  status: "Status",
  download: "Download",
  keyRequired: "Enter a token first",
  modelRequired: "Select a model",
  promptRequired: "Enter a prompt",
  generateFailed: "Generation failed",
  generated: "Generated {count} videos",
  emptyResponse: "Empty response",
  extraParamsInvalid: "Extra params must be a JSON object",
}

const zhTaskCopy = {
  task: "任务",
  taskCreated: "任务已创建：{id}",
  taskUpdated: "任务状态已更新",
  refreshStatus: "刷新状态",
  refreshing: "刷新中",
  refreshFailed: "刷新状态失败",
  upstreamID: "上游任务",
}

const enTaskCopy: typeof zhTaskCopy = {
  task: "Task",
  taskCreated: "Task created: {id}",
  taskUpdated: "Task status updated",
  refreshStatus: "Refresh status",
  refreshing: "Refreshing",
  refreshFailed: "Failed to refresh status",
  upstreamID: "Upstream task",
}
