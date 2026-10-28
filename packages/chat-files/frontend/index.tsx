import { useMemo } from "react"
import { FileText } from "lucide-react"
import { useI18n, type DashboardContext } from "@velocelab/dashboard/frontend"
import type { ChatSlotData } from "@velocelab/advanced-chat/frontend/slots"

function GeneratedFiles(props: Record<string, unknown>) {
  const { messages } = props as ChatSlotData
  const { language } = useI18n()
  const generatedFiles = useMemo(() => generatedFilesFromMessages(messages), [messages])
  return (
          <section className="min-h-0 rounded-md border border-border bg-card shadow-sm">
            <div className="flex h-11 items-center justify-between border-b px-3">
              <div className="flex items-center gap-2 text-sm font-semibold"><FileText size={16} />{language === "zh" ? "生成的文件" : "Generated files"}</div>
              <span className="text-xs tabular-nums text-muted-foreground">{generatedFiles.length}</span>
            </div>
            <div className="max-h-[calc(100vh-20rem)] space-y-1 overflow-y-auto p-2">
              {generatedFiles.length === 0 ? (
                <div className="px-3 py-8 text-center text-xs text-muted-foreground">{language === "zh" ? "助理登记的文件会显示在这里" : "Files reported by the assistant appear here"}</div>
              ) : generatedFiles.map((file) => (
                <div key={file.path} className="rounded-md px-2 py-2 hover:bg-muted">
                  <div className="flex items-center gap-2"><FileText size={14} className="shrink-0 text-primary" /><span className="truncate text-sm font-medium" title={file.path}>{file.name}</span></div>
                  {file.description && <div className="mt-1 line-clamp-2 pl-6 text-xs text-muted-foreground">{file.description}</div>}
                  <div className="mt-1 truncate pl-6 font-mono text-[11px] text-muted-foreground" title={file.path}>{file.path}</div>
                </div>
              ))}
            </div>
          </section>
  )
}

export default function apply(ctx: DashboardContext) {
  ctx.slot("chat.sidebar.panels", GeneratedFiles, "chat-files.panel", 40, "/chat")
}

interface GeneratedFileEntry {
  path: string
  name: string
  description: string
}

const GENERATED_FILE_TOOL_NAME = "report_generated_file"

function generatedFilesFromMessages(messages: ChatSlotData["messages"]): GeneratedFileEntry[] {
  const files = new Map<string, GeneratedFileEntry>()
  for (const message of messages) {
    for (const call of message.tool_calls || []) {
      if (call.name !== GENERATED_FILE_TOOL_NAME || call.status !== "ok") continue
      const path = stringArgument(call.arguments, "path").trim()
      if (!path) continue
      const segments = path.replace(/\\/g, "/").split("/").filter(Boolean)
      files.set(path, {
        path,
        name: stringArgument(call.arguments, "name").trim() || segments.at(-1) || path,
        description: stringArgument(call.arguments, "description").trim(),
      })
    }
  }
  return Array.from(files.values()).reverse()
}

function stringArgument(value: Record<string, unknown> | undefined, key: string) {
  const item = value?.[key]
  if (typeof item === "string") {
    return item
  }
  if (typeof item === "number" || typeof item === "boolean") {
    return String(item)
  }
  return ""
}
