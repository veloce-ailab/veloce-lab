import Editor, { DiffEditor, loader } from "@monaco-editor/react"
import * as monaco from "monaco-editor"
import { useTheme } from "@velocelab/dashboard/frontend"
import { toolFileContent, toolFileDiffs, toolPreviewLanguage, toolPreviewPath, type ToolPreviewCall } from "../../lib/tool-preview"

// Reuse the same bundled Monaco runtime as Explorer and source-control previews.
loader.config({ monaco })

export default function ToolFilePreview({ toolCall, kind, language }: { toolCall: ToolPreviewCall; kind: "read" | "write" | "replace"; language: string }) {
  const { resolvedTheme } = useTheme()
  const theme = resolvedTheme === "dark" ? "vs-dark" : "vs"
  const zh = language === "zh"
  const path = toolPreviewPath(toolCall)
  const options = { readOnly: true, domReadOnly: true, minimap: { enabled: false }, wordWrap: "off" as const, automaticLayout: true, scrollBeyondLastLine: false, fontSize: 12 }
  if (kind === "read") {
    const content = toolFileContent(toolCall)
    return content === null ? <div className="flex min-h-64 items-center justify-center p-8 text-sm text-muted-foreground">{toolCall.result || (zh ? "尚无文件内容。调用完成后将在此显示。" : "No recorded file content yet. It will appear when this call completes.")}</div>
      : <Editor height="65vh" language={toolPreviewLanguage(path)} value={content} theme={theme} options={options} />
  }
  const entries = toolFileDiffs(toolCall, kind)
  if (!entries.length) return <div className="flex min-h-64 items-center justify-center p-8 text-sm text-muted-foreground">{zh ? "没有可显示的文本修改。" : "No text changes are available."}</div>
  return (
    <div className="max-h-[72vh] min-h-0 overflow-y-auto">
      {entries.map((entry, index) => <div key={`${entry.path}-${index}`}>
        {entry.scope !== "file" && <div className="border-b bg-muted/40 px-4 py-2 text-xs text-muted-foreground">{entry.scope === "snippet" ? (zh ? "修改片段 · 本次记录未包含完整文件快照" : "Changed fragment · This call did not record the full file") : (zh ? "未记录修改前的文件内容，右侧显示拟写入内容" : "The previous file content was not recorded. The right side shows the requested content.")}{entries.length > 1 && ` · ${entry.path}`}</div>}
        <div className="grid grid-cols-2 border-b text-xs text-muted-foreground"><span className="border-r px-4 py-2">{zh ? "修改前" : "Before"}</span><span className="px-4 py-2">{zh ? "修改后" : "After"}</span></div>
        {entry.original === null ? <div className="grid grid-cols-2"><div className="flex items-center justify-center border-r px-4 py-12 text-xs text-muted-foreground">{zh ? "无旧内容快照" : "Previous content unavailable"}</div><Editor height={entries.length > 1 ? "36vh" : "60vh"} language={toolPreviewLanguage(entry.path)} value={entry.modified} theme={theme} options={options} /></div>
          : <DiffEditor height={entries.length > 1 ? "36vh" : "60vh"} original={entry.original} modified={entry.modified} language={toolPreviewLanguage(entry.path)} theme={theme} options={{ ...options, originalEditable: false, renderSideBySide: true, useInlineViewWhenSpaceIsLimited: false, renderOverviewRuler: false, renderIndicators: true, diffCodeLens: false, hideUnchangedRegions: { enabled: false } }} />}
      </div>)}
    </div>
  )
}
