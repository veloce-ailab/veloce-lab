import { useQuery } from "@tanstack/react-query"
import { Bot, LogOut, MessageSquare, Shield, UserCircle } from "lucide-react"
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom"
import { useEffect, useState } from "react"
import Settings, { type SettingsSection } from "./Settings"
import { AppHeader } from "@/components/layout/Layout"
import { PageTransition } from "@/components/layout/PageTransition"
import api, { isDesktopTarget } from "@/lib/api"
import { useI18n } from "@/lib/i18n"
import type { PublicSettings } from "@/lib/public-settings"
import { withPublicSettingsDefaults } from "@/lib/public-settings"
import { cn } from "@/lib/utils"

interface CurrentUser {
  username?: string
  email?: string
  avatar_url?: string
}

interface SettingsNavItem {
  href: string
  section?: SettingsSection
  label: string
  icon: typeof UserCircle
  colorClass: string
}

export default function SettingsWorkspace() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()
  const { language } = useI18n()
  const isDesktop = isDesktopTarget()
  const { data: settings } = useQuery<PublicSettings>({
    queryKey: ["public-settings"],
    queryFn: async () => (await api.get("/public/settings")).data,
  })
  const { data: user } = useQuery<CurrentUser>({
    queryKey: ["me"],
    queryFn: async () => (await api.get("/user/me")).data,
  })
  const publicSettings = withPublicSettingsDefaults(settings)
  const copy = settingsWorkspaceCopy(language)

  useEffect(() => {
    if (isDesktopTarget()) {
      window.parent?.postMessage({ type: "veloce-desktop-tab-title", title: desktopSettingsTitle(location.pathname, language), path: location.pathname }, "*")
    }
  }, [language, location.pathname])

  const logout = () => {
    localStorage.removeItem("token")
    navigate("/login", { replace: true })
  }

  return (
    <div className={cn("flex flex-col overflow-hidden", isDesktop ? "desktop-acrylic-window h-full min-h-0" : "h-screen bg-background")}>
      {!isDesktop && (
        <AppHeader
          publicSettings={publicSettings}
          user={user}
          isSidebarOpen={isSidebarOpen}
          onToggleSidebar={() => setIsSidebarOpen((open) => !open)}
        />
      )}

      <div className="flex min-h-0 flex-1">
        <SettingsSidebar pathname={location.pathname} copy={copy} onLogout={logout} />
        <div className={cn("fixed inset-0 z-40 transition-opacity duration-200 lg:hidden", isDesktop ? "top-0" : "top-16", isSidebarOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0")} aria-hidden={!isSidebarOpen}>
          <button type="button" className="absolute inset-0 bg-black/35 backdrop-blur-sm transition-opacity duration-200" aria-label={copy.closeMenu} onClick={() => setIsSidebarOpen(false)} />
          <SettingsSidebar className={cn("relative z-50 h-full w-64 max-w-[85vw] transition-transform duration-200 ease-out", isSidebarOpen ? "translate-x-0" : "-translate-x-full")} pathname={location.pathname} copy={copy} onLogout={logout} onNavigate={() => setIsSidebarOpen(false)} />
        </div>
        <main className={cn("min-h-0 flex-1 overflow-y-auto transition-[filter] duration-200", isSidebarOpen && "max-lg:blur-sm")}>
          <div className="mx-auto w-full max-w-5xl p-4 sm:p-6 lg:p-8">
            <PageTransition transitionKey={location.pathname} className="page-shell-transition">
              <Routes>
                <Route index element={<Navigate to="profile" replace />} />
                <Route path="profile" element={<Settings section="profile" />} />
                <Route path="assistant" element={<Settings section="assistant" />} />
                <Route path="security" element={<Settings section="security" />} />
                <Route path="*" element={<Navigate to="profile" replace />} />
              </Routes>
            </PageTransition>
          </div>
        </main>
      </div>
    </div>
  )
}

function SettingsSidebar({ pathname, copy, onLogout, className, onNavigate }: {
  pathname: string
  copy: ReturnType<typeof settingsWorkspaceCopy>
  onLogout: () => void
  className?: string
  onNavigate?: () => void
}) {
  const visibilityClass = className ? "flex flex-col" : "hidden lg:flex lg:flex-col"
  const items: SettingsNavItem[] = [
    { href: "/settings/profile", section: "profile", label: copy.account, icon: UserCircle, colorClass: "bg-blue-500/15 text-blue-600 dark:bg-blue-400/15 dark:text-blue-300" },
    { href: "/settings/assistant", section: "assistant", label: copy.assistant, icon: Bot, colorClass: "bg-violet-500/15 text-violet-600 dark:bg-violet-400/15 dark:text-violet-300" },
    { href: "/settings/security", section: "security", label: copy.security, icon: Shield, colorClass: "bg-emerald-500/15 text-emerald-600 dark:bg-emerald-400/15 dark:text-emerald-300" },
  ]

  return (
    <aside className={cn(visibilityClass, "h-full min-h-0 w-56 shrink-0 border-r bg-background", className)}>
      <div className="shrink-0 px-4 pb-3 pt-5 text-sm font-semibold">{copy.title}</div>
      <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3">
        {items.map((item) => {
          const Icon = item.icon
          const active = pathname === item.href
          return (
            <Link
              key={item.href}
              to={item.href}
              onClick={onNavigate}
              className={cn(
                "flex h-11 items-center gap-3 rounded-2xl px-3 text-sm transition-colors",
                // hover 底色只用于非激活项：激活项已是 bg-primary，若再套 hover:bg-muted
                // 会在悬停时把背景换成浅色而文字仍是 primary-foreground，看起来像变色异常
                active ? "bg-primary font-medium text-primary-foreground shadow-sm" : "hover:bg-muted",
              )}
            >
              <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-xl", active ? "bg-primary-foreground/15 text-primary-foreground" : item.colorClass)}>
                <Icon size={16} />
              </span>
              <span className="truncate">{item.label}</span>
            </Link>
          )
        })}
      </nav>
      <div className="mt-auto shrink-0 space-y-1 border-t p-3">
        <Link to="/chat" onClick={onNavigate} className="flex h-10 items-center gap-3 rounded-2xl px-3 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-xl bg-blue-500/15 text-blue-600 dark:bg-blue-400/15 dark:text-blue-300"><MessageSquare size={16} /></span>
          <span>{copy.chat}</span>
        </Link>
        <button type="button" onClick={onLogout} className="flex h-10 w-full items-center gap-3 rounded-2xl px-3 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-xl bg-rose-500/15 text-rose-600 dark:bg-rose-400/15 dark:text-rose-300"><LogOut size={16} /></span>
          <span>{copy.signOut}</span>
        </button>
      </div>
    </aside>
  )
}

function settingsWorkspaceCopy(language: string) {
  if (language === "zh") return { title: "设置", account: "账户", assistant: "助手", security: "安全", chat: "聊天", signOut: "退出登录", openMenu: "打开设置菜单", closeMenu: "关闭设置菜单" }
  if (language === "ja") return { title: "設定", account: "アカウント", assistant: "アシスタント", security: "セキュリティ", chat: "チャット", signOut: "ログアウト", openMenu: "設定メニューを開く", closeMenu: "設定メニューを閉じる" }
  return { title: "Settings", account: "Account", assistant: "Assistant", security: "Security", chat: "Chat", signOut: "Sign out", openMenu: "Open settings menu", closeMenu: "Close settings menu" }
}

function desktopSettingsTitle(pathname: string, language: string) {
  const zh = language === "zh"
  if (pathname === "/settings/assistant") return zh ? "助手设置" : "Assistant settings"
  if (pathname === "/settings/security") return zh ? "安全设置" : "Security settings"
  return zh ? "账户设置" : "Account settings"
}
