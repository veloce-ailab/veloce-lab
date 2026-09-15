import { DashboardSlot } from "@/lib/slots"

export function PageTitleSlot({ className, slotKey = "default" }: { className?: string; slotKey?: string } = {}) {
  return <DashboardSlot name={`page.title.${slotKey}`} className={className} />
}

export function PageInlineSlot({ className, slotKey = "default" }: { className?: string; slotKey?: string } = {}) {
  return <DashboardSlot name={`page.inline.${slotKey}`} className={className} />
}
