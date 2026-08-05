import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { PointerEvent as ReactPointerEvent } from "react"
import { createPortal } from "react-dom"
import { Terminal as XTerm } from "@xterm/xterm"
import type { IDisposable } from "@xterm/xterm"
import { FitAddon } from "@xterm/addon-fit"
import "@xterm/xterm/css/xterm.css"
import { Maximize2, Minimize2, RefreshCw, TerminalSquare, X } from "lucide-react"
import api from "@/lib/api"
import { cn } from "@/lib/utils"

export interface ConnectorTerminalCopy {
  title: string
  connecting: string
  connectFailed: string
  disconnected: string
  inputPlaceholder: string
  inputPlaceholderClosed: string
  maximize: string
  restore: string
  close: string
  restart: string
  clear: string
  truncatedNotice: string
  exitedWithCode: string
}

interface ConnectorTerminalWindowProps {
  deviceID: string
  deviceName: string
  deviceOS?: string
  workspacePath?: string
  copy: ConnectorTerminalCopy
  onClose: () => void
}

interface TerminalOpenResponse {
  terminal_id?: unknown
  shell?: unknown
  offset?: unknown
}

interface TerminalReadResponse {
  data?: unknown
  offset?: unknown
  alive?: unknown
  truncated?: unknown
  exit_code?: unknown
  exit_message?: unknown
}

type TerminalStatus = "connecting" | "ready" | "exited" | "error"

const minWidth = 420
const minHeight = 260
const defaultWidth = 720
const defaultHeight = 420
const terminalInputBatchDelay = 12

export function ConnectorTerminalWindow({ deviceID, deviceName, deviceOS, workspacePath, copy, onClose }: ConnectorTerminalWindowProps) {
  const [position, setPosition] = useState(() => initialPosition())
  const [size, setSize] = useState({ width: defaultWidth, height: defaultHeight })
  const [isMaximized, setIsMaximized] = useState(false)
  const [sessionSeq, setSessionSeq] = useState(0)
  const [terminalID, setTerminalID] = useState("")
  const [shell, setShell] = useState("")
  const [status, setStatus] = useState<TerminalStatus>("connecting")
  const [statusDetail, setStatusDetail] = useState("")

  const offsetRef = useRef(0)
  const frameRef = useRef<HTMLDivElement | null>(null)
  const terminalHostRef = useRef<HTMLDivElement | null>(null)
  const terminalRef = useRef<XTerm | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const inputDisposableRef = useRef<IDisposable | null>(null)
  const terminalIDRef = useRef("")
  const inputQueueRef = useRef(Promise.resolve())
  const inputBufferRef = useRef("")
  const inputTimerRef = useRef<number | null>(null)
  const terminalSizeRef = useRef("")
  const statusRef = useRef<TerminalStatus>("connecting")
  const resizeTimerRef = useRef<number | null>(null)
  const dragStateRef = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number } | null>(null)

  const writeTerminal = useCallback((text: string) => {
    if (text) {
      terminalRef.current?.write(text)
    }
  }, [])

  const writeTerminalBytes = useCallback((bytes: Uint8Array) => {
    if (bytes.length > 0) {
      terminalRef.current?.write(bytes)
    }
  }, [])

  const currentTerminalDimensions = useCallback(() => {
    const terminal = terminalRef.current
    const fitAddon = fitAddonRef.current
    if (terminal && fitAddon && terminalHostRef.current?.clientWidth && terminalHostRef.current?.clientHeight) {
      try {
        fitAddon.fit()
      } catch {
        // The xterm character measurer can throw before fonts/layout settle.
      }
      return { cols: terminal.cols, rows: terminal.rows }
    }
    const host = terminalHostRef.current
    if (host) {
      return terminalDimensions(host.clientWidth, host.clientHeight)
    }
    const frame = frameRef.current
    if (frame) {
      return terminalDimensions(frame.clientWidth, Math.max(0, frame.clientHeight - 40))
    }
    return terminalDimensions(defaultWidth, defaultHeight - 40)
  }, [])

  useEffect(() => {
    statusRef.current = status
  }, [status])

  const sendInput = useCallback((data: string) => {
    if (statusRef.current !== "ready" || !data) {
      return
    }
    inputBufferRef.current += data
    if (inputTimerRef.current !== null) {
      return
    }
    inputTimerRef.current = window.setTimeout(() => {
      inputTimerRef.current = null
      const pending = inputBufferRef.current
      inputBufferRef.current = ""
      const id = terminalIDRef.current
      if (!id || statusRef.current !== "ready" || !pending) {
        return
      }
      const encoded = bytesToBase64(new TextEncoder().encode(pending))
      inputQueueRef.current = inputQueueRef.current.then(async () => {
        await api.post("/user/advanced-chat/terminal/input", {
          connector_device_id: deviceID,
          terminal_id: id,
          data: encoded,
        })
      }).catch((err) => {
        writeTerminal(newline("[" + errorMessage(err, copy.disconnected) + "]"))
      })
    }, terminalInputBatchDelay)
  }, [copy.disconnected, deviceID, writeTerminal])

  useEffect(() => {
    const host = terminalHostRef.current
    if (!host) {
      return
    }
    const terminal = new XTerm({
      convertEol: false,
      cursorBlink: true,
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
      fontSize: 12,
      lineHeight: 1.35,
      scrollback: 5000,
      theme: {
        background: "#020817",
        foreground: "#e5e7eb",
        cursor: "#f8fafc",
        selectionBackground: "#334155",
        black: "#0f172a",
        blue: "#60a5fa",
        brightBlack: "#475569",
        brightBlue: "#93c5fd",
        brightCyan: "#67e8f9",
        brightGreen: "#86efac",
        brightMagenta: "#f0abfc",
        brightRed: "#fca5a5",
        brightWhite: "#f8fafc",
        brightYellow: "#fde68a",
        cyan: "#22d3ee",
        green: "#22c55e",
        magenta: "#d946ef",
        red: "#ef4444",
        white: "#e2e8f0",
        yellow: "#eab308",
      },
    })
    const fitAddon = new FitAddon()
    terminalRef.current = terminal
    fitAddonRef.current = fitAddon
    terminal.loadAddon(fitAddon)
    terminal.open(host)
    currentTerminalDimensions()
    window.requestAnimationFrame(() => currentTerminalDimensions())
    inputDisposableRef.current = terminal.onData((data) => sendInput(data))
    return () => {
      if (inputTimerRef.current !== null) {
        window.clearTimeout(inputTimerRef.current)
        inputTimerRef.current = null
      }
      inputBufferRef.current = ""
      inputDisposableRef.current?.dispose()
      inputDisposableRef.current = null
      fitAddon.dispose()
      terminal.dispose()
      if (terminalRef.current === terminal) {
        terminalRef.current = null
      }
      if (fitAddonRef.current === fitAddon) {
        fitAddonRef.current = null
      }
    }
  }, [currentTerminalDimensions, sendInput])

  // The connector keeps one shell process per terminal id, so this window opens
  // exactly one session and closes it again on unmount or restart.
  useEffect(() => {
    let cancelled = false
    const closeRemote = (id: string) => {
      void api.post("/user/advanced-chat/terminal/close", { connector_device_id: deviceID, terminal_id: id })
    }
    const open = async () => {
      setStatus("connecting")
      setStatusDetail("")
      offsetRef.current = 0
      terminalSizeRef.current = ""
      terminalRef.current?.clear()
      try {
        const initialSize = currentTerminalDimensions()
        const res = await api.post("/user/advanced-chat/terminal/open", {
          connector_device_id: deviceID,
          connector_workspace_path: workspacePath || "",
          cols: initialSize.cols,
          rows: initialSize.rows,
        })
        const payload = (res.data || {}) as TerminalOpenResponse
        const id = typeof payload.terminal_id === "string" ? payload.terminal_id : ""
        if (!id) {
          throw new Error(copy.connectFailed)
        }
        if (cancelled) {
          closeRemote(id)
          return
        }
        offsetRef.current = typeof payload.offset === "number" ? payload.offset : 0
        terminalIDRef.current = id
        setTerminalID(id)
        setShell(typeof payload.shell === "string" ? payload.shell : "")
        setStatus("ready")
        terminalRef.current?.focus()
      } catch (err) {
        if (!cancelled) {
          setStatus("error")
          setStatusDetail(errorMessage(err, copy.connectFailed))
        }
      }
    }
    void open()
    return () => {
      cancelled = true
      const id = terminalIDRef.current
      if (id) {
        terminalIDRef.current = ""
        closeRemote(id)
      }
    }
  }, [copy.connectFailed, currentTerminalDimensions, deviceID, sessionSeq, workspacePath])

  // Every read long-polls the connector, so output is drained in a loop instead
  // of on a fixed timer.
  useEffect(() => {
    if (!terminalID || status !== "ready") {
      return
    }
    let cancelled = false
    const drain = async () => {
      while (!cancelled) {
        try {
          const res = await api.get("/user/advanced-chat/terminal/output", {
            params: { connector_device_id: deviceID, terminal_id: terminalID, offset: offsetRef.current },
          })
          if (cancelled) {
            return
          }
          const payload = (res.data || {}) as TerminalReadResponse
          if (payload.truncated === true) {
            writeTerminal(newline("[" + copy.truncatedNotice + "]"))
          }
          if (typeof payload.data === "string") {
            writeTerminalBytes(base64ToBytes(payload.data))
          }
          if (typeof payload.offset === "number") {
            offsetRef.current = payload.offset
          }
          if (payload.alive === false) {
            const detail = typeof payload.exit_message === "string" && payload.exit_message ? payload.exit_message : ""
            const code = typeof payload.exit_code === "number" ? payload.exit_code : undefined
            setStatus("exited")
            setStatusDetail(detail || (code === undefined ? "" : copy.exitedWithCode.replace("{code}", String(code))))
            return
          }
        } catch (err) {
          if (cancelled) {
            return
          }
          setStatus("error")
          setStatusDetail(errorMessage(err, copy.disconnected))
          return
        }
      }
    }
    void drain()
    return () => {
      cancelled = true
    }
  }, [copy.disconnected, copy.exitedWithCode, copy.truncatedNotice, deviceID, status, terminalID, writeTerminal, writeTerminalBytes])

  // Keep the remote pseudo terminal aligned with the visible xterm viewport.
  useEffect(() => {
    const syncSize = () => {
      const { cols, rows } = currentTerminalDimensions()
      terminalRef.current?.resize(cols, rows)
      if (!terminalID || status !== "ready") {
        return
      }
      const signature = terminalID + ":" + cols + ":" + rows
      if (terminalSizeRef.current === signature) {
        return
      }
      terminalSizeRef.current = signature
      void api.post("/user/advanced-chat/terminal/resize", {
        connector_device_id: deviceID,
        terminal_id: terminalID,
        cols,
        rows,
      }).catch(() => {
        // A resize failure does not invalidate the terminal session.
      })
    }
    const scheduleSync = () => {
      if (resizeTimerRef.current !== null) {
        window.clearTimeout(resizeTimerRef.current)
      }
      resizeTimerRef.current = window.setTimeout(syncSize, 80)
    }
    scheduleSync()
    window.addEventListener("resize", scheduleSync)
    return () => {
      window.removeEventListener("resize", scheduleSync)
      if (resizeTimerRef.current !== null) {
        window.clearTimeout(resizeTimerRef.current)
        resizeTimerRef.current = null
      }
    }
  }, [currentTerminalDimensions, deviceID, isMaximized, size.height, size.width, status, terminalID])

  const restartSession = () => {
    terminalRef.current?.clear()
    setTerminalID("")
    setSessionSeq((seq) => seq + 1)
  }

  const handleDragStart = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (isMaximized || event.button !== 0 || (event.target as HTMLElement | null)?.closest("button")) {
      return
    }
    dragStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: position.x,
      originY: position.y,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const handleDragMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragStateRef.current
    if (!drag || drag.pointerId !== event.pointerId) {
      return
    }
    setPosition(clampPosition(
      drag.originX + (event.clientX - drag.startX),
      drag.originY + (event.clientY - drag.startY),
      size.width
    ))
  }

  const handleDragEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragStateRef.current
    if (drag && drag.pointerId === event.pointerId) {
      dragStateRef.current = null
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  const statusText = useMemo(() => {
    switch (status) {
      case "connecting":
        return copy.connecting
      case "exited":
        return statusDetail || copy.disconnected
      case "error":
        return statusDetail || copy.connectFailed
      default:
        return copy.inputPlaceholder
    }
  }, [copy.connectFailed, copy.connecting, copy.disconnected, copy.inputPlaceholder, status, statusDetail])

  const frameStyle = isMaximized
    ? { left: 8, top: 8, width: "calc(100vw - 1rem)", height: "calc(100vh - 1rem)" }
    : { left: position.x, top: position.y, width: size.width, height: size.height }

  if (typeof document === "undefined") {
    return null
  }

  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-[80]" role="dialog" aria-modal={false} aria-label={copy.title + " · " + deviceName}>
      <div ref={frameRef} className="pointer-events-auto absolute flex flex-col overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-2xl" style={frameStyle}>
        <div
          className={cn("flex h-10 shrink-0 items-center gap-2 border-b border-border/80 bg-muted/60 px-3", !isMaximized && "cursor-move")}
          onPointerDown={handleDragStart}
          onPointerMove={handleDragMove}
          onPointerUp={handleDragEnd}
          onPointerCancel={handleDragEnd}
          onDoubleClick={(event) => {
            if (!(event.target as HTMLElement | null)?.closest("button")) {
              setIsMaximized((maximized) => !maximized)
            }
          }}
        >
          <TerminalSquare size={15} className="shrink-0 text-muted-foreground" />
          <div className="flex min-w-0 flex-1 items-baseline gap-1.5 text-xs">
            <span className="truncate font-medium">{deviceName || copy.title}</span>
            {shell && <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{shell}</span>}
            {deviceOS && <span className="shrink-0 text-[11px] text-muted-foreground">{deviceOS}</span>}
          </div>
          <button type="button" className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground" onClick={restartSession} aria-label={copy.restart} title={copy.restart}>
            <RefreshCw size={13} className={status === "connecting" ? "animate-spin" : ""} />
          </button>
          <button type="button" className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground" onClick={() => setIsMaximized((maximized) => !maximized)} aria-label={isMaximized ? copy.restore : copy.maximize} title={isMaximized ? copy.restore : copy.maximize}>
            {isMaximized ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
          </button>
          <button type="button" className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive" onClick={onClose} aria-label={copy.close} title={copy.close}>
            <X size={14} />
          </button>
        </div>

        <div
          ref={terminalHostRef}
          className="min-h-0 min-w-0 flex-1 overflow-hidden bg-[#020817] [&_.xterm]:h-full [&_.xterm]:w-full [&_.xterm-viewport]:overflow-y-auto [&_.xterm-screen]:outline-none"
          onClick={() => terminalRef.current?.focus()}
        />

        <div className="flex shrink-0 items-center justify-between gap-2 border-t border-border/80 bg-muted/40 px-3 py-2">
          <span className={cn("truncate text-xs text-muted-foreground", status === "error" && "text-destructive")}>{statusText}</span>
          <button type="button" className="shrink-0 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground" onClick={() => terminalRef.current?.clear()} title={copy.clear}>
            {copy.clear}
          </button>
        </div>

        {!isMaximized && (
          <ResizeHandle
            onResize={(deltaX, deltaY) => setSize((current) => ({
              width: Math.max(minWidth, Math.min(current.width + deltaX, window.innerWidth - 32)),
              height: Math.max(minHeight, Math.min(current.height + deltaY, window.innerHeight - 32)),
            }))}
          />
        )}
      </div>
    </div>,
    document.body
  )
}

function ResizeHandle({ onResize }: { onResize: (deltaX: number, deltaY: number) => void }) {
  const lastRef = useRef<{ pointerId: number; x: number; y: number } | null>(null)
  return (
    <div
      className="absolute bottom-0 right-0 h-4 w-4 cursor-nwse-resize"
      onPointerDown={(event) => {
        if (event.button !== 0) {
          return
        }
        lastRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY }
        event.currentTarget.setPointerCapture(event.pointerId)
      }}
      onPointerMove={(event) => {
        const last = lastRef.current
        if (!last || last.pointerId !== event.pointerId) {
          return
        }
        onResize(event.clientX - last.x, event.clientY - last.y)
        lastRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY }
      }}
      onPointerUp={(event) => {
        if (lastRef.current?.pointerId === event.pointerId) {
          lastRef.current = null
          event.currentTarget.releasePointerCapture(event.pointerId)
        }
      }}
    />
  )
}

function terminalDimensions(width: number, height: number) {
  return {
    cols: Math.max(20, Math.min(500, Math.floor(Math.max(0, width - 16) / 8.4))),
    rows: Math.max(5, Math.min(200, Math.floor(Math.max(0, height - 16) / 16.2))),
  }
}

function base64ToBytes(encoded: string) {
  const binary = window.atob(encoded)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = ""
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return window.btoa(binary)
}

function newline(text: string) {
  return "\r\n" + text + "\r\n"
}

function initialPosition() {
  if (typeof window === "undefined") {
    return { x: 80, y: 80 }
  }
  return clampPosition(
    Math.max(16, window.innerWidth - defaultWidth - 48),
    Math.max(16, window.innerHeight - defaultHeight - 96),
    defaultWidth
  )
}

function clampPosition(x: number, y: number, width: number) {
  if (typeof window === "undefined") {
    return { x, y }
  }
  return {
    x: Math.max(120 - width, Math.min(x, window.innerWidth - 120)),
    y: Math.max(0, Math.min(y, window.innerHeight - 48)),
  }
}

function errorMessage(err: unknown, fallback: string) {
  if (err && typeof err === "object") {
    const response = (err as { response?: { data?: { error?: unknown; message?: unknown } } }).response
    const detail = response?.data?.error ?? response?.data?.message
    if (typeof detail === "string" && detail.trim()) {
      return detail
    }
  }
  if (err instanceof Error && err.message) {
    return err.message
  }
  return fallback
}
