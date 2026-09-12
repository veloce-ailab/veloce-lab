import { randomBytes, createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Context, Schema } from "yumeri";
import type {
  HarnessAgent,
  HarnessConnectorDevice,
  HarnessSession,
  AdvancedChatSessionFolder,
} from "./types.js";
import type * as ModelTypes from "./types.js";
import { registerAdvancedChatRoutes } from "./routes.js";
import { registerStudioTools } from "./studio.js";
import { registerAskUserTool } from "./ask-user.js";
import { filterToolsByDisabledGroups } from "./tool-groups.js";
import { attachImageFiles, registerChatFileRoutes } from "./files.js";
import { fetchCompletionWithRetry } from "./completion-runtime.js";
import { registerSessionTaskTools } from "./session-tasks.js";
import { registerRunTools } from "./run-tools.js";
import "@velocelab/dashboard";
import "@velocelab/file";
import "@velocelab/database-core";
import { ensureTables } from "./tables.js";

export * from "./types.js";

export const depend = ["database", "dashboard", "file"];
export const provide = ["advanced-chat"];

declare module "@yumerijs/types" {
  interface Tables {
    channels: ModelTypes.Channel;
    models: ModelTypes.Model;
    model_configs: ModelTypes.ModelConfig;
    advanced_chat_agents: ModelTypes.HarnessAgent;
    advanced_chat_connector_devices: ModelTypes.HarnessConnectorDevice;
    advanced_chat_connector_tasks: ModelTypes.HarnessConnectorTask;
    advanced_chat_sessions: ModelTypes.HarnessSession;
    advanced_chat_messages: ModelTypes.HarnessMessage;
    advanced_chat_runs: ModelTypes.HarnessRun;
    advanced_chat_user_settings: ModelTypes.HarnessUserSettings;
    advanced_chat_mcp_servers: ModelTypes.HarnessMCPServer;
    advanced_chat_files: ModelTypes.AdvancedChatFile;
    advanced_chat_knowledge_bases: ModelTypes.AdvancedChatKnowledgeBase;
    advanced_chat_memory_documents: ModelTypes.AdvancedChatMemoryDocument;
    advanced_chat_knowledge_documents: ModelTypes.AdvancedChatKnowledgeDocument;
    advanced_chat_connector_credentials: ModelTypes.AdvancedChatConnectorCredential;
    advanced_chat_connector_credential_bindings: ModelTypes.AdvancedChatConnectorCredentialBinding;
    advanced_chat_skill_packages: ModelTypes.AdvancedChatSkillPackage;
    advanced_chat_packaged_skills: ModelTypes.AdvancedChatPackagedSkill;
    advanced_chat_knowledge_chunks: ModelTypes.AdvancedChatKnowledgeChunk;
    advanced_chat_run_events: ModelTypes.AdvancedChatRunEvent;
    advanced_chat_chat_groups: ModelTypes.AdvancedChatChatGroup;
    advanced_chat_chat_group_members: ModelTypes.AdvancedChatChatGroupMember;
    advanced_chat_chat_group_messages: ModelTypes.AdvancedChatChatGroupMessage;
    advanced_chat_private_conversations: ModelTypes.AdvancedChatPrivateConversation;
    advanced_chat_private_messages: ModelTypes.AdvancedChatPrivateMessage;
    advanced_chat_scheduled_tasks: ModelTypes.AdvancedChatScheduledTask;
    advanced_chat_deliveries: ModelTypes.AdvancedChatDelivery;
    advanced_chat_workspaces: ModelTypes.AdvancedChatWorkspace;
    advanced_chat_workspace_files: ModelTypes.AdvancedChatWorkspaceFile;
    advanced_chat_session_tasks: ModelTypes.AdvancedChatSessionTask;
    advanced_chat_session_folders: ModelTypes.AdvancedChatSessionFolder;
  }
}

export interface AdvancedChatConfig {
  connectorOnlineWindowSeconds: string;
  retryAttempts: number;
  assistantRetryAttempts: number;
  retryDelayMs: number;
  retryMaxDelayMs: number;
  requestTimeoutMs: number;
}

export interface AdvancedChatService {
  registerTool(tool: ChatToolDefinition): () => void;
  tools(): ChatToolDefinition[];
  registerContextProvider(provider: ChatContextProvider): () => void;
  createConnector(
    userId: number,
    name: string,
    remark: string,
  ): Promise<{ device: HarnessConnectorDevice; token: string }>;
  listConnectors(userId: number): Promise<HarnessConnectorDevice[]>;
  listAgents(userId: number): Promise<HarnessAgent[]>;
  createAgent(userId: number, input: AgentInput): Promise<HarnessAgent>;
  updateAgent(
    userId: number,
    id: string,
    input: AgentInput,
  ): Promise<HarnessAgent | undefined>;
  deleteAgent(userId: number, id: string): Promise<void>;
  listSessions(userId: number): Promise<HarnessSession[]>;
  createSession(userId: number, input: SessionInput): Promise<HarnessSession>;
  getSession(
    userId: number,
    sessionId: string,
  ): Promise<Record<string, unknown> | undefined>;
  updateSession(
    userId: number,
    sessionId: string,
    input: Partial<SessionInput> & { folderId?: string },
  ): Promise<Record<string, unknown> | undefined>;
  deleteSession(userId: number, sessionId: string): Promise<boolean>;
  getRun(
    userId: number,
    runId: string,
  ): Promise<Record<string, unknown> | undefined>;
  stopRun(
    userId: number,
    runId: string,
  ): Promise<Record<string, unknown> | undefined>;
  listRunEvents(
    userId: number,
    runId: string,
    after: number,
  ): Promise<Record<string, unknown>[]>;
  listSessionTasks(
    userId: number,
    sessionId: string,
  ): Promise<Record<string, unknown>[]>;
  listSessionFolders(userId: number): Promise<Record<string, unknown>[]>;
  createSessionFolder(
    userId: number,
    name: string,
  ): Promise<AdvancedChatSessionFolder>;
  getUserSettings(userId: number): Promise<Record<string, unknown>>;
  updateUserSettings(
    userId: number,
    input: Record<string, unknown>,
  ): Promise<Record<string, unknown>>;
  listPendingConnectorTasks(
    userId: number,
    runId: string,
  ): Promise<Record<string, unknown>[]>;
  createConnectorTask(
    userId: number,
    deviceId: string,
    action: string,
    payload: Record<string, unknown>,
  ): Promise<ModelTypes.HarnessConnectorTask>;
  listScheduledTasks(
    userId: number,
  ): Promise<ModelTypes.AdvancedChatScheduledTask[]>;
  createScheduledTask(
    userId: number,
    input: ScheduledTaskInput,
  ): Promise<ModelTypes.AdvancedChatScheduledTask>;
  authenticateConnector(
    token: string,
  ): Promise<HarnessConnectorDevice | undefined>;
  heartbeatConnector(
    token: string,
    input: ConnectorRegistration,
  ): Promise<HarnessConnectorDevice | undefined>;
  nextConnectorTask(
    token: string,
  ): Promise<ModelTypes.HarnessConnectorTask | undefined>;
  completeConnectorTask(
    token: string,
    taskId: string,
    success: boolean,
    result: string,
    errorMessage: string,
  ): Promise<boolean>;
  complete(userId: number, input: ChatInput): Promise<ChatResult>;
}
export interface ChatToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute?(
    input: unknown,
    context: { userId: number; sessionId?: string; runId?: string; agentId?: string },
  ): Promise<unknown>;
}
export interface ChatContextProvider {
  id: string;
  provide(input: {
    userId: number;
    sessionId?: string;
    agentId?: string;
  }): Promise<string | undefined> | string | undefined;
}

export interface ChatInput {
  sessionId?: string;
  model: string;
  messages: Array<{
    role: string;
    content: string;
    tool_calls?: unknown[];
    tool_call_id?: string;
  }>;
  userChannelId?: number;
  stream?: boolean;
  maxTokens?: number;
  temperature?: number;
  reasoningEffort?: string;
  disabledToolGroups?: string[];
  mode?: string;
}

export interface ChatResult {
  sessionId: string;
  runId: string;
  message: {
    id: string;
    role: string;
    content: string;
    tool_calls?: unknown[];
  };
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
  connectorOnlineWindowSeconds: Schema.string(
    "Connector online window seconds",
  ).default("60"),
  retryAttempts: Schema.number("Chat retry attempts").default(3),
  assistantRetryAttempts: Schema.number("Assistant retry attempts").default(10),
  retryDelayMs: Schema.number("Chat retry delay milliseconds").default(500),
  retryMaxDelayMs: Schema.number(
    "Chat retry maximum delay milliseconds",
  ).default(30000),
  requestTimeoutMs: Schema.number("Chat request timeout milliseconds").default(
    120000,
  ),
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
  try {
    return JSON.parse(String(value || "{}"));
  } catch {
    return {};
  }
}

export async function apply(ctx: Context, pluginConfig: AdvancedChatConfig) {
  const dashboard = ctx.component.dashboard;
  const packageRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
  );
  ctx.i18n({
    advancedChat: {
      settings: { zh: "聊天设置", en: "Chat settings", ja: "チャット設定" },
      assistant: { zh: "AI 助手", en: "AI assistant", ja: "AIアシスタント" },
      credentials: { zh: "凭据管理", en: "Credentials", ja: "資格情報" },
      settingsGroup: { zh: "聊天", en: "Chat", ja: "チャット" },
    },
  });
  dashboard.addEntry({
    dev: path.resolve(packageRoot, "frontend/index.tsx"),
    prod: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "frontend/advanced-chat.js"),
    plugin: "advanced-chat",
  });
  const tools: ChatToolDefinition[] = [];
  const contextProviders: ChatContextProvider[] = [];
  const db = ctx.component.database;
  await ensureTables(db);
  registerChatFileRoutes(
    ctx,
    db,
    ctx.component.file as import("@velocelab/file").FileService,
  );
  const adapters = ctx.component.adapters as
    import("@velocelab/adapters").AdapterRegistry | undefined;
  registerStudioTools(db, (tool) => {
    tools.push(tool);
    return () => {
      const index = tools.indexOf(tool);
      if (index >= 0) tools.splice(index, 1);
    };
  });
  registerAskUserTool((tool) => {
    tools.push(tool);
    return () => {
      const index = tools.indexOf(tool);
      if (index >= 0) tools.splice(index, 1);
    };
  });
  registerSessionTaskTools(db, (tool) => {
    tools.push(tool);
    return () => {
      const index = tools.indexOf(tool);
      if (index >= 0) tools.splice(index, 1);
    };
  });
  registerRunTools(db, (tool) => {
    tools.push(tool);
    return () => {
      const index = tools.indexOf(tool);
      if (index >= 0) tools.splice(index, 1);
    };
  });
  contextProviders.push({
    id: "session-tasks",
    provide: ({ sessionId }) =>
      sessionId
        ? "For work requiring three or more distinct steps, call tasks_plan first. Keep one task in_progress at a time, then mark it completed or skipped with tasks_update."
        : undefined,
  });
  contextProviders.push({
    id: "ask-user",
    provide: ({ sessionId }) =>
      sessionId
        ? "When the request is ambiguous or requires a user decision, call ask_user with one clear question and preset options. After calling it, end the turn and wait for the user's next message."
        : undefined,
  });
  const service: AdvancedChatService = {
    registerTool(tool) {
      tools.push(tool);
      return () => {
        const i = tools.indexOf(tool);
        if (i >= 0) tools.splice(i, 1);
      };
    },
    tools: () => tools.slice(),
    registerContextProvider(provider) {
      contextProviders.push(provider);
      return () => {
        const i = contextProviders.indexOf(provider);
        if (i >= 0) contextProviders.splice(i, 1);
      };
    },
    async createConnector(userId, name, remark) {
      if (!adapters) throw Error("upstream adapters are not enabled");
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
      const devices = await db.select("advanced_chat_connector_devices", {
        user_id: userId,
      });
      return devices.sort((left, right) =>
        right.updated_at.localeCompare(left.updated_at),
      );
    },
    async listAgents(userId) {
      const agents = await db.select("advanced_chat_agents", {
        user_id: userId,
      });
      return agents.sort((left, right) => left.name.localeCompare(right.name));
    },
    async createAgent(userId, input) {
      const name = input.name.trim();
      if (!userId || !name) throw Error("agent name is required");
      const now = new Date().toISOString();
      // `id` is a NOT NULL primary column in the existing schema and the API
      // identifies agents by `stable_id`, so both carry the same value.
      const id = newID("aca");
      return db.create("advanced_chat_agents", {
        id,
        user_id: userId,
        stable_id: id,
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
      const existing = await db.selectOne("advanced_chat_agents", {
        stable_id: id,
        user_id: userId,
      });
      if (!existing) return undefined;
      const name = input.name.trim();
      if (!name) throw Error("agent name is required");
      await db.update(
        "advanced_chat_agents",
        { stable_id: id, user_id: userId },
        {
          name: name.slice(0, 100),
          prompt: input.prompt.trim(),
          default_model: input.defaultModel.trim(),
          user_channel_id: input.userChannelId || null,
          stream: input.stream,
          skill_ids: JSON.stringify(input.skillIds ?? []),
          mcp_server_ids: JSON.stringify(input.mcpServerIds ?? []),
          updated_at: new Date().toISOString(),
        },
      );
      return db.selectOne("advanced_chat_agents", {
        stable_id: id,
        user_id: userId,
      });
    },
    async deleteAgent(userId, id) {
      await db.remove("advanced_chat_agents", {
        stable_id: id,
        user_id: userId,
      });
    },
    async listSessions(userId) {
      const sessions = await db.select("advanced_chat_sessions", {
        user_id: userId,
      });
      const hydrated = await Promise.all(
        sessions.map(async (session) => service.getSession(userId, session.id)),
      );
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
      const session = await db.selectOne("advanced_chat_sessions", {
        id: sessionId,
        user_id: userId,
      });
      if (!session) return undefined;
      const messages = await db.select("advanced_chat_messages", {
        session_id: sessionId,
        user_id: userId,
      });
      const runs = await db.select("advanced_chat_runs", {
        session_id: sessionId,
        user_id: userId,
      });
      const latestRun = runs.sort((left, right) =>
        right.created_at.localeCompare(left.created_at),
      )[0];
      return {
        ...session,
        skill_ids: decodeList(session.skill_ids),
        mcp_server_ids: decodeList(session.mcp_server_ids),
        knowledge_base_ids: decodeList(session.knowledge_base_ids),
        connector_command_prefixes: decodeList(
          session.connector_command_prefixes,
        ),
        disabled_tool_groups: decodeList(session.disabled_tool_groups),
        messages: messages
          .sort((left, right) => left.sort_order - right.sort_order)
          .map((message) => ({
            ...message,
            content_parts: decodeList(message.content_parts),
            tool_calls: decodeList(message.tool_calls),
          })),
        latest_run: latestRun
          ? {
              ...latestRun,
              tool_call_details: decodeList(latestRun.tool_call_details),
            }
          : undefined,
      };
    },
    async updateSession(userId, sessionId, input) {
      const existing = await db.selectOne("advanced_chat_sessions", {
        id: sessionId,
        user_id: userId,
      });
      if (!existing) return undefined;
      await db.update(
        "advanced_chat_sessions",
        { id: sessionId, user_id: userId },
        {
          ...(input.title !== undefined
            ? { title: input.title.trim().slice(0, 160) }
            : {}),
          ...(input.modelName !== undefined
            ? { model_name: input.modelName.trim() }
            : {}),
          ...(input.userChannelId !== undefined
            ? { user_channel_id: input.userChannelId || null }
            : {}),
          ...(input.agentId !== undefined ? { agent_id: input.agentId } : {}),
          ...(input.folderId !== undefined
            ? { folder_id: input.folderId }
            : {}),
          updated_at: new Date().toISOString(),
        },
      );
      return service.getSession(userId, sessionId);
    },
    async deleteSession(userId, sessionId) {
      const runs = await db.select("advanced_chat_runs", {
        session_id: sessionId,
        user_id: userId,
      });
      for (const run of runs)
        await db.remove("advanced_chat_run_events", {
          run_id: run.id,
          user_id: userId,
        });
      await db.remove("advanced_chat_runs", {
        session_id: sessionId,
        user_id: userId,
      });
      await db.remove("advanced_chat_messages", {
        session_id: sessionId,
        user_id: userId,
      });
      await db.remove("advanced_chat_sessions", {
        id: sessionId,
        user_id: userId,
      });
      return true;
    },
    async getRun(userId, runId) {
      const run = await db.selectOne("advanced_chat_runs", {
        id: runId,
        user_id: userId,
      });
      return run
        ? { ...run, tool_call_details: decodeList(run.tool_call_details) }
        : undefined;
    },
    async stopRun(userId, runId) {
      const existing = await db.selectOne("advanced_chat_runs", {
        id: runId,
        user_id: userId,
      });
      if (!existing) return undefined;
      if (["completed", "failed", "cancelled"].includes(existing.status))
        return service.getRun(userId, runId);
      const now = new Date().toISOString();
      await db.update(
        "advanced_chat_runs",
        { id: runId, user_id: userId },
        {
          status: "cancelled",
          status_message: "cancelled",
          finished_at: now,
          updated_at: now,
        },
      );
      await db.create("advanced_chat_run_events", {
        run_id: runId,
        session_id: existing.session_id,
        user_id: userId,
        seq: 999999,
        event: "cancelled",
        payload: "{}",
        created_at: now,
      });
      return service.getRun(userId, runId);
    },
    async listRunEvents(userId, runId, after) {
      const events = await db.select("advanced_chat_run_events", {
        run_id: runId,
        user_id: userId,
      });
      return events
        .filter((event) => event.seq > after)
        .sort((left, right) => left.seq - right.seq)
        .slice(0, 200)
        .map((event) => ({ ...event, payload: decodeObject(event.payload) }));
    },
    async listSessionTasks(userId, sessionId) {
      const tasks = await db.select("advanced_chat_session_tasks", {
        user_id: userId,
        session_id: sessionId,
      });
      return tasks.sort((left, right) => left.position - right.position);
    },
    async listSessionFolders(userId) {
      const folders = await db.select("advanced_chat_session_folders", {
        user_id: userId,
      });
      return folders.sort((left, right) =>
        left.created_at.localeCompare(right.created_at),
      );
    },
    async createSessionFolder(userId, name) {
      const value = name.trim();
      if (!value || value.length > 80)
        throw Error("Folder name must be between 1 and 80 characters");
      const now = new Date().toISOString();
      return db.create("advanced_chat_session_folders", {
        id: newID("acf"),
        user_id: userId,
        name: value,
        created_at: now,
        updated_at: now,
      });
    },
    async getUserSettings(userId) {
      let settings = await db.selectOne("advanced_chat_user_settings", {
        user_id: userId,
      });
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
      const updates: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };
      if (typeof input.title_model_name === "string")
        updates.title_model_name = input.title_model_name.trim().slice(0, 100);
      if (typeof input.title_user_channel_id === "number")
        updates.title_user_channel_id = input.title_user_channel_id || null;
      if (
        input.title_generation_scope === "all" ||
        input.title_generation_scope === "recent"
      )
        updates.title_generation_scope = input.title_generation_scope;
      if (typeof input.connector_approval_agent_id === "string")
        updates.connector_approval_agent_id =
          input.connector_approval_agent_id.trim();
      if (Array.isArray(input.custom_mcp_servers))
        updates.custom_mcp_servers = JSON.stringify(input.custom_mcp_servers);
      await db.update(
        "advanced_chat_user_settings",
        { user_id: userId },
        updates,
      );
      return service.getUserSettings(userId);
    },
    async listPendingConnectorTasks(userId, runId) {
      const tasks = await db.select("advanced_chat_connector_tasks", {
        user_id: userId,
        run_id: runId,
      });
      return tasks
        .filter((task) =>
          ["queued", "pending_approval", "running"].includes(task.status),
        )
        .sort((left, right) => left.created_at.localeCompare(right.created_at));
    },
    async createConnectorTask(userId, deviceId, action, payload) {
      const device = await db.selectOne("advanced_chat_connector_devices", {
        id: deviceId,
        user_id: userId,
      });
      if (!device || device.status !== "online")
        throw Error("A connected device is required");
      return db.create("advanced_chat_connector_tasks", {
        id: newID("act"),
        user_id: userId,
        device_id: deviceId,
        run_id: "",
        action: action.trim(),
        workspace_path: String(payload.workspace_path ?? ""),
        payload: JSON.stringify(payload),
        status: "queued",
        result: "",
        error_message: "",
        started_at: null,
        finished_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as any);
    },
    async listScheduledTasks(userId) {
      const tasks = await db.select("advanced_chat_scheduled_tasks", {
        user_id: userId,
      });
      return tasks.sort((left, right) =>
        right.updated_at.localeCompare(left.updated_at),
      );
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
      return db.selectOne("advanced_chat_connector_devices", {
        token_hash: hashToken(normalized),
      });
    },
    async heartbeatConnector(token, input) {
      const device = await service.authenticateConnector(token);
      if (!device) return undefined;
      const now = new Date().toISOString();
      await db.update(
        "advanced_chat_connector_devices",
        { id: device.id },
        {
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
        },
      );
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
      const changed = await db.update(
        "advanced_chat_connector_tasks",
        { id: task.id, status: "queued" },
        {
          status: "running",
          started_at: now,
          updated_at: now,
        },
      );
      if (!changed) return undefined;
      return db.selectOne("advanced_chat_connector_tasks", { id: task.id });
    },
    async completeConnectorTask(token, taskId, success, result, errorMessage) {
      const device = await service.authenticateConnector(token);
      if (!device || !taskId.trim()) return false;
      const changed = await db.update(
        "advanced_chat_connector_tasks",
        {
          id: taskId,
          device_id: device.id,
          user_id: device.user_id,
          status: "running",
        },
        {
          status: success ? "completed" : "failed",
          result: result.slice(0, 1_000_000),
          error_message: errorMessage.slice(0, 100_000),
          finished_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      );
      return changed > 0;
    },
    async complete(userId, input) {
      const modelName = input.model.trim();
      if (!modelName || !input.messages.length)
        throw Error("model and messages are required");
      const session = input.sessionId
        ? await db.selectOne("advanced_chat_sessions", {
            id: input.sessionId,
            user_id: userId,
          })
        : await db.create("advanced_chat_sessions", {
            id: newID("acs"),
            user_id: userId,
            folder_id: "",
            title: "",
            run_mode: "assistant",
            agent_id: "",
            agent_group_id: "",
            skill_ids: "[]",
            mcp_server_ids: "[]",
            knowledge_base_ids: "[]",
            connector_device_id: "",
            connector_workspace_path: "",
            connector_auto_approve: false,
            connector_approval_mode: "manual",
            connector_command_prefixes: "[]",
            model_name: modelName,
            user_channel_id: input.userChannelId || null,
            max_tokens: input.maxTokens || 0,
            temperature: input.temperature ?? null,
            reasoning_effort: input.reasoningEffort || "",
            auto_compress_context: true,
            disabled_tool_groups: "[]",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
      if (!session) throw Error("session not found");
      const sessionId = String(session.id);
      const now = new Date().toISOString();
      const prior = await db.select("advanced_chat_messages", {
        session_id: sessionId,
        user_id: userId,
      });
      const userMessage = await db.create("advanced_chat_messages", {
        id: newID("acm"),
        session_id: sessionId,
        user_id: userId,
        role: "user",
        content: input.messages[input.messages.length - 1].content,
        content_parts: "[]",
        tool_calls: "[]",
        input_tokens: 0,
        output_tokens: 0,
        sort_order: prior.length,
        created_at: now,
        updated_at: now,
      });
      const runId = newID("acr");
      await db.create("advanced_chat_runs", {
        id: runId,
        session_id: sessionId,
        user_id: userId,
        status: "running",
        assistant_message_id: "",
        mode: "chat",
        status_message: "",
        current_round: 0,
        error_message: "",
        cost: "0",
        tool_calls: 0,
        tool_call_details: "[]",
        started_at: now,
        created_at: now,
        finished_at: null,
        updated_at: now,
      });
      const channelRows = await db.select("channels", { enabled: true });
      const configs = await db.select("model_configs", { enabled: true });
      const requestedChannel = input.userChannelId
        ? channelRows.filter(
            (row: any) => row.user_channel_id === input.userChannelId,
          )
        : channelRows;
      const selected = configs.find(
        (config: any) =>
          String(config.upstream_model_name || "") === modelName &&
          requestedChannel.some(
            (channel: any) =>
              channel.id === config.channel_id && channel.enabled,
          ),
      );
      const channel = selected
        ? channelRows.find((row: any) => row.id === selected.channel_id)
        : requestedChannel.find((row: any) => row.enabled);
      if (!channel) throw Error("no enabled upstream channel");
      const upstreamModel = selected?.upstream_model_name || modelName;
      const messages = [
        ...prior.map((message: any) => ({
          role: message.role,
          content: message.content,
        })),
        ...input.messages,
      ].map((message: any) => ({
        role: ["system", "user", "assistant", "tool"].includes(message.role)
          ? message.role
          : "user",
        content: String(message.content ?? ""),
        ...(Array.isArray(message.tool_calls)
          ? {
              toolCalls: message.tool_calls.map((call: any) => ({
                id: String(call.id ?? ""),
                name: String(call.function?.name ?? call.name ?? ""),
                arguments: String(
                  call.function?.arguments ?? call.arguments ?? "{}",
                ),
              })),
            }
          : {}),
        ...(message.tool_call_id
          ? { toolCallId: String(message.tool_call_id) }
          : {}),
      }));
      await attachImageFiles(
        userId,
        messages as any,
        db,
        ctx.component.file as import("@velocelab/file").FileService,
      );
      const optionalContext = "";
      const injectedContext = (
        await Promise.all(
          contextProviders.map((provider) =>
            provider.provide({ userId, sessionId, agentId: session.agent_id }),
          ),
        )
      )
        .filter(Boolean)
        .join("\n\n");
      const availableTools = filterToolsByDisabledGroups(
        service.tools(),
        input.disabledToolGroups,
      );
      const request = adapters.build({
        channelType: channel.type,
        model: upstreamModel,
        apiKey: channel.api_key || "",
        stream: input.stream === true,
        messages,
        maxTokens: input.maxTokens,
        temperature: input.temperature,
        reasoningEffort: input.reasoningEffort,
        system:
          [optionalContext, injectedContext].filter(Boolean).join("\n\n") ||
          undefined,
        tools: availableTools
          .filter((tool) => tool?.name)
          .map((tool) => ({
            name: String(tool.name),
            description: String(tool.description ?? ""),
            parameters: tool.parameters ?? {},
          })),
      });
      if (!request) throw Error("no adapter registered for upstream channel");
      const headers = {
        ...request.headers,
        ...(input.stream ? { Accept: "text/event-stream" } : {}),
      };
      const response = await fetchCompletionWithRetry(
        `${String(channel.base_url).replace(/\\\/$/, "")}${request.urlPath}`,
        { method: "POST", headers, body: JSON.stringify(request.body) },
        String(input.mode ?? "chat"),
        {
          retryAttempts: Math.max(1, Number(pluginConfig.retryAttempts) || 3),
          assistantRetryAttempts: Math.max(
            1,
            Number(pluginConfig.assistantRetryAttempts) || 10,
          ),
          retryDelayMs: Math.max(50, Number(pluginConfig.retryDelayMs) || 500),
          retryMaxDelayMs: Math.max(
            100,
            Number(pluginConfig.retryMaxDelayMs) || 30000,
          ),
          requestTimeoutMs: Math.max(
            1000,
            Number(pluginConfig.requestTimeoutMs) || 120000,
          ),
        },
      );
      let streamedContent = "";
      if (
        input.stream &&
        response.ok &&
        response.headers.get("content-type")?.includes("text/event-stream")
      ) {
        await adapters.stream(channel.type, response.clone(), (delta) => {
          streamedContent += delta;
        });
      }
      const text = await response.text();
      if (!response.ok) {
        await db.update(
          "advanced_chat_runs",
          { id: runId },
          {
            status: "failed",
            error_message: text.slice(0, 10000),
            finished_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        );
        throw Error(text || `upstream request failed (${response.status})`);
      }
      let data: any;
      if (input.stream && text.includes("data:")) {
        const chunks = text
          .split(/\r?\n/)
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trim())
          .filter((line) => line && line !== "[DONE]");
        const parsed = chunks.map((chunk) => {
          try {
            return JSON.parse(chunk);
          } catch {
            return {};
          }
        });
        const content = parsed
          .map(
            (item) =>
              item.choices?.[0]?.delta?.content ||
              item.delta?.text ||
              item.candidates?.[0]?.content?.parts
                ?.map((part: any) => part.text || "")
                .join("") ||
              "",
          )
          .join("");
        data = { choices: [{ message: { content }, finish_reason: "stop" }] };
      } else {
        try {
          data = JSON.parse(text);
        } catch {
          data = {};
        }
      }
      const parsed = adapters.parse(channel.type, data);
      let content = parsed?.content || streamedContent;
      const toolCalls = parsed?.toolCalls || [];
      const finishReason = parsed?.finishReason || "stop";
      const toolResults: unknown[] = [];
      if (Array.isArray(toolCalls)) {
        for (const call of toolCalls as any[]) {
          const name = String(call.function?.name ?? call.name ?? "");
          const definition = availableTools.find((tool) => tool.name === name);
          if (!definition?.execute) continue;
          let args: unknown = {};
          try {
            args = JSON.parse(
              String(call.function?.arguments ?? call.arguments ?? "{}"),
            );
          } catch {
            args = {};
          }
          try {
            toolResults.push({
              id: String(call.id ?? ""),
              result: await definition.execute(args, {
                userId,
                sessionId,
                runId,
              }),
            });
          } catch (error) {
            toolResults.push({
              id: String(call.id ?? ""),
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }
      }
      if (toolResults.length > 0 && toolCalls.length > 0) {
        const followupMessages: any[] = [
          ...messages,
          { role: "assistant", content, toolCalls },
          ...toolResults.map((item: any) => ({
            role: "tool",
            content: JSON.stringify(item.result ?? { error: item.error }),
            toolCallId: item.id,
          })),
        ];
        const followup = adapters.build({
          channelType: channel.type,
          model: upstreamModel,
          apiKey: channel.api_key || "",
          stream: false,
          messages: followupMessages,
          maxTokens: input.maxTokens,
          temperature: input.temperature,
          reasoningEffort: input.reasoningEffort,
        });
        if (followup) {
          const followupResponse = await fetch(
            `${String(channel.base_url).replace(/\\\/$/, "")}${followup.urlPath}`,
            {
              method: "POST",
              headers: followup.headers,
              body: JSON.stringify(followup.body),
            },
          );
          if (followupResponse.ok) {
            const followupData = await followupResponse
              .json()
              .catch(() => ({}));
            const followupParsed = adapters.parse(channel.type, followupData);
            if (followupParsed?.content) content = followupParsed.content;
          }
        }
      }
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
        payload: JSON.stringify({
          content,
          finish_reason: finishReason,
          tool_calls: toolCalls,
          tool_results: toolResults,
        }),
        created_at: new Date().toISOString(),
      });
      await db.update(
        "advanced_chat_runs",
        { id: runId },
        {
          tool_calls: toolCalls.length,
          current_round: toolCalls.length > 0 ? 1 : 0,
          status: "completed",
          assistant_message_id: assistant.id,
          finished_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      );
      await db.update(
        "advanced_chat_sessions",
        { id: sessionId },
        { updated_at: new Date().toISOString(), model_name: modelName },
      );
      return {
        sessionId,
        runId,
        message: {
          id: String(assistant.id),
          role: "assistant",
          content,
          tool_calls: toolCalls,
        },
        finishReason,
        inputTokens: parsed?.inputTokens || 0,
        outputTokens: parsed?.outputTokens || 0,
      };
    },
  };
  ctx.registerComponent("advanced-chat", service);
  registerAdvancedChatRoutes(ctx, service);
}
