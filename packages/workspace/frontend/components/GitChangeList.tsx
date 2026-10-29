import { FileCode2, FileMinus2, FilePenLine, FilePlus2, FileQuestion } from "lucide-react"
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

export function GitChangeList({ files, clean, copy, className, onFileClick }: { files: GitChangeFile[]; clean?: boolean; copy: GitChangeCopy; className?: string; onFileClick?: (file: GitChangeFile) => void }) {
  if (clean) return <div className={cn("rounded-md border border-dashed py-8 text-center text-sm text-muted-foreground", className)}>{copy.clean}</div>
  if (files.length === 0) return <div className={cn("rounded-md border border-dashed py-6 text-center text-sm text-muted-foreground", className)}>{copy.noDiff}</div>

  return (
    <section className={cn("space-y-2", className)}>
      <div className="text-sm font-semibold">{copy.changes}</div>
      <div className="overflow-hidden rounded-md border bg-background">
        {files.map((file) => {
          const state = changeState(file.status, copy)
          return <div key={file.path} className="border-b last:border-b-0">
            <button type="button" className="flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-muted/50" onClick={() => onFileClick?.(file)}>
              <state.Icon size={15} className={cn("shrink-0", state.iconClass)} />
              <span className="min-w-0 flex-1 truncate font-mono text-xs">{file.path}</span>
              <span className={cn("shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium", state.badgeClass)}>{state.label}</span>
              <span className="shrink-0 text-xs font-medium tabular-nums text-emerald-700 dark:text-emerald-400">+{file.additions}</span>
              <span className="shrink-0 text-xs font-medium tabular-nums text-rose-700 dark:text-rose-400">-{file.deletions}</span>
            </button>
          </div>
        })}
      </div>
    </section>
  )
}

function changeState(status: string, copy: GitChangeCopy) {
  if (status.includes("??") || status.includes("A")) return { label: copy.added, Icon: FilePlus2, iconClass: "text-emerald-600", badgeClass: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" }
  if (status.includes("D")) return { label: copy.deleted, Icon: FileMinus2, iconClass: "text-rose-600", badgeClass: "bg-rose-500/10 text-rose-700 dark:text-rose-300" }
  if (status.includes("R")) return { label: copy.renamed, Icon: FileQuestion, iconClass: "text-sky-600", badgeClass: "bg-sky-500/10 text-sky-700 dark:text-sky-300" }
  if (status.trim()) return { label: copy.modified, Icon: FilePenLine, iconClass: "text-amber-600", badgeClass: "bg-amber-500/10 text-amber-700 dark:text-amber-300" }
  return { label: copy.modified, Icon: FileCode2, iconClass: "text-muted-foreground", badgeClass: "bg-muted text-muted-foreground" }
}
