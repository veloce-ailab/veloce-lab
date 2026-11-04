import { lazy, Suspense, useEffect, useRef } from "react"
import { Terminal as XTerm } from "@xterm/xterm"
import { FitAddon } from "@xterm/addon-fit"
import "@xterm/xterm/css/xterm.css"
import { TerminalSquare } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { toolCommandTranscript, toolPreviewPath, type ToolPreviewCall } from "../../lib/tool-preview"

const ToolFilePreview = lazy(() => import("./ToolFilePreview"))

export interface ToolCallPreviewProps {
  toolCall: ToolPreviewCall
  kind: "command" | "read" | "write" | "replace"
  language: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** Display a recorded invocation only. This never starts a shell or reads today's file. */
export function ToolCallPreview({ toolCall, kind, language, open, onOpenChange }: ToolCallPreviewProps) {
  const zh = language === "zh"
  if (kind === "command") return open ? <ToolCommandOutput toolCall={toolCall} language={language} /> : null
  const path = toolPreviewPath(toolCall)
  const failed = ["error", "invalid_arguments", "cancelled"].includes(toolCall.status)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-6xl overflow-hidden bg-popover p-0 text-popover-foreground sm:max-w-6xl">
        <DialogHeader className="border-b px-5 py-3 pr-12">
          <DialogTitle className="break-all text-sm">{path || (zh ? "文件预览" : "File preview")}</DialogTitle>
          <DialogDescription className="text-xs">
            {kind === "read" ? (zh ? "只读 · 调用时读取的内容" : "Read only · Content recorded by this call") : (zh ? "只读 · 左侧修改前，右侧修改后" : "Read only · Before on the left, after on the right")}
            {failed && (zh ? " · 本次调用未完成，所示为请求的修改" : " · This call did not complete; changes shown were requested")}
          </DialogDescription>
        </DialogHeader>
        {open && <Suspense fallback={<div className="flex h-[65vh] items-center justify-center text-sm text-muted-foreground">{zh ? "加载预览…" : "Loading preview…"}</div>}><ToolFilePreview toolCall={toolCall} kind={kind} language={language} /></Suspense>}
      </DialogContent>
    </Dialog>
  )
}

function ToolCommandOutput({ toolCall, language }: { toolCall: ToolPreviewCall; language: string }) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const terminalRef = useRef<XTerm | null>(null)
  const transcript = toolCommandTranscript(toolCall)
  const zh = language === "zh"
  const active = ["running", "pending", "queued", "approval_required"].includes(toolCall.status)
  const status = toolCall.status === "approval_required" ? (zh ? "等待审批" : "Waiting for approval")
    : active ? (zh ? "运行中…" : "Running…")
    : transcript.exitCode !== undefined ? (zh ? `退出码 ${transcript.exitCode}` : `Exit code ${transcript.exitCode}`)
    : ["error", "invalid_arguments"].includes(toolCall.status) ? (zh ? "执行失败" : "Failed")
    : toolCall.status === "cancelled" ? (zh ? "已取消" : "Cancelled") : (zh ? "已结束" : "Finished")

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const terminal = new XTerm({
      convertEol: true,
      disableStdin: true,
      screenReaderMode: true,
      cursorBlink: false,
      cursorInactiveStyle: "none",
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
      fontSize: 12,
      lineHeight: 1.35,
      scrollback: 10000,
      theme: { background: "#101114", foreground: "#e5e7eb", selectionBackground: "#334155", green: "#86efac", red: "#fca5a5", brightBlack: "#94a3b8" },
    })
    const fit = new FitAddon()
    terminalRef.current = terminal
    terminal.loadAddon(fit)
    terminal.open(host)
    const resize = () => { if (host.clientWidth && host.clientHeight) { try { fit.fit() } catch { /* Font measurements settle on the next resize. */ } } }
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(host)
    const frame = window.requestAnimationFrame(resize)
    return () => { window.cancelAnimationFrame(frame); observer.disconnect(); fit.dispose(); terminal.dispose(); terminalRef.current = null }
  }, [])

  useEffect(() => {
    const terminal = terminalRef.current
    if (!terminal) return
    terminal.reset()
    // Commands are literal text; the recorded output can contain terminal ANSI colors.
    const command = transcript.command.replace(/[\x00-\x08\x0b-\x1f\x7f]/g, "")
    terminal.write(`\x1b[32m$\x1b[0m ${command}\r\n`)
    if (transcript.output) terminal.write(transcript.output)
  }, [transcript.command, transcript.output])

  return (
    <div className="mt-2 overflow-hidden rounded-md border border-border bg-[#101114] text-[#e5e7eb]">
      <div className="flex min-w-0 items-center gap-2 border-b border-white/10 px-3 py-2 text-xs text-slate-400"><TerminalSquare size={14} className="shrink-0" /><span className="min-w-0 flex-1 truncate" title={transcript.cwd}>{transcript.cwd || (zh ? "命令输出" : "Command output")}</span><span className="shrink-0">{status}</span></div>
      <div ref={hostRef} className="h-64 min-w-0 px-3 py-2" role="log" aria-label={zh ? "命令输入和输出（只读）" : "Command input and output (read only)"} />
      {!transcript.output && <div className="border-t border-white/10 px-3 py-2 text-xs text-slate-400">{active ? (zh ? "等待命令输出…" : "Waiting for command output…") : (zh ? "没有输出" : "No output")}</div>}
    </div>
  )
}
