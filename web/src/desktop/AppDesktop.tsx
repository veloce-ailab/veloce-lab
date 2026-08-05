import { useEffect, useRef, useState } from "react"
import type { ReactNode } from "react"
import { HashRouter, Navigate, Route, Routes, useLocation } from "react-router-dom"
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from "@tanstack/react-query"
import { Activity, Check, CreditCard, FolderOpen, Globe2, HardDrive, LogOut, PanelTop, Plus, Server, Settings, UserCircle } from "lucide-react"
import Login from "@/pages/Login"
import Setup from "@/pages/Setup"
import AdvancedChat from "@/pages/AdvancedChat"
import SettingsWorkspace from "@/pages/SettingsWorkspace"
import DesktopDashboard from "@/desktop/DesktopDashboard"
import api, {
  apiURL,
  getAuthToken,
  clearAuthToken,
  getDesktopTabID,
  getDesktopServerURL,
  normalizeServerURL,
  setDesktopTabServerURL,
  setDesktopServerURL,
} from "@/lib/api"
import { I18nProvider, useI18n } from "@/lib/i18n"
import { ThemeProvider } from "@/lib/theme"
import { ToastProvider } from "@/components/ui/toast"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import logoURL from "@/assets/logo.png"
import type { BuiltinServerStatus, DesktopCurrentUser, DesktopStorageSettings, DesktopTab, DesktopUserStats, SetupStatus } from "@/desktop/types"
import { newDesktopTab, normalizeDesktopTabPath, readActiveDesktopTabID, readDesktopTabs, readServerList, serverAccountKey, writeActiveDesktopTabID, writeDesktopTabs, writeServerList } from "@/desktop/storage"
import { hasAuthToken } from "@/desktop/auth"
import { DesktopApprovalDecisionBridge, DesktopConnectorBridge, DesktopNavigationBridge, DesktopTransparency, TokenBridge } from "@/desktop/bridges"

const queryClient = new QueryClient()

type DesktopProcessItem = DesktopProcessStatus["processes"][number]

const emptyDesktopSettings: DesktopSettings = {
  httpProxy: "",
  builtinServerPath: "",
  connectorPath: "",
  preparedUpdate: null,
}

function ProtectedRoute({ children }: { children: ReactNode }) {
  const location = useLocation()
  if (!hasAuthToken()) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }
  return <>{children}</>
}

function SetupGate({ children }: { children: ReactNode }) {
  const location = useLocation()
  const { t } = useI18n()
  const { data, isLoading } = useQuery<SetupStatus>({
    queryKey: ["setup-status"],
    queryFn: async () => {
      const res = await api.get("/setup/status")
      return res.data
    },
    retry: false,
  })

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
        {t("common.loading")}
      </div>
    )
  }

  if (data?.required && location.pathname !== "/setup") {
    return <Navigate to="/setup" replace />
  }

  if (!data?.required && location.pathname === "/setup") {
    return <Navigate to={hasAuthToken() ? "/chat" : "/login"} replace />
  }

  return <>{children}</>
}

function DocumentTitle() {
  const location = useLocation()
  const { language, t } = useI18n()

  useEffect(() => {
    const pageTitle = location.pathname.startsWith("/chat")
      ? t("nav.chat")
      : location.pathname.startsWith("/dashboard")
        ? language === "zh" ? "系统管理" : "System Management"
        : location.pathname.startsWith("/settings")
          ? language === "zh" ? "设置" : "Settings"
          : location.pathname === "/setup"
            ? language === "zh" ? "初始化站点" : "Initial Setup"
            : language === "zh" ? "登录" : "Sign in"
    document.title = `${pageTitle} - Veloce Desktop`
  }, [language, location.pathname, t])

  return null
}

function DesktopTitleBar({
  tabs,
  activeTabID,
  showTabs = true,
  onSelectTab,
  onAddTab,
  onCloseTab,
  onMoveTab,
  onDetachTab,
  onUpdateTabServer,
  onNavigateActive,
  onLogout,
}: {
  tabs: DesktopTab[]
  activeTabID: string
  showTabs?: boolean
  onSelectTab: (tabID: string) => void
  onAddTab: () => void
  onCloseTab: (tabID: string) => void
  onMoveTab: (tabID: string, targetTabID: string) => void
  onDetachTab: (tabID: string, screenX: number, screenY: number) => void
  onUpdateTabServer: (tabID: string, serverURL: string) => void
  onNavigateActive: (path: "/settings" | "/settings/wallet") => void
  onLogout: () => void
}) {
  const { language } = useI18n()
  const queryClient = useQueryClient()
  const serverPopupRef = useRef<HTMLDivElement | null>(null)
  const statusPopupRef = useRef<HTMLDivElement | null>(null)
  const applicationMenuRef = useRef<HTMLDivElement | null>(null)
  const [isServerOpen, setIsServerOpen] = useState(false)
  const [isStatusOpen, setIsStatusOpen] = useState(false)
  const [openApplicationMenu, setOpenApplicationMenu] = useState<"file" | "edit" | "help" | null>(null)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [value, setValue] = useState(() => getDesktopServerURL())
  const [servers, setServers] = useState(readServerList)
  const [builtinStatus, setBuiltinStatus] = useState<BuiltinServerStatus | null>(null)
  const [processStatus, setProcessStatus] = useState<DesktopProcessStatus | null>(null)
  const [settingsDraft, setSettingsDraft] = useState<DesktopSettings>(emptyDesktopSettings)
  const [updateResult, setUpdateResult] = useState<DesktopUpdateResult | null>(null)
  const [isSavingSettings, setIsSavingSettings] = useState(false)
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false)
  const [isBuiltinBusy, setIsBuiltinBusy] = useState(false)
  const [isAccountOpen, setIsAccountOpen] = useState(false)
  const draggingTabID = useRef("")
  const droppedInStrip = useRef(false)
  const activeTab = tabs.find((tab) => tab.id === activeTabID) || tabs[0]
  const currentServer = normalizeServerURL(activeTab?.serverURL || getDesktopServerURL())
  const copy = language === "zh"
    ? { title: "Veloce", file: "文件", edit: "编辑", help: "帮助", newWindow: "新窗口", quit: "退出", closeWindow: "关闭", home: "返回主页", copyText: "复制", paste: "粘贴", cut: "剪切", deleteText: "删除", undo: "撤销", redo: "还原", officialSite: "官网", github: "GitHub", label: "服务器", settings: "设置", status: "服务状态", browser: "浏览器", account: "账户", recharge: "充值", storage: "存储", signOut: "退出登录", placeholder: "http://localhost:8080", save: "保存", close: "关闭", browse: "选择", current: "当前", anonymous: "未登录", builtin: "运行内置服务器", connector: "连接器", running: "运行中", stopped: "未运行", terminate: "终止", pid: "进程", version: "版本", mode: "模式", noProcess: "暂无运行中的受管进程", httpProxy: "全局 HTTP 代理", httpProxyPlaceholder: "http://127.0.0.1:7890", builtinPath: "内置服务器文件路径", connectorPath: "内置连接器文件路径", checkUpdate: "检查更新", checkingUpdate: "正在检查...", updateReady: "更新已准备", updateReadyDescription: "点击确定将退出当前应用并运行安装程序。", installNow: "确定", cancel: "取消", noUpdate: "没有可用更新", settingsSaved: "设置已保存", builtinStarting: "正在准备内置服务器...", builtinWaiting: "正在等待内置服务器就绪...", builtinUnavailable: "桌面桥接未就绪", newTab: "新标签页", closeTab: "关闭标签页" }
    : { title: "Veloce", file: "File", edit: "Edit", help: "Help", newWindow: "New window", quit: "Quit", closeWindow: "Close", home: "Home", copyText: "Copy", paste: "Paste", cut: "Cut", deleteText: "Delete", undo: "Undo", redo: "Redo", officialSite: "Official website", github: "GitHub", label: "Server", settings: "Settings", status: "Service status", browser: "Browser", account: "Account", recharge: "Recharge", storage: "Storage", signOut: "Sign out", placeholder: "http://localhost:8080", save: "Save", close: "Close", browse: "Choose", current: "Current", anonymous: "Not signed in", builtin: "Run built-in server", connector: "Connector", running: "Running", stopped: "Stopped", terminate: "Terminate", pid: "PID", version: "Version", mode: "Mode", noProcess: "No managed process is running", httpProxy: "Global HTTP proxy", httpProxyPlaceholder: "http://127.0.0.1:7890", builtinPath: "Built-in server file path", connectorPath: "Built-in connector file path", checkUpdate: "Check for updates", checkingUpdate: "Checking...", updateReady: "Update is ready", updateReadyDescription: "Confirm to quit this app and run the installer.", installNow: "OK", cancel: "Cancel", noUpdate: "No update available", settingsSaved: "Settings saved", builtinStarting: "Preparing built-in server...", builtinWaiting: "Waiting for built-in server...", builtinUnavailable: "Desktop bridge is not ready", newTab: "New tab", closeTab: "Close tab" }

  const { data: user } = useQuery<DesktopCurrentUser>({
    queryKey: ["desktop-me", currentServer, getAuthToken()],
    queryFn: async () => {
      const res = await api.get("/user/me")
      return res.data
    },
    enabled: Boolean(getAuthToken()),
    retry: false,
  })

  const { data: userStats } = useQuery<DesktopUserStats>({
    queryKey: ["desktop-user-stats", currentServer, getAuthToken()],
    queryFn: async () => {
      const res = await api.get("/user/stats")
      return res.data
    },
    enabled: Boolean(getAuthToken()),
    retry: false,
  })

  const { data: storageSettings } = useQuery<DesktopStorageSettings>({
    queryKey: ["desktop-storage-settings", currentServer, getAuthToken()],
    queryFn: async () => {
      const res = await api.get("/user/advanced-chat/settings")
      return res.data
    },
    enabled: Boolean(getAuthToken()),
    retry: false,
  })

  useEffect(() => {
    setValue(currentServer)
  }, [currentServer])

  useEffect(() => {
    const label = user?.username || user?.email
    if (label) {
      localStorage.setItem(serverAccountKey(currentServer), label)
    }
  }, [currentServer, user?.email, user?.username])

  useEffect(() => {
    if (!isServerOpen && !isStatusOpen && !openApplicationMenu) {
      return
    }
    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target
      if (
        target instanceof Node &&
          (serverPopupRef.current?.contains(target) || statusPopupRef.current?.contains(target) || applicationMenuRef.current?.contains(target))
      ) {
        return
      }
      setIsServerOpen(false)
      setIsStatusOpen(false)
      setOpenApplicationMenu(null)
    }
    document.addEventListener("pointerdown", closeOnOutsidePointer)
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer)
  }, [isServerOpen, isStatusOpen, openApplicationMenu])

  useEffect(() => {
    let cancelled = false
    void window.veloceDesktop?.getBuiltinServerStatus().then((status) => {
      if (!cancelled) {
        setBuiltinStatus(status)
      }
    })
    const unsubscribe = window.veloceDesktop?.onBuiltinServerStatus((status) => {
      setBuiltinStatus(status)
      setIsBuiltinBusy(status.phase === "checking" || status.phase === "downloading" || status.phase === "starting")
    })
    return () => {
      cancelled = true
      unsubscribe?.()
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    void window.veloceDesktop?.getDesktopProcessStatus().then((status) => {
      if (!cancelled) {
        setProcessStatus(status)
      }
    })
    const unsubscribe = window.veloceDesktop?.onDesktopProcessStatus((status) => {
      setProcessStatus(status)
    })
    return () => {
      cancelled = true
      unsubscribe?.()
    }
  }, [])

  useEffect(() => {
    if (!isSettingsOpen) {
      return
    }
    let cancelled = false
    void window.veloceDesktop?.getDesktopSettings().then((settings) => {
      if (!cancelled) {
        setSettingsDraft(settings)
        setUpdateResult(settings.preparedUpdate
          ? { state: "ready", message: copy.updateReady, version: settings.preparedUpdate.tagName, filePath: settings.preparedUpdate.filePath }
          : null)
      }
    })
    return () => {
      cancelled = true
    }
  }, [copy.updateReady, isSettingsOpen])

  const saveServer = () => {
    const nextURL = normalizeServerURL(value)
    writeServerList([nextURL, ...servers])
    setValue(nextURL)
    setServers(readServerList())
    if (activeTab) {
      onUpdateTabServer(activeTab.id, nextURL)
    }
    queryClient.clear()
    setIsServerOpen(false)
  }

  const selectServer = (serverURL: string) => {
    const nextURL = normalizeServerURL(serverURL)
    writeServerList([nextURL, ...servers])
    setValue(nextURL)
    setServers(readServerList())
    if (activeTab) {
      onUpdateTabServer(activeTab.id, nextURL)
    }
    queryClient.clear()
    setIsServerOpen(false)
  }

  const toggleBuiltinServer = async () => {
    if (!window.veloceDesktop || isBuiltinBusy) {
      return
    }
    const nextEnabled = !builtinStatus?.enabled
    setIsBuiltinBusy(true)
    const status = await window.veloceDesktop.setBuiltinServerEnabled(nextEnabled)
    setBuiltinStatus(status)
    setIsBuiltinBusy(status.phase === "checking" || status.phase === "downloading" || status.phase === "starting")
    if (status.enabled && status.serverURL) {
      const nextURL = normalizeServerURL(status.serverURL)
      writeServerList([nextURL, ...servers])
      setBuiltinStatus({ ...status, message: copy.builtinWaiting })
      const setupStatus = await waitForSetupStatus(nextURL)
      if (activeTab) {
        onUpdateTabServer(activeTab.id, nextURL)
        setDesktopServerURL(nextURL, activeTab.id)
      }
      if (!setupStatus?.required && hasAuthToken()) {
        await api.put("/settings", { system_mode: "personal" }).catch(() => undefined)
      }
      queryClient.clear()
      setIsServerOpen(false)
    }
  }

  const saveDesktopSettings = async () => {
    if (!window.veloceDesktop) {
      return
    }
    setIsSavingSettings(true)
    const saved = await window.veloceDesktop.saveDesktopSettings(settingsDraft)
    setSettingsDraft(saved)
    setIsSavingSettings(false)
  }

  const chooseDesktopPath = async (field: "builtinServerPath" | "connectorPath") => {
    const filePath = await window.veloceDesktop?.chooseDesktopFile()
    if (filePath) {
      setSettingsDraft((draft) => ({ ...draft, [field]: filePath }))
    }
  }

  const checkForDesktopUpdate = async () => {
    if (!window.veloceDesktop || isCheckingUpdate) {
      return
    }
    setIsCheckingUpdate(true)
    await window.veloceDesktop.saveDesktopSettings(settingsDraft)
    const result = await window.veloceDesktop.checkDesktopUpdate()
    setUpdateResult(result)
    setIsCheckingUpdate(false)
  }

  const installPreparedUpdate = async () => {
    await window.veloceDesktop?.installPreparedDesktopUpdate()
  }

  const runMenuAction = (action: "new-window" | "quit" | "close-window" | "copy" | "paste" | "cut" | "delete" | "undo" | "redo" | "official-site" | "github" | "home") => {
    setOpenApplicationMenu(null)
    if (action === "home") {
      window.location.hash = "#/chat"
      return
    }
    if (action === "official-site" || action === "github") {
      void window.veloceDesktop?.openDesktopLink(action)
      return
    }
    void window.veloceDesktop?.runDesktopMenuAction(action)
  }

  const accountLabel = user?.username || user?.email || copy.anonymous
  const accountInitial = accountLabel.trim().slice(0, 1).toUpperCase() || "U"
  const balance = userStats?.balance ?? user?.balance ?? 0
  const storageUsed = Math.max(0, Number(storageSettings?.file_storage_used_bytes || 0))
  const storageTotal = Math.max(0, Number(storageSettings?.file_storage_total_mb || 0)) * 1024 * 1024
  const storagePercent = storageTotal > 0 ? Math.min(100, Math.round((storageUsed / storageTotal) * 100)) : 0

  return (
    <>
    <div className="desktop-acrylic-surface fixed inset-x-0 top-0 z-50 h-9 select-none border-b [-webkit-app-region:drag]">
      <div className="flex h-full items-center justify-between pl-3 pr-[138px]">
        <div className="flex min-w-0 flex-1 items-center gap-2 text-xs font-semibold">
          <img src={logoURL} alt="" className="h-5 w-5 rounded object-cover" />
          <span className="shrink-0 truncate">{copy.title}</span>
          <div ref={applicationMenuRef} className="ml-2 flex h-full items-center gap-1 [-webkit-app-region:no-drag]">
            <DesktopMenu label={copy.file} open={openApplicationMenu === "file"} onOpenChange={() => setOpenApplicationMenu((current) => current === "file" ? null : "file")} items={[
              { label: copy.newWindow, action: () => runMenuAction("new-window") },
              { label: copy.closeWindow, action: () => runMenuAction("close-window") },
              { label: copy.home, action: () => runMenuAction("home") },
              { label: copy.quit, action: () => runMenuAction("quit") },
            ]} />
            <DesktopMenu label={copy.edit} open={openApplicationMenu === "edit"} onOpenChange={() => setOpenApplicationMenu((current) => current === "edit" ? null : "edit")} items={[
              { label: copy.copyText, action: () => runMenuAction("copy") },
              { label: copy.paste, action: () => runMenuAction("paste") },
              { label: copy.cut, action: () => runMenuAction("cut") },
              { label: copy.deleteText, action: () => runMenuAction("delete") },
              { label: copy.undo, action: () => runMenuAction("undo") },
              { label: copy.redo, action: () => runMenuAction("redo") },
            ]} />
            <DesktopMenu label={copy.help} open={openApplicationMenu === "help"} onOpenChange={() => setOpenApplicationMenu((current) => current === "help" ? null : "help")} items={[
              { label: copy.officialSite, action: () => runMenuAction("official-site") },
              { label: copy.github, action: () => runMenuAction("github") },
            ]} />
          </div>
          {showTabs && <div className="ml-1 flex min-w-0 max-w-[55vw] items-center gap-1 overflow-hidden [-webkit-app-region:no-drag]">
            {tabs.map((tab) => {
              const active = tab.id === activeTabID
              return (
                <Button
                  key={tab.id}
                  type="button"
                  draggable
                  variant={active ? "outline" : "ghost"}
                  className={`flex min-w-0 max-w-44 items-center gap-1 border px-2 text-left text-[11px] ${active ? "h-8 self-end rounded-t-2xl rounded-b-none border-border border-b-background bg-background text-foreground shadow-sm" : "h-7 rounded-2xl border-transparent text-muted-foreground hover:bg-muted hover:text-foreground"}`}
                  onClick={() => onSelectTab(tab.id)}
                  onDragStart={(event) => {
                    draggingTabID.current = tab.id
                    droppedInStrip.current = false
                    event.dataTransfer.effectAllowed = "move"
                    event.dataTransfer.setData("text/plain", tab.id)
                  }}
                  onDragOver={(event) => {
                    const draggedID = draggingTabID.current
                    if (!draggedID || draggedID === tab.id) {
                      return
                    }
                    event.preventDefault()
                    onMoveTab(draggedID, tab.id)
                  }}
                  onDrop={(event) => {
                    event.preventDefault()
                    droppedInStrip.current = true
                    if (draggingTabID.current) {
                      onSelectTab(draggingTabID.current)
                    }
                  }}
                  onDragEnd={(event) => {
                    const draggedID = draggingTabID.current
                    draggingTabID.current = ""
                    if (draggedID && !droppedInStrip.current) {
                      onDetachTab(draggedID, event.screenX, event.screenY)
                    }
                    droppedInStrip.current = false
                  }}
                  title={`${tab.title} · ${tab.serverURL}`}
                >
                  <span className="truncate">{tab.title}</span>
                  {tabs.length > 1 && (
                    <span
                      role="button"
                      tabIndex={-1}
                      className="ml-1 flex h-4 w-4 shrink-0 items-center justify-center rounded hover:bg-background/80"
                      title={copy.closeTab}
                      onClick={(event) => {
                        event.stopPropagation()
                        onCloseTab(tab.id)
                      }}
                    >
                      x
                    </span>
                  )}
                </Button>
              )
            })}
            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" title={copy.newTab} aria-label={copy.newTab} onClick={onAddTab}>
              <Plus size={14} />
            </Button>
          </div>}
        </div>
        <div className="flex items-center gap-1 [-webkit-app-region:no-drag]">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          title={copy.settings}
          aria-label={copy.settings}
          onClick={() => {
            setIsSettingsOpen(true)
            setIsStatusOpen(false)
            setIsServerOpen(false)
          }}
        >
          <Settings size={16} />
        </Button>
        <div ref={statusPopupRef} className="relative">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            title={copy.status}
            aria-label={copy.status}
            onClick={() => {
              setIsStatusOpen((open) => !open)
              setIsServerOpen(false)
            }}
          >
            <Activity size={16} />
          </Button>
          {isStatusOpen && (
            <div className="desktop-acrylic-popover absolute right-0 top-9 w-[min(380px,calc(100vw-2rem))] rounded-2xl border p-3 text-popover-foreground">
              <div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <Activity size={14} />
                <span>{copy.status}</span>
              </div>
              <div className="space-y-2">
                {(processStatus?.processes.length ? processStatus.processes : []).map((item) => (
                  <ProcessStatusRow key={item.id} item={item} copy={copy} onStatusChange={setProcessStatus} />
                ))}
                {!processStatus?.processes.length && (
                  <div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">{copy.noProcess}</div>
                )}
              </div>
            </div>
          )}
        </div>
        <div ref={serverPopupRef} className="relative">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            title={copy.label}
            aria-label={copy.label}
            onClick={() => {
              setIsServerOpen((open) => !open)
              setIsStatusOpen(false)
            }}
          >
            <Globe2 size={16} />
          </Button>
          {isServerOpen && (
            <div className="desktop-acrylic-popover absolute right-0 top-9 w-[min(360px,calc(100vw-2rem))] rounded-2xl border p-3 text-popover-foreground">
              <div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <Server size={14} />
                <span>{copy.label}</span>
              </div>
              <div className="flex gap-2">
                <Input
                  value={value}
                  placeholder={copy.placeholder}
                  className="h-8 min-w-0 text-xs"
                  onChange={(event) => setValue(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      saveServer()
                    }
                  }}
                />
                <Button className="h-8 shrink-0 px-3 text-xs" onClick={saveServer}>
                  {copy.save}
                </Button>
              </div>
              <div className="mt-3 max-h-64 space-y-1 overflow-y-auto">
                {servers.map((serverURL) => {
                  const selected = normalizeServerURL(serverURL) === currentServer
                  const account = localStorage.getItem(serverAccountKey(serverURL)) || copy.anonymous
                  return (
                    <Button
                      key={serverURL}
                      type="button"
                      variant="ghost"
                      className="flex h-auto w-full items-center gap-2 rounded-2xl px-2 py-2 text-left text-xs hover:bg-muted"
                      onClick={() => selectServer(serverURL)}
                    >
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center">
                        {selected ? <Check size={14} /> : null}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{serverURL}</span>
                        <span className="block truncate text-muted-foreground">
                          {selected ? `${copy.current} · ${account}` : account}
                        </span>
                      </span>
                    </Button>
                  )
                })}
              </div>
              <Button
                variant="ghost"
                className="mt-2 h-8 w-full justify-start gap-2 text-xs"
                onClick={() => {
                  setValue(defaultServerCandidate(servers))
                }}
              >
                <Plus size={14} />
                {copy.placeholder}
              </Button>
              <div className="mt-3 border-t pt-3">
                <div className="flex w-full items-center justify-between gap-3 rounded-2xl px-2 py-2 text-left text-xs">
                  <span className="min-w-0">
                    <span className="block font-medium">{copy.builtin}</span>
                    <span className="block truncate text-muted-foreground">
                      {!window.veloceDesktop ? copy.builtinUnavailable : isBuiltinBusy ? copy.builtinStarting : builtinStatus?.message || builtinStatus?.serverURL || copy.placeholder}
                    </span>
                  </span>
                  <Switch checked={Boolean(builtinStatus?.enabled)} disabled={isBuiltinBusy || !window.veloceDesktop} onCheckedChange={toggleBuiltinServer} />
                </div>
              </div>
            </div>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          title={copy.browser}
          aria-label={copy.browser}
          onClick={() => void window.veloceDesktop?.openDesktopBrowser()}
        >
          <PanelTop size={16} />
        </Button>
        <div
          className="relative ml-3 border-l pl-3"
          onMouseEnter={() => setIsAccountOpen(true)}
          onMouseLeave={() => setIsAccountOpen(false)}
        >
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 overflow-hidden rounded-full"
            title={copy.account}
            aria-label={copy.account}
            onClick={() => setIsAccountOpen((open) => !open)}
          >
            {user?.avatar_url ? (
              <img src={apiURL(user.avatar_url)} alt="" className="h-full w-full object-cover" />
            ) : user ? (
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">{accountInitial}</span>
            ) : (
              <UserCircle size={19} />
            )}
          </Button>
          {isAccountOpen && (
            <div className="desktop-acrylic-popover absolute right-0 top-9 z-[70] w-72 rounded-2xl border p-3 text-popover-foreground">
              <div className="flex min-w-0 items-center gap-3">
                {user?.avatar_url ? (
                  <img src={apiURL(user.avatar_url)} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
                ) : (
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">{accountInitial}</span>
                )}
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">{accountLabel}</div>
                  {user?.email && <div className="truncate text-xs text-muted-foreground">{user.email}</div>}
                </div>
              </div>
              <div className="mt-3 space-y-3 border-t pt-3 text-xs">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">{language === "zh" ? "余额" : "Balance"}</span>
                  <span className="font-medium">{formatDesktopBalance(balance)}</span>
                </div>
                <div>
                  <div className="mb-1.5 flex items-center justify-between gap-3">
                    <span className="flex items-center gap-1.5 text-muted-foreground"><HardDrive size={13} />{copy.storage}</span>
                    <span>{storageTotal > 0 ? `${formatDesktopBytes(storageUsed)} / ${formatDesktopBytes(storageTotal)}` : "-"}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${storagePercent}%` }} />
                  </div>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Button size="sm" className="h-8 gap-1.5" onClick={() => { setIsAccountOpen(false); onNavigateActive("/settings/wallet") }}>
                  <CreditCard size={14} />
                  {copy.recharge}
                </Button>
                <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={() => { setIsAccountOpen(false); onNavigateActive("/settings") }}>
                  <Settings size={14} />
                  {copy.settings}
                </Button>
              </div>
              <Button variant="ghost" size="sm" className="mt-2 h-8 w-full justify-start gap-2 text-destructive hover:text-destructive" onClick={() => { setIsAccountOpen(false); onLogout() }}>
                <LogOut size={14} />
                {copy.signOut}
              </Button>
            </div>
          )}
        </div>
        </div>
      </div>
    </div>
    {isSettingsOpen && (
      <DesktopSettingsModal
        copy={copy}
        settings={settingsDraft}
        updateResult={updateResult}
        isSaving={isSavingSettings}
        isChecking={isCheckingUpdate}
        onSettingsChange={setSettingsDraft}
        onClose={() => setIsSettingsOpen(false)}
        onSave={saveDesktopSettings}
        onChoosePath={chooseDesktopPath}
        onCheckUpdate={checkForDesktopUpdate}
        onInstallUpdate={installPreparedUpdate}
        onDismissUpdate={() => setUpdateResult(null)}
      />
    )}
    </>
  )
}

function DesktopMenu({
  label,
  open,
  onOpenChange,
  items,
}: {
  label: string
  open: boolean
  onOpenChange: () => void
  items: Array<{ label: string; action: () => void }>
}) {
  return (
    <div className="relative">
      <Button
        type="button"
        variant="ghost"
        className={`h-7 rounded-2xl px-2 text-xs font-medium ${open ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
        onClick={onOpenChange}
      >
        {label}
      </Button>
      {open && (
        <div className="absolute left-0 top-8 z-[70] min-w-32 rounded-md bg-popover p-1 text-popover-foreground shadow-lg">
          {items.map((item) => (
            <Button
              key={item.label}
              type="button"
              variant="ghost"
              className="flex h-8 w-full items-center rounded-2xl px-2 text-left text-xs hover:bg-muted"
              onClick={item.action}
            >
              {item.label}
            </Button>
          ))}
        </div>
      )}
    </div>
  )
}

function DesktopSettingsModal({
  copy,
  settings,
  updateResult,
  isSaving,
  isChecking,
  onSettingsChange,
  onClose,
  onSave,
  onChoosePath,
  onCheckUpdate,
  onInstallUpdate,
  onDismissUpdate,
}: {
  copy: Record<string, string>
  settings: DesktopSettings
  updateResult: DesktopUpdateResult | null
  isSaving: boolean
  isChecking: boolean
  onSettingsChange: (settings: DesktopSettings) => void
  onClose: () => void
  onSave: () => void
  onChoosePath: (field: "builtinServerPath" | "connectorPath") => void
  onCheckUpdate: () => void
  onInstallUpdate: () => void
  onDismissUpdate: () => void
}) {
  const updateMessage = updateResult?.state === "ready"
    ? `${copy.updateReady}${updateResult.version ? ` (${updateResult.version})` : ""}`
    : updateResult?.state === "not_available"
      ? copy.noUpdate
      : updateResult?.message || ""
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-gray-950/50 p-4 backdrop-blur-sm [-webkit-app-region:no-drag]">
      <div className="w-[min(560px,calc(100vw-2rem))] rounded-md border bg-popover p-4 text-popover-foreground shadow-xl">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="text-sm font-semibold">{copy.settings}</div>
          <Button variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={onClose}>
            {copy.close}
          </Button>
        </div>
        <div className="space-y-3">
          <label className="block text-xs">
            <span className="mb-1 block font-medium">{copy.httpProxy}</span>
            <Input
              value={settings.httpProxy}
              placeholder={copy.httpProxyPlaceholder}
              className="h-8 text-xs"
              onChange={(event) => onSettingsChange({ ...settings, httpProxy: event.target.value })}
            />
          </label>
          <PathSettingRow
            label={copy.builtinPath}
            value={settings.builtinServerPath}
            browseLabel={copy.browse}
            onChange={(value) => onSettingsChange({ ...settings, builtinServerPath: value })}
            onChoose={() => onChoosePath("builtinServerPath")}
          />
          <PathSettingRow
            label={copy.connectorPath}
            value={settings.connectorPath}
            browseLabel={copy.browse}
            onChange={(value) => onSettingsChange({ ...settings, connectorPath: value })}
            onChoose={() => onChoosePath("connectorPath")}
          />
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t pt-4">
          <Button variant="outline" className="h-8 text-xs" disabled={isChecking} onClick={onCheckUpdate}>
            {isChecking ? copy.checkingUpdate : copy.checkUpdate}
          </Button>
          <Button className="h-8 text-xs" disabled={isSaving} onClick={onSave}>
            {copy.save}
          </Button>
        </div>
        {updateResult && (
          <div className="mt-3 rounded-md border p-3 text-xs">
            <div className="font-medium">{updateMessage}</div>
            {updateResult.state === "ready" ? (
              <>
                <div className="mt-1 text-muted-foreground">{copy.updateReadyDescription}</div>
                <div className="mt-3 flex justify-end gap-2">
                  <Button variant="outline" size="sm" className="h-7 px-3 text-xs" onClick={onDismissUpdate}>
                    {copy.cancel}
                  </Button>
                  <Button size="sm" className="h-7 px-3 text-xs" onClick={onInstallUpdate}>
                    {copy.installNow}
                  </Button>
                </div>
              </>
            ) : null}
          </div>
        )}
      </div>
    </div>
  )
}

function PathSettingRow({
  label,
  value,
  browseLabel,
  onChange,
  onChoose,
}: {
  label: string
  value: string
  browseLabel: string
  onChange: (value: string) => void
  onChoose: () => void
}) {
  return (
    <label className="block text-xs">
      <span className="mb-1 block font-medium">{label}</span>
      <div className="flex gap-2">
        <Input value={value} className="h-8 min-w-0 text-xs" onChange={(event) => onChange(event.target.value)} />
        <Button type="button" variant="outline" className="h-8 shrink-0 gap-2 px-3 text-xs" onClick={onChoose}>
          <FolderOpen size={14} />
          {browseLabel}
        </Button>
      </div>
    </label>
  )
}

function ProcessStatusRow({
  item,
  copy,
  onStatusChange,
}: {
  item: DesktopProcessItem
  copy: Record<string, string>
  onStatusChange: (status: DesktopProcessStatus) => void
}) {
  const title = item.kind === "builtin-server" ? copy.builtin : copy.connector
  const statusLabel = item.running ? copy.running : copy.stopped
  const terminate = async () => {
    const status = await window.veloceDesktop?.terminateDesktopProcess(item.id)
    if (status) {
      onStatusChange(status)
    }
  }
  return (
    <div className="rounded-md border p-3 text-xs">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate font-medium">{title}</div>
          <div className="mt-1 truncate text-muted-foreground">{item.message || item.serverURL || statusLabel}</div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className={`rounded-full px-2 py-0.5 text-[11px] ${item.running ? "bg-emerald-500/15 text-emerald-600" : "bg-muted text-muted-foreground"}`}>
            {statusLabel}
          </span>
          <Button variant="outline" size="sm" className="h-6 px-2 text-[11px]" onClick={terminate}>
            {copy.terminate}
          </Button>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-muted-foreground">
        <ProcessMeta label={copy.pid} value={item.pid ? String(item.pid) : "-"} />
        <ProcessMeta label={copy.version} value={item.version || "-"} />
        {item.mode && <ProcessMeta label={copy.mode} value={item.mode} />}
        {item.serverURL && <ProcessMeta label="URL" value={item.serverURL} />}
      </div>
    </div>
  )
}

function ProcessMeta({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] uppercase tracking-normal">{label}</div>
      <div className="truncate text-foreground">{value}</div>
    </div>
  )
}

function defaultServerCandidate(servers: string[]) {
  const base = "http://localhost:8080"
  if (!servers.includes(base)) {
    return base
  }
  return "http://"
}

async function waitForSetupStatus(serverURL: string) {
  const endpoint = `${normalizeServerURL(serverURL)}/api/setup/status`
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(endpoint, { cache: "no-store" })
      if (response.ok) {
        return await response.json() as SetupStatus
      }
    } catch {
      // Keep polling until the just-started local server is ready.
    }
    await delay(500)
  }
  return null
}

function delay(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

function DesktopRoutes() {
  const embeddedTabID = getDesktopTabID()
  if (embeddedTabID) {
    mirrorDesktopBridge()
    return <DesktopPageRoutes className="fixed inset-0 overflow-hidden" />
  }

  return <DesktopSingleWindow />
}

function formatDesktopBalance(value: string | number) {
  const amount = Number(value)
  return Number.isFinite(amount) ? amount.toLocaleString(undefined, { maximumFractionDigits: 4 }) : String(value || 0)
}

function formatDesktopBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0 B"
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  if (value < 1024 * 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`
  return `${(value / 1024 / 1024 / 1024).toFixed(1)} GB`
}

function DesktopPageRoutes({ className }: { className: string }) {
  return (
    <HashRouter>
      <TokenBridge />
      <DesktopConnectorBridge />
      <DesktopApprovalDecisionBridge />
      <DesktopNavigationBridge />
      <DocumentTitle />
      <div className={className}>
        <SetupGate>
          <Routes>
            <Route path="/" element={<Navigate to={hasAuthToken() ? "/chat" : "/login"} replace />} />
            <Route path="/login" element={<Login />} />
            <Route path="/setup" element={<Setup />} />
            <Route path="/chat/*" element={<ProtectedRoute><AdvancedChat /></ProtectedRoute>} />
            <Route path="/dashboard/*" element={<ProtectedRoute><DesktopDashboard /></ProtectedRoute>} />
            <Route path="/settings/*" element={<ProtectedRoute><SettingsWorkspace /></ProtectedRoute>} />
            <Route path="*" element={<Navigate to={hasAuthToken() ? "/chat" : "/login"} replace />} />
          </Routes>
        </SetupGate>
      </div>
    </HashRouter>
  )
}

function DesktopSingleWindow() {
  const queryClient = useQueryClient()
  const [serverURL, setServerURL] = useState(() => getDesktopServerURL())
  const tab: DesktopTab = { id: "desktop", title: "Chat", serverURL, path: "/chat" }
  const updateServer = (_tabID: string, value: string) => {
    const nextURL = normalizeServerURL(value)
    setDesktopServerURL(nextURL)
    setServerURL(nextURL)
    queryClient.clear()
  }

  return (
    <>
      <DesktopTitleBar
        tabs={[tab]}
        activeTabID={tab.id}
        showTabs={false}
        onSelectTab={() => undefined}
        onAddTab={() => undefined}
        onCloseTab={() => undefined}
        onMoveTab={() => undefined}
        onDetachTab={() => undefined}
        onUpdateTabServer={updateServer}
        onNavigateActive={(path) => { window.location.hash = `#${path}` }}
        onLogout={() => {
          clearAuthToken()
          window.location.hash = "#/login"
        }}
      />
      <DesktopPageRoutes className="fixed inset-x-0 bottom-0 top-9 overflow-hidden bg-background" />
    </>
  )
}

function mirrorDesktopBridge() {
  if (!window.veloceDesktop && window.parent && window.parent !== window && window.parent.veloceDesktop) {
    window.veloceDesktop = window.parent.veloceDesktop
  }
}

export function DesktopTabbedShell() {
  const queryClient = useQueryClient()
  const [tabs, setTabs] = useState<DesktopTab[]>([])
  const [activeTabID, setActiveTabID] = useState("")
  const [isReady, setIsReady] = useState(false)
  const [isDetachedWindow, setIsDetachedWindow] = useState(false)

  useEffect(() => {
    let cancelled = false
    void window.veloceDesktop?.getDesktopTabInitialState().then((state) => {
      if (cancelled) {
        return
      }
      const initialTabs = state?.tab ? [state.tab] : readDesktopTabs()
      setTabs(initialTabs)
      setActiveTabID(readActiveDesktopTabID(initialTabs))
      setIsDetachedWindow(Boolean(state?.tab))
      setIsReady(true)
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!isReady) {
      return
    }
    if (!isDetachedWindow) {
      writeDesktopTabs(tabs)
    }
    for (const tab of tabs) {
      setDesktopTabServerURL(tab.id, tab.serverURL)
    }
    if (!tabs.some((tab) => tab.id === activeTabID) && tabs[0]) {
      setActiveTabID(tabs[0].id)
      if (!isDetachedWindow) {
        writeActiveDesktopTabID(tabs[0].id)
      }
    }
  }, [activeTabID, isDetachedWindow, isReady, tabs])

  useEffect(() => {
    const activeTab = tabs.find((tab) => tab.id === activeTabID)
    if (activeTab) {
      setDesktopServerURL(activeTab.serverURL)
    }
  }, [activeTabID, tabs])

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const data = event.data
      if (!data || typeof data !== "object" || data.type !== "veloce-desktop-tab-title") {
        return
      }
      const frame = Array.from(document.querySelectorAll<HTMLIFrameElement>("iframe[data-tab-id]"))
        .find((item) => item.contentWindow === event.source)
      const tabID = frame?.dataset.tabId
      if (!tabID) {
        return
      }
      const title = typeof data.title === "string" && data.title.trim() ? data.title.trim().slice(0, 40) : "Chat"
      const pagePath = normalizeDesktopTabPath(data.path)
      setTabs((current) => current.map((tab) => tab.id === tabID ? { ...tab, title, path: pagePath } : tab))
    }
    window.addEventListener("message", handleMessage)
    return () => window.removeEventListener("message", handleMessage)
  }, [])

  useEffect(() => {
    return window.veloceDesktop?.onDesktopTabReceived((tab) => {
      setTabs((current) => current.some((item) => item.id === tab.id) ? current : [...current, tab])
      setActiveTabID(tab.id)
    })
  }, [])

  useEffect(() => {
    return window.veloceDesktop?.onBrowserAskPage((page) => {
      const target = document.querySelector<HTMLIFrameElement>(`iframe[data-tab-id="${activeTabID}"]`)
      target?.contentWindow?.postMessage({ type: "veloce-browser-ask-page", title: page.title || "", url: page.url || "" }, "*")
    })
  }, [activeTabID])

  const selectTab = (tabID: string) => {
    const tab = tabs.find((item) => item.id === tabID)
    if (tab) {
      setDesktopServerURL(tab.serverURL)
      queryClient.clear()
    }
    setActiveTabID(tabID)
    if (!isDetachedWindow) {
      writeActiveDesktopTabID(tabID)
    }
  }

  const addTab = () => {
    const tab = newDesktopTab(tabs.find((item) => item.id === activeTabID)?.serverURL || getDesktopServerURL())
    setDesktopTabServerURL(tab.id, tab.serverURL)
    setTabs((current) => [...current, tab])
    selectTab(tab.id)
  }

  const closeTab = (tabID: string) => {
    setTabs((current) => {
      if (current.length <= 1) {
        return current
      }
      const next = current.filter((tab) => tab.id !== tabID)
      if (activeTabID === tabID) {
        const fallback = next[Math.max(0, current.findIndex((tab) => tab.id === tabID) - 1)] || next[0]
        if (fallback) {
          setActiveTabID(fallback.id)
          if (!isDetachedWindow) {
            writeActiveDesktopTabID(fallback.id)
          }
        }
      }
      return next
    })
  }

  const updateTabServer = (tabID: string, serverURL: string) => {
    const nextURL = normalizeServerURL(serverURL)
    setDesktopTabServerURL(tabID, nextURL)
    if (tabID === activeTabID) {
      setDesktopServerURL(nextURL)
      queryClient.clear()
    }
    setTabs((current) => current.map((tab) => tab.id === tabID ? { ...tab, serverURL: nextURL } : tab))
  }

  const moveTab = (tabID: string, targetTabID: string) => {
    setTabs((current) => {
      const sourceIndex = current.findIndex((tab) => tab.id === tabID)
      const targetIndex = current.findIndex((tab) => tab.id === targetTabID)
      if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) {
        return current
      }
      const next = [...current]
      const [tab] = next.splice(sourceIndex, 1)
      next.splice(targetIndex, 0, tab)
      return next
    })
  }

  const detachTab = async (tabID: string, screenX: number, screenY: number) => {
    const tab = tabs.find((item) => item.id === tabID)
    if (!tab || !window.veloceDesktop) {
      return
    }
    const result = await window.veloceDesktop.detachDesktopTab({ ...tab, screenX, screenY })
    if (!result.moved) {
      return
    }
    setTabs((current) => {
      const next = current.filter((item) => item.id !== tabID)
      if (next.length > 0) {
        return next
      }
      const replacement = newDesktopTab(tab.serverURL)
      setActiveTabID(replacement.id)
      return [replacement]
    })
    if (activeTabID === tabID) {
      setActiveTabID((current) => current === tabID ? "" : current)
    }
  }

  const sendToActiveTab = (message: Record<string, unknown>) => {
    const frame = document.querySelector<HTMLIFrameElement>(`iframe[data-tab-id="${activeTabID}"]`)
    frame?.contentWindow?.postMessage(message, "*")
  }

  if (!isReady) {
    return <div className="flex h-screen items-center justify-center bg-background text-sm text-muted-foreground">Loading...</div>
  }

  return (
    <>
      <DesktopTitleBar
        tabs={tabs}
        activeTabID={activeTabID}
        onSelectTab={selectTab}
        onAddTab={addTab}
        onCloseTab={closeTab}
        onMoveTab={moveTab}
        onDetachTab={detachTab}
        onUpdateTabServer={updateTabServer}
        onNavigateActive={(path) => sendToActiveTab({ type: "veloce-desktop-navigate", path })}
        onLogout={() => sendToActiveTab({ type: "veloce-desktop-logout" })}
      />
      <div className="fixed inset-x-0 bottom-0 top-9 overflow-hidden bg-background">
        {tabs.map((tab) => (
          <iframe
            key={`${tab.id}:${tab.serverURL}`}
            title={tab.title}
            data-tab-id={tab.id}
            src={`./index.html?desktop_tab_id=${encodeURIComponent(tab.id)}#${tab.path}`}
            className={`h-full w-full border-0 ${tab.id === activeTabID ? "block" : "hidden"}`}
          />
        ))}
      </div>
    </>
  )
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <I18nProvider>
          <ToastProvider>
            <DesktopTransparency />
            <DesktopRoutes />
          </ToastProvider>
        </I18nProvider>
      </ThemeProvider>
    </QueryClientProvider>
  )
}

export default App
