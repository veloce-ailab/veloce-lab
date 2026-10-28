import { useState } from "react"
import { Check, ChevronRight, Folder, Monitor } from "lucide-react"
import { cn, Popover, PopoverContent, PopoverTrigger, useI18n, type DashboardContext } from "@velocelab/dashboard/frontend"
import type { ChatSlotData } from "@velocelab/advanced-chat/frontend/slots"

function EnvironmentPanel(props: Record<string, unknown>) {
  const { language } = useI18n()
  const { session, device, devices, recentWorkspacePaths, setDevice, setWorkspacePath, openWorkspacePicker } = props as ChatSlotData
  const [picker, setPicker] = useState<"device" | "workspace" | null>(null)
  const copy = language === "zh" ? zhCopy : enCopy
  const deviceID = session?.connector_device_id || ""
  const workspacePath = session?.connector_workspace_path || ""

  return <section className="w-full rounded-md border border-border bg-card p-3 text-card-foreground shadow-sm">
    <div className="flex items-center gap-2 text-sm font-semibold"><Monitor size={16} className="text-muted-foreground" />{copy.environment}</div>
    <div className="relative mt-3 rounded-md border border-border">
      <Popover open={picker === "device"} onOpenChange={(open) => setPicker(open ? "device" : null)}>
        <PopoverTrigger asChild>
          <button type="button" className="flex min-h-12 w-full items-center gap-2 px-3 text-left hover:bg-muted/50">
            <Monitor size={16} className="shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1"><span className="block text-xs text-muted-foreground">{copy.executionEnvironment}</span><span className="block truncate text-sm font-medium">{device?.name || copy.noDevice}</span></span>
            <ChevronRight size={16} className="shrink-0 text-muted-foreground" />
          </button>
        </PopoverTrigger>
        <PopoverContent side="left" align="start" className="w-72 max-w-[calc(100vw-2rem)] p-2">
          <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">{copy.selectDevice}</div>
          <button type="button" className={cn("flex min-h-10 w-full items-center justify-between rounded px-2 text-left text-sm hover:bg-muted", !deviceID && "bg-primary/10 text-primary")} onClick={() => { setDevice(""); setPicker(null) }}>
            <span>{copy.noDevice}</span>{!deviceID && <Check size={14} />}
          </button>
          {devices.length === 0 ? <div className="px-2 py-3 text-center text-xs text-muted-foreground">{copy.noDevices}</div> : devices.map((item) => <button key={item.id} type="button" className={cn("flex min-h-11 w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-muted", item.id === deviceID && "bg-primary/10 text-primary")} onClick={() => { setDevice(item.id); setPicker(null) }}>
            <span className="min-w-0 truncate font-medium">{item.name}</span><span className={cn("shrink-0 text-[11px]", item.online ? "text-primary" : "text-muted-foreground")}>{item.online ? copy.online : copy.offline}</span>
          </button>)}
        </PopoverContent>
      </Popover>
      <Popover open={picker === "workspace"} onOpenChange={(open) => setPicker(open ? "workspace" : null)}>
        <PopoverTrigger asChild>
          <button type="button" className="flex min-h-12 w-full items-center gap-2 border-t border-border/70 px-3 text-left hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-50" disabled={!deviceID}>
            <Folder size={16} className="shrink-0 text-primary" />
            <span className="min-w-0 flex-1"><span className="block text-xs text-muted-foreground">{copy.runDirectory}</span><span className="block truncate font-mono text-xs">{workspacePath || copy.noWorkspacePath}</span></span>
            <ChevronRight size={16} className="shrink-0 text-muted-foreground" />
          </button>
        </PopoverTrigger>
        <PopoverContent side="left" align="start" className="w-72 max-w-[calc(100vw-2rem)] p-2">
          <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">{copy.runDirectory}</div>
          {recentWorkspacePaths.length === 0 ? <div className="px-2 py-4 text-center text-sm text-muted-foreground">{copy.noWorkspaces}</div> : recentWorkspacePaths.map((path) => <button key={path} type="button" className={cn("flex min-h-10 w-full items-center rounded px-2 text-left text-sm hover:bg-muted", path === workspacePath && "bg-primary/10 text-primary")} onClick={() => { setWorkspacePath(path); setPicker(null) }}>
            <span className="truncate font-mono text-xs">{path}</span>
          </button>)}
          <div className="mt-1 border-t border-border/70 pt-1">
            <button type="button" className="flex h-9 w-full items-center gap-2 rounded px-2 text-left text-sm hover:bg-muted" onClick={() => { setPicker(null); openWorkspacePicker() }}><Folder size={15} />{copy.selectWorkspace}</button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  </section>
}

function Environment(props: Record<string, unknown>) {
  const data = props as ChatSlotData
  return <EnvironmentPanel key={`${data.session?.id}:${data.device?.id}`} {...data} />
}

export default function apply(ctx: DashboardContext) {
  ctx.slot("chat.sidebar.panels", Environment, "chat-environment.panel", 10, "/chat")
}

const zhCopy = { environment: "环境信息", executionEnvironment: "执行环境", runDirectory: "运行目录", selectDevice: "选择设备", noDevice: "未选择设备", noWorkspacePath: "未选择运行目录", noDevices: "暂无设备", online: "在线", offline: "离线", noWorkspaces: "暂无最近工作区", selectWorkspace: "选择工作区" }
const enCopy: typeof zhCopy = { environment: "Environment", executionEnvironment: "Execution environment", runDirectory: "Run directory", selectDevice: "Select device", noDevice: "No device selected", noWorkspacePath: "No run directory selected", noDevices: "No devices", online: "Online", offline: "Offline", noWorkspaces: "No recent workspaces", selectWorkspace: "Select workspace" }
