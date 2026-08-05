import { Database, MessageSquare, Settings } from "lucide-react"
import { NavLink } from "react-router-dom"
import { cn } from "@/lib/utils"

const items = [
  { to: "/chat", label: "聊天", icon: MessageSquare },
  { to: "/admin/channels", label: "上游渠道", icon: Database },
  { to: "/admin/system", label: "系统设置", icon: Settings },
]

export function Sidebar({ className, onNavigate }: { className?: string; onNavigate?: () => void }) {
  return (
    <aside className={cn("flex h-full w-60 flex-col border-r bg-card p-2", className)}>
      <nav className="space-y-0.5">
        {items.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            onClick={onNavigate}
            className={({ isActive }) => cn(
              "flex h-6 items-center gap-2 rounded-md px-2 text-xs font-medium transition-colors",
              isActive ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon size={15} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
    </aside>
  )
}

export function SystemManagementSidebar() {
  return <Sidebar />
}
