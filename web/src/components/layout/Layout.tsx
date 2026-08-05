import { Sidebar } from "./Sidebar"
import { PageTransition } from "./PageTransition"
import { Menu, UserCircle } from "lucide-react"
import { Link, Outlet, useLocation } from "react-router-dom"
import { useState, type ReactNode } from "react"
import { useQuery } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { ThemeSwitcher } from "@/components/ThemeSwitcher"
import { LanguageSwitcher } from "@/components/LanguageSwitcher"
import { AnnouncementButton } from "@/components/AnnouncementButton"
import api, { apiURL } from "@/lib/api"
import { useI18n } from "@/lib/i18n"
import type { PublicSettings } from "@/lib/public-settings"
import { parseTopNavItems, withPublicSettingsDefaults } from "@/lib/public-settings"
import { cn } from "@/lib/utils"

interface CurrentUser {
  username?: string
  email?: string
  phone?: string | null
  avatar_url?: string
  is_admin?: boolean
}

export function Layout() {
  const location = useLocation()
  const isChatWorkspace = location.pathname === "/chat" || location.pathname.startsWith("/chat/")
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const { language } = useI18n()
  const { data: settings } = useQuery<PublicSettings>({
    queryKey: ["public-settings"],
    queryFn: async () => {
      const res = await api.get("/public/settings")
      return res.data
    },
  })
  const { data: user } = useQuery<CurrentUser>({
    queryKey: ["me"],
    queryFn: async () => {
      const res = await api.get("/user/me")
      return res.data
    },
  })
  const publicSettings = withPublicSettingsDefaults(settings)
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <AppHeader
        publicSettings={publicSettings}
        user={user}
        isSidebarOpen={isSidebarOpen}
        onToggleSidebar={() => setIsSidebarOpen((open) => !open)}
      />

      <div className="flex min-h-0 flex-1">
        <div className={cn("hidden lg:h-full lg:shrink-0", !isChatWorkspace && "lg:block")}>
          <Sidebar />
        </div>

        <div className={cn("fixed inset-0 top-16 z-40 transition-opacity duration-200 lg:hidden", isSidebarOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0")} aria-hidden={!isSidebarOpen}>
            <button
              type="button"
              className="absolute inset-0 bg-black/35 backdrop-blur-sm transition-opacity duration-200"
              aria-label="Close menu"
              onClick={() => setIsSidebarOpen(false)}
            />
            <div className={cn("relative z-50 h-full w-64 max-w-[85vw] transition-transform duration-200 ease-out", isSidebarOpen ? "translate-x-0" : "-translate-x-full")}>
              <Sidebar className="w-full" onNavigate={() => setIsSidebarOpen(false)} />
            </div>
        </div>

        <main className={cn("flex min-h-0 flex-1 flex-col overflow-y-auto transition-[filter] duration-200", isSidebarOpen && "max-lg:blur-sm")}>
          {publicSettings.sms_binding_required && user && !user.phone && (
            <div className="border-b border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 sm:px-6 lg:px-8 dark:text-amber-300">
              <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2">
                <span>{language === "zh" ? "管理员要求绑定手机号，请前往安全设置完成绑定。" : "The administrator requires a bound phone number. Please bind one in security settings."}</span>
                <Link to="/settings/security" className="shrink-0 font-medium underline-offset-4 hover:underline">
                  {language === "zh" ? "去绑定" : "Bind now"}
                </Link>
              </div>
            </div>
          )}
          {publicSettings.announcement && (
            <div className="border-b bg-muted/50 px-4 py-3 text-sm sm:px-6 lg:px-8">
              <div className="mx-auto max-w-6xl whitespace-pre-wrap">{publicSettings.announcement}</div>
            </div>
          )}
          <div className={cn("mx-auto w-full flex-1", isChatWorkspace ? "min-h-0 max-w-none p-0" : "max-w-6xl p-4 sm:p-6 lg:p-8")}>
            <PageTransition className="page-shell-transition">
              <div className={cn(isChatWorkspace ? "h-full min-h-0" : "space-y-6")}>
                <Outlet />
              </div>
            </PageTransition>
          </div>
          {publicSettings.footer_text && (
            <footer className="border-t px-4 py-4 text-center text-sm text-muted-foreground sm:px-6 lg:px-8">
              {publicSettings.footer_text}
            </footer>
          )}
        </main>
      </div>
    </div>
  )
}

export interface AppHeaderUser {
  username?: string
  email?: string
  avatar_url?: string
}

// AppHeader is the shared top bar used by the console layout and the settings
// workspace so both surfaces stay visually consistent.
export function AppHeader({
  publicSettings,
  user,
  isSidebarOpen,
  onToggleSidebar,
  extra,
}: {
  publicSettings: PublicSettings
  user?: AppHeaderUser
  isSidebarOpen: boolean
  onToggleSidebar: () => void
  extra?: ReactNode
}) {
  const { language } = useI18n()
  const topNavItems = parseTopNavItems(publicSettings.top_nav_items)
  const menuLabel = isSidebarOpen
    ? language === "zh" ? "关闭菜单" : "Close menu"
    : language === "zh" ? "打开菜单" : "Open menu"
  return (
    <header className="z-30 flex h-16 shrink-0 items-center justify-between border-b bg-background/95 px-4 backdrop-blur sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <Button
          className="lg:hidden"
          variant="outline"
          size="icon"
          onClick={onToggleSidebar}
          aria-label={menuLabel}
          aria-expanded={isSidebarOpen}
        >
          <Menu size={18} />
        </Button>
        <Brand settings={publicSettings} />
      </div>
      <div className="flex min-w-0 items-center gap-3">
        {publicSettings.top_nav_enabled && topNavItems.length > 0 && (
          <div className="hidden min-w-0 items-center gap-4 text-sm text-muted-foreground lg:flex">
            {topNavItems.map((item) => (
              <NavLink key={`${item.label}-${item.href}`} label={item.label} href={item.href} external={item.external} />
            ))}
          </div>
        )}
        {extra}
        <ThemeSwitcher />
        <LanguageSwitcher compact />
        <AnnouncementButton />
        <UserAvatar user={user} />
      </div>
    </header>
  )
}

function UserAvatar({ user }: { user?: CurrentUser }) {
  const label = user?.username || user?.email || "User"
  const initials = avatarInitials(label)
  return (
    <Link
      to="/settings/profile"
      className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border bg-muted text-sm font-semibold text-foreground hover:bg-accent"
      title={label}
      aria-label={label}
    >
      {user?.avatar_url ? (
        <img src={apiURL(user.avatar_url)} alt="" className="h-full w-full object-cover" />
      ) : initials ? (
        initials
      ) : (
        <UserCircle size={20} />
      )}
    </Link>
  )
}

function avatarInitials(value: string) {
  const trimmed = value.trim()
  if (!trimmed) {
    return ""
  }
  const parts = trimmed.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
  }
  return trimmed.slice(0, 2).toUpperCase()
}

function Brand({ settings, className }: { settings: PublicSettings; className?: string }) {
  return (
    <Link to="/" className={className ? `flex min-w-0 items-center gap-2 ${className}` : "flex min-w-0 items-center gap-2"}>
      {settings.icon_url && <img src={settings.icon_url} alt="" className="h-7 w-7 shrink-0 rounded object-cover" />}
      <span className="truncate text-sm font-semibold">{settings.site_name}</span>
    </Link>
  )
}

function NavLink({ label, href, external }: { label: string; href: string; external: boolean }) {
  if (external) {
    return (
      <a href={href} target="_blank" rel="noreferrer">
        {label}
      </a>
    )
  }
  return <Link to={href}>{label}</Link>
}
