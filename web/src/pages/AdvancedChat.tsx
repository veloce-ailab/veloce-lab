import { Bot, Brain, CalendarClock, ChevronRight, Database, FileText, Globe2, Home, Laptop, Menu, MessageSquare, MessageSquareText, Send, SlidersHorizontal, Sparkles, UserCircle, Users } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { Link, Navigate, Route, Routes, useLocation } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import Chat from "./Chat"
import Agents from "./Agents"
import AgentEditor from "./AgentEditor"
import Skills from "./Skills"
import AdvancedChatMCP from "./AdvancedChatMCP"
import AdvancedChatFiles from "./AdvancedChatFiles"
import KnowledgeBases from "./KnowledgeBases"
import AdvancedChatMemories from "./AdvancedChatMemories"
import AdvancedChatDevices, { AdvancedChatDeviceDetail } from "./AdvancedChatDevices"
import AdvancedChatSites from "./AdvancedChatSites"
import MessageChannels from "./MessageChannelsWorkspace"
import AdvancedChatDeliveries from "./AdvancedChatDeliveries"
import AdvancedChatScheduledTasks from "./AdvancedChatScheduledTasks"
import AgentGroupsPage from "./AgentGroupsPage"
import ChatGroups from "./ChatGroups"
import Community from "./Community"
import { LanguageSwitcher } from "@/components/LanguageSwitcher"
import { ThemeSwitcher } from "@/components/ThemeSwitcher"
import { AnnouncementButton } from "@/components/AnnouncementButton"
import { Button } from "@/components/ui/button"
import { PageTransition } from "@/components/layout/PageTransition"
import api, { apiURL, isDesktopTarget } from "@/lib/api"
import { useI18n } from "@/lib/i18n"
import type { PublicSettings } from "@/lib/public-settings"
import { parseTopNavItems, withPublicSettingsDefaults } from "@/lib/public-settings"
import { cn } from "@/lib/utils"

interface CurrentUser {
  username?: string
  email?: string
  avatar_url?: string
  is_admin?: boolean
}

interface AdvancedChatSidebarItem {
  href: string
  label: string
  icon: LucideIcon
  active: boolean
  children?: { href: string; label: string }[]
}

const advancedChatSidebarIconTones: Record<string, string> = {
  "/chat": "bg-blue-500/15 text-blue-600 dark:bg-blue-400/15 dark:text-blue-300",
  "/chat/community": "bg-emerald-500/15 text-emerald-600 dark:bg-emerald-400/15 dark:text-emerald-300",
  "/chat/tasks": "bg-orange-500/15 text-orange-600 dark:bg-orange-400/15 dark:text-orange-300",
  "/chat/files": "bg-amber-500/15 text-amber-600 dark:bg-amber-400/15 dark:text-amber-300",
  "/chat/knowledge": "bg-cyan-500/15 text-cyan-600 dark:bg-cyan-400/15 dark:text-cyan-300",
  "/chat/images": "bg-pink-500/15 text-pink-600 dark:bg-pink-400/15 dark:text-pink-300",
  "/chat/videos": "bg-violet-500/15 text-violet-600 dark:bg-violet-400/15 dark:text-violet-300",
  "/chat/channels": "bg-sky-500/15 text-sky-600 dark:bg-sky-400/15 dark:text-sky-300",
  "/chat/deliveries": "bg-emerald-500/15 text-emerald-600 dark:bg-emerald-400/15 dark:text-emerald-300",
  "/chat/scheduled-tasks": "bg-amber-500/15 text-amber-600 dark:bg-amber-400/15 dark:text-amber-300",
  "/chat/groups": "bg-cyan-500/15 text-cyan-600 dark:bg-cyan-400/15 dark:text-cyan-300",
  "/chat/agents": "bg-purple-500/15 text-purple-600 dark:bg-purple-400/15 dark:text-purple-300",
  "/chat/memories": "bg-rose-500/15 text-rose-600 dark:bg-rose-400/15 dark:text-rose-300",
  "/chat/skills": "bg-fuchsia-500/15 text-fuchsia-600 dark:bg-fuchsia-400/15 dark:text-fuchsia-300",
  "/chat/devices": "bg-teal-500/15 text-teal-600 dark:bg-teal-400/15 dark:text-teal-300",
  "/chat/sites": "bg-lime-500/15 text-lime-700 dark:bg-lime-400/15 dark:text-lime-300",
  "/chat/agent-groups": "bg-indigo-500/15 text-indigo-600 dark:bg-indigo-400/15 dark:text-indigo-300",
  "/chat/agent-tasks": "bg-orange-500/15 text-orange-600 dark:bg-orange-400/15 dark:text-orange-300",
  "/chat/mcp": "bg-indigo-500/15 text-indigo-600 dark:bg-indigo-400/15 dark:text-indigo-300",
  "/chat/admin-overview": "bg-fuchsia-500/15 text-fuchsia-600 dark:bg-fuchsia-400/15 dark:text-fuchsia-300",
  "/chat/admin-logs": "bg-slate-500/15 text-slate-600 dark:bg-slate-400/15 dark:text-slate-300",
  "/chat/admin/general": "bg-rose-500/15 text-rose-600 dark:bg-rose-400/15 dark:text-rose-300",
  "/chat/admin-channels": "bg-teal-500/15 text-teal-600 dark:bg-teal-400/15 dark:text-teal-300",
  "/chat/admin-models": "bg-pink-500/15 text-pink-600 dark:bg-pink-400/15 dark:text-pink-300",
  "/chat/admin-users": "bg-lime-500/15 text-lime-700 dark:bg-lime-400/15 dark:text-lime-300",
}

interface AdvancedChatSidebarGroup {
  id: string
  label: string
  items: AdvancedChatSidebarItem[]
}

export default function AdvancedChat() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const location = useLocation()
  const { language, t } = useI18n()
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
  const isChatRoute = location.pathname === "/chat" || location.pathname.startsWith("/chat/session/")
  const transitionKey = isChatRoute ? "/chat" : location.pathname
  const viewportHeightClass = isDesktopTarget() ? "h-full" : "h-screen"

  useEffect(() => {
    if (!isDesktopTarget()) {
      return
    }
    window.parent?.postMessage({ type: "veloce-desktop-tab-title", title: desktopPageTitle(location.pathname, language), path: location.pathname }, "*")
  }, [language, location.pathname])

  if (isSettingsLoading) {
    return (
      <div className={cn("flex items-center justify-center bg-background text-sm text-muted-foreground", viewportHeightClass)}>
        {t("common.loading")}
      </div>
    )
  }

  return (
    <div className={cn("flex flex-col overflow-hidden", isDesktop ? "desktop-acrylic-window" : "bg-background", viewportHeightClass)}>
      {!isDesktop && <header className="z-30 flex h-16 shrink-0 items-center justify-between bg-background/95 px-4 backdrop-blur sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <Button
            className="lg:hidden"
            variant="outline"
            size="icon"
            onClick={() => setIsSidebarOpen((open) => !open)}
            aria-label={isSidebarOpen ? t("advancedChat.closeMenu") : t("advancedChat.openMenu")}
            aria-expanded={isSidebarOpen}
          >
            <Menu size={18} />
          </Button>
          <Link to="/" className="flex min-w-0 items-center gap-2">
            {publicSettings.icon_url && <img src={publicSettings.icon_url} alt="" className="h-7 w-7 shrink-0 rounded object-cover" />}
            <span className="truncate text-sm font-semibold">{publicSettings.site_name}</span>
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
          <ThemeSwitcher />
          <LanguageSwitcher compact />
          <AnnouncementButton />
          <UserAvatar user={user} />
        </div>
      </header>}

      <div className={cn("flex min-h-0 flex-1", isChatRoute && "bg-background")}>
        <div className="hidden lg:block lg:h-full lg:shrink-0">
          <AdvancedChatSidebar className={isChatRoute ? "border-r-0 bg-background" : undefined} publicSettings={publicSettings} user={user} sessionSlotID="chat-sessions-sidebar-slot-desktop" />
        </div>

        <div className={cn("fixed inset-0 z-40 transition-opacity duration-200 lg:hidden", isDesktop ? "top-0" : "top-16", isSidebarOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0")} aria-hidden={!isSidebarOpen}>
            <button
              type="button"
              className="absolute inset-0 bg-black/35 backdrop-blur-sm transition-opacity duration-200"
              aria-label={t("advancedChat.closeMenu")}
              onClick={() => setIsSidebarOpen(false)}
            />
            <div className={cn("relative z-50 h-full w-64 max-w-[85vw] transition-transform duration-200 ease-out", isSidebarOpen ? "translate-x-0" : "-translate-x-full")}>
              <AdvancedChatSidebar className={cn("w-full", isChatRoute && "border-r-0 bg-background")} publicSettings={publicSettings} user={user} onNavigate={() => setIsSidebarOpen(false)} sessionSlotID="chat-sessions-sidebar-slot-mobile" />
            </div>
        </div>

        <main className={cn("flex min-h-0 flex-1 flex-col transition-[filter] duration-200", isChatRoute ? "overflow-hidden" : "overflow-y-auto", isSidebarOpen && "max-lg:blur-sm")}>
          {!isChatRoute && publicSettings.announcement && (
            <div className="border-b bg-muted/50 px-4 py-3 text-sm sm:px-6 lg:px-8">
              <div className="mx-auto max-w-6xl whitespace-pre-wrap">{publicSettings.announcement}</div>
            </div>
          )}
          <div className={cn("w-full flex-1", isChatRoute ? "min-h-0" : "mx-auto max-w-6xl p-4 sm:p-6 lg:p-8")}>
            <PageTransition transitionKey={transitionKey} className={cn("page-shell-transition", isChatRoute && "h-full min-h-0")}>
              <div className={cn(isChatRoute ? "h-full" : "space-y-6")}>
                {isChatRoute ? (
                  <Chat />
                ) : (
                  <Routes>
                    <Route path="community" element={<Community />} />
                    <Route path="community/knowledge-bases/:knowledgeBaseID" element={<Community />} />
                    <Route path="community/skills/:skillID" element={<Community />} />
                    <Route path="community/:id" element={<Community />} />
                    <Route path="agents" element={<Agents />} />
                    <Route path="agents/:id" element={<AgentEditor />} />
                    <Route path="skills" element={<Skills />} />
                    <Route path="skills/:id" element={<Skills />} />
                    <Route path="mcp" element={<AdvancedChatMCP />} />
                    <Route path="devices" element={<AdvancedChatDevices />} />
                    <Route path="devices/:id" element={<AdvancedChatDeviceDetail />} />
                    <Route path="sites" element={<AdvancedChatSites />} />
                    <Route path="agent-groups/*" element={<AgentGroupsPage />} />
                    {publicSettings.message_channel_enabled && <Route path="channels/*" element={<MessageChannels />} />}
                    <Route path="deliveries" element={<AdvancedChatDeliveries />} />
                    <Route path="scheduled-tasks" element={<AdvancedChatScheduledTasks />} />
                    <Route path="groups" element={<ChatGroups />} />
                    <Route path="groups/:groupID" element={<ChatGroups />} />
                    <Route path="files" element={<AdvancedChatFiles />} />
                    <Route path="knowledge" element={<KnowledgeBases />} />
                    <Route path="memories" element={<AdvancedChatMemories />} />
                    <Route path="*" element={<Navigate to="/chat" replace />} />
                  </Routes>
                )}
              </div>
            </PageTransition>
          </div>
          {!isChatRoute && publicSettings.footer_text && (
            <footer className="border-t px-4 py-4 text-center text-sm text-muted-foreground sm:px-6 lg:px-8">
              {publicSettings.footer_text}
            </footer>
          )}
        </main>
      </div>
    </div>
  )
}

function desktopPageTitle(pathname: string, language: string) {
  const zh = language === "zh"
  if (pathname === "/chat" || pathname.startsWith("/chat/session/")) return zh ? "聊天" : "Chat"
  if (pathname === "/chat/community" || pathname.startsWith("/chat/community/")) return zh ? "社区" : "Community"
  if (pathname === "/chat/files") return zh ? "文件库" : "Files"
  if (pathname === "/chat/knowledge") return zh ? "知识库" : "Knowledge bases"
  if (pathname === "/chat/memories") return zh ? "记忆" : "Memory"
  if (pathname.startsWith("/chat/channels")) return zh ? "消息通道" : "Message Channels"
  if (pathname === "/chat/deliveries") return zh ? "结果投递" : "Result Delivery"
  if (pathname === "/chat/scheduled-tasks") return zh ? "任务" : "Tasks"
  if (pathname === "/chat/groups" || pathname.startsWith("/chat/groups/")) return zh ? "聊天群组" : "Chat Groups"
  if (pathname === "/chat/agents" || pathname.startsWith("/chat/agents/")) return zh ? "助理" : "Agents"
  if (pathname === "/chat/skills" || pathname.startsWith("/chat/skills/")) return zh ? "技能" : "Skills"
  if (pathname === "/chat/devices" || pathname.startsWith("/chat/devices/")) return zh ? "设备" : "Devices"
  if (pathname === "/chat/sites") return zh ? "站点" : "Sites"
  if (pathname.includes("/agent-groups/") && pathname.endsWith("/operations")) return zh ? "工作室运营" : "Studio Operations"
  if (pathname.startsWith("/chat/agent-groups")) return zh ? "工作室" : "Agent Studios"
  if (pathname === "/chat/agent-tasks") return zh ? "代理任务" : "Agent Tasks"
  if (pathname === "/chat/mcp") return zh ? "MCP" : "MCP"
  if (pathname === "/chat/admin-overview") return zh ? "管理概览" : "Admin Overview"
  if (pathname === "/chat/admin-logs") return zh ? "审计日志" : "Audit Logs"
  if (pathname.startsWith("/chat/admin/")) return zh ? "系统设置" : "System"
  if (pathname === "/chat/admin-channels") return zh ? "渠道" : "Channels"
  if (pathname === "/chat/admin-models") return zh ? "模型" : "Models"
  if (pathname === "/chat/admin-users") return zh ? "用户" : "Users"
  return zh ? "聊天" : "Chat"
}

function AdvancedChatSidebar({
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
  const { language, t } = useI18n()
  const filesLabel = language === "zh" ? "文件库" : "Files"
  const knowledgeLabel = t("nav.knowledgeBases")
  const memoriesLabel = language === "zh" ? "记忆" : "Memory"
  const messageChannelsLabel = language === "zh" ? "消息通道" : "Message Channels"
  const deliveriesLabel = language === "zh" ? "结果投递" : "Result Delivery"
  const scheduledTasksLabel = language === "zh" ? "任务" : "Tasks"
  const agentGroupsLabel = language === "zh" ? "工作室" : "Agent Studios"
  const sitesLabel = language === "zh" ? "站点" : language === "ja" ? "サイト" : "Sites"
  const workflowLabel = language === "zh" ? "工作流" : language === "ja" ? "ワークフロー" : "Workflows"
  const agentLabel = language === "zh" ? "代理" : language === "ja" ? "エージェント" : "Agents"
  const homeItem: AdvancedChatSidebarItem = {
    href: "/chat",
    label: t("nav.chat"),
    icon: MessageSquare,
    active: location.pathname === "/chat" || location.pathname.startsWith("/chat/session/"),
  }
  const directItems: AdvancedChatSidebarItem[] = [
    { href: "/chat/community", label: language === "zh" ? "社区" : language === "ja" ? "コミュニティ" : "Community", icon: Users, active: location.pathname === "/chat/community" || location.pathname.startsWith("/chat/community/") },
    { href: "/chat/groups", label: language === "zh" ? "聊天群组" : "Chat Groups", icon: MessageSquareText, active: location.pathname === "/chat/groups" || location.pathname.startsWith("/chat/groups/") },
    { href: "/chat/files", label: filesLabel, icon: FileText, active: location.pathname === "/chat/files" },
    { href: "/chat/knowledge", label: knowledgeLabel, icon: Database, active: location.pathname === "/chat/knowledge" },
    ...(user?.is_admin ? [{ href: "/settings/channels", label: language === "zh" ? "账户设置" : "Account Settings", icon: SlidersHorizontal, active: location.pathname.startsWith("/settings") }] : []),
  ]
  const groups: AdvancedChatSidebarGroup[] = [
    {
      id: "workflow",
      label: workflowLabel,
      items: [
        ...(publicSettings.message_channel_enabled ? [{ href: "/chat/channels", label: messageChannelsLabel, icon: MessageSquare, active: location.pathname.startsWith("/chat/channels") }] : []),
        { href: "/chat/deliveries", label: deliveriesLabel, icon: Send, active: location.pathname === "/chat/deliveries" },
        { href: "/chat/scheduled-tasks", label: scheduledTasksLabel, icon: CalendarClock, active: location.pathname === "/chat/scheduled-tasks" },
      ],
    },
    {
      id: "agents",
      label: agentLabel,
      items: [
        { href: "/chat/agents", label: t("nav.agents"), icon: Bot, active: location.pathname === "/chat/agents" },
        { href: "/chat/memories", label: memoriesLabel, icon: Brain, active: location.pathname === "/chat/memories" },
        { href: "/chat/skills", label: t("nav.skills"), icon: Sparkles, active: location.pathname === "/chat/skills" || location.pathname.startsWith("/chat/skills/") },
        { href: "/chat/devices", label: t("nav.devices"), icon: Laptop, active: location.pathname === "/chat/devices" || location.pathname.startsWith("/chat/devices/") },
        { href: "/chat/sites", label: sitesLabel, icon: Globe2, active: location.pathname === "/chat/sites" },
        { href: "/chat/agent-groups", label: agentGroupsLabel, icon: Users, active: location.pathname.startsWith("/chat/agent-groups") },
        { href: "/chat/mcp", label: t("nav.mcp"), icon: Bot, active: location.pathname === "/chat/mcp" },
      ],
    },
  ].filter((group) => group.items.length > 0)
  const [selectedGroupID, setSelectedGroupID] = useState("")
  const routeGroup = groups.find((group) => group.items.some((item) => item.active || item.children?.some((child) => location.pathname === child.href)))
  const activeGroup = groups.find((group) => group.id === selectedGroupID) || routeGroup
  const showingGroup = Boolean(activeGroup)

  useEffect(() => {
    if (homeItem.active) {
      setSelectedGroupID("")
      return
    }
    setSelectedGroupID(routeGroup?.id || "")
  }, [homeItem.active, location.pathname, routeGroup?.id])

  const renderSidebarLink = (item: AdvancedChatSidebarItem) => (
    <div key={item.href}>
      <Link
        to={item.href}
        onClick={onNavigate}
        className={cn(
          "flex items-center gap-3 rounded-2xl px-3 py-2 text-sm font-medium transition-colors",
          item.active ? "bg-primary text-primary-foreground shadow-sm" : "hover:bg-muted"
        )}
      >
        <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-xl", item.active ? "bg-primary-foreground/15 text-primary-foreground" : advancedChatSidebarIconTones[item.href] || "bg-muted text-muted-foreground")}>
          <item.icon size={16} />
        </span>
        <span className="flex-1 truncate">{item.label}</span>
      </Link>
      {item.children && item.active && (
        <div className="ml-9 mt-1 flex flex-col gap-1">
          {item.children.map((child) => (
            <Link
              key={child.href}
              to={child.href}
              onClick={onNavigate}
              className={cn(
                "rounded-xl px-3 py-1.5 text-xs transition-colors",
                location.pathname === child.href ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              {child.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  )

  return (
    <aside className={cn("flex h-full w-56 flex-col overflow-x-hidden overflow-y-auto border-r bg-card", className)}>
      <nav className={cn("relative shrink-0", !homeItem.active && "min-h-full")}>
        <div className={cn("transition-transform duration-200 ease-out", showingGroup && "-translate-x-full")}>
          <div className="flex flex-col gap-1 px-4 py-4">
            {renderSidebarLink(homeItem)}
            {directItems.map((item) => renderSidebarLink(item))}
            <div className="my-2" />
            {groups.map((group) => {
              const firstItem = group.items[0]
              return (
                <Link
                  key={group.id}
                  to={firstItem.href}
                  onClick={() => setSelectedGroupID(group.id)}
                  className={cn(
                    "flex items-center gap-3 rounded-2xl px-3 py-2 text-sm font-medium transition-colors",
                    group.id === routeGroup?.id ? "bg-muted text-foreground" : "hover:bg-muted"
                  )}
                >
                  <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-xl", advancedChatSidebarIconTones[firstItem.href] || "bg-muted text-muted-foreground")}>
                    <firstItem.icon size={16} />
                  </span>
                  <span className="flex-1 truncate">{group.label}</span>
                  <ChevronRight size={15} className="text-muted-foreground" />
                </Link>
              )
            })}
          </div>
          {homeItem.active && <div id={sessionSlotID} className="border-t border-border" />}
        </div>
        <div className={cn("absolute inset-x-0 top-0 px-4 py-4 transition-transform duration-200 ease-out", showingGroup ? "translate-x-0" : "translate-x-full")}>
          {activeGroup && (
            <div className="flex flex-col gap-1">
              <div className="mb-3 flex items-center gap-1 border-b pb-3 text-sm">
                <Link
                  to="/chat"
                  onClick={() => setSelectedGroupID("")}
                  className="flex h-8 w-8 items-center justify-center rounded-2xl hover:bg-muted"
                  aria-label={t("nav.chat")}
                  title={t("nav.chat")}
                >
                  <Home size={16} />
                </Link>
                <ChevronRight size={14} className="text-muted-foreground" />
                <span className="min-w-0 truncate font-medium">{activeGroup.label}</span>
              </div>
              {activeGroup.items.map((item) => renderSidebarLink(item))}
            </div>
          )}
        </div>
      </nav>
    </aside>
  )
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
