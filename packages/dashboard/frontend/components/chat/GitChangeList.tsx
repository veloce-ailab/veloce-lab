import { FileCode2, FileMinus2, FilePenLine, FilePlus2, FileQuestion } from "lucide-react"
import { useState } from "react"
import { cn } from "@/lib/utils"

export interface GitChangeFile {
  path: string
  status: string
  additions: number
  deletions: number
  diff?: string
}

interface GitChangeCopy {
  changes: string
  clean: string
  untracked: string
  noDiff: string
  added: string
  modified: string
  deleted: string
  renamed: string
}

export function GitChangeList({ files, clean, copy, className }: { files: GitChangeFile[]; clean?: boolean; copy: GitChangeCopy; className?: string }) {
  const [expandedPath, setExpandedPath] = useState(files.length === 1 ? files[0]?.path || "" : "")
  if (clean) return <div className={cn("rounded-md border border-dashed py-8 text-center text-sm text-muted-foreground", className)}>{copy.clean}</div>
  if (files.length === 0) return <div className={cn("rounded-md border border-dashed py-6 text-center text-sm text-muted-foreground", className)}>{copy.noDiff}</div>

  return (
    <section className={cn("space-y-2", className)}>
      <div className="text-sm font-semibold">{copy.changes}</div>
      <div className="overflow-hidden rounded-md border bg-background">
        {files.map((file) => {
          const state = changeState(file.status, copy)
          const expanded = expandedPath === file.path
          return <div key={file.path} className="border-b last:border-b-0">
            <button type="button" className="flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-muted/50" onClick={() => setExpandedPath((current) => current === file.path ? "" : file.path)} aria-expanded={expanded}>
              <state.Icon size={15} className={cn("shrink-0", state.iconClass)} />
              <span className="min-w-0 flex-1 truncate font-mono text-xs">{file.path}</span>
              <span className={cn("shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium", state.badgeClass)}>{state.label}</span>
              <span className="shrink-0 text-xs font-medium tabular-nums text-emerald-700 dark:text-emerald-400">+{file.additions}</span>
              <span className="shrink-0 text-xs font-medium tabular-nums text-rose-700 dark:text-rose-400">-{file.deletions}</span>
            </button>
            {expanded && <div className="border-t bg-muted/20 p-2">{file.diff ? <GitDiffPreview diff={file.diff} /> : <div className="rounded border border-dashed px-3 py-4 text-xs text-muted-foreground">{file.status.includes("??") ? copy.untracked : copy.noDiff}</div>}</div>}
          </div>
        })}
      </div>
    </section>
  )
}

function GitDiffPreview({ diff }: { diff: string }) {
  let oldLine = 0
  let newLine = 0
  return <pre className="max-h-96 overflow-auto rounded border bg-background font-mono text-[11px] leading-5"><code>{diff.split(/\r?\n/).map((line, index) => {
    const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line)
    if (hunk) {
      oldLine = Number(hunk[1])
      newLine = Number(hunk[2])
      return <DiffLine key={`${index}-${line}`} line={line} tone="hunk" />
    }
    if (line.startsWith("+++") || line.startsWith("---") || line.startsWith("diff --git") || line.startsWith("index ")) return <DiffLine key={`${index}-${line}`} line={line} tone="meta" />
    if (line.startsWith("+") && !line.startsWith("+++")) return <DiffLine key={`${index}-${line}`} line={line} newNumber={newLine++} tone="added" />
    if (line.startsWith("-") && !line.startsWith("---")) return <DiffLine key={`${index}-${line}`} line={line} oldNumber={oldLine++} tone="removed" />
    if (line.startsWith(" ")) return <DiffLine key={`${index}-${line}`} line={line} oldNumber={oldLine++} newNumber={newLine++} tone="context" />
    return <DiffLine key={`${index}-${line}`} line={line} tone="meta" />
  })}</code></pre>
}

function DiffLine({ line, oldNumber, newNumber, tone }: { line: string; oldNumber?: number; newNumber?: number; tone: "added" | "removed" | "context" | "hunk" | "meta" }) {
  const color = tone === "added" ? "bg-emerald-500/10 text-emerald-950 dark:text-emerald-100" : tone === "removed" ? "bg-rose-500/10 text-rose-950 dark:text-rose-100" : tone === "hunk" ? "bg-sky-500/10 text-sky-800 dark:text-sky-200" : tone === "meta" ? "bg-muted/60 text-muted-foreground" : "text-foreground"
  return <span className={cn("grid min-w-max grid-cols-[3.5rem_3.5rem_minmax(0,1fr)]", color)}><span className="select-none border-r border-current/10 px-2 text-right opacity-50">{oldNumber || ""}</span><span className="select-none border-r border-current/10 px-2 text-right opacity-50">{newNumber || ""}</span><span className="whitespace-pre px-2">{line || " "}</span>{"\n"}</span>
}

function changeState(status: string, copy: GitChangeCopy) {
  if (status.includes("??") || status.includes("A")) return { label: copy.added, Icon: FilePlus2, iconClass: "text-emerald-600", badgeClass: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" }
  if (status.includes("D")) return { label: copy.deleted, Icon: FileMinus2, iconClass: "text-rose-600", badgeClass: "bg-rose-500/10 text-rose-700 dark:text-rose-300" }
  if (status.includes("R")) return { label: copy.renamed, Icon: FileQuestion, iconClass: "text-sky-600", badgeClass: "bg-sky-500/10 text-sky-700 dark:text-sky-300" }
  if (status.trim()) return { label: copy.modified, Icon: FilePenLine, iconClass: "text-amber-600", badgeClass: "bg-amber-500/10 text-amber-700 dark:text-amber-300" }
  return { label: copy.modified, Icon: FileCode2, iconClass: "text-muted-foreground", badgeClass: "bg-muted text-muted-foreground" }
}
