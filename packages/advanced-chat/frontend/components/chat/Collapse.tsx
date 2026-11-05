import { useEffect, useState, type ReactNode } from "react"
import { cn } from "@/lib/utils"

/**
 * Animates a disclosure open and closed.
 *
 * The content has to stay mounted for the closing transition to play, but a tool
 * result can be large, so it is dropped once the collapse has finished instead of
 * being kept in the DOM for the whole session. Height is driven through
 * `grid-template-rows` 0fr -> 1fr, which is the one way to animate a content
 * height we do not know without measuring it in JS.
 *
 * The wrapper clips with `overflow-hidden` rather than shrinking its child, so
 * content that expects a stable box (the command terminal is a fixed-height
 * xterm) still measures itself correctly while the panel is opening.
 */
export function Collapse({ open, className, children }: { open: boolean; className?: string; children: ReactNode }) {
  const [mounted, setMounted] = useState(open)
  const [expanded, setExpanded] = useState(open)
  useEffect(() => {
    if (open) {
      setMounted(true)
      // Mount collapsed, then expand only after that collapsed state has been
      // painted. One frame is not enough: the callback can run before the
      // browser paints the 0fr state, leaving nothing to transition from.
      let inner = 0
      const outer = requestAnimationFrame(() => {
        inner = requestAnimationFrame(() => setExpanded(true))
      })
      return () => {
        cancelAnimationFrame(outer)
        if (inner) cancelAnimationFrame(inner)
      }
    }
    setExpanded(false)
    const timer = window.setTimeout(() => setMounted(false), 200)
    return () => window.clearTimeout(timer)
  }, [open])
  if (!mounted) {
    return null
  }
  return (
    <div className={cn("grid transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none", expanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0", className)}>
      <div className="min-h-0 overflow-hidden">{children}</div>
    </div>
  )
}
