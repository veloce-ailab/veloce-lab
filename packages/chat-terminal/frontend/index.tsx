import { useState } from "react"
import { TerminalSquare } from "lucide-react"
import { Button, useI18n, type DashboardContext } from "@velocelab/dashboard/frontend"
import { ConnectorTerminalWindow, type ConnectorTerminalCopy } from "./ConnectorTerminalWindow"
import type { ChatSlotData } from "@velocelab/advanced-chat/frontend/slots"

function TerminalPanel(props: Record<string, unknown>) {
  const { device, session } = props as ChatSlotData
  const { language } = useI18n()
  const copy = language === "zh" ? zhConnectorTerminalCopy : enConnectorTerminalCopy
  const [mode, setMode] = useState<"closed" | "inline" | "window">("closed")
  return <section className="rounded-md border border-border bg-card p-3 shadow-sm">
    <div className="mb-2 flex items-center gap-2 text-sm font-semibold"><TerminalSquare size={16} />{copy.title}</div>
    <div className="flex gap-2">
      <Button variant="outline" size="sm" className="min-w-0 flex-1" disabled={!device?.online} title={device?.online ? copy.openTerminal : copy.deviceRequired} onClick={() => setMode(mode === "inline" ? "closed" : "inline")}>{mode === "inline" ? copy.close : copy.openTerminal}</Button>
      <Button variant="outline" size="sm" disabled={!device?.online} onClick={() => setMode(mode === "window" ? "closed" : "window")}>{language === "zh" ? "独立窗口" : "Window"}</Button>
    </div>
    {mode !== "closed" && device && <div className="mt-2"><ConnectorTerminalWindow key={`${device.id}:${session?.connector_workspace_path}:${mode}`} inline={mode === "inline"} deviceID={device.id} deviceName={device.name} deviceOS={device.os} workspacePath={session?.connector_workspace_path || ""} copy={copy} onClose={() => setMode("closed")} /></div>}
  </section>
}

function Terminal(props: Record<string, unknown>) {
  const data = props as ChatSlotData
  return <TerminalPanel key={`${data.session?.id}:${data.device?.id}:${data.session?.connector_workspace_path}`} {...data} />
}

function TerminalTabType(props: Record<string, unknown>) {
  const { onCreateTab } = props as { onCreateTab?: (type: string, label: string) => void }
  const { language } = useI18n()
  return <button type="button" className="flex w-full items-center gap-2 rounded-md border border-border bg-card p-3 text-left text-sm font-medium hover:bg-muted" onClick={() => onCreateTab?.("terminal", language === "zh" ? "终端" : "Terminal")}><TerminalSquare size={16} />{language === "zh" ? "终端" : "Terminal"}</button>
}

function TerminalTabContent(props: Record<string, unknown>) {
  const tabs = props.tabs as Array<{ id: string; type: string }> | undefined
  const activeID = String(props.activeTab ?? "")
  const data = props as ChatSlotData
  if (!data.device?.online) return <div className="rounded-md border border-border bg-card p-4 text-sm text-muted-foreground">{(data as any).language === "zh" ? "请先选择一台在线设备。" : "Select an online device first."}</div>
  return <>{tabs?.filter((tab) => tab.type === "terminal").map((tab) => <div key={tab.id} className={tab.id === activeID ? "flex min-h-0 flex-1 flex-col" : "hidden"}><ConnectorTerminalWindow key={tab.id} inline deviceID={data.device.id} deviceName={data.device.name} deviceOS={data.device.os} workspacePath={data.session?.connector_workspace_path || ""} copy={data.language === "zh" ? zhConnectorTerminalCopy : enConnectorTerminalCopy} onClose={() => data.onCloseTab?.(tab.id)} /></div>)}</>
}

export default function apply(ctx: DashboardContext) {
  ctx.slot("chat.sidebar.panels", Terminal, "chat-terminal.panel", 30, "/chat")
  ctx.slot("chat.sidebar.tab-types", TerminalTabType, "chat-terminal.tab-type", 30, "/chat")
  ctx.slot("chat.sidebar.tab-content", TerminalTabContent, "chat-terminal.tab-content", 30, "/chat")
}

const zhConnectorTerminalCopy: ConnectorTerminalCopy & { openTerminal: string; deviceRequired: string } = {
  openTerminal: "打开终端",
  deviceRequired: "请先选择一台在线设备。",
  title: "终端",
  connecting: "正在连接设备终端…",
  connectFailed: "无法打开设备终端",
  disconnected: "终端已断开",
  inputPlaceholder: "输入命令后回车执行",
  inputPlaceholderClosed: "终端不可用",
  maximize: "最大化",
  restore: "还原",
  close: "关闭",
  restart: "重启终端",
  clear: "清屏",
  truncatedNotice: "较早的输出已被截断",
  exitedWithCode: "终端已退出（退出码 {code}）",
}

const enConnectorTerminalCopy: typeof zhConnectorTerminalCopy = {
  openTerminal: "Open terminal",
  deviceRequired: "Select an online device first.",
  title: "Terminal",
  connecting: "Connecting to the device terminal…",
  connectFailed: "Failed to open the device terminal",
  disconnected: "Terminal disconnected",
  inputPlaceholder: "Type a command and press Enter",
  inputPlaceholderClosed: "Terminal unavailable",
  maximize: "Maximize",
  restore: "Restore",
  close: "Close",
  restart: "Restart terminal",
  clear: "Clear",
  truncatedNotice: "Earlier output was truncated",
  exitedWithCode: "Terminal exited with code {code}",
}
