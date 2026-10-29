import { Context, Session } from "yumeri"
import "@velocelab/dashboard"
import "@velocelab/sidebar"
import "@velocelab/connector"
import type { ConnectorService } from "@velocelab/connector"

export const depend = ["dashboard", "sidebar", "connector"]
export const provide = ["explorer"]

export function apply(ctx: Context) {
  ctx.component.dashboard.addEntry({ dev: new URL("../frontend/index.tsx", import.meta.url).pathname, prod: new URL("./frontend/explorer.js", import.meta.url).pathname, plugin: "explorer" })
  const connector = ctx.component.connector as ConnectorService
  const uid = (session: Session) => Number((session.properties.user as { id?: number } | undefined)?.id || 0)
  const body = async (session: Session) => await session.parseRequestBody() as Record<string, unknown>
  const respond = async (session: Session, action: () => Promise<unknown>) => {
    try {
      session.respond(await action(), "json")
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      session.status = /outside the workspace|unsupported open action|absolute workspace and path|required/i.test(message) ? 400 : /permission denied/i.test(message) ? 403 : 500
      session.respond({ error: message }, "json")
    }
  }
  const input = (value: Record<string, unknown>) => {
    const root = String(value.workspace_path ?? "").trim()
    const target = String(value.path ?? root).trim()
    if (!root || !target) throw Error("A workspace and path are required")
    return { device_id: String(value.device_id ?? ""), workspace_path: root, path: target }
  }
  ctx.route("/api/explorer/list").methods("GET").action(async (session: Session, query: URLSearchParams) => respond(session, () => connector.execute(uid(session), "list_directory", input({ device_id: query.get("device_id"), workspace_path: query.get("workspace_path"), path: query.get("path") }))))
  ctx.route("/api/explorer/read").methods("GET").action(async (session: Session, query: URLSearchParams) => respond(session, () => connector.execute(uid(session), "read_file", input({ device_id: query.get("device_id"), workspace_path: query.get("workspace_path"), path: query.get("path") }))))
  ctx.route("/api/explorer/write").methods("POST").action(async (session: Session) => respond(session, async () => { const value = await body(session); return connector.execute(uid(session), "write_file", { ...input(value), content: String(value.content ?? "") }) }))
  ctx.route("/api/explorer/open").methods("POST").action(async (session: Session) => respond(session, async () => { const value = await body(session); const action = ["open_file_manager", "open_terminal", "open_vscode"].includes(String(value.action)) ? String(value.action) : ""; if (!action) throw Error("Unsupported open action"); return connector.execute(uid(session), action, input(value)) }))
}
