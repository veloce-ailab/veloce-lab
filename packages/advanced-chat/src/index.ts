import { randomBytes, createHash } from "node:crypto";
import { Context, Database, Schema } from "yumeri";
import type {
  HarnessAgent,
  HarnessConnectorDevice,
  HarnessSession,
} from "@velocelab/model";

export const depend = ["velocelab-core", "database", "model", "file", "adapters"];
export const provide = ["advanced-chat"];

export interface AdvancedChatConfig {
  enabled: boolean;
  connectorOnlineWindowSeconds: string;
}

export interface AdvancedChatService {
  createConnector(userId: number, name: string, remark: string): Promise<{ device: HarnessConnectorDevice; token: string }>;
  listConnectors(userId: number): Promise<HarnessConnectorDevice[]>;
  listAgents(userId: number): Promise<HarnessAgent[]>;
  createAgent(userId: number, input: AgentInput): Promise<HarnessAgent>;
  updateAgent(userId: number, id: string, input: AgentInput): Promise<HarnessAgent | undefined>;
  deleteAgent(userId: number, id: string): Promise<void>;
  listSessions(userId: number): Promise<HarnessSession[]>;
  createSession(userId: number, input: SessionInput): Promise<HarnessSession>;
  getSession(userId: number, sessionId: string): Promise<Record<string, unknown> | undefined>;
  updateSession(userId: number, sessionId: string, input: Partial<SessionInput> & { folderId?: string }): Promise<Record<string, unknown> | undefined>;
  deleteSession(userId: number, sessionId: string): Promise<boolean>;
  getRun(userId: number, runId: string): Promise<Record<string, unknown> | undefined>;
  stopRun(userId: number, runId: string): Promise<Record<string, unknown> | undefined>;
  listRunEvents(userId: number, runId: string, after: number): Promise<Record<string, unknown>[]>;
  listSessionTasks(userId: number, sessionId: string): Promise<Record<string, unknown>[]>;
  listSessionFolders(userId: number): Promise<Record<string, unknown>[]>;
  createSessionFolder(userId: number, name: string): Promise<Record<string, unknown>>;
  getUserSettings(userId: number): Promise<Record<string, unknown>>;
  updateUserSettings(userId: number, input: Record<string, unknown>): Promise<Record<string, unknown>>;
  listPendingConnectorTasks(userId: number, runId: string): Promise<Record<string, unknown>[]>;
  listScheduledTasks(userId: number): Promise<import("@velocelab/model").AdvancedChatScheduledTask[]>;
  createScheduledTask(userId: number, input: ScheduledTaskInput): Promise<import("@velocelab/model").AdvancedChatScheduledTask>;
  authenticateConnector(token: string): Promise<HarnessConnectorDevice | undefined>;
  heartbeatConnector(token: string, input: ConnectorRegistration): Promise<HarnessConnectorDevice | undefined>;
  nextConnectorTask(token: string): Promise<import("@velocelab/model").HarnessConnectorTask | undefined>;
  completeConnectorTask(token: string, taskId: string, success: boolean, result: string, errorMessage: string): Promise<boolean>;
  complete(userId: number, input: ChatInput): Promise<ChatResult>;
}

export interface ChatInput {
  sessionId?: string;
  model: string;
  messages: Array<{ role: string; content: string; tool_calls?: unknown[]; tool_call_id?: string }>;
  userChannelId?: number;
  stream?: boolean;
  maxTokens?: number;
  temperature?: number;
  reasoningEffort?: string;
}

export interface ChatResult {
  sessionId: string;
  runId: string;
  message: { id: string; role: string; content: string; tool_calls?: unknown[] };
  finishReason: string;
  inputTokens: number;
  outputTokens: number;
}

export interface AgentInput {
  name: string;
  prompt: string;
  defaultModel: string;
  userChannelId?: number;
  stream: boolean;
  skillIds?: string[];
  mcpServerIds?: string[];
}

export interface SessionInput {
  agentId?: string;
  title?: string;
  modelName?: string;
  userChannelId?: number;
}

export interface ScheduledTaskInput {
  name: string;
  description: string;
  agentId: string;
  scheduleType: string;
  message: string;
  modelName: string;
  userChannelId?: number;
  intervalSeconds?: number;
  runAt?: string;
}

export interface ConnectorRegistration {
  name?: string;
  hostname?: string;
  os?: string;
  arch?: string;
  version?: string;
  mode?: string;
  kind?: string;
  desktopInstanceId?: string;
}

export const config: Schema<AdvancedChatConfig> = Schema.object({
  enabled: Schema.boolean("Enable personal Harness").default(true),
  connectorOnlineWindowSeconds: Schema.string("Connector online window seconds").default("60"),
});

declare module "yumeri" {
  interface Components {
    "advanced-chat": AdvancedChatService;
  }
}

function newID(prefix: string) {
  return `${prefix}-${randomBytes(16).toString("hex")}`;
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function decodeList(value: unknown) {
  try {
    const parsed = JSON.parse(String(value || "[]"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function decodeObject(value: unknown) {
  try { return JSON.parse(String(value || "{}")); } catch { return {}; }
}

export function apply(ctx: Context, pluginConfig: AdvancedChatConfig) {
  const db = ctx.component.database as Database;
  const adapters = ctx.component.adapters as import("@velocelab/adapters").AdapterRegistry;
  const service: AdvancedChatService = {
    async createConnector(userId, name, remark) {
      if (!pluginConfig.enabled) throw Error("personal Harness is disabled");
      const trimmedName = name.trim();
      if (!userId || !trimmedName) throw Error("connector name is required");
      const token = randomBytes(32).toString("base64url");
      const now = new Date().toISOString();
      const device = await db.create("advanced_chat_connector_devices", {
        id: newID("acd"),
        user_id: userId,
        token_hash: hashToken(token),
        name: trimmedName.slice(0, 120),
        remark: remark.trim().slice(0, 200),
        hostname: "",
        os: "",
        arch: "",
        version: "",
        kind: "cli",
        desktop_instance_id: "",
        mode: "platform",
        status: "offline",
        last_seen_at: null,
        created_at: now,
        updated_at: now,
      });
      return { device, token };
    },
    async listConnectors(userId) {
      const devices = await db.select("advanced_chat_connector_devices", { user_id: userId });
      return devices.sort((left, right) => right.updated_at.localeCompare(left.updated_at));
    },
    async listAgents(userId) {
      const agents = await db.select("advanced_chat_agents", { user_id: userId });
      return agents.sort((left, right) => left.name.localeCompare(right.name));
    },
    async createAgent(userId, input) {
      const name = input.name.trim();
      if (!userId || !name) throw Error("agent name is required");
      const now = new Date().toISOString();
      return db.create("advanced_chat_agents", {
        user_id: userId,
        stable_id: newID("aca"),
        name: name.slice(0, 100),
        prompt: input.prompt.trim(),
        default_model: input.defaultModel.trim(),
        user_channel_id: input.userChannelId || null,
        stream: input.stream,
        skill_ids: JSON.stringify(input.skillIds ?? []),
        mcp_server_ids: JSON.stringify(input.mcpServerIds ?? []),
        knowledge_base_ids: "[]",
        preset_messages: "[]",
        created_at: now,
        updated_at: now,
      });
    },
    async updateAgent(userId, id, input) {
      const existing = await db.selectOne("advanced_chat_agents", { stable_id: id, user_id: userId });
      if (!existing) return undefined;
      const name = input.name.trim();
      if (!name) throw Error("agent name is required");
      await db.update("advanced_chat_agents", { stable_id: id, user_id: userId }, {
        name: name.slice(0, 100),
        prompt: input.prompt.trim(),
        default_model: input.defaultModel.trim(),
        user_channel_id: input.userChannelId || null,
        stream: input.stream,
        skill_ids: JSON.stringify(input.skillIds ?? []),
        mcp_server_ids: JSON.stringify(input.mcpServerIds ?? []),
        updated_at: new Date().toISOString(),
      });
      return db.selectOne("advanced_chat_agents", { stable_id: id, user_id: userId });
    },
    async deleteAgent(userId, id) {
      await db.remove("advanced_chat_agents", { stable_id: id, user_id: userId });
    },
    async listSessions(userId) {
      const sessions = await db.select("advanced_chat_sessions", { user_id: userId });
      const hydrated = await Promise.all(sessions.map(async (session) => service.getSession(userId, session.id)));
      return hydrated.filter(Boolean) as unknown as HarnessSession[];
    },
    async createSession(userId, input) {
      const now = new Date().toISOString();
      return db.create("advanced_chat_sessions", {
        id: newID("acs"),
        user_id: userId,
        folder_id: "",
        title: input.title?.trim() ?? "",
        run_mode: "assistant",
        agent_id: input.agentId ?? "",
        agent_group_id: "",
        skill_ids: "[]",
        mcp_server_ids: "[]",
        knowledge_base_ids: "[]",
        connector_device_id: "",
        connector_workspace_path: "",
        connector_auto_approve: false,
        connector_approval_mode: "manual",
        connector_command_prefixes: "[]",
        model_name: input.modelName?.trim() ?? "",
        user_channel_id: input.userChannelId || null,
        max_tokens: 0,
        temperature: null,
        reasoning_effort: "",
        auto_compress_context: true,
        disabled_tool_groups: "[]",
        created_at: now,
        updated_at: now,
      });
    },
    async getSession(userId, sessionId) {
      const session = await db.selectOne("advanced_chat_sessions", { id: sessionId, user_id: userId });
      if (!session) return undefined;
      const messages = await db.select("advanced_chat_messages", { session_id: sessionId, user_id: userId });
      const runs = await db.select("advanced_chat_runs", { session_id: sessionId, user_id: userId });
      const latestRun = runs.sort((left, right) => right.created_at.localeCompare(left.created_at))[0];
      return {
        ...session,
        skill_ids: decodeList(session.skill_ids),
        mcp_server_ids: decodeList(session.mcp_server_ids),
        knowledge_base_ids: decodeList(session.knowledge_base_ids),
        connector_command_prefixes: decodeList(session.connector_command_prefixes),
        disabled_tool_groups: decodeList(session.disabled_tool_groups),
        messages: messages.sort((left, right) => left.sort_order - right.sort_order).map((message) => ({ ...message, content_parts: decodeList(message.content_parts), tool_calls: decodeList(message.tool_calls) })),
        latest_run: latestRun ? { ...latestRun, tool_call_details: decodeList(latestRun.tool_call_details) } : undefined,
      };
    },
    async updateSession(userId, sessionId, input) {
      const existing = await db.selectOne("advanced_chat_sessions", { id: sessionId, user_id: userId });
      if (!existing) return undefined;
      await db.update("advanced_chat_sessions", { id: sessionId, user_id: userId }, {
        ...(input.title !== undefined ? { title: input.title.trim().slice(0, 160) } : {}),
        ...(input.modelName !== undefined ? { model_name: input.modelName.trim() } : {}),
        ...(input.userChannelId !== undefined ? { user_channel_id: input.userChannelId || null } : {}),
        ...(input.agentId !== undefined ? { agent_id: input.agentId } : {}),
        ...(input.folderId !== undefined ? { folder_id: input.folderId } : {}),
        updated_at: new Date().toISOString(),
      });
      return service.getSession(userId, sessionId);
    },
    async deleteSession(userId, sessionId) {
      const runs = await db.select("advanced_chat_runs", { session_id: sessionId, user_id: userId });
      for (const run of runs) await db.remove("advanced_chat_run_events", { run_id: run.id, user_id: userId });
      await db.remove("advanced_chat_runs", { session_id: sessionId, user_id: userId });
      await db.remove("advanced_chat_messages", { session_id: sessionId, user_id: userId });
      await db.remove("advanced_chat_sessions", { id: sessionId, user_id: userId });
      return true;
    },
    async getRun(userId, runId) {
      const run = await db.selectOne("advanced_chat_runs", { id: runId, user_id: userId });
      return run ? { ...run, tool_call_details: decodeList(run.tool_call_details) } : undefined;
    },
    async stopRun(userId, runId) {
      const existing = await db.selectOne("advanced_chat_runs", { id: runId, user_id: userId });
      if (!existing) return undefined;
      if (["completed", "failed", "cancelled"].includes(existing.status)) return service.getRun(userId, runId);
      const now = new Date().toISOString();
      await db.update("advanced_chat_runs", { id: runId, user_id: userId }, { status: "cancelled", status_message: "cancelled", finished_at: now, updated_at: now });
      await db.create("advanced_chat_run_events", { run_id: runId, session_id: existing.session_id, user_id: userId, seq: 999999, event: "cancelled", payload: "{}", created_at: now });
      return service.getRun(userId, runId);
    },
    async listRunEvents(userId, runId, after) {
      const events = await db.select("advanced_chat_run_events", { run_id: runId, user_id: userId });
      return events.filter((event) => event.seq > after).sort((left, right) => left.seq - right.seq).slice(0, 200).map((event) => ({ ...event, payload: decodeObject(event.payload) }));
    },
    async listSessionTasks(userId, sessionId) {
      const tasks = await db.select("advanced_chat_session_tasks", { user_id: userId, session_id: sessionId });
      return tasks.sort((left, right) => left.position - right.position);
    },
    async listSessionFolders(userId) {
      const folders = await db.select("advanced_chat_session_folders", { user_id: userId });
      return folders.sort((left, right) => left.created_at.localeCompare(right.created_at));
    },
    async createSessionFolder(userId, name) {
      const value = name.trim();
      if (!value || value.length > 80) throw Error("Folder name must be between 1 and 80 characters");
      const now = new Date().toISOString();
      return db.create("advanced_chat_session_folders", { id: newID("acf"), user_id: userId, name: value, created_at: now, updated_at: now });
    },
    async getUserSettings(userId) {
      let settings = await db.selectOne("advanced_chat_user_settings", { user_id: userId });
      if (!settings) {
        settings = await db.create("advanced_chat_user_settings", {
          user_id: userId,
          file_storage_enabled: true,
          assistant_mode_enabled: true,
          custom_mcp_servers: "[]",
          title_model_name: "",
          title_user_channel_id: null,
          updated_at: new Date().toISOString(),
        });
      }
      return {
        ...settings,
        custom_mcp_servers: decodeList(settings.custom_mcp_servers),
        title_model_name: settings.title_model_name || "",
        title_generation_scope: settings.title_generation_scope || "recent",
        connector_approval_agent_id: settings.connector_approval_agent_id || "",
      };
    },
    async updateUserSettings(userId, input) {
      await service.getUserSettings(userId);
      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (typeof input.title_model_name === "string") updates.title_model_name = input.title_model_name.trim().slice(0, 100);
      if (typeof input.title_user_channel_id === "number") updates.title_user_channel_id = input.title_user_channel_id || null;
      if (input.title_generation_scope === "all" || input.title_generation_scope === "recent") updates.title_generation_scope = input.title_generation_scope;
      if (typeof input.connector_approval_agent_id === "string") updates.connector_approval_agent_id = input.connector_approval_agent_id.trim();
      if (Array.isArray(input.custom_mcp_servers)) updates.custom_mcp_servers = JSON.stringify(input.custom_mcp_servers);
      await db.update("advanced_chat_user_settings", { user_id: userId }, updates);
      return service.getUserSettings(userId);
    },
    async listPendingConnectorTasks(userId, runId) {
      const tasks = await db.select("advanced_chat_connector_tasks", { user_id: userId, run_id: runId });
      return tasks.filter((task) => ["queued", "pending_approval", "running"].includes(task.status)).sort((left, right) => left.created_at.localeCompare(right.created_at));
    },
    async listScheduledTasks(userId) {
      const tasks = await db.select("advanced_chat_scheduled_tasks", { user_id: userId });
      return tasks.sort((left, right) => right.updated_at.localeCompare(left.updated_at));
    },
    async createScheduledTask(userId, input) {
      const name = input.name.trim();
      const scheduleType = input.scheduleType.trim();
      if (!userId || !name || !scheduleType || !input.message.trim()) {
        throw Error("name, schedule type, and message are required");
      }
      if (!["manual", "once", "interval"].includes(scheduleType)) {
        throw Error("invalid schedule type");
      }
      const now = new Date().toISOString();
      return db.create("advanced_chat_scheduled_tasks", {
        id: newID("act"),
        user_id: userId,
        name: name.slice(0, 120),
        description: input.description.trim(),
        agent_id: input.agentId.trim(),
        schedule_type: scheduleType,
        run_at: input.runAt || null,
        interval_seconds: Math.max(0, input.intervalSeconds ?? 0),
        session_mode: "auto",
        session_id: "",
        auto_delete_session: false,
        message: input.message.trim(),
        timeout_seconds: 300,
        delivery_id: "",
        model_name: input.modelName.trim(),
        user_channel_id: input.userChannelId || 0,
        max_tokens: 0,
        temperature: null,
        reasoning_effort: "",
        enabled: true,
        last_run_at: null,
        next_run_at: input.runAt || null,
        last_run_id: "",
        last_status: "idle",
        last_error: "",
        created_at: now,
        updated_at: now,
      });
    },
    async authenticateConnector(token) {
      const normalized = token.trim();
      if (!normalized) return undefined;
      return db.selectOne("advanced_chat_connector_devices", { token_hash: hashToken(normalized) });
    },
    async heartbeatConnector(token, input) {
      const device = await service.authenticateConnector(token);
      if (!device) return undefined;
      const now = new Date().toISOString();
      await db.update("advanced_chat_connector_devices", { id: device.id }, {
        name: input.name?.trim().slice(0, 120) || device.name,
        hostname: input.hostname?.trim().slice(0, 120) || "",
        os: input.os?.trim().slice(0, 40) || "",
        arch: input.arch?.trim().slice(0, 40) || "",
        version: input.version?.trim().slice(0, 80) || "",
        mode: input.mode?.trim() || "platform",
        kind: input.kind?.trim() || device.kind,
        desktop_instance_id: input.desktopInstanceId?.trim() || "",
        status: "online",
        last_seen_at: now,
        updated_at: now,
      });
      return db.selectOne("advanced_chat_connector_devices", { id: device.id });
    },
    async nextConnectorTask(token) {
      const device = await service.authenticateConnector(token);
      if (!device) return undefined;
      const task = await db.selectOne("advanced_chat_connector_tasks", {
        device_id: device.id,
        user_id: device.user_id,
        status: "queued",
      });
      if (!task) return undefined;
      const now = new Date().toISOString();
      const changed = await db.update("advanced_chat_connector_tasks", { id: task.id, status: "queued" }, {
        status: "running",
        started_at: now,
        updated_at: now,
      });
      if (!changed) return undefined;
      return db.selectOne("advanced_chat_connector_tasks", { id: task.id });
    },
    async completeConnectorTask(token, taskId, success, result, errorMessage) {
      const device = await service.authenticateConnector(token);
      if (!device || !taskId.trim()) return false;
      const changed = await db.update("advanced_chat_connector_tasks", {
        id: taskId,
        device_id: device.id,
        user_id: device.user_id,
        status: "running",
      }, {
        status: success ? "completed" : "failed",
        result: result.slice(0, 1_000_000),
        error_message: errorMessage.slice(0, 100_000),
        finished_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      return changed > 0;
    },
    async complete(userId, input) {
      if (!pluginConfig.enabled) throw Error("personal Harness is disabled");
      const modelName = input.model.trim();
      if (!modelName || !input.messages.length) throw Error("model and messages are required");
      const session = input.sessionId
        ? await db.selectOne("advanced_chat_sessions", { id: input.sessionId, user_id: userId })
        : await db.create("advanced_chat_sessions", {
          id: newID("acs"), user_id: userId, folder_id: "", title: "", run_mode: "assistant", agent_id: "", agent_group_id: "",
          skill_ids: "[]", mcp_server_ids: "[]", knowledge_base_ids: "[]", connector_device_id: "", connector_workspace_path: "",
          connector_auto_approve: false, connector_approval_mode: "manual", connector_command_prefixes: "[]", model_name: modelName,
          user_channel_id: input.userChannelId || null, max_tokens: input.maxTokens || 0, temperature: input.temperature ?? null,
          reasoning_effort: input.reasoningEffort || "", auto_compress_context: true, disabled_tool_groups: "[]",
          created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        });
      if (!session) throw Error("session not found");
      const sessionId = String(session.id);
      const now = new Date().toISOString();
      const prior = await db.select("advanced_chat_messages", { session_id: sessionId, user_id: userId });
      const userMessage = await db.create("advanced_chat_messages", {
        id: newID("acm"), session_id: sessionId, user_id: userId, role: "user", content: input.messages[input.messages.length - 1].content,
        content_parts: "[]", tool_calls: "[]", input_tokens: 0, output_tokens: 0, sort_order: prior.length, created_at: now, updated_at: now,
      });
      const runId = newID("acr");
      await db.create("advanced_chat_runs", {
        id: runId, session_id: sessionId, user_id: userId, status: "running", assistant_message_id: "", mode: "chat", status_message: "", current_round: 0,
        error_message: "", cost: 0, tool_calls: 0, tool_call_details: "[]", started_at: now, created_at: now, finished_at: null, updated_at: now,
      });
      const channelRows = await db.select("channels", { enabled: true });
      const configs = await db.select("model_configs", { enabled: true });
      const requestedChannel = input.userChannelId ? channelRows.filter((row: any) => row.user_channel_id === input.userChannelId) : channelRows;
      const selected = configs.find((config: any) => String(config.upstream_model_name || "") === modelName && requestedChannel.some((channel: any) => channel.id === config.channel_id && channel.enabled));
      const channel = selected ? channelRows.find((row: any) => row.id === selected.channel_id) : requestedChannel.find((row: any) => row.enabled);
      if (!channel) throw Error("no enabled upstream channel");
      const upstreamModel = selected?.upstream_model_name || modelName;
      const protocol = adapters.protocolFor(channel.type);
      const endpoint = protocol === "claude" ? "claude_messages" : protocol === "gemini" ? "gemini_generate" : protocol === "responses" ? "responses" : "chat";
      const request = adapters.request(channel.type, endpoint, upstreamModel, channel.api_key || "");
      const payload: Record<string, unknown> = {
        model: upstreamModel,
        messages: [...prior.map((message: any) => ({ role: message.role, content: message.content })), ...input.messages],
        stream: input.stream === true,
      };
      if (input.maxTokens) payload.max_tokens = input.maxTokens;
      if (input.temperature !== undefined) payload.temperature = input.temperature;
      if (input.reasoningEffort) payload.reasoning_effort = input.reasoningEffort;
      const prepared = adapters.applyPayload(channel.type, endpoint, payload);
      const headers = { ...request.headers, ...(input.stream ? { Accept: "text/event-stream" } : {}) };
      const response = await fetch(`${String(channel.base_url).replace(/\\\/$/, "")}${request.path || ""}`, { method: "POST", headers, body: JSON.stringify(prepared) });
      const text = await response.text();
      if (!response.ok) {
        await db.update("advanced_chat_runs", { id: runId }, { status: "failed", error_message: text.slice(0, 10000), finished_at: new Date().toISOString(), updated_at: new Date().toISOString() });
        throw Error(text || `upstream request failed (${response.status})`);
      }
      let data: any;
      if (input.stream && text.includes("data:")) {
        const chunks = text.split(/\r?\n/).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim()).filter((line) => line && line !== "[DONE]");
        const parsed = chunks.map((chunk) => { try { return JSON.parse(chunk); } catch { return {}; } });
        const content = parsed.map((item) => item.choices?.[0]?.delta?.content || item.delta?.text || item.candidates?.[0]?.content?.parts?.map((part: any) => part.text || "").join("") || "").join("");
        data = { choices: [{ message: { content }, finish_reason: "stop" }] };
      } else {
        try { data = JSON.parse(text); } catch { data = {}; }
      }
      const content = protocol === "claude"
        ? String(data.content?.find((part: any) => part.type === "text")?.text || "")
        : protocol === "gemini"
          ? String(data.candidates?.[0]?.content?.parts?.map((part: any) => part.text || "").join("") || "")
          : String(data.choices?.[0]?.message?.content || data.output_text || "");
      const toolCalls = data.choices?.[0]?.message?.tool_calls || [];
      const finishReason = String(data.choices?.[0]?.finish_reason || "stop");
      const assistant = await db.create("advanced_chat_messages", {
        id: newID("acm"),
        session_id: sessionId,
        user_id: userId,
        role: "assistant",
        content,
        content_parts: "[]",
        tool_calls: JSON.stringify(toolCalls),
        input_tokens: Number(data.usage?.prompt_tokens || 0),
        output_tokens: Number(data.usage?.completion_tokens || 0),
        sort_order: prior.length + 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      await db.create("advanced_chat_run_events", {
        run_id: runId,
        session_id: sessionId,
        user_id: userId,
        seq: 1,
        event: "completed",
        payload: JSON.stringify({ content, finish_reason: finishReason, tool_calls: toolCalls }),
        created_at: new Date().toISOString(),
      });
      await db.update("advanced_chat_runs", { id: runId }, { status: "completed", assistant_message_id: assistant.id, finished_at: new Date().toISOString(), updated_at: new Date().toISOString() });
      await db.update("advanced_chat_sessions", { id: sessionId }, { updated_at: new Date().toISOString(), model_name: modelName });
      return {
        sessionId,
        runId,
        message: { id: String(assistant.id), role: "assistant", content, tool_calls: toolCalls },
        finishReason,
        inputTokens: Number(data.usage?.prompt_tokens || 0),
        outputTokens: Number(data.usage?.completion_tokens || 0),
      };
    },
  };
  ctx.registerComponent("advanced-chat", service);
}
