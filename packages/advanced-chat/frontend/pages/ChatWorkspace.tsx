import { Bot, ChevronRight, Home, Search, Settings as SettingsIcon, UserCircle } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { Link, useLocation, useNavigate } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { useEffect, useMemo, useState } from "react"
import { LanguageSwitcher } from "@/components/LanguageSwitcher"
import { ThemeSwitcher } from "@/components/ThemeSwitcher"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { PageTransition } from "@/components/layout/PageTransition"
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarInset, SidebarProvider, SidebarRail, SidebarTrigger, useSidebar } from "@/components/ui/sidebar"
import { api, apiURL, isDesktopTarget } from "@/lib/api"
import { useI18n } from "@/lib/i18n"
import { parseTopNavItems, withPublicSettingsDefaults, type PublicSettings } from "@/lib/public-settings"
import { cn } from "@/lib/utils"
import { DashboardSlot } from "@/lib/slots"
import {
  DashboardFrameOutlet,
  navItemForPath,
  navItemLabel,
  navSections,
  pageForPath,
  subscribeExtensions,
  type DashboardNavItem,
  type DashboardNavSection,
} from "@velocelab/dashboard/frontend"

interface CurrentUser {
  username?: string
  email?: string
  avatar_url?: string
  is_admin?: boolean
}

interface GlobalChatSession {
  id: string
  title?: string
  updated_at?: string
  created_at?: string
}

interface ChatSidebarItem {
  href: string
  label: string
  icon: LucideIcon
  active: boolean
}

type Translate = (key: string) => string

const chatHomePath = "/chat"

/**
 * The chat frame. It owns the chrome around every `/chat/*` page and nothing
 * else: the pages themselves — including this plugin's own chat page — are
 * contributions, so a package that adds a chat capability only registers a page
 * and appears in the menu below.
 *
 * The menu has two levels. Items in the `direct` section are listed flat;
 * every other section is a heading that opens its own list of pages, which is
 * how a package introduces a new submenu without editing this file.
 */
export default function ChatWorkspace() {
  const location = useLocation()
  const navigate = useNavigate()
  const { language, t } = useI18n()
  const [isGlobalSearchOpen, setIsGlobalSearchOpen] = useState(false)
  const [globalSearch, setGlobalSearch] = useState("")
  const { data: globalSessions = [] } = useQuery<GlobalChatSession[]>({
    queryKey: ["advanced-chat-global-session-search"],
    enabled: isGlobalSearchOpen,
    queryFn: async () => {
      const res = await api.get("/user/advanced-chat/sessions")
      return Array.isArray(res.data) ? res.data : []
    },
  })
  const filteredGlobalSessions = useMemo(() => {
    const query = globalSearch.trim().toLowerCase()
    return globalSessions.slice()
      .filter((session) => !query || (session.title || "").toLowerCase().includes(query))
      .sort((a, b) => Date.parse(b.updated_at || b.created_at || "") - Date.parse(a.updated_at || a.created_at || ""))
      .slice(0, 50)
  }, [globalSearch, globalSessions])
  const { data: settings, isLoading: isSettingsLoading } = useQuery<PublicSettings>({
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
  const isDesktop = isDesktopTarget()
  const topNavItems = parseTopNavItems(publicSettings.top_nav_items)
  const isHome = location.pathname === chatHomePath || location.pathname.startsWith(`${chatHomePath}/session/`)
  // Pages that need the whole viewport declare `layout: "full"` when they register.
  const fullHeight = pageForPath("chat", location.pathname)?.layout === "full"
  const transitionKey = isHome ? chatHomePath : location.pathname
  const viewportHeightClass = isDesktopTarget() ? "h-full" : "h-screen"

  useEffect(() => {
    if (!isDesktopTarget()) {
      return
    }
    const item = navItemForPath("chat", location.pathname)
    const title = item ? navItemLabel(item, t) : t("nav.chat")
    window.parent?.postMessage({ type: "veloce-desktop-tab-title", title, path: location.pathname }, "*")
  }, [location.pathname, t])

  if (isSettingsLoading) {
    return (
      <div className={cn("flex items-center justify-center bg-background text-sm text-muted-foreground", viewportHeightClass)}>
        {t("common.loading")}
      </div>
    )
  }

  return (
    <SidebarProvider className={cn("overflow-hidden", isDesktop ? "desktop-acrylic-window" : "bg-background", viewportHeightClass)}>
      <Sidebar collapsible="offcanvas" className={cn(fullHeight && "bg-background")}>
        <ChatSidebar className={cn("w-full", fullHeight && "bg-background")} publicSettings={publicSettings} user={user} sessionSlotID="chat-sessions-sidebar-slot" />
        <SidebarRail />
      </Sidebar>
      <SidebarInset className="min-w-0 overflow-hidden">
      <header className={cn("z-30 flex shrink-0 items-center justify-between border-b border-border/70 bg-background/95 px-4 backdrop-blur sm:px-6", isDesktop ? "h-12" : "h-16")}>
        <div className="flex min-w-0 items-center gap-3">
          <SidebarTrigger className="h-8 w-8" aria-label={t("advancedChat.openMenu")} />
          <Link to="/" className="flex min-w-0 items-center gap-2">
            <span className="truncate text-sm font-semibold">Veloce</span>
          </Link>
        </div>
        <div className="flex min-w-0 items-center gap-3">
          {publicSettings.top_nav_enabled && topNavItems.length > 0 && (
            <div className="hidden min-w-0 items-center gap-4 text-sm text-muted-foreground lg:flex">
              {topNavItems.map((item) => (
                <TopNavLink key={`${item.label}-${item.href}`} label={item.label} href={item.href} external={item.external} />
              ))}
            </div>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setIsGlobalSearchOpen(true)}
            aria-label={language === "zh" ? "搜索会话" : "Search sessions"}
            title={language === "zh" ? "搜索会话" : "Search sessions"}
          >
            <Search size={17} />
          </Button>
          <ThemeSwitcher />
          <LanguageSwitcher compact />
          <UserAvatar user={user} />
        </div>
      </header>

      <div className={cn("flex min-h-0 flex-1", fullHeight && "bg-background")}>
        <main className={cn("flex min-h-0 flex-1 flex-col", fullHeight ? "overflow-hidden" : "overflow-y-auto")}>
          <div className={cn("w-full flex-1", fullHeight ? "min-h-0" : "mx-auto max-w-6xl p-4 sm:p-6 lg:p-8")}>
            <PageTransition transitionKey={transitionKey} className={cn("page-shell-transition", fullHeight && "h-full min-h-0")}>
              <div className={cn(fullHeight ? "h-full" : "space-y-6")}>
                <DashboardFrameOutlet frame="chat" fallback={chatHomePath} />
              </div>
            </PageTransition>
          </div>
          {!fullHeight && publicSettings.footer_text && (
            <footer className="border-t px-4 py-4 text-center text-sm text-muted-foreground sm:px-6 lg:px-8">
              {publicSettings.footer_text}
            </footer>
          )}
        </main>
      </div>
      </SidebarInset>
      <Dialog open={isGlobalSearchOpen} onOpenChange={(open) => { setIsGlobalSearchOpen(open); if (!open) setGlobalSearch("") }}>
        <DialogContent className="max-h-[75vh] max-w-lg overflow-hidden p-0">
          <DialogHeader className="border-b px-5 py-4 pr-12">
            <DialogTitle>{language === "zh" ? "搜索会话" : "Search sessions"}</DialogTitle>
          </DialogHeader>
          <div className="p-4">
            <Input
              autoFocus
              value={globalSearch}
              onChange={(event) => setGlobalSearch(event.target.value)}
              placeholder={language === "zh" ? "搜索会话标题" : "Search session titles"}
              aria-label={language === "zh" ? "搜索会话标题" : "Search session titles"}
              className="h-10"
            />
            <div className="mt-3 max-h-[48vh] overflow-y-auto rounded-md border p-1">
              {filteredGlobalSessions.length === 0 ? (
                <div className="px-3 py-10 text-center text-sm text-muted-foreground">{language === "zh" ? "没有找到会话" : "No sessions found"}</div>
              ) : filteredGlobalSessions.map((session) => (
                <button
                  key={session.id}
                  type="button"
                  className="flex min-h-10 w-full items-center rounded px-2 text-left hover:bg-muted"
                  onClick={() => { navigate(`/chat/session/${encodeURIComponent(session.id)}`); setIsGlobalSearchOpen(false); setGlobalSearch("") }}
                >
                  <span className="truncate text-sm font-medium">{session.title || (language === "zh" ? "未命名会话" : "Untitled session")}</span>
                </button>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </SidebarProvider>
  )
}

function ChatSidebar({
  className,
  publicSettings,
  user,
  onNavigate,
  sessionSlotID,
}: {
  className?: string
  publicSettings: PublicSettings
  user?: CurrentUser
  onNavigate?: () => void
  sessionSlotID?: string
}) {
  const location = useLocation()
  const { isMobile, setOpenMobile } = useSidebar()
  const { language, t } = useI18n()
  const [, refreshNavigation] = useState(0)
  useEffect(() => subscribeExtensions(() => refreshNavigation((value) => value + 1)), [])
  const homeItem: ChatSidebarItem = {
    href: `${chatHomePath}?new_session=1`,
    label: language === "zh" ? "主页" : language === "ja" ? "ホーム" : "Home",
    icon: Home,
    active: location.pathname === chatHomePath || location.pathname.startsWith(`${chatHomePath}/session/`),
  }
  const sections = chatSections(location.pathname, t, language)
  const flatItems = sections.filter((section) => section.id === "direct").flatMap((section) => section.items)
  const submenus = sections.filter((section) => section.id !== "direct" && section.items.length > 0)
  const [selectedSectionID, setSelectedSectionID] = useState("")
  const routeSection = submenus.find((section) => section.items.some((item) => item.active))
  const activeSection = submenus.find((section) => section.id === selectedSectionID) || routeSection
  const showingSection = Boolean(activeSection)

  useEffect(() => {
    if (homeItem.active) {
      setSelectedSectionID("")
      return
    }
    setSelectedSectionID(routeSection?.id || "")
  }, [homeItem.active, location.pathname, routeSection?.id])

  const handleNavigation = () => {
    onNavigate?.()
    if (isMobile) {
      setOpenMobile(false)
    }
  }

  const renderSidebarLink = (item: ChatSidebarItem) => (
    <div key={item.href}>
      <Link
        to={item.href}
        onClick={handleNavigation}
        className={cn(
          "flex h-9 items-center gap-2 rounded-md px-2 text-sm font-medium transition-colors",
          item.active ? "bg-primary text-primary-foreground shadow-sm" : "hover:bg-muted"
        )}
      >
        <span className={cn("flex size-6 shrink-0 items-center justify-center rounded", item.active ? "bg-primary-foreground/15 text-primary-foreground" : "bg-muted text-muted-foreground")}>
          <item.icon size={15} />
        </span>
        <span className="flex-1 truncate">{item.label}</span>
      </Link>
    </div>
  )

  return (
    <div className={cn("flex h-full min-h-0 w-full flex-col overflow-hidden bg-sidebar", className)}>
      <SidebarHeader className="shrink-0 px-3 py-3">
        {renderSidebarLink(homeItem)}
      </SidebarHeader>
      <SidebarContent className="relative min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain p-0">
      <nav className="relative min-h-0 flex-1">
        <div className={cn("transition-transform duration-200 ease-out", homeItem.active && "flex min-h-full flex-col", showingSection && "-translate-x-full")}>
          <div className="flex flex-col gap-1 px-3 pb-3">
            <DashboardSlot name="sidebar.navigation.before" scope="/chat" />
            {flatItems.map((item) => renderSidebarLink(item))}
            <div className="my-1.5" />
            {submenus.map((section) => {
              const firstItem = section.items[0]
              return (
                <Link
                  key={section.id}
                  to={firstItem.href}
                  onClick={() => { setSelectedSectionID(section.id); handleNavigation() }}
                  className={cn(
                    "flex h-9 items-center gap-2 rounded-md px-2 text-sm font-medium transition-colors",
                    section.id === routeSection?.id ? "bg-muted text-foreground" : "hover:bg-muted"
                  )}
                >
                  <span className="flex size-6 shrink-0 items-center justify-center rounded bg-muted text-muted-foreground">
                    <firstItem.icon size={15} />
                  </span>
                  <span className="flex-1 truncate">{section.label}</span>
                  <ChevronRight size={15} className="text-muted-foreground" />
                </Link>
              )
            })}
            <DashboardSlot name="sidebar.navigation.after" scope="/chat" />
          </div>
          {homeItem.active && <div id={sessionSlotID} className="min-h-0 flex-1 border-t border-border" />}
        </div>
        <div className={cn("absolute inset-x-0 top-0 px-3 py-3 transition-transform duration-200 ease-out", showingSection ? "translate-x-0" : "translate-x-full")}>
          {activeSection && (
            <div className="flex flex-col gap-1">
              <div className="mb-3 flex items-center gap-1 border-b pb-3 text-sm">
                <Link
                  to={chatHomePath}
                  onClick={() => { setSelectedSectionID(""); handleNavigation() }}
                  className="flex h-9 w-9 items-center justify-center rounded-md hover:bg-muted"
                  aria-label={t("nav.chat")}
                  title={t("nav.chat")}
                >
                  <Home size={16} />
                </Link>
                <ChevronRight size={14} className="text-muted-foreground" />
                <span className="min-w-0 truncate font-medium">{activeSection.label}</span>
              </div>
              {activeSection.items.map((item) => renderSidebarLink(item))}
            </div>
          )}
        </div>
      </nav>
      </SidebarContent>
      <SidebarFooter className="shrink-0 border-t border-sidebar-border p-3">
        <Link
          to={user?.is_admin ? "/settings/channels" : "/settings/profile"}
          onClick={handleNavigation}
          className={cn("flex h-9 items-center gap-2 rounded-md px-2 text-sm font-medium transition-colors", location.pathname.startsWith("/settings") ? "bg-primary text-primary-foreground shadow-sm" : "hover:bg-muted")}
        >
          <span className={cn("flex size-6 shrink-0 items-center justify-center rounded", location.pathname.startsWith("/settings") ? "bg-primary-foreground/15 text-primary-foreground" : "bg-muted text-muted-foreground")}>
            <SettingsIcon size={15} />
          </span>
          <span className="flex-1 truncate">{language === "zh" ? "设置" : language === "ja" ? "設定" : "Settings"}</span>
        </Link>
      </SidebarFooter>
    </div>
  )
}

interface ChatSidebarSection {
  id: string
  label: string
  items: ChatSidebarItem[]
}

/**
 * Sections come from the contributions: a package may declare one
 * (`group: { id, labelKey, order }`) or join an existing one by id. This frame
 * only backstops the buckets nobody owns, so a new submenu needs no edit here.
 */
function chatSections(pathname: string, t: Translate, language: string): ChatSidebarSection[] {
  return navSections("chat").map((section) => ({
    id: section.id,
    label: chatSectionLabel(section, t, language),
    items: section.items.map((item) => chatSidebarItem(item, pathname, t)),
  }))
}

function chatSidebarItem(item: DashboardNavItem, pathname: string, t: Translate): ChatSidebarItem {
  const active = pathname === item.path || pathname.startsWith(`${item.path}/`)
  return { href: item.path, label: navItemLabel(item, t), icon: (item.icon as LucideIcon | undefined) || Bot, active }
}

function chatSectionLabel(section: DashboardNavSection, t: Translate, language: string) {
  if (section.label) {
    return section.label
  }
  if (section.labelKey) {
    const label = t(section.labelKey)
    if (label !== section.labelKey) {
      return label
    }
  }
  return chatFallbackSectionLabel(section.id, language)
}

function chatFallbackSectionLabel(id: string, language: string) {
  const labels: Record<string, [string, string, string]> = {
    direct: ["直接访问", "Direct", "直接アクセス"],
    library: ["库", "Library", "ライブラリ"],
    workflow: ["工作流", "Workflows", "ワークフロー"],
    agents: ["代理", "Agents", "エージェント"],
  }
  const value = labels[id] || [id, id, id]
  return language === "zh" ? value[0] : language === "ja" ? value[2] : value[1]
}

function UserAvatar({ user }: { user?: CurrentUser }) {
  const { t } = useI18n()
  const label = user?.username || user?.email || t("common.user")
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

function TopNavLink({ label, href, external }: { label: string; href: string; external: boolean }) {
  if (external) {
    return (
      <a href={href} target="_blank" rel="noreferrer">
        {label}
      </a>
    )
  }
  return <Link to={href}>{label}</Link>
}
