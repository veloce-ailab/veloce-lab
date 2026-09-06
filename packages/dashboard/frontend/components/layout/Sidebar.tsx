import { Database, MessageSquare, Settings } from "lucide-react"
import { NavLink } from "react-router-dom"
import { cn } from "@/lib/utils"
import { DashboardSlot } from "@/lib/slots"
import { nav, subscribeExtensions } from "@/extension"
import { useEffect, useState } from "react"

const items = [
  { to: "/chat", label: "聊天", icon: MessageSquare },
  { to: "/admin/channels", label: "上游渠道", icon: Database },
  { to: "/admin/system", label: "系统设置", icon: Settings },
]

export function Sidebar({ className, onNavigate }: { className?: string; onNavigate?: () => void }) {
  const [, refresh] = useState(0)
  useEffect(() => subscribeExtensions(() => refresh((value) => value + 1)), [])
  const extensionItems = nav()
  return (
    <aside className={cn("flex h-full w-60 flex-col border-r bg-card p-3", className)}>
      <nav className="space-y-1">
        <DashboardSlot name="sidebar.navigation.before" />
        {items.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            onClick={onNavigate}
            className={({ isActive }) => cn(
              "flex h-9 items-center gap-2 rounded-md px-3 text-sm font-medium transition-colors",
              isActive ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon size={16} />
            <span>{label}</span>
          </NavLink>
        ))}
        {extensionItems.map((item) => (
          <NavLink key={item.id} to={item.path} onClick={onNavigate} className={({ isActive }) => cn("flex h-9 items-center gap-2 rounded-md px-3 text-sm font-medium transition-colors", isActive ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>
            {item.icon ? <item.icon size={16} /> : null}<span>{item.label}</span>
          </NavLink>
        ))}
        <DashboardSlot name="sidebar.navigation.after" />
      </nav>
      <DashboardSlot name="sidebar.footer" className="mt-auto" />
    </aside>
  )
}

export function SystemManagementSidebar() {
  return <Sidebar />
}
