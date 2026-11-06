import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import type { RefObject } from "react"
import { createPortal } from "react-dom"
import { cn } from "@/lib/utils"

/**
 * Read-only view of the messages the rail navigates. The chat page passes its
 * own message rows here, so this file stays free of the page's private types.
 */
export interface ConversationHistoryMessage {
  id: string
  role: "user" | "assistant"
  content?: string
  created_at?: string
  records?: ReadonlyArray<{ kind?: string; content?: string; tool_call?: { name?: string } }>
  tool_calls?: ReadonlyArray<{ name?: string; status?: string }>
}

interface ConversationHistoryRailProps {
  messages: ConversationHistoryMessage[]
  viewportRef: RefObject<HTMLDivElement | null>
  language: string
  className?: string
}

const railCopy = {
  zh: {
    label: "会话历史",
    user: "你",
    assistant: "助手",
    empty: "这条消息没有文本内容",
    jump: (index: number, total: number) => `跳转到第 ${index} 个问题（共 ${total} 个）`,
  },
  ja: {
    label: "会話履歴",
    user: "あなた",
    assistant: "アシスタント",
    empty: "このメッセージにはテキストがありません",
    jump: (index: number, total: number) => `${index} 番目の質問へ移動（全 ${total} 件）`,
  },
  en: {
    label: "Conversation history",
    user: "You",
    assistant: "Assistant",
    empty: "This message has no text",
    jump: (index: number, total: number) => `Jump to question ${index} of ${total}`,
  },
} as const

type RailCopy = (typeof railCopy)[keyof typeof railCopy]

function copyFor(language: string): RailCopy {
  return language === "zh" ? railCopy.zh : language === "ja" ? railCopy.ja : railCopy.en
}

/** Markdown-ish source text, flattened enough to read in a small card. */
function messagePreviewText(message: ConversationHistoryMessage): string {
  const chunks: string[] = []
  for (const record of message.records || []) {
    if (record?.kind === "text" && typeof record.content === "string" && record.content.trim()) {
      chunks.push(record.content)
    }
  }
  if (chunks.length === 0 && typeof message.content === "string" && message.content.trim()) {
    chunks.push(message.content)
  }
  if (chunks.length === 0) {
    for (const call of message.tool_calls || []) {
      if (call?.name) {
        chunks.push(`⚙ ${call.name}`)
      }
    }
  }
  return chunks
    .join("\n\n")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

function formatMessageTime(value: string | undefined, language: string): string {
  if (!value) {
    return ""
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return ""
  }
  const locale = language === "zh" ? "zh-CN" : language === "ja" ? "ja-JP" : "en-US"
  return date.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })
}

interface PreviewState {
  index: number
  right: number
  centerY: number
}

/**
 * The compact history navigator shown at the right edge of the conversation.
 *
 * Only the user's questions get a tick — the answers are usually too tall to
 * be useful landmarks. Hovering (or focusing) a tick opens a preview of the
 * question, and clicking scrolls the viewport to it. The tick for the question
 * currently at the top of the viewport stays lit, so the rail doubles as a
 * scroll position indicator.
 */
export function ConversationHistoryRail({ messages, viewportRef, language, className }: ConversationHistoryRailProps) {
  const copy = useMemo(() => copyFor(language), [language])
  const railRef = useRef<HTMLDivElement | null>(null)
  const previewRef = useRef<HTMLDivElement | null>(null)
  const messagesRef = useRef(messages)
  messagesRef.current = messages
  const userMessages = useMemo(() => messages.filter((message) => message.role === "user"), [messages])
  const userMessagesRef = useRef(userMessages)
  userMessagesRef.current = userMessages
  const [activeIndex, setActiveIndex] = useState(-1)
  const [preview, setPreview] = useState<PreviewState | null>(null)
  const [previewTop, setPreviewTop] = useState(0)

  const showPreview = useCallback((index: number, element: HTMLElement) => {
    if (!userMessagesRef.current[index]) {
      return
    }
    const rect = element.getBoundingClientRect()
    const railRect = railRef.current?.getBoundingClientRect()
    const centerY = rect.top + rect.height / 2
    setPreview({ index, right: Math.max(12, window.innerWidth - (railRect?.left ?? rect.left) + 10), centerY })
    // First paint before the card has been measured; the layout effect below
    // centres it once its real height is known.
    setPreviewTop(Math.max(8, centerY - 120))
  }, [])

  const hidePreview = useCallback(() => setPreview(null), [])

  // Measure and clamp the preview card so it never leaves the window, even
  // when the hovered tick sits near the top or bottom edge of the rail.
  useLayoutEffect(() => {
    if (!preview) {
      return
    }
    const node = previewRef.current
    if (!node) {
      return
    }
    const height = node.offsetHeight
    const maxTop = Math.max(8, window.innerHeight - height - 8)
    const top = Math.min(Math.max(8, preview.centerY - height / 2), maxTop)
    setPreviewTop((current) => (Math.abs(current - top) < 1 ? current : top))
  }, [preview])

  // Keep the highlighted tick in sync with the viewport. The scroll listener is
  // rAF-throttled because message content can be tall and this runs on every
  // wheel tick during a stream.
  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) {
      return
    }
    let frame = 0
    const update = () => {
      frame = 0
      const nodes = Array.from(viewport.querySelectorAll<HTMLElement>("[data-message-id]"))
      if (nodes.length === 0) {
        setActiveIndex(-1)
        return
      }
      const allMessages = messagesRef.current
      const byID = new Map(allMessages.map((message, index) => [message.id, index] as const))
      const viewportTop = viewport.getBoundingClientRect().top
      let next = -1
      let first: number | null = null
      for (const node of nodes) {
        const index = byID.get(node.dataset.messageId || "")
        if (index === undefined) {
          continue
        }
        if (first === null) {
          first = index
        }
        if (node.getBoundingClientRect().top <= viewportTop + 32) {
          next = index
        } else {
          break
        }
      }
      // The rail indexes questions, so find the last question at or above the
      // first visible message in the full conversation.
      const topMessage = next < 0 ? first ?? 0 : next
      let active = -1
      for (let index = 0; index <= topMessage && index < allMessages.length; index += 1) {
        if (allMessages[index].role === "user") {
          active += 1
        }
      }
      setActiveIndex(Math.max(active, 0))
    }
    const schedule = () => {
      if (!frame) {
        frame = requestAnimationFrame(update)
      }
    }
    update()
    viewport.addEventListener("scroll", schedule, { passive: true })
    const observer = new ResizeObserver(schedule)
    observer.observe(viewport)
    return () => {
      viewport.removeEventListener("scroll", schedule)
      observer.disconnect()
      if (frame) {
        cancelAnimationFrame(frame)
      }
    }
  }, [viewportRef, messages.length, messages[0]?.id, userMessages.length])

  // A preview anchored to a tick would dangle in the wrong place as soon as
  // the conversation scrolls, so dismiss it on scroll and resize.
  useEffect(() => {
    if (!preview) {
      return
    }
    const viewport = viewportRef.current
    const hide = () => setPreview(null)
    window.addEventListener("resize", hide)
    viewport?.addEventListener("scroll", hide, { passive: true })
    return () => {
      window.removeEventListener("resize", hide)
      viewport?.removeEventListener("scroll", hide)
    }
  }, [preview, viewportRef])

  // The rail sits on top of the conversation, so a wheel over it would have
  // nothing to scroll. Hand those events to the message viewport instead —
  // unless the rail itself has more ticks than fit and needs to scroll.
  useEffect(() => {
    const rail = railRef.current
    const viewport = viewportRef.current
    const list = rail?.firstElementChild as HTMLElement | null
    if (!rail || !viewport || !list) {
      return
    }
    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey) {
        return
      }
      if (list.scrollHeight > list.clientHeight + 1) {
        return
      }
      event.preventDefault()
      viewport.scrollTop += event.deltaY
    }
    rail.addEventListener("wheel", onWheel, { passive: false })
    return () => rail.removeEventListener("wheel", onWheel)
  }, [viewportRef, messages.length])

  const jumpTo = useCallback((index: number) => {
    const viewport = viewportRef.current
    const message = userMessagesRef.current[index]
    if (!viewport || !message) {
      return
    }
    const nodes = Array.from(viewport.querySelectorAll<HTMLElement>("[data-message-id]"))
    const order = new Map(userMessagesRef.current.map((item, position) => [item.id, position] as const))
    let target = nodes.find((node) => node.dataset.messageId === message.id)
    if (!target) {
      // Empty questions have no row of their own; land on the next rendered one.
      target = nodes.find((node) => (order.get(node.dataset.messageId || "") ?? -1) > index)
    }
    setPreview(null)
    if (!target) {
      viewport.scrollTo({ top: viewport.scrollHeight, behavior: "smooth" })
      return
    }
    const viewportTop = viewport.getBoundingClientRect().top
    const top = viewport.scrollTop + target.getBoundingClientRect().top - viewportTop - 16
    viewport.scrollTo({ top: Math.max(0, top), behavior: "smooth" })
    setActiveIndex(index)
  }, [viewportRef])

  if (userMessages.length < 2) {
    return null
  }

  const previewMessage = preview ? userMessages[preview.index] : undefined
  const previewText = previewMessage ? messagePreviewText(previewMessage) : ""

  return (
    <>
      <div
        ref={railRef}
        role="navigation"
        aria-label={copy.label}
        className={cn(
          "pointer-events-none absolute inset-y-0 right-0 z-20 hidden select-none items-center justify-center lg:flex",
          className
        )}
      >
        <div className="pointer-events-auto flex h-full max-h-full flex-col items-end justify-center gap-1 overflow-y-auto py-4 pr-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {userMessages.map((message, index) => {
            const active = index === activeIndex
            const shown = index === preview?.index
            return (
              <button
                key={message.id}
                type="button"
                className="group flex max-h-6 min-h-2.5 w-8 flex-1 cursor-pointer items-center justify-end rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={copy.jump(index + 1, userMessages.length)}
                aria-current={active ? "true" : undefined}
                onClick={() => jumpTo(index)}
                onPointerEnter={(event) => {
                  if (event.pointerType === "mouse" || !event.pointerType) {
                    showPreview(index, event.currentTarget)
                  }
                }}
                onPointerLeave={hidePreview}
                onFocus={(event) => showPreview(index, event.currentTarget)}
                onBlur={hidePreview}
              >
                <span
                  className={cn(
                    "block h-[2px] rounded-full transition-all duration-150",
                    active || shown
                      ? "w-6 bg-foreground"
                      : "w-3.5 bg-muted-foreground/45 group-hover:bg-foreground/70 group-focus-visible:bg-foreground"
                  )}
                />
              </button>
            )
          })}
        </div>
      </div>
      {preview && previewMessage
        ? createPortal(
            <div
              ref={previewRef}
              style={{ top: previewTop, right: preview.right }}
              className="pointer-events-none fixed z-50 w-[22rem] max-w-[calc(100vw-5rem)] rounded-xl border border-border bg-popover/95 px-3.5 py-3 text-popover-foreground shadow-xl ring-1 ring-black/5 backdrop-blur-sm"
            >
              <div className="mb-1.5 flex items-center gap-2 text-[11px] font-medium text-muted-foreground">
                <span
                  className={cn(
                    "inline-flex h-4 items-center rounded px-1.5",
                    previewMessage.role === "user" ? "bg-muted text-foreground" : "bg-primary/10 text-primary"
                  )}
                >
                  {previewMessage.role === "user" ? copy.user : copy.assistant}
                </span>
                <span className="tabular-nums">
                  {preview.index + 1}/{userMessages.length}
                </span>
                <span className="ml-auto tabular-nums">{formatMessageTime(previewMessage.created_at, language)}</span>
              </div>
              <p className="line-clamp-8 whitespace-pre-wrap break-words text-sm leading-relaxed text-muted-foreground">
                {previewText || copy.empty}
              </p>
            </div>,
            document.body
          )
        : null}
    </>
  )
}
