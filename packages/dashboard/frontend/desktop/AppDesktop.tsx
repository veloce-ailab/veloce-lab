import { useEffect, useRef, useState } from "react"
import type { ReactNode } from "react"
import { HashRouter, Route, Routes, useLocation, useNavigate } from "react-router-dom"
import { ExternalLink, FolderOpen, Globe2, Info, RefreshCw, Server, Settings } from "lucide-react"

import { useI18n } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import { useToast } from "@/components/ui/toast"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import logoURL from "@/assets/logo.png"
import {
  DesktopApprovalDecisionBridge,
  DesktopNavigationBridge,
  DesktopTransparency,
} from "@/desktop/bridges"
import { frames as extensionFrames, routes as extensionRoutes, subscribeExtensions } from "../extension"

// The desktop shell is one window on one server: the server that serves this
// page. Every window of the app shows the same panel, several windows share the
// single main process, and what the browser cannot do (window chrome, the
// built-in server, the connector process, OS notifications) comes from the
// preload bridge.
//
// There is no sign-in and no server picker here. The server has no auth plugin,
// and the window can only ever load the origin it was opened on, so the shell
// adds window chrome and the few host capabilities around the panel instead of
// owning an account or a server list.


type DesktopSystemInfo = { hostname: string; platform: string; instanceID: string; titleBar?: "overlay" | "frame" }
/** Height the panel starts below when this shell draws its own title bar. */
const overlayTitleBarClass = "top-9"

const emptyDesktopSettings: DesktopSettings = {
  httpProxy: "",
  builtinServerPath: "",
  developerMode: false,
  serverURL: "",
  preparedUpdate: null,
}

function DocumentTitle() {
  const location = useLocation()
  const { language, t } = useI18n()

  useEffect(() => {
    const pageTitle = location.pathname.startsWith("/settings")
      ? language === "zh" ? "设置" : "Settings"
      : t("nav.chat")
    document.title = `${pageTitle} - Veloce Lab`
  }, [language, location.pathname, t])

  return null
}

const zhCopy = {
  title: "Veloce Lab",
  file: "文件",
  edit: "编辑",
  help: "帮助",
  newWindow: "新窗口",
  closeWindow: "关闭窗口",
  quit: "退出",
  home: "返回聊天",
  copyText: "复制",
  paste: "粘贴",
  cut: "剪切",
  deleteText: "删除",
  undo: "撤销",
  redo: "还原",
  officialSite: "官网",
  github: "GitHub",
  settings: "桌面设置",
  panelSettings: "打开面板设置",
  close: "关闭",
  save: "保存",
  saved: "设置已保存",
  saveFailed: "设置未能保存",
  builtin: "内置服务器",
  builtinUnavailable: "桌面桥接不可用",
  builtinStarting: "正在准备内置服务器…",
  processes: "受管进程",
  connector: "连接器",
  noProcess: "暂无运行中的受管进程",
  running: "运行中",
  stopped: "未运行",
  terminate: "终止",
  pid: "进程",
  version: "版本",
  mode: "模式",
  httpProxy: "全局 HTTP 代理",
  httpProxyPlaceholder: "http://127.0.0.1:7890",
  browse: "选择",
  developerMode: "开发者模式",
  developerModeDescription: "允许窗口加载外部服务器上的面板。外部服务器上的页面会获得与本机相同的桌面能力：打开文件、启动连接器、发送通知。",
  externalServerURL: "外部服务器地址",
  externalServerPlaceholder: "https://panel.example.com",
  externalServerEmpty: "未填写地址时仍使用内置服务器。",
  panelAddress: "面板地址",
  systemInfo: "系统信息",
  hostname: "主机名",
  platform: "系统",
  instanceID: "安装标识",
  checkUpdate: "检查更新",
  updateUnavailable: "暂不可用",
  links: "链接",
} as const

const enCopy: Record<keyof typeof zhCopy, string> = {
  title: "Veloce Lab",
  file: "File",
  edit: "Edit",
  help: "Help",
  newWindow: "New window",
  closeWindow: "Close window",
  quit: "Quit",
  home: "Back to chat",
  copyText: "Copy",
  paste: "Paste",
  cut: "Cut",
  deleteText: "Delete",
  undo: "Undo",
  redo: "Redo",
  officialSite: "Official website",
  github: "GitHub",
  settings: "Desktop settings",
  panelSettings: "Open panel settings",
  close: "Close",
  save: "Save",
  saved: "Settings saved",
  saveFailed: "Settings could not be saved",
  builtin: "Built-in server",
  builtinUnavailable: "Desktop bridge is not available",
  builtinStarting: "Preparing the built-in server…",
  processes: "Managed processes",
  noProcess: "No managed process is running",
  running: "Running",
  stopped: "Stopped",
  terminate: "Terminate",
  pid: "PID",
  version: "Version",
  mode: "Mode",
  httpProxy: "Global HTTP proxy",
  httpProxyPlaceholder: "http://127.0.0.1:7890",
  browse: "Choose",
  developerMode: "Developer mode",
  developerModeDescription: "Let the windows load a panel from an external server. A page from that server gets the same desktop abilities this machine has: opening files, starting a connector and showing notifications.",
  externalServerURL: "External server URL",
  externalServerPlaceholder: "https://panel.example.com",
  externalServerEmpty: "The built-in server is used while this is empty.",
  panelAddress: "Panel address",
  systemInfo: "System information",
  hostname: "Hostname",
  platform: "Platform",
  instanceID: "Installation id",
  checkUpdate: "Check for updates",
  updateUnavailable: "Not available yet",
  links: "Links",
}

type DesktopCopy = Record<keyof typeof zhCopy, string>

const isBusyPhase = (phase: BuiltinServerStatus["phase"] | undefined) =>
  phase === "checking" || phase === "downloading" || phase === "starting"

function useDesktopCopy() {
  const { language } = useI18n()
  return language === "zh" ? zhCopy : enCopy
}

/**
 * Panel pages are rendered exactly as the plugins registered them: a frame owns
 * its own chrome (top bar, sidebar, slots), and the shell only reserves the
 * window title bar above it.
 */
function DesktopPageRoutes() {
  const [, refreshExtensions] = useState(0)
  useEffect(() => subscribeExtensions(() => refreshExtensions((value) => value + 1)), [])
  const registeredRoutes = extensionRoutes()
  const registeredFrames = extensionFrames()
  return (
    <Routes>
      {registeredRoutes.map((route) => {
        const Component = route.component
        return <Route key={route.path} path={route.path} element={<Component />} />
      })}
      {registeredFrames.map((frame) => {
        const Component = frame.component
        return <Route key={frame.id} path={`${frame.path.replace(/\/$/, "")}/*`} element={<Component />} />
      })}
      <Route path="*" element={null} />
    </Routes>
  )
}

export function DesktopShell() {
  // Where the window keeps its native frame (Linux), the frame *is* the title
  // bar: drawing a second one would only push the panel under the window
  // controls. The bridge says which world this is.
  const [titleBarMode, setTitleBarMode] = useState<"overlay" | "frame" | "unknown">("unknown")
  useEffect(() => {
    let cancelled = false
    void window.veloceDesktop?.getDesktopSystemInfo().then((info) => {
      if (!cancelled) setTitleBarMode(info.titleBar ?? "overlay")
    })
    return () => {
      cancelled = true
    }
  }, [])
  const overlay = titleBarMode !== "frame"
  return (
    <HashRouter>
      <DesktopTransparency />
      <DesktopApprovalDecisionBridge />
      <DesktopNavigationBridge />
      <DocumentTitle />
      <DesktopTitleBar overlay={overlay} />
      {/* `transform-gpu` makes this box the containing block for the panel's own
          `position: fixed` children (the chat sidebar is one) — without it they
          pin themselves to the viewport and slide under the title bar. Portals
          still go to the body, so dialogs and menus are unaffected. */}
      <div className={cn("fixed inset-x-0 bottom-0 transform-gpu overflow-hidden bg-background", overlayTitleBarClass)}>
        <DesktopPageRoutes />
      </div>
    </HashRouter>
  )
}

function DesktopTitleBar({ overlay }: { overlay: boolean }) {
  const copy = useDesktopCopy()
  const { success, error: showError } = useToast()
  const navigate = useNavigate()
  const applicationMenuRef = useRef<HTMLDivElement | null>(null)
  const [openApplicationMenu, setOpenApplicationMenu] = useState<"file" | "edit" | "help" | null>(null)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [settingsDraft, setSettingsDraft] = useState<DesktopSettings>(emptyDesktopSettings)
  const [builtinStatus, setBuiltinStatus] = useState<BuiltinServerStatus | null>(null)
  const [systemInfo, setSystemInfo] = useState<DesktopSystemInfo | null>(null)
  const [updateNotice, setUpdateNotice] = useState("")
  const [isSavingSettings, setIsSavingSettings] = useState(false)
  const [isBuiltinBusy, setIsBuiltinBusy] = useState(false)
  const bridge = typeof window === "undefined" ? undefined : window.veloceDesktop

  useEffect(() => {
    let cancelled = false
    void bridge?.getBuiltinServerStatus().then((status) => {
      if (cancelled) return
      setBuiltinStatus(status)
      setIsBuiltinBusy(isBusyPhase(status.phase))
    })
    const unsubscribe = bridge?.onBuiltinServerStatus((status) => {
      setBuiltinStatus(status)
      setIsBuiltinBusy(isBusyPhase(status.phase))
    })
    return () => {
      cancelled = true
      unsubscribe?.()
    }
  }, [bridge])

  useEffect(() => {
    let cancelled = false
    return () => {
      cancelled = true
      unsubscribe?.()
    }
  }, [bridge])

  useEffect(() => {
    if (!isSettingsOpen) return
    let cancelled = false
    void bridge?.getDesktopSettings().then((settings) => {
      if (!cancelled) setSettingsDraft(settings)
    })
    void bridge?.getDesktopSystemInfo().then((info) => {
      if (!cancelled) setSystemInfo(info)
    })
    return () => {
      cancelled = true
    }
  }, [bridge, isSettingsOpen])

  useEffect(() => {
    if (!openApplicationMenu) return
    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target
      if (target instanceof Node && applicationMenuRef.current?.contains(target)) return
      setOpenApplicationMenu(null)
    }
    document.addEventListener("pointerdown", closeOnOutsidePointer)
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer)
  }, [openApplicationMenu])

  const toggleBuiltinServer = async () => {
    if (!bridge || isBuiltinBusy) return
    setIsBuiltinBusy(true)
    const status = await bridge.setBuiltinServerEnabled(!builtinStatus?.enabled)
    setBuiltinStatus(status)
    setIsBuiltinBusy(isBusyPhase(status.phase))
  }

  const saveDesktopSettings = async () => {
    if (!bridge) return
    setIsSavingSettings(true)
    try {
      // The bridge answers with what it actually stored: enabling developer mode
      // asks for confirmation first, and a refused confirmation keeps the draft
      // in sync with the settings that are still in force.
      const saved = await bridge.saveDesktopSettings(settingsDraft)
      setSettingsDraft(saved)
      success(copy.saved)
    } catch (saveError) {
      console.error("Failed to save desktop settings", saveError)
      showError(copy.saveFailed)
    } finally {
      setIsSavingSettings(false)
    }
  }



  const runMenuAction = (action: "new-window" | "quit" | "close-window" | "copy" | "paste" | "cut" | "delete" | "undo" | "redo") => {
    setOpenApplicationMenu(null)
    void bridge?.runDesktopMenuAction(action)
  }

  const openPanelLink = (target: "official-site" | "github") => {
    setOpenApplicationMenu(null)
    void bridge?.openDesktopLink(target)
  }

  return (
    <>
      <div
        className={cn(
          "desktop-acrylic-surface fixed inset-x-0 top-0 z-50 h-9 select-none border-b",
          overlay && "[-webkit-app-region:drag]",
        )}
      >
        {/* Room for the window buttons only where they float over the page: macOS
            draws them on the left, Windows on the right. A framed window owns its
            own title bar, so the page gets the full width there. */}
        <div
          className={cn(
            "flex h-full items-center justify-between",
            !overlay ? "pl-3 pr-3" : systemInfo?.platform === "darwin" ? "pl-[80px] pr-3" : "pl-3 pr-[138px]",
          )}
        >
          <div className="flex min-w-0 flex-1 items-center gap-2 text-xs font-semibold">
            <img src={logoURL} alt="" className="h-5 w-5 rounded object-cover" />
            <span className="shrink-0 truncate">{copy.title}</span>
            <div ref={applicationMenuRef} className="ml-2 flex h-full items-center gap-1 [-webkit-app-region:no-drag]">
              <DesktopMenu
                label={copy.file}
                open={openApplicationMenu === "file"}
                onOpenChange={() => setOpenApplicationMenu((current) => current === "file" ? null : "file")}
                items={[
                  { label: copy.newWindow, action: () => runMenuAction("new-window") },
                  { label: copy.closeWindow, action: () => runMenuAction("close-window") },
                  { label: copy.home, action: () => { setOpenApplicationMenu(null); navigate("/chat") } },
                  { label: copy.quit, action: () => runMenuAction("quit") },
                ]}
              />
              <DesktopMenu
                label={copy.edit}
                open={openApplicationMenu === "edit"}
                onOpenChange={() => setOpenApplicationMenu((current) => current === "edit" ? null : "edit")}
                items={[
                  { label: copy.copyText, action: () => runMenuAction("copy") },
                  { label: copy.paste, action: () => runMenuAction("paste") },
                  { label: copy.cut, action: () => runMenuAction("cut") },
                  { label: copy.deleteText, action: () => runMenuAction("delete") },
                  { label: copy.undo, action: () => runMenuAction("undo") },
                  { label: copy.redo, action: () => runMenuAction("redo") },
                ]}
              />
              <DesktopMenu
                label={copy.help}
                open={openApplicationMenu === "help"}
                onOpenChange={() => setOpenApplicationMenu((current) => current === "help" ? null : "help")}
                items={[
                  { label: copy.officialSite, action: () => openPanelLink("official-site") },
                  { label: copy.github, action: () => openPanelLink("github") },
                ]}
              />
            </div>
          </div>
          <div className="flex items-center gap-1 [-webkit-app-region:no-drag]">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              title={copy.settings}
              aria-label={copy.settings}
              onClick={() => setIsSettingsOpen(true)}
            >
              <Settings size={16} />
            </Button>
          </div>
        </div>
      </div>
      {isSettingsOpen && (
        <DesktopSettingsDialog
          copy={copy}
          settings={settingsDraft}
          builtinStatus={builtinStatus}
          isBuiltinBusy={isBuiltinBusy}
          systemInfo={systemInfo}
          updateNotice={updateNotice}
          isSaving={isSavingSettings}
          onSettingsChange={setSettingsDraft}
          onToggleBuiltin={() => void toggleBuiltinServer()}
          onCheckUpdate={() => setUpdateNotice(copy.updateUnavailable)}
          onOpenPanelSettings={() => { setIsSettingsOpen(false); navigate("/settings") }}
          onOpenLink={(target) => void bridge?.openDesktopLink(target)}
          onClose={() => { setIsSettingsOpen(false); setUpdateNotice("") }}
          onSave={() => void saveDesktopSettings()}
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
        <div className="absolute left-0 top-8 z-[70] min-w-36 rounded-md bg-popover p-1 text-popover-foreground shadow-lg">
          {items.map((item) => (
            <Button
              key={item.label}
              type="button"
              variant="ghost"
              className="flex h-8 w-full items-center justify-start rounded-2xl px-2 text-left text-xs hover:bg-muted"
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

function DesktopSettingsDialog({
  copy,
  settings,
  builtinStatus,
  isBuiltinBusy,
  systemInfo,
  updateNotice,
  isSaving,
  onSettingsChange,
  onToggleBuiltin,
  onCheckUpdate,
  onOpenPanelSettings,
  onOpenLink,
  onClose,
  onSave,
}: {
  copy: DesktopCopy
  settings: DesktopSettings
  builtinStatus: BuiltinServerStatus | null
  isBuiltinBusy: boolean
  systemInfo: DesktopSystemInfo | null
  updateNotice: string
  isSaving: boolean
  onSettingsChange: (settings: DesktopSettings) => void
  onToggleBuiltin: () => void
  onCheckUpdate: () => void
  onOpenPanelSettings: () => void
  onOpenLink: (target: "official-site" | "github") => void
  onClose: () => void
  onSave: () => void
}) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-gray-950/50 p-4 backdrop-blur-sm [-webkit-app-region:no-drag]">
      <div className="max-h-[calc(100vh-2rem)] w-[min(600px,calc(100vw-2rem))] overflow-y-auto rounded-md border bg-popover p-4 text-popover-foreground shadow-xl">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="text-sm font-semibold">{copy.settings}</div>
          <Button variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={onClose}>
            {copy.close}
          </Button>
        </div>

        <div className="space-y-4">
          <section>
            <SectionTitle icon={<Server size={14} />}>{copy.builtin}</SectionTitle>
            <div className="flex items-start justify-between gap-3 rounded-md border p-3 text-xs">
              <div className="min-w-0">
                <div className="truncate text-muted-foreground">
                  {!window.veloceDesktop
                    ? copy.builtinUnavailable
                    : isBuiltinBusy
                      ? copy.builtinStarting
                      : builtinStatus?.message || builtinStatus?.serverURL || ""}
                </div>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                  <span>{window.location.origin}</span>
                  {builtinStatus?.version ? <span>{copy.version} {builtinStatus.version}</span> : null}
                </div>
              </div>
              <Switch
                checked={Boolean(builtinStatus?.enabled)}
                disabled={isBuiltinBusy || !window.veloceDesktop}
                onCheckedChange={onToggleBuiltin}
              />
            </div>
          </section>

          <section className="space-y-3">
            <label className="block text-xs">
              <span className="mb-1 block font-medium">{copy.httpProxy}</span>
              <Input
                value={settings.httpProxy}
                placeholder={copy.httpProxyPlaceholder}
                className="h-8 text-xs"
                onChange={(event) => onSettingsChange({ ...settings, httpProxy: event.target.value })}
              />
            </label>
          </section>

          <section>
            <SectionTitle icon={<Globe2 size={14} />}>{copy.developerMode}</SectionTitle>
            <div className="rounded-md border p-3 text-xs">
              <div className="flex items-start justify-between gap-3">
                <p className="min-w-0 text-muted-foreground">{copy.developerModeDescription}</p>
                <Switch
                  checked={settings.developerMode}
                  disabled={!window.veloceDesktop}
                  onCheckedChange={(checked) => onSettingsChange({ ...settings, developerMode: checked === true })}
                />
              </div>
              {settings.developerMode && (
                <label className="mt-3 block">
                  <span className="mb-1 block font-medium">{copy.externalServerURL}</span>
                  <Input
                    value={settings.serverURL}
                    placeholder={copy.externalServerPlaceholder}
                    className="h-8 text-xs"
                    onChange={(event) => onSettingsChange({ ...settings, serverURL: event.target.value })}
                  />
                  <span className="mt-1 block text-[11px] text-muted-foreground">{copy.externalServerEmpty}</span>
                </label>
              )}
            </div>
          </section>

          <section>
            <SectionTitle icon={<Info size={14} />}>{copy.systemInfo}</SectionTitle>
            <div className="grid grid-cols-2 gap-2 rounded-md border p-3 text-xs text-muted-foreground">
              <ProcessMeta label={copy.hostname} value={systemInfo?.hostname || "-"} />
              <ProcessMeta label={copy.platform} value={systemInfo?.platform || "-"} />
              <ProcessMeta label={copy.instanceID} value={systemInfo?.instanceID || "-"} />
              <ProcessMeta label={copy.panelAddress} value={window.location.origin} />
            </div>
          </section>

          <section className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
            <div className="flex min-w-0 items-center gap-2">
              <Button variant="outline" className="h-8 text-xs" onClick={onCheckUpdate}>
                <RefreshCw size={14} />
                {copy.checkUpdate}
              </Button>
              {updateNotice && <span className="text-xs text-muted-foreground">{updateNotice}</span>}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" className="h-8 gap-1.5 text-xs" onClick={() => onOpenLink("official-site")}>
                <ExternalLink size={14} />
                {copy.officialSite}
              </Button>
              <Button variant="outline" className="h-8 gap-1.5 text-xs" onClick={() => onOpenLink("github")}>
                <ExternalLink size={14} />
                {copy.github}
              </Button>
            </div>
          </section>
        </div>

        <div className="mt-4 flex items-center justify-between gap-2 border-t pt-4">
          <Button variant="ghost" className="h-8 text-xs" onClick={onOpenPanelSettings}>
            {copy.panelSettings}
          </Button>
          <Button className="h-8 text-xs" disabled={isSaving} onClick={onSave}>
            {copy.save}
          </Button>
        </div>
      </div>
    </div>
  )
}

function SectionTitle({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
      {icon}
      <span>{children}</span>
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

function ProcessMeta({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] uppercase tracking-normal">{label}</div>
      <div className="truncate text-foreground">{value}</div>
    </div>
  )
}

// `DesktopShell` is mounted by `App` inside the shared providers, so a plugin
// that registers a page or a slot sees the same registry in both targets.
export default DesktopShell
