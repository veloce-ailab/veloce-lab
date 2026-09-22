import { randomUUID } from "node:crypto";
import { Context, Database, Schema, Session } from "yumeri";
import "@velocelab/advanced-chat";
import type { AdvancedChatService, ChatInput } from "@velocelab/advanced-chat";

export const depend = ["database", "dashboard", "advanced-chat"];
export const provide = ["chat-subagent"];
export interface ChatSubagentConfig { maxConcurrentPerUser: string; maxTasksPerRun: string; taskTimeoutMs: string; autoContinueMainChat: boolean; disabledToolGroups: string[]; resultMaxChars: string; defaultTitleMaxChars: string }
export const config: Schema<ChatSubagentConfig> = Schema.object({
  maxConcurrentPerUser: Schema.string("Maximum concurrent subagents per user").key("chat-subagent.config.maxConcurrentPerUser").default("3"),
  maxTasksPerRun: Schema.string("Maximum subagents per main run").key("chat-subagent.config.maxTasksPerRun").default("6"),
  taskTimeoutMs: Schema.string("Subagent timeout milliseconds").key("chat-subagent.config.taskTimeoutMs").default("600000"),
  autoContinueMainChat: Schema.boolean("Continue the main chat after subagents finish").key("chat-subagent.config.autoContinueMainChat").default(true),
  disabledToolGroups: Schema.array(Schema.string("Tool group")).key("chat-subagent.config.disabledToolGroups").default(["workspace", "web"]),
  resultMaxChars: Schema.string("Maximum stored subagent result characters").key("chat-subagent.config.resultMaxChars").default("20000"),
  defaultTitleMaxChars: Schema.string("Default subagent title length").key("chat-subagent.config.defaultTitleMaxChars").default("80"),
});
type Task = { id: string; user_id: number; session_id: string; parent_run_id: string; title: string; task: string; context: string; status: string; result: string; error: string; continuation_started: boolean; created_at: string; updated_at: string; finished_at?: string | null };
declare module "@yumerijs/types" { interface Tables { advanced_chat_subagent_tasks: Task; } }

export async function apply(ctx: Context, cfg: ChatSubagentConfig) {
  ctx.component.dashboard.addEntry({ dev: new URL("../frontend/index.tsx", import.meta.url).pathname, prod: new URL("./frontend/chat-subagent.js", import.meta.url).pathname, plugin: "chat-subagent" });
  const db = ctx.component.database as Database;
  await db.extend("advanced_chat_subagent_tasks", { id: { type: "string", nullable: false }, user_id: { type: "integer", nullable: false }, session_id: { type: "string", nullable: false }, parent_run_id: "string", title: "string", task: "text", context: "text", status: "string", result: "text", error: "text", continuation_started: { type: "boolean", initial: false }, created_at: "timestamp", updated_at: "timestamp", finished_at: "timestamp" }, { primary: "id" });
  const chat = ctx.component["advanced-chat"] as AdvancedChatService;
  const continueAfterAll = async (userId: number, sessionId: string, parentRunId: string) => {
    if (!parentRunId || !cfg.autoContinueMainChat) return;
    const tasks: any[] = await db.select("advanced_chat_subagent_tasks", { user_id: userId, session_id: sessionId, parent_run_id: parentRunId });
    if (!tasks.length || tasks.some((task) => ["queued", "running"].includes(String(task.status)))) return;
    const parent: any = await db.selectOne("advanced_chat_runs", { id: parentRunId, user_id: userId });
    if (!parent || parent.status !== "completed" || tasks.some((task) => task.continuation_started === true)) return;
    await db.update("advanced_chat_subagent_tasks", { user_id: userId, session_id: sessionId, parent_run_id: parentRunId }, { continuation_started: true, updated_at: new Date().toISOString() });
    const source: any = await db.selectOne("advanced_chat_sessions", { id: sessionId, user_id: userId });
    const history: any[] = await db.select("advanced_chat_messages", { session_id: sessionId, user_id: userId });
    if (!source) return;
    const summary = tasks.map((task) => `## ${task.title} (${task.status})\n${task.result || task.error || "No result"}`).join("\n\n");
    const notification = `All delegated sub-agents have finished. Review their results and continue the conversation.\n\n${summary}`;
    try { await chat.complete(userId, { sessionId, model: String(source.model_name ?? ""), messages: [...history.map((message) => ({ role: String(message.role), content: String(message.content) })), { role: "user", content: notification }], userChannelId: Number(source.user_channel_id) || undefined, stream: false, maxTokens: Number(source.max_tokens) || undefined, temperature: source.temperature == null ? undefined : Number(source.temperature), reasoningEffort: String(source.reasoning_effort ?? ""), mode: String(source.run_mode ?? "chat"), disabledToolGroups: JSON.parse(String(source.disabled_tool_groups ?? "[]")) } as ChatInput); }
    catch (error) { await db.update("advanced_chat_subagent_tasks", { user_id: userId, session_id: sessionId, parent_run_id: parentRunId }, { error: `Continuation failed: ${error instanceof Error ? error.message : String(error)}`, updated_at: new Date().toISOString() }); }
  };
  const create = async (userId: number, sessionId: string, parentRunId: string, input: Record<string, unknown>) => {
    const maxConcurrent = Math.max(1, Number(cfg.maxConcurrentPerUser) || 3);
    const maxPerRun = Math.max(1, Number(cfg.maxTasksPerRun) || 6);
    const active: any[] = await db.select("advanced_chat_subagent_tasks", { user_id: userId, status: "running" });
    if (active.length >= maxConcurrent) throw Error("Subagent concurrency limit reached");
    const runTasks: any[] = await db.select("advanced_chat_subagent_tasks", { user_id: userId, session_id: sessionId, parent_run_id: parentRunId });
    if (runTasks.length >= maxPerRun) throw Error("Subagent task limit for this run reached");
    const source: any = await db.selectOne("advanced_chat_sessions", { id: sessionId, user_id: userId }); if (!source) throw Error("Chat session not found");
    const taskText = String(input.task ?? "").trim(); if (!taskText) throw Error("task is required");
    const context = String(input.context ?? "").trim(), now = new Date().toISOString(), id = `sub-${randomUUID()}`, title = String(input.title ?? taskText.slice(0, Math.max(1, Number(cfg.defaultTitleMaxChars) || 80)));
    await db.create("advanced_chat_subagent_tasks", { id, user_id: userId, session_id: sessionId, parent_run_id: parentRunId, title, task: taskText, context, status: "queued", result: "", error: "", continuation_started: false, created_at: now, updated_at: now, finished_at: null } as any);
    void (async () => { await db.update("advanced_chat_subagent_tasks", { id, user_id: userId }, { status: "running", updated_at: new Date().toISOString() }); try { const prompt = ["You are a focused sub-agent. Do not assume a persona or retain conversation history.", context ? `Preset context:\n${context}` : "", `Task:\n${taskText}`].filter(Boolean).join("\n\n"); const result = await chat.complete(userId, { sessionId: `subsession-${randomUUID()}`, visible: false, model: String(source.model_name ?? ""), messages: [{ role: "user", content: prompt }], userChannelId: Number(source.user_channel_id) || undefined, stream: false, maxTokens: Number(source.max_tokens) || undefined, temperature: source.temperature == null ? undefined : Number(source.temperature), reasoningEffort: String(source.reasoning_effort ?? ""), mode: "chat", disabledToolGroups: cfg.disabledToolGroups } as ChatInput, { signal: AbortSignal.timeout(Math.max(1000, Number(cfg.taskTimeoutMs) || 600000)) }); await db.update("advanced_chat_subagent_tasks", { id, user_id: userId }, { status: "completed", result: String(result.message.content ?? "").slice(0, Math.max(1, Number(cfg.resultMaxChars) || 20000)), updated_at: new Date().toISOString(), finished_at: new Date().toISOString() }); } catch (error) { await db.update("advanced_chat_subagent_tasks", { id, user_id: userId }, { status: "failed", error: error instanceof Error ? error.message : String(error), updated_at: new Date().toISOString(), finished_at: new Date().toISOString() }); } await continueAfterAll(userId, sessionId, parentRunId); })();
    return { id, status: "queued" };
  };
  chat.registerTool({ name: "delegate_subagent", description: "Run an independent background sub-agent for a focused task. It has no persona or chat history; provide only needed preset context. Returns immediately with a task id; multiple calls run in parallel.", parameters: { type: "object", required: ["task"], properties: { task: { type: "string" }, title: { type: "string" }, context: { type: "string" } } }, execute: (input, context) => create(context.userId, String(context.sessionId ?? ""), String(context.runId ?? ""), input as Record<string, unknown>) });
  const owner = (session: Session) => session.properties.user as { id?: number } | undefined;
  ctx.route("/api/user/advanced-chat/subagents").methods("GET").action(async (session: Session, query: URLSearchParams) => { const current = owner(session); if (current?.id === undefined) return; const sessionId = String(query.get("session_id") ?? ""); session.respond(await db.select("advanced_chat_subagent_tasks", { user_id: current.id, ...(sessionId ? { session_id: sessionId } : {}) }), "json"); });
  ctx.route("/api/user/advanced-chat/subagents/:id").methods("GET").action(async (session, _params, id) => { const current = owner(session); if (current?.id === undefined) return; const row = await db.selectOne("advanced_chat_subagent_tasks", { id, user_id: current.id }); if (!row) { session.status = 404; session.respond({ error: "Sub-agent not found" }, "json"); return; } session.respond(row, "json"); });
}
