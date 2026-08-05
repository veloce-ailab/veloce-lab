import { useMemo, useRef, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { ArrowLeft, Code2, FileText, Folder, FolderOpen, PackageOpen, Sparkles, Upload } from "lucide-react"
import { Link, useParams } from "react-router-dom"
import api from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { PageInlineSlot, PageTitleSlot } from "@/components/layout/PageTitleSlot"
import { useToast } from "@/components/ui/toast"
import { useI18n } from "@/lib/i18n"
import { cn } from "@/lib/utils"

interface Skill {
  id: string
  package_id: string
  name: string
  description: string
  source: string
  skill_path: string
  root_path: string
  enabled: boolean
  size: number
  hash: string
  created_at: string
  updated_at: string
}

interface SkillFile {
  path: string
  size: number
  skill: boolean
  mod_time?: string
}

interface SkillDetail extends Skill {
  package_name: string
  package_source_name: string
  files: SkillFile[]
}

interface SkillFileContent {
  path: string
  content: string
  size: number
  truncated: boolean
}

interface FileTreeNode {
  name: string
  path: string
  type: "dir" | "file"
  file?: SkillFile
  children: FileTreeNode[]
}

const skillsQueryKey = ["advanced-chat-skills"] as const
const skillPackagesQueryKey = ["advanced-chat-skill-packages"] as const

export default function Skills() {
  const { id = "" } = useParams()
  return id ? <SkillDetailPage skillID={id} /> : <SkillListPage />
}

function SkillListPage() {
  const queryClient = useQueryClient()
  const { error, success } = useToast()
  const { t } = useI18n()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [uploading, setUploading] = useState(false)

  const { data: skills = [] } = useQuery<Skill[]>({
    queryKey: skillsQueryKey,
    queryFn: async () => {
      const res = await api.get("/user/advanced-chat/skills")
      return Array.isArray(res.data) ? res.data.map(normalizeSkill).filter((item): item is Skill => Boolean(item)) : []
    },
  })

  const uploadPackage = async (file: File | undefined) => {
    if (!file) {
      return
    }
    const lower = file.name.toLowerCase()
    if (!lower.endsWith(".zip") && !lower.endsWith(".tar.gz") && !lower.endsWith(".tgz")) {
      error("请上传 zip、tar.gz 或 tgz 格式的 Skill 包")
      return
    }
    const form = new FormData()
    form.append("file", file)
    setUploading(true)
    try {
      await api.post("/user/advanced-chat/skill-packages", form, {
        headers: { "Content-Type": "multipart/form-data" },
      })
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: skillsQueryKey }),
        queryClient.invalidateQueries({ queryKey: skillPackagesQueryKey }),
      ])
      success("Skill 已上传")
    } catch (err) {
      error(apiErrorMessage(err, "Skill 上传失败"))
    } finally {
      setUploading(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ""
      }
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">{t("nav.skills")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">上传后会自动拆成一个个独立 Skill，运行时按需读取 SKILL.md 和资源文件。</p>
        </div>
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".zip,.tgz,.tar.gz,application/zip,application/gzip"
            className="hidden"
            onChange={(event) => uploadPackage(event.target.files?.[0])}
          />
          <Button className="gap-2" disabled={uploading} onClick={() => fileInputRef.current?.click()}>
            <Upload size={16} />
            {uploading ? "上传中" : "上传 Skill"}
          </Button>
        </div>
      </div>

      <PageTitleSlot />

      <Card>
        <CardHeader>
          <CardTitle>{t("advancedChat.skills.list")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {skills.length === 0 ? (
            <div className="rounded-md border border-dashed px-3 py-8 text-center text-sm text-muted-foreground">{t("advancedChat.skills.empty")}</div>
          ) : (
            skills.map((skill) => (
              <Link key={skill.id} to={`/chat/skills/${encodeURIComponent(skill.id)}`} className="block rounded-md border p-3 transition-colors hover:bg-muted/30">
                <div className="flex min-w-0 items-center gap-2">
                  <Sparkles className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="truncate text-sm font-medium">{skill.name}</span>
                  <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">{skill.source}</span>
                </div>
                {skill.description && <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">{skill.description}</div>}
                <div className="mt-2 truncate text-[11px] text-muted-foreground">{skill.id}</div>
              </Link>
            ))
          )}
        </CardContent>
      </Card>

      <PageInlineSlot slotKey="primary" />
      <PageInlineSlot slotKey="secondary" />
    </div>
  )
}

function SkillDetailPage({ skillID }: { skillID: string }) {
  const [selectedFilePath, setSelectedFilePath] = useState("")
  const [rawMode, setRawMode] = useState(false)

  const { data: skill, isFetching } = useQuery<SkillDetail | null>({
    queryKey: ["advanced-chat-skill", skillID],
    queryFn: async () => {
      const res = await api.get(`/user/advanced-chat/skills/${encodeURIComponent(skillID)}`)
      const detail = normalizeSkillDetail(res.data)
      if (detail && !selectedFilePath) {
        setSelectedFilePath(detail.files.find((file) => file.skill)?.path || detail.files[0]?.path || "")
      }
      return detail
    },
  })

  const { data: fileContent, isFetching: isFetchingFile } = useQuery<SkillFileContent | null>({
    queryKey: ["advanced-chat-skill-file", skillID, selectedFilePath],
    enabled: Boolean(skillID && selectedFilePath),
    queryFn: async () => {
      const res = await api.get(`/user/advanced-chat/skills/${encodeURIComponent(skillID)}/files`, {
        params: { path: selectedFilePath },
      })
      return normalizeSkillFileContent(res.data)
    },
  })

  const tree = useMemo(() => buildFileTree(skill?.files || []), [skill?.files])
  const isMarkdown = selectedFilePath.toLowerCase().endsWith(".md") || selectedFilePath.toLowerCase().endsWith(".markdown")

  if (!skill && !isFetching) {
    return (
      <div className="space-y-4">
        <Button asChild variant="ghost" className="-ml-3 gap-2">
          <Link to="/chat/skills">
            <ArrowLeft size={16} />
            返回 Skills
          </Link>
        </Button>
        <div className="rounded-md border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">Skill 不存在或已被删除</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <Button asChild variant="ghost" className="-ml-3 mb-2 gap-2">
            <Link to="/chat/skills">
              <ArrowLeft size={16} />
              返回 Skills
            </Link>
          </Button>
          <h1 className="truncate text-3xl font-bold">{skill?.name || "Skill"}</h1>
          {skill?.description && <p className="mt-2 max-w-3xl text-sm text-muted-foreground">{skill.description}</p>}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[18rem_1fr]">
        <Card className="min-h-[34rem]">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <PackageOpen size={18} />
              文件
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
              <div className="truncate font-medium text-foreground">{skill?.package_source_name || "-"}</div>
              <div className="mt-1">{formatBytes(skill?.size || 0)}</div>
              <div className="mt-1 truncate">{skill?.hash || "-"}</div>
            </div>
            <div className="max-h-[32rem] overflow-auto pr-1">
              {tree.children.length === 0 ? (
                <div className="rounded-md border border-dashed px-3 py-8 text-center text-xs text-muted-foreground">暂无文件</div>
              ) : (
                <FileTree nodes={tree.children} selectedPath={selectedFilePath} onSelect={(path) => {
                  setSelectedFilePath(path)
                  setRawMode(false)
                }} />
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="min-h-[34rem] overflow-hidden">
          <CardHeader className="border-b">
            <CardTitle className="flex min-w-0 items-center justify-between gap-3 text-base">
              <span className="min-w-0 truncate">{selectedFilePath || "选择文件"}</span>
              <Button variant="outline" size="sm" className="shrink-0 gap-2" disabled={!selectedFilePath || !isMarkdown} onClick={() => setRawMode((value) => !value)}>
                <Code2 size={15} />
                {rawMode || !isMarkdown ? "Raw" : "Rendered"}
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="h-[34rem] overflow-auto p-4">
            {!selectedFilePath ? (
              <div className="text-sm text-muted-foreground">选择左侧文件查看内容</div>
            ) : isFetchingFile ? (
              <div className="text-sm text-muted-foreground">加载中...</div>
            ) : fileContent && isMarkdown && !rawMode ? (
              <MarkdownPreview content={fileContent.content} />
            ) : (
              <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-5">{fileContent?.content || ""}</pre>
            )}
            {fileContent?.truncated && <div className="mt-3 rounded-md border bg-muted/40 p-2 text-xs text-muted-foreground">内容已截断</div>}
          </CardContent>
        </Card>
      </div>
      <PageInlineSlot slotKey="primary" />
      <PageInlineSlot slotKey="secondary" />
    </div>
  )
}

function FileTree({ nodes, selectedPath, onSelect, depth = 0 }: { nodes: FileTreeNode[]; selectedPath: string; onSelect: (path: string) => void; depth?: number }) {
  return (
    <div className="space-y-1">
      {nodes.map((node) => (
        <div key={`${node.type}:${node.path}`}>
          {node.type === "dir" ? (
            <div>
              <div className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs font-medium text-muted-foreground" style={{ paddingLeft: 8 + depth * 14 }}>
                {node.children.length > 0 ? <FolderOpen className="h-3.5 w-3.5 shrink-0" /> : <Folder className="h-3.5 w-3.5 shrink-0" />}
                <span className="truncate">{node.name}</span>
              </div>
              <FileTree nodes={node.children} selectedPath={selectedPath} onSelect={onSelect} depth={depth + 1} />
            </div>
          ) : (
            <button
              type="button"
              className={cn(
                "flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors",
                selectedPath === node.path ? "bg-primary text-primary-foreground" : "hover:bg-muted/60",
              )}
              style={{ paddingLeft: 8 + depth * 14 }}
              onClick={() => onSelect(node.path)}
            >
              <FileText className="h-3.5 w-3.5 shrink-0" />
              <span className="min-w-0 flex-1 truncate">{node.name}</span>
              {node.file?.skill && <span className="shrink-0 rounded bg-muted px-1 py-0.5 text-[10px] text-muted-foreground">SKILL</span>}
            </button>
          )}
        </div>
      ))}
    </div>
  )
}

function MarkdownPreview({ content }: { content: string }) {
  const blocks = parseMarkdownBlocks(content)
  return (
    <div className="space-y-2 text-sm leading-6">
      {blocks.map((block, index) => {
        if (block.type === "code") {
          return <pre key={index} className="overflow-auto rounded-md border bg-muted/40 p-3 font-mono text-xs leading-5">{block.text}</pre>
        }
        if (block.type === "heading") {
          return renderMarkdownHeading(block.text, block.level || 2, index)
        }
        if (block.type === "list") {
          return <div key={index} className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground" /><span>{block.text}</span></div>
        }
        if (block.type === "blank") {
          return <div key={index} className="h-2" />
        }
        return <p key={index} className="text-foreground/90">{block.text}</p>
      })}
    </div>
  )
}

function renderMarkdownHeading(text: string, level: number, key: number) {
  if (level <= 1) {
    return <h1 key={key} className="mt-4 text-xl font-semibold text-foreground">{text}</h1>
  }
  if (level === 2) {
    return <h2 key={key} className="mt-4 text-lg font-semibold text-foreground">{text}</h2>
  }
  if (level === 3) {
    return <h3 key={key} className="mt-4 text-base font-semibold text-foreground">{text}</h3>
  }
  return <h4 key={key} className="mt-4 text-sm font-semibold text-foreground">{text}</h4>
}

function parseMarkdownBlocks(content: string) {
  const blocks: Array<{ type: "code" | "heading" | "list" | "blank" | "paragraph"; text: string; level?: number }> = []
  const lines = content.split(/\r?\n/)
  let code: string[] | null = null
  for (const line of lines) {
    if (line.trim().startsWith("```")) {
      if (code) {
        blocks.push({ type: "code", text: code.join("\n") })
        code = null
      } else {
        code = []
      }
      continue
    }
    if (code) {
      code.push(line)
      continue
    }
    const heading = /^(#{1,6})\s+(.+)$/.exec(line)
    if (heading) {
      blocks.push({ type: "heading", level: heading[1].length, text: heading[2] })
      continue
    }
    const list = /^\s*[-*]\s+(.+)$/.exec(line)
    if (list) {
      blocks.push({ type: "list", text: list[1] })
      continue
    }
    if (!line.trim()) {
      blocks.push({ type: "blank", text: "" })
      continue
    }
    blocks.push({ type: "paragraph", text: line })
  }
  if (code) {
    blocks.push({ type: "code", text: code.join("\n") })
  }
  return blocks
}

function buildFileTree(files: SkillFile[]): FileTreeNode {
  const root: FileTreeNode = { name: "", path: "", type: "dir", children: [] }
  for (const file of files) {
    const parts = file.path.split("/").filter(Boolean)
    let current = root
    parts.forEach((part, index) => {
      const path = parts.slice(0, index + 1).join("/")
      const isFile = index === parts.length - 1
      let node = current.children.find((item) => item.name === part && item.type === (isFile ? "file" : "dir"))
      if (!node) {
        node = { name: part, path, type: isFile ? "file" : "dir", file: isFile ? file : undefined, children: [] }
        current.children.push(node)
        current.children.sort((a, b) => {
          if (a.type !== b.type) {
            return a.type === "dir" ? -1 : 1
          }
          return a.name.localeCompare(b.name)
        })
      }
      current = node
    })
  }
  return root
}

function normalizeSkill(value: unknown): Skill | null {
  if (!isRecord(value)) {
    return null
  }
  const id = stringFromUnknown(value.id)
  if (!id) {
    return null
  }
  return {
    id,
    package_id: stringFromUnknown(value.package_id) || "",
    name: stringFromUnknown(value.name) || id,
    description: stringFromUnknown(value.description) || "",
    source: stringFromUnknown(value.source) || "uploaded",
    skill_path: stringFromUnknown(value.skill_path) || "",
    root_path: stringFromUnknown(value.root_path) || "",
    enabled: value.enabled !== false,
    size: numberFromUnknown(value.size),
    hash: stringFromUnknown(value.hash) || "",
    created_at: stringFromUnknown(value.created_at) || new Date().toISOString(),
    updated_at: stringFromUnknown(value.updated_at) || new Date().toISOString(),
  }
}

function normalizeSkillDetail(value: unknown): SkillDetail | null {
  const base = normalizeSkill(value)
  if (!base || !isRecord(value)) {
    return null
  }
  return {
    ...base,
    package_name: stringFromUnknown(value.package_name) || "",
    package_source_name: stringFromUnknown(value.package_source_name) || "",
    files: Array.isArray(value.files) ? value.files.map(normalizeSkillFile).filter((file): file is SkillFile => Boolean(file)) : [],
  }
}

function normalizeSkillFile(value: unknown): SkillFile | null {
  if (!isRecord(value)) {
    return null
  }
  const path = stringFromUnknown(value.path)
  if (!path) {
    return null
  }
  return {
    path,
    size: numberFromUnknown(value.size),
    skill: value.skill === true,
    mod_time: stringFromUnknown(value.mod_time) || undefined,
  }
}

function normalizeSkillFileContent(value: unknown): SkillFileContent | null {
  if (!isRecord(value)) {
    return null
  }
  return {
    path: stringFromUnknown(value.path) || "",
    content: stringFromUnknown(value.content) || "",
    size: numberFromUnknown(value.size),
    truncated: value.truncated === true,
  }
}

function apiErrorMessage(err: unknown, fallback: string) {
  if (isRecord(err) && isRecord(err.response) && isRecord(err.response.data)) {
    const data = err.response.data
    if (typeof data.error === "string" && data.error) {
      return data.error
    }
    if (typeof data.message === "string" && data.message) {
      return data.message
    }
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
  return undefined
}

function numberFromUnknown(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0
}

function formatBytes(value: number) {
  if (value < 1024) {
    return `${value} B`
  }
  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`
  }
  return `${(value / 1024 / 1024).toFixed(1)} MB`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}
