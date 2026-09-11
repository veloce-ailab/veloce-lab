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
    <aside className={cn("flex h-full w-60 flex-col border-r bg-card p-3", className)}>
      <nav className="space-y-1">
        <DashboardSlot name="sidebar.navigation.before" />
        {extensionItems.map((item) => (
          <NavLink key={item.id} to={item.path} onClick={onNavigate} className={({ isActive }) => cn("flex h-9 items-center gap-2 rounded-md px-3 text-sm font-medium transition-colors", isActive ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>
            {item.icon ? <item.icon size={16} /> : null}<span>{navItemLabel(item, t)}</span>
          </NavLink>
        ))}
        <DashboardSlot name="sidebar.navigation.after" />
      </nav>
      <DashboardSlot name="sidebar.footer" className="mt-auto" />
    </aside>
  )
}
