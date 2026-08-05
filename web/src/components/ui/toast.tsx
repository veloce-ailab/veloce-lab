import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react"
import type { ReactNode } from "react"
import { CheckCircle2, Info, X, XCircle } from "lucide-react"
import { cn } from "@/lib/utils"

type ToastVariant = "success" | "error" | "info"

interface ToastItem {
  id: number
  message: string
  variant: ToastVariant
  leaving: boolean
}

interface ToastApi {
  toast: (message: string, variant?: ToastVariant) => void
  success: (message: string) => void
  error: (message: string) => void
  info: (message: string) => void
}

const ToastContext = createContext<ToastApi | null>(null)

const AUTO_DISMISS_MS = 3200
const LEAVE_ANIMATION_MS = 180

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const idRef = useRef(0)
  const timersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map())

  const remove = useCallback((id: number) => {
    setToasts((current) => current.map((item) => (item.id === id ? { ...item, leaving: true } : item)))
    const timer = setTimeout(() => {
      setToasts((current) => current.filter((item) => item.id !== id))
      timersRef.current.delete(id)
    }, LEAVE_ANIMATION_MS)
    timersRef.current.set(id, timer)
  }, [])

  const toast = useCallback(
    (message: string, variant: ToastVariant = "info") => {
      if (!message) {
        return
      }
      const id = (idRef.current += 1)
      setToasts((current) => [...current, { id, message, variant, leaving: false }])
      const timer = setTimeout(() => remove(id), AUTO_DISMISS_MS)
      timersRef.current.set(id, timer)
    },
    [remove]
  )

  useEffect(() => {
    const timers = timersRef.current
    return () => {
      timers.forEach((timer) => clearTimeout(timer))
      timers.clear()
    }
  }, [])

  const api: ToastApi = {
    toast,
    success: useCallback((message: string) => toast(message, "success"), [toast]),
    error: useCallback((message: string) => toast(message, "error"), [toast]),
    info: useCallback((message: string) => toast(message, "info"), [toast]),
  }

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={remove} />
    </ToastContext.Provider>
  )
}

function ToastViewport({ toasts, onDismiss }: { toasts: ToastItem[]; onDismiss: (id: number) => void }) {
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-full max-w-sm flex-col gap-2">
      {toasts.map((item) => (
        <ToastCard key={item.id} item={item} onDismiss={onDismiss} />
      ))}
    </div>
  )
}

const variantStyles: Record<ToastVariant, { wrapper: string; icon: ReactNode }> = {
  success: {
    wrapper: "border-emerald-500/30 bg-emerald-50 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100",
    icon: <CheckCircle2 size={18} className="shrink-0 text-emerald-500" />,
  },
  error: {
    wrapper: "border-red-500/30 bg-red-50 text-red-900 dark:bg-red-950 dark:text-red-100",
    icon: <XCircle size={18} className="shrink-0 text-red-500" />,
  },
  info: {
    wrapper: "border-white/50 bg-popover/80 text-popover-foreground backdrop-blur-xl dark:border-white/10 dark:bg-popover/80",
    icon: <Info size={18} className="shrink-0 text-muted-foreground" />,
  },
}

function ToastCard({ item, onDismiss }: { item: ToastItem; onDismiss: (id: number) => void }) {
  const styles = variantStyles[item.variant]
  return (
    <div
      role="status"
      className={cn(
        "pointer-events-auto flex items-start gap-3 rounded-md border px-4 py-3 text-sm shadow-lg",
        styles.wrapper,
        item.leaving ? "animate-toast-out" : "animate-toast-in"
      )}
    >
      {styles.icon}
      <span className="min-w-0 flex-1 whitespace-pre-wrap break-words">{item.message}</span>
      <button
        type="button"
        className="shrink-0 rounded-sm opacity-60 transition-opacity hover:opacity-100"
        aria-label="Close"
        onClick={() => onDismiss(item.id)}
      >
        <X size={16} />
      </button>
    </div>
  )
}

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider")
  }
  return context
}
