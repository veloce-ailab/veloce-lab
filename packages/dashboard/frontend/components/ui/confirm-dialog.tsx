import { useCallback, useEffect, useRef, useState } from "react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { useI18n } from "@/lib/i18n"

interface ConfirmDialogOptions {
  description: string
  title?: string
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
}

interface PendingConfirmation extends ConfirmDialogOptions {
  resolve: (confirmed: boolean) => void
}

export function useConfirmDialog() {
  const { language } = useI18n()
  const [pending, setPending] = useState<PendingConfirmation | null>(null)
  const pendingRef = useRef<PendingConfirmation | null>(null)
  const copy = language === "zh"
    ? { title: "确认操作", confirm: "确认", cancel: "取消" }
    : language === "ja"
      ? { title: "操作を確認", confirm: "確認", cancel: "キャンセル" }
      : { title: "Confirm action", confirm: "Confirm", cancel: "Cancel" }

  const finish = useCallback((confirmed: boolean) => {
    const current = pendingRef.current
    if (!current) return
    pendingRef.current = null
    setPending(null)
    current.resolve(confirmed)
  }, [])

  const confirm = useCallback((options: ConfirmDialogOptions) => new Promise<boolean>((resolve) => {
    if (pendingRef.current) pendingRef.current.resolve(false)
    const next = { ...options, resolve }
    pendingRef.current = next
    setPending(next)
  }), [])

  useEffect(() => () => finish(false), [finish])

  const confirmDialog = (
    <AlertDialog open={Boolean(pending)} onOpenChange={(open) => { if (!open) finish(false) }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{pending?.title || copy.title}</AlertDialogTitle>
          <AlertDialogDescription>{pending?.description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => finish(false)}>{pending?.cancelLabel || copy.cancel}</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={() => finish(true)}>{pending?.confirmLabel || copy.confirm}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )

  return { confirm, confirmDialog }
}
