import { randomUUID } from "node:crypto"
import { Context, Database, Session } from "yumeri"
import "@velocelab/dashboard"
import "@velocelab/sidebar"

declare module "@yumerijs/types" {
  interface Tables { browser_tabs: Record<string, unknown> }
}

export const depend = ["database", "dashboard", "sidebar"]
export const provide = ["browser"]

interface BrowserRecord { id: string; user_id: number; title: string; url: string; history: string; history_index: number; created_at: string; updated_at: string }
const safeUrl = (input: unknown) => {
  const value = String(input ?? "").trim()
  if (value === "about:blank") return value
  if (!value) return "https://www.google.com"
  const candidate = /^[a-z][a-z\d+.-]*:/i.test(value) ? value : `https://${value.includes(" ") ? `www.google.com/search?q=${encodeURIComponent(value)}` : value}`
  const url = new URL(candidate)
  if (!["http:", "https:"].includes(url.protocol)) throw Error("Only HTTP and HTTPS pages can be opened")
  return url.href
}

export async function apply(ctx: Context) {
  const db = ctx.component.database as Database
  await db.extend("browser_tabs", {
    id: { type: "string", nullable: false }, user_id: { type: "integer", nullable: false },
    title: { type: "string", nullable: false }, url: { type: "text", nullable: false },
    history: { type: "text", nullable: false }, history_index: { type: "integer", initial: 0 },
    created_at: "timestamp", updated_at: "timestamp",
  })
  ctx.component.dashboard.addEntry({ dev: new URL("../frontend/index.tsx", import.meta.url).pathname, prod: new URL("./frontend/browser.js", import.meta.url).pathname, plugin: "browser" })

  const uid = (session: Session) => Number((session.properties.user as { id?: number } | undefined)?.id || 0)
  const owned = async (userId: number, id: string) => await db.selectOne("browser_tabs", { id, user_id: userId }) as BrowserRecord | undefined
  ctx.route("/api/browser/tabs").methods("GET").action(async (session) => {
    const userId = uid(session)
    if (!userId) return
    session.respond(await db.select("browser_tabs", { user_id: userId }), "json")
  })
  ctx.route("/api/browser/tabs").methods("POST").action(async (session) => {
    const userId = uid(session)
    if (!userId) return
    try {
      const input = await session.parseRequestBody() as Record<string, unknown>
      const url = safeUrl(input.url || "about:blank")
      const now = new Date().toISOString()
      const record = await db.create("browser_tabs", { id: randomUUID(), user_id: userId, title: String(input.title || "新标签页"), url, history: JSON.stringify([url]), history_index: 0, created_at: now, updated_at: now })
      session.status = 201
      session.respond(record, "json")
    } catch (error) { session.status = 400; session.respond({ error: error instanceof Error ? error.message : String(error) }, "json") }
  })
  ctx.route("/api/browser/tabs/:id").methods("GET").action(async (session, _query, id) => {
    const userId = uid(session)
    if (!userId) return
    const record = await owned(userId, id)
    if (!record) { session.status = 404; session.respond({ error: "Browser tab not found" }, "json"); return }
    session.respond(record, "json")
  })
  ctx.route("/api/browser/tabs/:id").methods("PUT").action(async (session, _query, id) => {
    const userId = uid(session)
    if (!userId) return
    try {
      const record = await owned(userId, id)
      if (!record) { session.status = 404; session.respond({ error: "Browser tab not found" }, "json"); return }
      const input = await session.parseRequestBody() as Record<string, unknown>
      const history = JSON.parse(String(record.history || "[]")) as string[]
      let index = Math.max(0, Math.min(history.length - 1, Number(record.history_index) || 0))
      if (typeof input.navigate === "string") {
        const url = safeUrl(input.navigate)
        history.splice(index + 1)
        history.push(url)
        index = history.length - 1
      } else if (input.step === "back") index = Math.max(0, index - 1)
      else if (input.step === "forward") index = Math.min(history.length - 1, index + 1)
      else if (input.reload === true) { /* The current page remains the history target. */ }
      const url = history[index] || safeUrl(input.url)
      await db.update("browser_tabs", { id, user_id: userId }, { url, history: JSON.stringify(history), history_index: index, title: String(input.title || record.title), updated_at: new Date().toISOString() })
      session.respond(await owned(userId, id), "json")
    } catch (error) { session.status = 400; session.respond({ error: error instanceof Error ? error.message : String(error) }, "json") }
  })
  ctx.route("/api/browser/tabs/:id").methods("DELETE").action(async (session, _query, id) => {
    const userId = uid(session)
    if (!userId) return
    await db.remove("browser_tabs", { id, user_id: userId })
    session.status = 204
    session.respond("", "plain")
  })
}
