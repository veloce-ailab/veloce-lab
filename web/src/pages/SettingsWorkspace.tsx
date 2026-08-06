import { useQuery } from "@tanstack/react-query"
import { BarChart3, Bell, Bot, ChevronDown, ChevronRight, Database, HardDrive, Home, KeyRound, LogOut, MessageSquare, Settings as SettingsIcon, Shield, UserCircle } from "lucide-react"
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom"
import { useEffect, useState } from "react"
import Settings, { type SettingsSection } from "./Settings"
import Channels from "./Channels"
import SystemManagement from "./SystemManagement"
import SettingsStatistics from "./SettingsStatistics"
import AdvancedChatMemories from "./AdvancedChatMemories"
import ConnectorCredentials from "./ConnectorCredentials"
import DesktopNotifications from "./DesktopNotifications"
import { AppHeader } from "@/components/layout/Layout"
import { PageTransition } from "@/components/layout/PageTransition"
import api, { apiURL, isDesktopTarget } from "@/lib/api"
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
}

interface SettingsNavGroup {
  id: string
  label: string
  items: SettingsNavItem[]
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
        <SettingsSidebar pathname={location.pathname} copy={copy} user={user} onLogout={logout} />
        <div className={cn("fixed inset-0 z-40 transition-opacity duration-200 lg:hidden", isDesktop ? "top-0" : "top-16", isSidebarOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0")} aria-hidden={!isSidebarOpen}>
          <button type="button" className="absolute inset-0 bg-black/35 backdrop-blur-sm transition-opacity duration-200" aria-label={copy.closeMenu} onClick={() => setIsSidebarOpen(false)} />
          <SettingsSidebar className={cn("relative z-50 h-full w-72 max-w-[85vw] transition-transform duration-200 ease-out", isSidebarOpen ? "translate-x-0" : "-translate-x-full")} pathname={location.pathname} copy={copy} user={user} onLogout={logout} onNavigate={() => setIsSidebarOpen(false)} />
        </div>
        <main className={cn("min-h-0 flex-1 overflow-y-auto transition-[filter] duration-200", isSidebarOpen && "max-lg:blur-sm")}>
          <div className="mx-auto w-full max-w-6xl p-4 sm:p-7 lg:p-10">
            <PageTransition transitionKey={location.pathname} className="page-shell-transition">
              <Routes>
                <Route index element={<Navigate to="statistics" replace />} />
                <Route path="statistics" element={<SettingsStatistics />} />
                <Route path="profile" element={<Settings section="profile" />} />
                <Route path="assistant" element={<Settings section="assistant" />} />
                <Route path="security" element={<Settings section="security" />} />
                <Route path="channels" element={<Channels />} />
                <Route path="models" element={<Navigate to="../channels" replace />} />
                <Route path="system" element={<SystemManagement section="proxy" />} />
                <Route path="message-channel" element={<SystemManagement section="channels" />} />
                <Route path="storage" element={<SystemManagement section="storage" />} />
                <Route path="about" element={<SystemManagement section="about" />} />
                <Route path="chat" element={<SystemManagement section="advancedChat" />} />
                <Route path="advanced-chat" element={<Navigate to="../chat" replace />} />
                <Route path="memory" element={<AdvancedChatMemories />} />
                <Route path="credentials" element={<ConnectorCredentials />} />
                <Route path="notifications" element={<DesktopNotifications />} />
                <Route path="*" element={<Navigate to="profile" replace />} />
              </Routes>
            </PageTransition>
          </div>
        </main>
      </div>
    </div>
  )
}

function SettingsSidebar({ pathname, copy, user, onLogout, className, onNavigate }: {
  pathname: string
  copy: ReturnType<typeof settingsWorkspaceCopy>
  user?: CurrentUser
  onLogout: () => void
  className?: string
  onNavigate?: () => void
}) {
  const visibilityClass = className ? "flex flex-col" : "hidden lg:flex lg:flex-col"
  const groups: SettingsNavGroup[] = [
    {
      id: "general",
      label: copy.general,
      items: [
        { href: "/settings/statistics", label: copy.statistics, icon: BarChart3 },
        { href: "/settings/profile", section: "profile", label: copy.account, icon: UserCircle },
        { href: "/settings/security", section: "security", label: copy.security, icon: Shield },
        { href: "/settings/notifications", label: copy.notifications, icon: Bell },
      ],
    },
    {
      id: "ai",
      label: copy.aiCategory,
      items: [
        { href: "/settings/assistant", section: "assistant", label: copy.assistant, icon: Bot },
        { href: "/settings/channels", label: copy.channels, icon: Database },
        { href: "/settings/memory", label: copy.memory, icon: HardDrive },
      ],
    },
    {
      id: "chat",
      label: copy.chatCategory,
      items: [
        { href: "/settings/chat", label: copy.chatSettings, icon: MessageSquare },
        { href: "/settings/credentials", label: copy.credentials, icon: KeyRound },
      ],
    },
    {
      id: "system",
      label: copy.systemCategory,
      items: [
        { href: "/settings/system", label: copy.networkProxy, icon: SettingsIcon },
        { href: "/settings/message-channel", label: copy.messageChannel, icon: MessageSquare },
        { href: "/settings/storage", label: copy.storage, icon: HardDrive },
        { href: "/settings/about", label: copy.about, icon: Shield },
      ],
    },
  ]
  const [collapsedGroups, setCollapsedGroups] = useState<string[]>([])
  const toggleGroup = (groupID: string) => setCollapsedGroups((current) => current.includes(groupID) ? current.filter((id) => id !== groupID) : [...current, groupID])
  const displayName = user?.username || user?.email || copy.account
  const initials = avatarInitials(displayName)

  return (
    <aside className={cn(visibilityClass, "h-full min-h-0 w-72 shrink-0 border-r bg-card", className)}>
      <div className="shrink-0 border-b px-4 pb-3 pt-4">
        <div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
          <Link to="/chat" onClick={onNavigate} className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-muted" title={copy.chat} aria-label={copy.chat}><Home size={15} /></Link>
          <ChevronRight size={13} />
          <span className="font-medium text-foreground">{copy.title}</span>
        </div>
        <Link to="/settings/profile" onClick={onNavigate} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-muted">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border bg-muted text-xs font-semibold">
            {user?.avatar_url ? <img src={apiURL(user.avatar_url)} alt="" className="h-full w-full object-cover" /> : initials || <UserCircle size={18} />}
          </span>
          <span className="min-w-0"><span className="block truncate text-sm font-medium">{displayName}</span><span className="block truncate text-xs text-muted-foreground">{copy.account}</span></span>
        </Link>
      </div>
      <nav className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-4">
        {groups.map((group) => {
          const collapsed = collapsedGroups.includes(group.id)
          return (
            <section key={group.id}>
              <button type="button" className="flex h-8 w-full items-center justify-between rounded-md px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:bg-muted" onClick={() => toggleGroup(group.id)} aria-expanded={!collapsed}>
                <span>{group.label}</span>
                {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
              </button>
              {!collapsed && <div className="mt-1 space-y-0.5">{group.items.map((item) => {
                const Icon = item.icon
                const active = pathname === item.href
                return <Link key={item.href} to={item.href} onClick={onNavigate} className={cn("flex h-9 items-center gap-3 rounded-md px-3 text-sm transition-colors", active ? "bg-primary font-medium text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground")}><Icon size={16} /><span className="truncate">{item.label}</span></Link>
              })}</div>}
            </section>
          )
        })}
      </nav>
      <div className="mt-auto shrink-0 border-t p-3">
        <Link to="/chat" onClick={onNavigate} className="flex h-9 items-center gap-3 rounded-md px-3 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"><MessageSquare size={16} /><span>{copy.chat}</span></Link>
        <button type="button" onClick={onLogout} className="flex h-9 w-full items-center gap-3 rounded-md px-3 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"><LogOut size={16} /><span>{copy.signOut}</span></button>
      </div>
    </aside>
  )
}

function settingsWorkspaceCopy(language: string) {
  if (language === "zh") return { title: "设置", statistics: "统计信息", account: "账户", notifications: "通知", assistant: "AI 助手", security: "安全", channels: "AI 服务商与模型", memory: "记忆设置", credentials: "凭据管理", networkProxy: "网络代理", messageChannel: "消息通道", storage: "数据存储", about: "软件信息", chatSettings: "聊天设置", general: "通用", aiCategory: "智能体", chatCategory: "聊天", systemCategory: "系统", chat: "聊天", signOut: "退出登录", openMenu: "打开设置菜单", closeMenu: "关闭设置菜单" }
  if (language === "ja") return { title: "設定", statistics: "統計", account: "アカウント", notifications: "通知", assistant: "AIアシスタント", security: "セキュリティ", channels: "AIサービスとモデル", memory: "メモリ設定", credentials: "資格情報", networkProxy: "ネットワークプロキシ", messageChannel: "メッセージチャンネル", storage: "データストレージ", about: "ソフトウェア情報", chatSettings: "チャット設定", general: "一般", aiCategory: "エージェント", chatCategory: "チャット", systemCategory: "システム", chat: "チャット", signOut: "ログアウト", openMenu: "設定メニューを開く", closeMenu: "閉じる" }
  return { title: "Settings", statistics: "Statistics", account: "Account", notifications: "Notifications", assistant: "AI assistant", security: "Security", channels: "AI providers and models", memory: "Memory", credentials: "Credentials", networkProxy: "Network proxy", messageChannel: "Message channels", storage: "Data storage", about: "About", chatSettings: "Chat settings", general: "General", aiCategory: "Agents", chatCategory: "Chat", systemCategory: "System", chat: "Chat", signOut: "Sign out", openMenu: "Open settings menu", closeMenu: "Close settings menu" }
}

function avatarInitials(value: string) {
  const parts = value.trim().split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
  return parts[0]?.slice(0, 2).toUpperCase() || ""
}

function desktopSettingsTitle(pathname: string, language: string) {
  const zh = language === "zh"
  if (pathname === "/settings/assistant") return zh ? "助手设置" : "Assistant settings"
  if (pathname === "/settings/statistics") return zh ? "统计信息" : "Statistics"
  if (pathname === "/settings/security") return zh ? "安全设置" : "Security settings"
  if (pathname === "/settings/channels") return zh ? "上级渠道" : "Upstream channels"
  if (pathname === "/settings/credentials") return zh ? "凭据管理" : "Credentials"
  if (pathname === "/settings/notifications") return zh ? "通知" : "Notifications"
  if (pathname === "/settings/system") return zh ? "网络代理" : "Network proxy"
  if (pathname === "/settings/message-channel") return zh ? "消息通道" : "Message channels"
  if (pathname === "/settings/storage") return zh ? "数据存储" : "Data storage"
  if (pathname === "/settings/about") return zh ? "软件信息" : "About"
  if (pathname === "/settings/chat") return zh ? "聊天设置" : "Chat settings"
  if (pathname === "/settings/memory") return zh ? "记忆设置" : "Memory settings"
  return zh ? "账户设置" : "Account settings"
}
