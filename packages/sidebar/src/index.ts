import { randomUUID } from "node:crypto";
import { Context, Database, Session } from "yumeri";
import "@velocelab/dashboard";
import "@velocelab/database-core";

export const depend = ["dashboard", "database"];
export const provide = ["sidebar"];

declare module "yumeri" { interface Components { sidebar: Record<string, never> } }

declare module "@yumerijs/types" { interface Tables { sidebar_tabs: Record<string, unknown>; sidebar_session_state: Record<string, unknown> } }

export async function apply(ctx: Context) {
  const db = ctx.component.database as Database;
  await db.extend("sidebar_tabs", {
    id: { type: "string", nullable: false }, user_id: { type: "integer", nullable: false },
    session_id: { type: "string", nullable: false }, type: { type: "string", nullable: false },
    label: { type: "string", nullable: false }, state: { type: "text", nullable: false },
    created_at: "timestamp", updated_at: "timestamp",
  });
  await db.extend("sidebar_session_state", {
    id: { type: "string", nullable: false }, user_id: { type: "integer", nullable: false },
    session_id: { type: "string", nullable: false }, active_tab: { type: "string", nullable: false },
    updated_at: "timestamp",
  });
  const userID = (session: Session) => Number((session.properties.user as { id?: number } | undefined)?.id || 0);
  const sessionID = (value: unknown) => String(value ?? "").trim();
  const validRequest = (session: Session, id: unknown) => userID(session) > 0 && Boolean(sessionID(id));
  ctx.route("/api/sidebar/tabs").methods("GET").action(async (session: Session, query: URLSearchParams) => {
    const id = sessionID(query.get("session_id"));
    if (!validRequest(session, id)) { session.status = 400; session.respond({ error: "session_id is required" }, "json"); return; }
    const [rows, current] = await Promise.all([
      db.select("sidebar_tabs", { user_id: userID(session), session_id: id }),
      db.selectOne("sidebar_session_state", { id: `${userID(session)}:${id}`, user_id: userID(session), session_id: id }),
    ]);
    session.respond({ tabs: rows.map((row: any) => ({ ...row, state: parseState(row.state) })), activeTab: (current as any)?.active_tab || "home" }, "json");
  });
  ctx.route("/api/sidebar/tabs").methods("POST").action(async (session: Session) => {
    const input = await session.parseRequestBody() as Record<string, unknown>;
    const id = sessionID(input.session_id);
    if (!validRequest(session, id) || !sessionID(input.type)) { session.status = 400; session.respond({ error: "session_id and type are required" }, "json"); return; }
    const now = new Date().toISOString();
    const tabID = sessionID(input.id) || randomUUID();
    const record = await db.create("sidebar_tabs", { id: tabID, user_id: userID(session), session_id: id, type: sessionID(input.type), label: sessionID(input.label) || sessionID(input.type), state: JSON.stringify(input.state && typeof input.state === "object" ? input.state : {}), created_at: now, updated_at: now });
    await setActiveTab(db, userID(session), id, tabID);
    session.status = 201; session.respond({ ...record, state: parseState(record.state) }, "json");
  });
  ctx.route("/api/sidebar/tabs/active").methods("PUT").action(async (session: Session) => {
    const input = await session.parseRequestBody() as Record<string, unknown>;
    const id = sessionID(input.session_id);
    if (!validRequest(session, id)) { session.status = 400; session.respond({ error: "session_id is required" }, "json"); return; }
    const activeTab = sessionID(input.active_tab) || "home";
    if (activeTab !== "home" && activeTab !== "new") {
      const tab = await db.selectOne("sidebar_tabs", { id: activeTab, user_id: userID(session), session_id: id });
      if (!tab) { session.status = 404; session.respond({ error: "Sidebar tab not found" }, "json"); return; }
    }
    await setActiveTab(db, userID(session), id, activeTab);
    session.respond({ activeTab }, "json");
  });
  ctx.route("/api/sidebar/tabs/:id").methods("PUT").action(async (session: Session, _query: URLSearchParams, tabID: string) => {
    const input = await session.parseRequestBody() as Record<string, unknown>;
    const id = sessionID(input.session_id);
    if (!validRequest(session, id)) { session.status = 400; session.respond({ error: "session_id is required" }, "json"); return; }
    const values: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (input.label !== undefined) values.label = sessionID(input.label);
    if (input.state && typeof input.state === "object") values.state = JSON.stringify(input.state);
    await db.update("sidebar_tabs", { id: tabID, user_id: userID(session), session_id: id }, values);
    const updated = await db.selectOne("sidebar_tabs", { id: tabID, user_id: userID(session), session_id: id });
    if (!updated) { session.status = 404; session.respond({ error: "Sidebar tab not found" }, "json"); return; }
    session.respond({ ...(updated as any), state: parseState((updated as any).state) }, "json");
  });
  ctx.route("/api/sidebar/tabs/:id").methods("DELETE").action(async (session: Session, query: URLSearchParams, tabID: string) => {
    const id = sessionID(query.get("session_id"));
    if (!validRequest(session, id)) { session.status = 400; session.respond({ error: "session_id is required" }, "json"); return; }
    await db.remove("sidebar_tabs", { id: tabID, user_id: userID(session), session_id: id });
    const state = await db.selectOne("sidebar_session_state", { id: `${userID(session)}:${id}`, user_id: userID(session), session_id: id }) as any;
    if (state?.active_tab === tabID) {
      const tabs = await db.select("sidebar_tabs", { user_id: userID(session), session_id: id }) as any[];
      await setActiveTab(db, userID(session), id, tabs.at(-1)?.id || "home");
    }
    session.status = 204; session.respond("", "plain");
  });
  ctx.registerComponent("sidebar", {});
  ctx.component.dashboard.addEntry({
    dev: new URL("../frontend/index.tsx", import.meta.url).pathname,
    prod: new URL("./frontend/sidebar.js", import.meta.url).pathname,
    plugin: "sidebar",
  });
}

async function setActiveTab(db: Database, userID: number, sessionID: string, activeTab: string) {
  const id = `${userID}:${sessionID}`;
  const values = { active_tab: activeTab, updated_at: new Date().toISOString() };
  const existing = await db.selectOne("sidebar_session_state", { id, user_id: userID, session_id: sessionID });
  if (existing) await db.update("sidebar_session_state", { id }, values);
  else await db.create("sidebar_session_state", { id, user_id: userID, session_id: sessionID, ...values });
}

function parseState(value: unknown): Record<string, unknown> {
  try { const parsed = JSON.parse(String(value || "{}")); return parsed && typeof parsed === "object" ? parsed : {}; } catch { return {}; }
}
