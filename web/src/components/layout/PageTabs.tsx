import type { ComponentPropsWithoutRef } from "react"
import { cn } from "@/lib/utils"

type PageTabsProps = ComponentPropsWithoutRef<"nav">

interface PageTabProps extends ComponentPropsWithoutRef<"button"> {
  active: boolean
}

/** Page-level tab navigation, shared with the studio operations detail page. */
export function PageTabs({ className, ...props }: PageTabsProps) {
  return <nav className={cn("flex gap-1 overflow-x-auto border-b", className)} {...props} />
}

export function PageTab({ active, className, type = "button", ...props }: PageTabProps) {
  return (
    <button
      type={type}
      className={cn(
        "shrink-0 border-b-2 px-3 py-2 text-sm font-medium transition-colors",
        active ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground",
        className,
      )}
      {...props}
    />
  )
}
