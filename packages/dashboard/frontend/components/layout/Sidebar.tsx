import { NavLink } from "react-router-dom"
import { cn } from "@/lib/utils"
import { DashboardSlot } from "@/lib/slots"
import { useI18n } from "@/lib/i18n"
import { nav, subscribeExtensions } from "@/extension"
import { navItemLabel } from "@/runtime"
import { useEffect, useState } from "react"

export function Sidebar({ className, onNavigate }: { className?: string; onNavigate?: () => void }) {
  const [, refresh] = useState(0)
  const { t } = useI18n()
  useEffect(() => subscribeExtensions(() => refresh((value) => value + 1)), [])
  const extensionItems = nav()
  return (
    <aside className={cn("flex h-full min-w-0 flex-col border-r border-sidebar-border bg-sidebar px-3 py-4 text-sidebar-foreground", className)}>
      <nav className="min-w-0 space-y-1">
        <DashboardSlot name="sidebar.navigation.before" />
        {extensionItems.map((item) => (
          <NavLink key={item.id} to={item.path} onClick={onNavigate} className={({ isActive }) => cn("flex h-9 min-w-0 items-center gap-2 rounded-md px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring", isActive ? "relative bg-sidebar-accent font-semibold text-sidebar-accent-foreground after:absolute after:inset-y-2 after:left-0 after:w-[3px] after:rounded-r-full after:bg-primary" : "font-medium text-sidebar-foreground/70 hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground")}>
            {item.icon ? <item.icon size={16} className="shrink-0" /> : null}<span className="min-w-0 truncate">{navItemLabel(item, t)}</span>
          </NavLink>
        ))}
        <DashboardSlot name="sidebar.navigation.after" />
      </nav>
      <DashboardSlot name="sidebar.footer" className="mt-auto" />
    </aside>
  )
}
