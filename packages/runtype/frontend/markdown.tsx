// A small Markdown renderer for plans.
//
// The chat page has a full one, but it lives inside that page and is not shared;
// a plan only ever uses headings, lists, code fences, quotes and tables, so a
// focused subset is enough — and it keeps this bundle free of the chat page's
// tree. Anything unrecognized falls through as a paragraph, which is what the
// original text looked like anyway.
import { Fragment, memo, useMemo, type ReactNode } from "react"

type Align = "left" | "center" | "right"

type Block =
  | { kind: "code"; language: string; text: string }
  | { kind: "heading"; level: number; text: string }
  | { kind: "quote"; text: string }
  | { kind: "list"; ordered: boolean; items: string[] }
  | { kind: "table"; headers: string[]; aligns: Align[]; rows: string[][] }
  | { kind: "rule" }
  | { kind: "paragraph"; text: string }

const fence = /^\s*```(\S*)\s*$/
const heading = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/
const rule = /^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/
const bullet = /^\s{0,3}([-*+]|\d+[.)])\s+(.*)$/
const tableRow = /^\s*\|?(.*)\|\s*$/

function splitRow(line: string): string[] {
  return tableRow
    .exec(line)?.[1]
    .split("|")
    .map((cell) => cell.trim()) ?? []
}

function alignmentOf(cell: string): Align {
  if (/^:-+:$/.test(cell)) return "center"
  if (/^-+:$/.test(cell)) return "right"
  return "left"
}

function isTableSeparator(line: string) {
  const cells = splitRow(line)
  return cells.length > 0 && cells.every((cell) => /^:?-{2,}:?$/.test(cell))
}

export function parseMarkdown(source: string): Block[] {
  const lines = source.replace(/\r\n?/g, "\n").split("\n")
  const blocks: Block[] = []
  let paragraph: string[] = []
  const flush = () => {
    if (!paragraph.length) return
    blocks.push({ kind: "paragraph", text: paragraph.join("\n").trim() })
    paragraph = []
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    if (!line.trim()) {
      flush()
      continue
    }
    const code = fence.exec(line)
    if (code) {
      flush()
      const body: string[] = []
      index += 1
      while (index < lines.length && !fence.test(lines[index])) {
        body.push(lines[index])
        index += 1
      }
      blocks.push({ kind: "code", language: code[1] || "", text: body.join("\n") })
      continue
    }
    const title = heading.exec(line)
    if (title) {
      flush()
      blocks.push({ kind: "heading", level: title[1].length, text: title[2] })
      continue
    }
    if (rule.test(line)) {
      flush()
      blocks.push({ kind: "rule" })
      continue
    }
    if (/^\s{0,3}>/.test(line)) {
      flush()
      const quote: string[] = []
      while (index < lines.length && /^\s{0,3}>/.test(lines[index])) {
        quote.push(lines[index].replace(/^\s{0,3}>\s?/, ""))
        index += 1
      }
      index -= 1
      blocks.push({ kind: "quote", text: quote.join("\n").trim() })
      continue
    }
    if (line.includes("|") && index + 1 < lines.length && isTableSeparator(lines[index + 1])) {
      flush()
      const headers = splitRow(line)
      const aligns = splitRow(lines[index + 1]).map(alignmentOf)
      const rows: string[][] = []
      index += 2
      while (index < lines.length && lines[index].includes("|") && lines[index].trim()) {
        rows.push(splitRow(lines[index]))
        index += 1
      }
      index -= 1
      blocks.push({ kind: "table", headers, aligns, rows })
      continue
    }
    const item = bullet.exec(line)
    if (item) {
      flush()
      const ordered = /\d/.test(item[1])
      const items: string[] = [item[2]]
      while (index + 1 < lines.length) {
        const next = bullet.exec(lines[index + 1])
        if (!next || /\d/.test(next[1]) !== ordered) break
        items.push(next[2])
        index += 1
      }
      blocks.push({ kind: "list", ordered, items })
      continue
    }
    paragraph.push(line)
  }
  flush()
  return blocks
}

const inlinePattern = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|~~[^~]+~~|\[[^\]]+\]\([^)\s]+\))/g

function inline(text: string, keyPrefix: string): ReactNode[] {
  const parts = text.split(inlinePattern).filter((part) => part !== "")
  return parts.map((part, index) => {
    const key = `${keyPrefix}:${index}`
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2)
      return <code key={key} className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]">{part.slice(1, -1)}</code>
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4)
      return <strong key={key} className="font-semibold">{inline(part.slice(2, -2), key)}</strong>
    if (part.startsWith("~~") && part.endsWith("~~") && part.length > 4)
      return <del key={key} className="opacity-70">{inline(part.slice(2, -2), key)}</del>
    if (part.startsWith("*") && part.endsWith("*") && part.length > 2)
      return <em key={key}>{inline(part.slice(1, -1), key)}</em>
    const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(part)
    if (link)
      return <a key={key} href={link[2]} target="_blank" rel="noreferrer noopener" className="text-primary underline underline-offset-4">{inline(link[1], key)}</a>
    return <Fragment key={key}>{part}</Fragment>
  })
}

const headingClass = ["text-lg font-semibold", "text-base font-semibold", "text-sm font-semibold", "text-sm font-medium", "text-sm font-medium", "text-sm font-medium"]
const alignClass: Record<Align, string> = { left: "text-left", center: "text-center", right: "text-right" }

function MarkdownImpl({ text }: { text: string }) {
  const blocks = useMemo(() => parseMarkdown(text), [text])
  return (
    <div className="space-y-2 break-words text-sm leading-6">
      {blocks.map((block, index) => {
        const key = `b${index}`
        switch (block.kind) {
          case "code":
            return (
              <pre key={key} className="overflow-x-auto rounded-md border bg-muted/50 p-3 font-mono text-xs leading-5">
                <code>{block.text}</code>
              </pre>
            )
          case "heading": {
            const size = headingClass[Math.min(block.level, 6) - 1]
            return <div key={key} className={size}>{inline(block.text, key)}</div>
          }
          case "quote":
            return (
              <blockquote key={key} className="border-l-2 border-border pl-3 text-muted-foreground">
                {inline(block.text, key)}
              </blockquote>
            )
          case "list": {
            const items = block.items.map((item, itemIndex) => <li key={`${key}:${itemIndex}`}>{inline(item, `${key}:${itemIndex}`)}</li>)
            return block.ordered
              ? <ol key={key} className="list-decimal space-y-1 pl-5">{items}</ol>
              : <ul key={key} className="list-disc space-y-1 pl-5">{items}</ul>
          }
          case "table":
            return (
              <div key={key} className="overflow-x-auto">
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr>
                      {block.headers.map((header, cellIndex) => (
                        <th key={`${key}:h${cellIndex}`} className={`border-b px-2 py-1.5 font-medium ${alignClass[block.aligns[cellIndex] ?? "left"]}`}>
                          {inline(header, `${key}:h${cellIndex}`)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {block.rows.map((row, rowIndex) => (
                      <tr key={`${key}:r${rowIndex}`}>
                        {row.map((cell, cellIndex) => (
                          <td key={`${key}:r${rowIndex}:${cellIndex}`} className={`border-b border-border/50 px-2 py-1.5 align-top ${alignClass[block.aligns[cellIndex] ?? "left"]}`}>
                            {inline(cell, `${key}:r${rowIndex}:${cellIndex}`)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          case "rule":
            return <hr key={key} className="border-border" />
          default:
            return <p key={key} className="whitespace-pre-wrap">{inline(block.text, key)}</p>
        }
      })}
    </div>
  )
}

/** Plans are static while a dialog is open; re-parsing them on every frame is waste. */
export const Markdown = memo(MarkdownImpl)
