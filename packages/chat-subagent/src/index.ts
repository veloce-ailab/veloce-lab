import { randomUUID } from "node:crypto";
import { Context, Database, Session } from "yumeri";
import "@velocelab/advanced-chat";
import type { AdvancedChatService, ChatInput } from "@velocelab/advanced-chat";

export const depend = ["database", "dashboard", "advanced-chat"];
export const provide = ["chat-subagent"];

type Task = { id: string; user_id: number; session_id: string; title: string; task: string; context: string; status: string; result: string; error: string; created_at: string; updated_at: string; finished_at?: string | null };
declare module "@yumerijs/types" { interface Tables { advanced_chat_subagent_tasks: Task; } }

export async function apply(ctx: Context) {
  ctx.component.dashboard.addEntry({ dev: new URL("../frontend/index.tsx", import.meta.url).pathname, prod: new URL("./frontend/chat-subagent.js", import.meta.url).pathname, plugin: "chat-subagent" });
  const db = ctx.component.database as Database;
  await db.extend("advanced_chat_subagent_tasks", {
    id: { type: "string", nullable: false }, user_id: { type: "integer", nullable: false }, session_id: { type: "string", nullable: false }, title: "string", task: "text", context: "text", status: "string", result: "text", error: "text", created_at: "timestamp", updated_at: "timestamp", finished_at: "timestamp",
  }, { primary: "id" });
  const chat = ctx.component["advanced-chat"] as AdvancedChatService;
  const create = async (userId: number, sessionId: string, input: Record<string, unknown>) => {
    const source: any = await db.selectOne("advanced_chat_sessions", { id: sessionId, user_id: userId });
    if (!source) throw Error("Chat session not found");
    const taskText = String(input.task ?? "").trim();
    if (!taskText) throw Error("task is required");
    const context = String(input.context ?? "").trim();
    const now = new Date().toISOString(); const id = `sub-${randomUUID()}`;
    const title = String(input.title ?? taskText.slice(0, 80));
    await db.create("advanced_chat_subagent_tasks", { id, user_id: userId, session_id: sessionId, title, task: taskText, context, status: "queued", result: "", error: "", created_at: now, updated_at: now, finished_at: null } as any);
    void (async () => {
      await db.update("advanced_chat_subagent_tasks", { id, user_id: userId }, { status: "running", updated_at: new Date().toISOString() });
      try {
        const isolatedSessionId = `subsession-${randomUUID()}`;
        const prompt = ["You are a focused sub-agent. Do not assume a persona or retain conversation history.", context ? `Preset context:\n${context}` : "", `Task:\n${taskText}`].filter(Boolean).join("\n\n");
        const result = await chat.complete(userId, { sessionId: isolatedSessionId, model: String(source.model_name ?? ""), messages: [{ role: "user", content: prompt }], userChannelId: Number(source.user_channel_id) || undefined, stream: false, maxTokens: Number(source.max_tokens) || undefined, temperature: source.temperature == null ? undefined : Number(source.temperature), reasoningEffort: String(source.reasoning_effort ?? ""), mode: "chat", disabledToolGroups: ["workspace", "web"] } as ChatInput);
        await db.update("advanced_chat_subagent_tasks", { id, user_id: userId }, { status: "completed", result: result.message.content, updated_at: new Date().toISOString(), finished_at: new Date().toISOString() });
      } catch (error) { await db.update("advanced_chat_subagent_tasks", { id, user_id: userId }, { status: "failed", error: error instanceof Error ? error.message : String(error), updated_at: new Date().toISOString(), finished_at: new Date().toISOString() }); }
    })();
    return { id, status: "queued" };
  };
  chat.registerTool({ name: "delegate_subagent", description: "Run an independent background sub-agent for a focused task. It has no persona or chat history; provide only needed preset context. Returns immediately with a task id; multiple calls run in parallel.", parameters: { type: "object", required: ["task"], properties: { task: { type: "string" }, title: { type: "string" }, context: { type: "string" } } }, execute: (input, context) => create(context.userId, String(context.sessionId ?? ""), input as Record<string, unknown>) });
  const owner = (session: Session) => session.properties.user as { id?: number } | undefined;
  ctx.route("/api/user/advanced-chat/subagents").methods("GET").action(async (session) => { const current = owner(session); if (current?.id === undefined) return; const sessionId = String((session as any).query?.session_id ?? ""); const rows = await db.select("advanced_chat_subagent_tasks", { user_id: current.id, ...(sessionId ? { session_id: sessionId } : {}) }); session.respond(rows, "json"); });
  ctx.route("/api/user/advanced-chat/subagents/:id").methods("GET").action(async (session, _params, id) => { const current = owner(session); if (current?.id === undefined) return; const row = await db.selectOne("advanced_chat_subagent_tasks", { id, user_id: current.id }); if (!row) { session.status = 404; session.respond({ error: "Sub-agent not found" }, "json"); return; } session.respond(row, "json"); });
}
