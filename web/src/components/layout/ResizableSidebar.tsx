import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react"
import { cn } from "@/lib/utils"

type SidebarEdge = "left" | "right"

interface ResizableSidebarProps {
  storageKey: string
  side: SidebarEdge
  defaultWidth: number
  minWidth?: number
  maxWidth?: number
  className?: string
  children: ReactNode
}

export function ResizableSidebar({ storageKey, side, defaultWidth, minWidth = 208, maxWidth = 560, className, children }: ResizableSidebarProps) {
  const [width, setWidth] = useState(() => readSidebarWidth(storageKey, defaultWidth, minWidth, maxWidth))
  const dragStart = useRef<{ x: number; width: number } | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  useEffect(() => {
    if (!isDragging) return
    const move = (event: globalThis.PointerEvent) => {
      const start = dragStart.current
      if (!start) return
      const delta = side === "left" ? event.clientX - start.x : start.x - event.clientX
      setWidth(clamp(start.width + delta, minWidth, maxWidth))
    }
    const finish = () => {
      dragStart.current = null
      setIsDragging(false)
    }
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", finish)
    return () => {
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", finish)
    }
  }, [isDragging, maxWidth, minWidth, side])

  useEffect(() => {
    if (typeof window !== "undefined") localStorage.setItem(`veloce.sidebar-width.${storageKey}`, String(width))
  }, [storageKey, width])

  const beginResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    dragStart.current = { x: event.clientX, width }
    setIsDragging(true)
  }
  const resizeByKeyboard = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const increase = side === "left" ? event.key === "ArrowRight" : event.key === "ArrowLeft"
    const decrease = side === "left" ? event.key === "ArrowLeft" : event.key === "ArrowRight"
    if (!increase && !decrease) return
    event.preventDefault()
    setWidth((current) => clamp(current + (increase ? 24 : -24), minWidth, maxWidth))
  }

  return <div className={cn("relative min-w-0 shrink-0", className)} style={{ width }}>
    <div className="h-full min-w-0">{children}</div>
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize sidebar"
      tabIndex={0}
      className={cn("absolute inset-y-0 z-40 w-2 cursor-col-resize touch-none outline-none before:absolute before:inset-y-0 before:left-1/2 before:w-px before:bg-transparent before:transition-colors hover:before:bg-primary/60 focus-visible:before:bg-primary", side === "left" ? "-right-1" : "-left-1", isDragging && "before:bg-primary")}
      onPointerDown={beginResize}
      onKeyDown={resizeByKeyboard}
    />
  </div>
}

function readSidebarWidth(storageKey: string, fallback: number, min: number, max: number) {
  if (typeof window === "undefined") return fallback
  const stored = Number(localStorage.getItem(`veloce.sidebar-width.${storageKey}`))
  return Number.isFinite(stored) ? clamp(stored, min, max) : fallback
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.round(value)))
}
