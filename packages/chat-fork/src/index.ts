import { randomUUID } from "node:crypto";
import { Context, Database, Session } from "yumeri";

export const depend = ["database", "dashboard", "advanced-chat"];
export const provide = ["chat-fork"];

export async function apply(ctx: Context) {
  ctx.component.dashboard.addEntry({
    dev: new URL("../frontend/index.tsx", import.meta.url).pathname,
    prod: new URL("./frontend/chat-fork.js", import.meta.url).pathname,
    plugin: "chat-fork",
  });
  const db = ctx.component.database as Database;
  const user = (session: Session) => session.properties.user as { id?: number } | undefined;
  ctx.route("/api/user/advanced-chat/fork").methods("GET").action((session) => session.respond({ enabled: true }, "json"));
  ctx.route("/api/user/advanced-chat/sessions/:id/fork").methods("POST").action(async (session, _params, id) => {
    const current = user(session);
    if (current?.id === undefined) return;
    const input = await session.parseRequestBody() as { message_id?: unknown };
    const source: any = await db.selectOne("advanced_chat_sessions", { id, user_id: current.id });
    if (!source) { session.status = 404; session.respond({ error: "Session not found" }, "json"); return; }
    const messages: any[] = await db.select("advanced_chat_messages", { session_id: id, user_id: current.id });
    const targetIndex = messages.findIndex((message) => String(message.id) === String(input.message_id ?? ""));
    if (targetIndex < 0) { session.status = 404; session.respond({ error: "Message not found" }, "json"); return; }
    const now = new Date().toISOString();
    const sessionID = `acs-${randomUUID()}`;
    const title = String(source.title ?? "New chat");
    await db.create("advanced_chat_sessions", { ...source, id: sessionID, title: `${title} (fork)`, created_at: now, updated_at: now });
    for (const [index, message] of messages.slice(0, targetIndex + 1).entries())
      await db.create("advanced_chat_messages", { ...message, id: `acm-${crypto.randomUUID()}`, session_id: sessionID, sort_order: index, created_at: now, updated_at: now });
    session.status = 201;
    session.respond({ id: sessionID }, "json");
  });
}
