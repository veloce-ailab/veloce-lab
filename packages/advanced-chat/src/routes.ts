import { Context, Session } from "yumeri";
import type { MiddlewareService } from "@velocelab/middleware";
import type { AdvancedChatService } from "./index.js";

export function registerAdvancedChatRoutes(ctx: Context, service: AdvancedChatService, middleware?: MiddlewareService) {
  const user = async (session: Session) => {
    if (middleware && !(await middleware.authenticate(session))) {
      session.status = 401;
      session.respond({ error: "Authorization is required" }, "json");
      return undefined;
    }
    return session.properties.user as { id?: number } | undefined;
  };
  const body = async (session: Session) => (await session.parseRequestBody()) as Record<string, unknown>;
  const token = (session: Session) => {
    const headers = session.client.req?.headers ?? {};
    const value = headers["x-connector-token"] ?? headers.authorization ?? "";
    const raw = Array.isArray(value) ? value[0] : value;
    return typeof raw === "string" ? raw.replace(/^bearer\s+/i, "").trim() : "";
  };
  const list = (value: unknown) => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  const agent = (value: any) => ({ ...value, id: value.stable_id || String(value.id ?? "") });

  ctx.route("/api/user/advanced-chat/devices").methods("GET").action(async (session) => {
    const current = await user(session); if (!current?.id) return;
    session.respond((await service.listConnectors(current.id)).map(({ token_hash: _hash, ...item }) => item), "json");
  });
  ctx.route("/api/user/advanced-chat/devices/token").methods("POST").action(async (session) => {
    const current = await user(session); if (!current?.id) return;
    const input = await body(session); const created = await service.createConnector(current.id, String(input.name ?? ""), String(input.remark ?? ""));
    const { token_hash: _hash, ...device } = created.device; session.respond({ ...device, token: created.token }, "json");
  });
  ctx.route("/api/user/advanced-chat/agents").methods("GET").action(async (session) => { const current = await user(session); if (current?.id) session.respond((await service.listAgents(current.id)).map(agent), "json"); });
  ctx.route("/api/user/advanced-chat/agents").methods("POST").action(async (session) => { const current = await user(session); if (!current?.id) return; const input = await body(session); const value = await service.createAgent(current.id, { name: String(input.name ?? ""), prompt: String(input.prompt ?? ""), defaultModel: String(input.default_model ?? ""), userChannelId: Number(input.user_channel_id ?? 0) || undefined, stream: input.stream === true, skillIds: list(input.skill_ids), mcpServerIds: list(input.mcp_server_ids) }); session.status = 201; session.respond(agent(value), "json"); });
  ctx.route("/api/user/advanced-chat/agents/:id").methods("DELETE").action(async (session, _params, id) => { const current = await user(session); if (current?.id) { await service.deleteAgent(current.id, id); session.respond({ success: true }, "json"); } });
  ctx.route("/api/user/advanced-chat/sessions").methods("GET").action(async (session) => { const current = await user(session); if (current?.id) session.respond(await service.listSessions(current.id), "json"); });
  ctx.route("/api/user/advanced-chat/sessions").methods("POST").action(async (session) => { const current = await user(session); if (!current?.id) return; const input = await body(session); const value = await service.createSession(current.id, { agentId: typeof input.agent_id === "string" ? input.agent_id : undefined, title: typeof input.title === "string" ? input.title : undefined, modelName: typeof input.model_name === "string" ? input.model_name : undefined, userChannelId: Number(input.user_channel_id ?? 0) || undefined }); session.status = 201; session.respond(value, "json"); });
  ctx.route("/api/user/advanced-chat/sessions/:id").methods("GET").action(async (session, _params, id) => { const current = await user(session); if (!current?.id) return; const value = await service.getSession(current.id, id); if (!value) { session.status = 404; session.respond({ error: "Session not found" }, "json"); } else session.respond(value, "json"); });
  ctx.route("/api/user/advanced-chat/sessions/:id").methods("DELETE").action(async (session, _params, id) => { const current = await user(session); if (current?.id) session.respond({ success: await service.deleteSession(current.id, id) }, "json"); });
  ctx.route("/api/user/advanced-chat/sessions/:id").methods("PUT").action(async (session, _params, id) => { const current = await user(session); if (!current?.id) return; const input = await body(session); session.respond(await service.updateSession(current.id, id, { title: typeof input.title === "string" ? input.title : undefined, modelName: typeof input.model_name === "string" ? input.model_name : undefined, agentId: typeof input.agent_id === "string" ? input.agent_id : undefined }), "json"); });
  ctx.route("/api/user/advanced-chat/sessions/:id/folder").methods("PUT").action(async (session, _params, id) => { const current = await user(session); if (current?.id) session.respond(await service.updateSession(current.id, id, { folderId: String((await body(session)).folder_id ?? "") }), "json"); });
  ctx.route("/api/user/advanced-chat/sessions/:id/tasks").methods("GET").action(async (session, _params, id) => { const current = await user(session); if (current?.id) session.respond(await service.listSessionTasks(current.id, id), "json"); });
  ctx.route("/api/user/advanced-chat/sessions/folders").methods("GET").action(async (session) => { const current = await user(session); if (current?.id) session.respond(await service.listSessionFolders(current.id), "json"); });
  ctx.route("/api/user/advanced-chat/sessions/folders").methods("POST").action(async (session) => { const current = await user(session); if (!current?.id) return; session.status = 201; session.respond(await service.createSessionFolder(current.id, String((await body(session)).name ?? "")), "json"); });
  ctx.route("/api/user/advanced-chat/settings").methods("GET").action(async (session) => { const current = await user(session); if (current?.id) session.respond(await service.getUserSettings(current.id), "json"); });
  ctx.route("/api/user/advanced-chat/settings").methods("PUT").action(async (session) => { const current = await user(session); if (current?.id) session.respond(await service.updateUserSettings(current.id, await body(session)), "json"); });
  ctx.route("/api/user/advanced-chat/completions").methods("POST").action(async (session) => { const current = await user(session); if (!current?.id) return; const input = await body(session); const messages = Array.isArray(input.messages) ? input.messages.map((item: any) => ({ role: String(item.role ?? "user"), content: String(item.content ?? ""), tool_calls: item.tool_calls, tool_call_id: item.tool_call_id })) : []; session.respond(await service.complete(current.id, { sessionId: typeof input.session_id === "string" ? input.session_id : undefined, model: String(input.model ?? ""), messages, userChannelId: Number(input.channel_id ?? 0) || undefined, stream: input.stream === true, maxTokens: Number(input.max_tokens ?? 0) || undefined, temperature: typeof input.temperature === "number" ? input.temperature : undefined, reasoningEffort: typeof input.reasoning_effort === "string" ? input.reasoning_effort : undefined }), "json"); });
  ctx.route("/api/user/advanced-chat/runs/:id").methods("GET").action(async (session, _params, id) => { const current = await user(session); if (current?.id) session.respond(await service.getRun(current.id, id) ?? { error: "Run not found" }, "json"); });
  ctx.route("/api/user/advanced-chat/runs/:id/stop").methods("POST").action(async (session, _params, id) => { const current = await user(session); if (current?.id) session.respond(await service.stopRun(current.id, id) ?? { error: "Run not found" }, "json"); });
  ctx.route("/api/user/advanced-chat/runs/:id/events").methods("GET").action(async (session, params, id) => { const current = await user(session); if (current?.id) session.respond(await service.listRunEvents(current.id, id, Number(params.get("after") ?? 0) || 0), "json"); });
  ctx.route("/api/user/advanced-chat/runs/:id/connector-tasks/pending").methods("GET").action(async (session, _params, id) => { const current = await user(session); if (current?.id) session.respond(await service.listPendingConnectorTasks(current.id, id), "json"); });
  ctx.route("/api/advanced-chat/connectors/register").methods("POST").action(async (session) => { const input = await body(session); const value = await service.heartbeatConnector(token(session), input as any); if (!value) { session.status = 401; session.respond({ error: "Invalid connector token" }, "json"); } else { const { token_hash: _hash, ...device } = value; session.respond(device, "json"); } });
  ctx.route("/api/advanced-chat/connectors/heartbeat").methods("POST").action(async (session) => { const value = await service.heartbeatConnector(token(session), await body(session) as any); if (!value) session.status = 401; session.respond(value ? { ok: true, device_id: value.id } : { error: "Invalid connector token" }, "json"); });
  ctx.route("/api/advanced-chat/connectors/tasks/next").methods("GET").action(async (session) => { const value = await service.nextConnectorTask(token(session)); session.respond({ task: value ?? null }, "json"); });
  ctx.route("/api/advanced-chat/connectors/tasks/:id/result").methods("POST").action(async (session, _params, id) => { const input = await body(session); session.respond({ ok: true, ignored: !(await service.completeConnectorTask(token(session), id, input.success === true, String(input.result ?? ""), String(input.error_message ?? ""))) }, "json"); });
}
