import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useEffect, useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Download, Image as ImageIcon, WandSparkles } from "lucide-react"
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
}

interface ImageResult {
  url: string
  b64_json: string
  revised_prompt: string
}

type ImageResponseFormat = "auto" | "url" | "b64_json"
type ImageMode = "generate" | "edit"

const modelStoreKey = "windypear.images.model.v1"
const sizeStoreKey = "windypear.images.size.v1"
const responseFormatStoreKey = "windypear.images.response_format.v1"
const countStoreKey = "windypear.images.count.v1"
const modeStoreKey = "windypear.images.mode.v1"
const qualityStoreKey = "windypear.images.quality.v1"
const styleStoreKey = "windypear.images.style.v1"
const backgroundStoreKey = "windypear.images.background.v1"
const moderationStoreKey = "windypear.images.moderation.v1"
const outputFormatStoreKey = "windypear.images.output_format.v1"

const imageSizes = ["auto", "1024x1024", "1024x1536", "1536x1024", "1024x1792", "1792x1024"]
const responseFormats: ImageResponseFormat[] = ["auto", "url", "b64_json"]
const imageQualities = ["auto", "low", "medium", "high"]
const imageStyles = ["auto", "vivid", "natural"]
const imageBackgrounds = ["auto", "transparent", "opaque"]
const imageModerations = ["auto", "low"]
const imageOutputFormats = ["auto", "png", "jpeg", "webp"]

export default function Images() {
  const { language } = useI18n()
  const copy = language === "zh" ? zhCopy : enCopy
  const { success, error, info } = useToast()
  const [apiKey, setAPIKey] = useState("")
  const [mode, setMode] = useState<ImageMode>(() => normalizeMode(localStorage.getItem(modeStoreKey) || "generate"))
  const [modelName, setModelName] = useState(() => localStorage.getItem(modelStoreKey) || "")
  const [prompt, setPrompt] = useState("")
  const [size, setSize] = useState(() => localStorage.getItem(sizeStoreKey) || "auto")
  const [count, setCount] = useState(() => normalizeCount(localStorage.getItem(countStoreKey) || "1"))
  const [responseFormat, setResponseFormat] = useState<ImageResponseFormat>(() => normalizeResponseFormat(localStorage.getItem(responseFormatStoreKey) || "auto"))
  const [quality, setQuality] = useState(() => localStorage.getItem(qualityStoreKey) || "auto")
  const [style, setStyle] = useState(() => localStorage.getItem(styleStoreKey) || "auto")
  const [background, setBackground] = useState(() => localStorage.getItem(backgroundStoreKey) || "auto")
  const [moderation, setModeration] = useState(() => localStorage.getItem(moderationStoreKey) || "auto")
  const [outputFormat, setOutputFormat] = useState(() => localStorage.getItem(outputFormatStoreKey) || "auto")
  const [outputCompression, setOutputCompression] = useState(0)
  const [extraParams, setExtraParams] = useState("")
  const [editImage, setEditImage] = useState<File | null>(null)
  const [editMask, setEditMask] = useState<File | null>(null)
  const [results, setResults] = useState<ImageResult[]>([])
  const [isGenerating, setIsGenerating] = useState(false)

  const { data: catalog = [] } = useQuery<UserChannelCatalog[]>({
    queryKey: ["catalog"],
    queryFn: async () => {
      const res = await api.get("/user/catalog")
      return Array.isArray(res.data) ? res.data.map(normalizeCatalogItem) : []
    },
  })

  const modelOptions = useMemo(() => uniqueModels(catalog), [catalog])

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
    localStorage.setItem(sizeStoreKey, size)
  }, [size])

  useEffect(() => {
    localStorage.setItem(countStoreKey, String(count))
  }, [count])

  useEffect(() => {
    localStorage.setItem(responseFormatStoreKey, responseFormat)
  }, [responseFormat])

  useEffect(() => {
    localStorage.setItem(modeStoreKey, mode)
  }, [mode])
/*

const zhCopy = {
  title: "AI 绘画",
  config: "配置",
  apiKey: "API Key",
  keyPlaceholder: "填写 sk- 令牌",
  mode: "模式",
  modeGenerate: "图片生成",
  modeEdit: "图片编辑",
  model: "模型",
  selectModel: "选择模型",
  size: "尺寸",
  count: "数量",
  responseFormat: "响应格式",
  quality: "质量",
  style: "风格",
  background: "背景",
  moderation: "审核强度",
  outputFormat: "输出格式",
  outputCompression: "输出压缩",
  extraParams: "额外参数 JSON",
  editImage: "编辑图片",
  editMask: "蒙版",
  auto: "自动",
  prompt: "提示词",
  promptPlaceholder: "输入绘画或编辑提示词",
  generate: "生成",
  generating: "生成中",
  results: "结果",
  noResults: "暂无图片",
  download: "下载",
  keyRequired: "请填写令牌",
  modelRequired: "请选择模型",
  promptRequired: "请输入提示词",
  imageRequired: "请上传要编辑的图片",
  generateFailed: "生成失败",
  generated: "已生成 {count} 张图片",
  emptyResponse: "空响应",
  extraParamsInvalid: "额外参数必须是 JSON 对象",
  resultAlt: "生成图片 {index}",
}

const enCopy: typeof zhCopy = {
  title: "AI Images",
  config: "Config",
  apiKey: "API Key",
  keyPlaceholder: "Enter sk- token",
  mode: "Mode",
  modeGenerate: "Generate",
  modeEdit: "Edit",
  model: "Model",
  selectModel: "Select model",
  size: "Size",
  count: "Count",
  responseFormat: "Response format",
  quality: "Quality",
  style: "Style",
  background: "Background",
  moderation: "Moderation",
  outputFormat: "Output format",
  outputCompression: "Output compression",
  extraParams: "Extra params JSON",
  editImage: "Image",
  editMask: "Mask",
  auto: "Auto",
  prompt: "Prompt",
  promptPlaceholder: "Enter an image prompt or edit instruction",
  generate: "Generate",
  generating: "Generating",
  results: "Results",
  noResults: "No images yet",
  download: "Download",
  keyRequired: "Enter a token first",
  modelRequired: "Select a model",
  promptRequired: "Enter a prompt",
  imageRequired: "Upload an image to edit",
  generateFailed: "Generation failed",
  generated: "Generated {count} images",
  emptyResponse: "Empty response",
  extraParamsInvalid: "Extra params must be a JSON object",
  resultAlt: "Generated image {index}",
}
/*

const zhCopy = {
  title: "AI 绘画",
  config: "配置",
  apiKey: "API Key",
  keyPlaceholder: "填写 sk- 令牌",
  mode: "模式",
  modeGenerate: "图片生成",
  modeEdit: "图片编辑",
  model: "模型",
  selectModel: "选择模型",
  size: "尺寸",
  count: "数量",
  responseFormat: "响应格式",
  quality: "质量",
  style: "风格",
  background: "背景",
  moderation: "审核强度",
  outputFormat: "输出格式",
  outputCompression: "输出压缩",
  extraParams: "额外参数 JSON",
  editImage: "编辑图片",
  editMask: "蒙版",
  auto: "自动",
  prompt: "提示词",
  promptPlaceholder: "输入绘画或编辑提示词",
  generate: "生成",
  generating: "生成中",
  results: "结果",
  noResults: "暂无图片",
  download: "下载",
  keyRequired: "请填写令牌",
  modelRequired: "请选择模型",
  promptRequired: "请输入提示词",
  imageRequired: "请上传要编辑的图片",
  generateFailed: "生成失败",
  generated: "已生成 {count} 张图片",
  emptyResponse: "空响应",
  extraParamsInvalid: "额外参数必须是 JSON 对象",
  resultAlt: "生成图片 {index}",
}

const enCopy: typeof zhCopy = {
  title: "AI Images",
  config: "Config",
  apiKey: "API Key",
  keyPlaceholder: "Enter sk- token",
  mode: "Mode",
  modeGenerate: "Generate",
  modeEdit: "Edit",
  model: "Model",
  selectModel: "Select model",
  size: "Size",
  count: "Count",
  responseFormat: "Response format",
  quality: "Quality",
  style: "Style",
  background: "Background",
  moderation: "Moderation",
  outputFormat: "Output format",
  outputCompression: "Output compression",
  extraParams: "Extra params JSON",
  editImage: "Image",
  editMask: "Mask",
  auto: "Auto",
  prompt: "Prompt",
  promptPlaceholder: "Enter an image prompt or edit instruction",
  generate: "Generate",
  generating: "Generating",
  results: "Results",
  noResults: "No images yet",
  download: "Download",
  keyRequired: "Enter a token first",
  modelRequired: "Select a model",
  promptRequired: "Enter a prompt",
  imageRequired: "Upload an image to edit",
  generateFailed: "Generation failed",
  generated: "Generated {count} images",
  emptyResponse: "Empty response",
  extraParamsInvalid: "Extra params must be a JSON object",
  resultAlt: "Generated image {index}",
}
*/

  useEffect(() => {
    localStorage.setItem(qualityStoreKey, quality)
  }, [quality])

  useEffect(() => {
    localStorage.setItem(styleStoreKey, style)
  }, [style])

  useEffect(() => {
    localStorage.setItem(backgroundStoreKey, background)
  }, [background])

  useEffect(() => {
    localStorage.setItem(moderationStoreKey, moderation)
  }, [moderation])

  useEffect(() => {
    localStorage.setItem(outputFormatStoreKey, outputFormat)
  }, [outputFormat])

  const generateImages = async () => {
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
    if (mode === "edit" && !editImage) {
      error(copy.imageRequired)
      return
    }

    setIsGenerating(true)
    try {
      const body: Record<string, unknown> = {
        model: cleanModel,
        prompt: cleanPrompt,
        n: count,
      }
      if (size !== "auto") {
        body.size = size
      }
      if (responseFormat !== "auto") {
        body.response_format = responseFormat
      }
      if (quality !== "auto") {
        body.quality = quality
      }
      if (style !== "auto") {
        body.style = style
      }
      if (background !== "auto") {
        body.background = background
      }
      if (moderation !== "auto") {
        body.moderation = moderation
      }
      if (outputFormat !== "auto") {
        body.output_format = outputFormat
      }
      if (outputCompression > 0) {
        body.output_compression = outputCompression
      }
      Object.assign(body, parseExtraParams(extraParams, copy.extraParamsInvalid))

      const response = mode === "edit"
        ? await fetch(apiURL("/v1/images/edits"), {
            method: "POST",
            headers: { Authorization: `Bearer ${rawKey}` },
            body: imageEditFormData(body, editImage, editMask),
          })
        : await fetch(apiURL("/v1/images/generations"), {
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
      const nextResults = imageResultsFromPayload(payload)
      setResults(nextResults)
      if (nextResults.length > 0) {
        success(copy.generated.replace("{count}", String(nextResults.length)))
      } else {
        info(copy.emptyResponse)
      }
    } catch (err) {
      error(err instanceof Error ? err.message : copy.generateFailed)
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-3xl font-bold">{copy.title}</h1>
        <Button className="gap-2" disabled={isGenerating || !prompt.trim()} onClick={generateImages}>
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
              <Input
                value={apiKey}
                type="password"
                placeholder={copy.keyPlaceholder}
                onChange={(event) => {
                  setAPIKey(event.target.value)
                }}
              />
            </label>
            <label className="block space-y-2 text-sm">
              <span className="font-medium">{copy.mode}</span>
              <Select value={String((mode) || "__shadcn_empty__")} onValueChange={(value) => setMode(normalizeMode((value === "__shadcn_empty__" ? "" : value)))}><SelectTrigger className="h-10 w-full rounded-2xl border border-border bg-background px-3 text-sm"><SelectValue /></SelectTrigger><SelectContent>
                <SelectItem value="generate">{copy.modeGenerate}</SelectItem>
                <SelectItem value="edit">{copy.modeEdit}</SelectItem>
              </SelectContent></Select>
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
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block space-y-2 text-sm">
                <span className="font-medium">{copy.size}</span>
                <Select value={String((size) || "__shadcn_empty__")} onValueChange={(value) => setSize((value === "__shadcn_empty__" ? "" : value))}><SelectTrigger className="h-10 w-full rounded-2xl border border-border bg-background px-3 text-sm"><SelectValue /></SelectTrigger><SelectContent>
                  {imageSizes.map((option) => (
                    <SelectItem key={option} value={String(option)}>
                      {option === "auto" ? copy.auto : option}
                    </SelectItem>
                  ))}
                </SelectContent></Select>
              </label>
              <label className="block space-y-2 text-sm">
                <span className="font-medium">{copy.count}</span>
                <Input min={1} max={4} type="number" value={count} onChange={(event) => setCount(normalizeCount(event.target.value))} />
              </label>
            </div>
            {mode === "edit" && (
              <div className="space-y-3 rounded-md border p-3">
                <label className="block space-y-2 text-sm">
                  <span className="font-medium">{copy.editImage}</span>
                  <Input type="file" accept="image/*" onChange={(event) => setEditImage(event.target.files?.[0] || null)} />
                </label>
                <label className="block space-y-2 text-sm">
                  <span className="font-medium">{copy.editMask}</span>
                  <Input type="file" accept="image/*" onChange={(event) => setEditMask(event.target.files?.[0] || null)} />
                </label>
              </div>
            )}
            <label className="block space-y-2 text-sm">
              <span className="font-medium">{copy.responseFormat}</span>
              <Select value={String((responseFormat) || "__shadcn_empty__")} onValueChange={(value) => setResponseFormat(normalizeResponseFormat((value === "__shadcn_empty__" ? "" : value)))}><SelectTrigger className="h-10 w-full rounded-2xl border border-border bg-background px-3 text-sm"><SelectValue /></SelectTrigger><SelectContent>
                {responseFormats.map((format) => (
                  <SelectItem key={format} value={String(format)}>
                    {format === "auto" ? copy.auto : format}
                  </SelectItem>
                ))}
              </SelectContent></Select>
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <OptionField label={copy.quality} value={quality} options={imageQualities} autoLabel={copy.auto} onChange={setQuality} />
              <OptionField label={copy.style} value={style} options={imageStyles} autoLabel={copy.auto} onChange={setStyle} />
              <OptionField label={copy.background} value={background} options={imageBackgrounds} autoLabel={copy.auto} onChange={setBackground} />
              <OptionField label={copy.moderation} value={moderation} options={imageModerations} autoLabel={copy.auto} onChange={setModeration} />
              <OptionField label={copy.outputFormat} value={outputFormat} options={imageOutputFormats} autoLabel={copy.auto} onChange={setOutputFormat} />
              <label className="block space-y-2 text-sm">
                <span className="font-medium">{copy.outputCompression}</span>
                <Input min={0} max={100} type="number" value={outputCompression} onChange={(event) => setOutputCompression(normalizePercent(event.target.value))} />
              </label>
            </div>
            <label className="block space-y-2 text-sm">
              <span className="font-medium">{copy.extraParams}</span>
              <textarea className="min-h-24 w-full rounded-md border bg-background px-3 py-2 font-mono text-xs outline-none focus:ring-2 focus:ring-ring" value={extraParams} placeholder='{"seed":1234}' onChange={(event) => setExtraParams(event.target.value)} />
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
                onChange={(event) => {
                  setPrompt(event.target.value)
                }}
              />
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <Button className="gap-2" disabled={isGenerating || !prompt.trim()} onClick={generateImages}>
                  <WandSparkles size={16} />
                  {isGenerating ? copy.generating : copy.generate}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{copy.results}</CardTitle>
            </CardHeader>
            <CardContent>
              {results.length === 0 ? (
                <div className="flex min-h-[360px] flex-col items-center justify-center gap-3 rounded-md border text-center text-sm text-muted-foreground">
                  <ImageIcon className="h-8 w-8" />
                  <div>{copy.noResults}</div>
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  {results.map((result, index) => {
                    const source = imageSource(result)
                    return (
                      <div key={`${index}-${source.slice(0, 36)}`} className="space-y-3 rounded-md border p-3">
                        <div className="aspect-square overflow-hidden rounded-md bg-muted">
                          {source ? <img src={source} alt={copy.resultAlt.replace("{index}", String(index + 1))} className="h-full w-full object-contain" /> : null}
                        </div>
                        {result.revised_prompt && <div className="whitespace-pre-wrap break-words text-sm text-muted-foreground">{result.revised_prompt}</div>}
                        {source && (
                          <Button asChild variant="outline" size="sm" className="gap-2">
                            <a href={source} download={`image-${index + 1}.png`} target={result.url ? "_blank" : undefined} rel={result.url ? "noreferrer" : undefined}>
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

function normalizeResponseFormat(value: string): ImageResponseFormat {
  if (value === "url" || value === "b64_json") {
    return value
  }
  return "auto"
}

function normalizeMode(value: string): ImageMode {
  return value === "edit" ? "edit" : "generate"
}

function normalizePercent(value: string) {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed)) {
    return 0
  }
  return Math.min(100, Math.max(0, parsed))
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

function imageEditFormData(body: Record<string, unknown>, image: File | null, mask: File | null) {
  const formData = new FormData()
  if (image) {
    formData.append("image", image)
  }
  if (mask) {
    formData.append("mask", mask)
  }
  Object.entries(body).forEach(([key, value]) => {
    if (value === undefined || value === null) {
      return
    }
    if (typeof value === "object") {
      formData.append(key, JSON.stringify(value))
      return
    }
    formData.append(key, String(value))
  })
  return formData
}

function normalizeCatalogItem(value: unknown): UserChannelCatalog {
  const item = isRecord(value) ? value : {}
  return {
    id: Number(item.id || 0),
    name: typeof item.name === "string" ? item.name : "",
    models: Array.isArray(item.models) ? item.models.filter((model): model is string => typeof model === "string") : [],
  }
}

function uniqueModels(catalog: UserChannelCatalog[]) {
  return Array.from(new Set(catalog.flatMap((channel) => channel.models))).sort()
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

function imageResultsFromPayload(payload: unknown): ImageResult[] {
  if (!isRecord(payload) || !Array.isArray(payload.data)) {
    return []
  }
  return payload.data
    .filter(isRecord)
    .map((item) => ({
      url: typeof item.url === "string" ? item.url : "",
      b64_json: typeof item.b64_json === "string" ? item.b64_json : "",
      revised_prompt: typeof item.revised_prompt === "string" ? item.revised_prompt : "",
    }))
    .filter((item) => item.url || item.b64_json)
}

function imageSource(result: ImageResult) {
  if (result.url) {
    return result.url
  }
  if (result.b64_json.startsWith("data:")) {
    return result.b64_json
  }
  return `data:image/png;base64,${result.b64_json}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

/*
const zhCopy = {
  title: "AI 绘画",
  config: "配置",
  apiKey: "API Key",
  keyPlaceholder: "填写 sk- 令牌",
  model: "模型",
  selectModel: "选择模型",
  size: "尺寸",
  count: "数量",
  responseFormat: "响应格式",
  auto: "自动",
  prompt: "提示词",
  promptPlaceholder: "输入绘画提示词",
  generate: "生成",
  generating: "生成中",
  results: "结果",
  noResults: "暂无图片",
  download: "下载",
  keyRequired: "请填写令牌",
  modelRequired: "请选择模型",
  promptRequired: "请输入提示词",
  generateFailed: "生成失败",
  generated: "已生成 {count} 张图片",
  emptyResponse: "空响应",
  resultAlt: "生成图片 {index}",
}

const enCopy: typeof zhCopy = {
  title: "AI Images",
  config: "Config",
  apiKey: "API Key",
  keyPlaceholder: "Enter sk- token",
  model: "Model",
  selectModel: "Select model",
  size: "Size",
  count: "Count",
  responseFormat: "Response format",
  auto: "Auto",
  prompt: "Prompt",
  promptPlaceholder: "Enter an image prompt",
  generate: "Generate",
  generating: "Generating",
  results: "Results",
  noResults: "No images yet",
  download: "Download",
  keyRequired: "Enter a token first",
  modelRequired: "Select a model",
  promptRequired: "Enter a prompt",
  generateFailed: "Generation failed",
  generated: "Generated {count} images",
  emptyResponse: "Empty response",
  resultAlt: "Generated image {index}",
}
  useEffect(() => {
    localStorage.setItem(modeStoreKey, mode)
  }, [mode])
*/

const zhCopy = {
  title: "AI 绘画",
  config: "配置",
  apiKey: "API Key",
  keyPlaceholder: "填写 sk- 令牌",
  mode: "模式",
  modeGenerate: "图片生成",
  modeEdit: "图片编辑",
  model: "模型",
  selectModel: "选择模型",
  size: "尺寸",
  count: "数量",
  responseFormat: "响应格式",
  quality: "质量",
  style: "风格",
  background: "背景",
  moderation: "审核强度",
  outputFormat: "输出格式",
  outputCompression: "输出压缩",
  extraParams: "额外参数 JSON",
  editImage: "编辑图片",
  editMask: "蒙版",
  auto: "自动",
  prompt: "提示词",
  promptPlaceholder: "输入绘画或编辑提示词",
  generate: "生成",
  generating: "生成中",
  results: "结果",
  noResults: "暂无图片",
  download: "下载",
  keyRequired: "请填写令牌",
  modelRequired: "请选择模型",
  promptRequired: "请输入提示词",
  imageRequired: "请上传要编辑的图片",
  generateFailed: "生成失败",
  generated: "已生成 {count} 张图片",
  emptyResponse: "空响应",
  extraParamsInvalid: "额外参数必须是 JSON 对象",
  resultAlt: "生成图片 {index}",
}

const enCopy: typeof zhCopy = {
  title: "AI Images",
  config: "Config",
  apiKey: "API Key",
  keyPlaceholder: "Enter sk- token",
  mode: "Mode",
  modeGenerate: "Generate",
  modeEdit: "Edit",
  model: "Model",
  selectModel: "Select model",
  size: "Size",
  count: "Count",
  responseFormat: "Response format",
  quality: "Quality",
  style: "Style",
  background: "Background",
  moderation: "Moderation",
  outputFormat: "Output format",
  outputCompression: "Output compression",
  extraParams: "Extra params JSON",
  editImage: "Image",
  editMask: "Mask",
  auto: "Auto",
  prompt: "Prompt",
  promptPlaceholder: "Enter an image prompt or edit instruction",
  generate: "Generate",
  generating: "Generating",
  results: "Results",
  noResults: "No images yet",
  download: "Download",
  keyRequired: "Enter a token first",
  modelRequired: "Select a model",
  promptRequired: "Enter a prompt",
  imageRequired: "Upload an image to edit",
  generateFailed: "Generation failed",
  generated: "Generated {count} images",
  emptyResponse: "Empty response",
  extraParamsInvalid: "Extra params must be a JSON object",
  resultAlt: "Generated image {index}",
}
