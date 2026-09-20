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
import type { ChatStreamEvent } from "./stream.js";
import { registerSessionTaskTools } from "./session-tasks.js";
import { registerRunTools } from "./run-tools.js";
import "@velocelab/dashboard";
import "@velocelab/file";
import "@velocelab/database-core";
import { ensureTables } from "./tables.js";

export * from "./types.js";

export const depend = ["database", "dashboard", "file", "adapters"];
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
  /** Creates the agent that always exists, if this user does not have it yet. */
  ensureDefaultAgent(userId: number): Promise<HarnessAgent | undefined>;
  createAgent(userId: number, input: AgentInput): Promise<HarnessAgent>;
  updateAgent(
    userId: number,
    id: string,
    input: AgentInput,
  ): Promise<HarnessAgent | undefined>;
  /** Whether this agent is the default one, which cannot be removed. */
  agentIsDefault(userId: number, id: string): Promise<boolean>;
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
  /**
   * The frontend owns a session's id: it creates the session locally and
   * persists it with a PUT. That PUT has to create the row, or the first message
   * of every new chat fails with "session not found".
   */
  saveSessionSnapshot(
    userId: number,
    sessionId: string,
    input: SessionSnapshotInput,
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
  complete(
    userId: number,
    input: ChatInput,
    hooks?: ChatCompletionHooks,
  ): Promise<ChatResult>;
}
export interface ChatToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute?(
    input: unknown,
    context: {
      userId: number;
      sessionId?: string;
      runId?: string;
      agentId?: string;
      /** Selections the run resolved, so tools can scope themselves to them. */
      skillIds?: string[];
      knowledgeBaseIds?: string[];
      mcpServerIds?: string[];
      mode?: string;
      disabledToolGroups?: string[];
      /**
       * Which machine and folder the session works in, and how strictly its
       * commands are gated. Tools that reach out to a device need all three:
       * without the workspace a relative path lands in the server's own working
       * directory, and without the mode nothing can tell whether an action has
       * to be approved first.
       */
      connectorDeviceId?: string;
      connectorWorkspacePath?: string;
      connectorApprovalMode?: string;
      connectorAutoApprove?: boolean;
    },
  ): Promise<unknown>;
}
export interface ChatContextProvider {
  id: string;
  provide(input: {
    userId: number;
    sessionId?: string;
    agentId?: string;
    skillIds?: string[];
    knowledgeBaseIds?: string[];
    mcpServerIds?: string[];
    mode?: string;
  }): Promise<string | undefined> | string | undefined;
}

export interface ChatInput {
  sessionId?: string;
  title?: string;
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
  agentId?: string;
  agentGroupId?: string;
  skillIds?: string[];
  knowledgeBaseIds?: string[];
  mcpServerIds?: string[];
  connectorDeviceId?: string;
  connectorWorkspacePath?: string;
  connectorAutoApprove?: boolean;
  connectorApprovalMode?: string;
  connectorCommandPrefixes?: string[];
  autoCompressContext?: boolean;
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
  /** Set when the run was stopped or the caller went away mid-flight. */
  cancelled?: boolean;
}

export interface ChatCompletionHooks {
  /** Aborted when the caller (or the browser) goes away. */
  signal?: AbortSignal;
  /** Receives the events of the `text/event-stream` contract, in order. */
  onEvent?: (event: ChatStreamEvent) => void;
}

/**
 * A request the caller got wrong, as opposed to an upstream that failed.
 *
 * The route used to guess the status from the message text, which misfiled a
 * real upstream failure: `Invalid URL (POST /v1/v1/chat/completions)` matched
 * `/invalid/` and the browser was told "400 Bad Request" for what was actually a
 * channel misconfiguration.
 */
export class ChatInputError extends Error {}

/**
 * Joins a channel's base URL with an upstream path.
 *
 * Channels are configured either as a bare host (`https://api.deepseek.com`) or
 * with the API version already in the base (`https://api.deepseek.com/v1`), and
 * appending blindly turned the second shape into `/v1/v1/chat/completions`,
 * which the upstream answered with `Invalid URL (POST /v1/v1/chat/completions)`.
 * A version the base already carries is not repeated.
 */
export function upstreamURL(baseURL: unknown, urlPath: unknown): string {
  const base = String(baseURL ?? "")
    .trim()
    .replace(/\/+$/, "");
  const suffix = String(urlPath ?? "").trim();
  const version = suffix.match(/^\/(v\d+)\//)?.[1];
  if (version && new RegExp(`/${version}$`).test(base))
    return `${base}${suffix.slice(version.length + 1)}`;
  return `${base}${suffix}`;
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

/**
 * A whole session as the frontend owns it. The client generates the id and
 * persists everything it knows with one PUT, which is why every field is
 * optional: what it omits is meant to fall back to a default.
 */
export interface SessionSnapshotInput {
  title?: string;
  runMode?: string;
  agentId?: string;
  agentGroupId?: string;
  skillIds?: unknown[];
  mcpServerIds?: unknown[];
  knowledgeBaseIds?: unknown[];
  connectorDeviceId?: string;
  connectorWorkspacePath?: string;
  connectorAutoApprove?: boolean;
  connectorApprovalMode?: string;
  connectorCommandPrefixes?: unknown[];
  modelName?: string;
  userChannelId?: number;
  maxTokens?: number;
  temperature?: number | null;
  reasoningEffort?: string;
  autoCompressContext?: boolean;
  disabledToolGroups?: unknown[];
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
  ).key("advanced-chat.config.connectorOnlineWindowSeconds").default("60"),
  retryAttempts: Schema.number("Chat retry attempts").key("advanced-chat.config.retryAttempts").default(3),
  assistantRetryAttempts: Schema.number("Assistant retry attempts").key("advanced-chat.config.assistantRetryAttempts").default(10),
  retryDelayMs: Schema.number("Chat retry delay milliseconds").key("advanced-chat.config.retryDelayMs").default(500),
  retryMaxDelayMs: Schema.number(
    "Chat retry maximum delay milliseconds",
  ).key("advanced-chat.config.retryMaxDelayMs").default(30000),
  requestTimeoutMs: Schema.number("Chat request timeout milliseconds").key("advanced-chat.config.requestTimeoutMs").default(
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

/**
 * Selections reach a run from three places: the request, the session the run
 * belongs to, and the agent that session pins. The request wins, then the
 * session, and the agent only fills a gap the session never set — so clearing a
 * selection in the UI really clears it instead of falling back to the agent.
 */
function resolveList(
  fromRequest: string[] | undefined,
  fromSession: unknown,
  fromAgent: unknown,
) {
  if (Array.isArray(fromRequest)) return fromRequest.map(String);
  const session = decodeList(fromSession).map(String);
  if (session.length) return session;
  return decodeList(fromAgent).map(String);
}

/**
 * Runs currently executing in this process, so a stop request can abort the
 * upstream call instead of only marking the row. A run executes inside the HTTP
 * handler that started it, which is what makes this registry necessary.
 */
const inFlightRuns = new Map<string, AbortController>();

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
  // The one agent that always exists. Its identity is the reserved `stable_id`
  // the Go implementation used, which the agents page already relies on, rather
  // than a new flag: renaming the agent must not be able to orphan the rule.
  const DEFAULT_AGENT_ID = "default";
  const DEFAULT_AGENT_NAME = "Default";
  /**
   * An agent is identified by `stable_id`, but rows written before that column
   * existed only have `id`, so both are matched.
   */
  const agentByID = async (userId: number, id: string) =>
    db.selectOne("advanced_chat_agents", {
      user_id: userId,
      $or: [{ stable_id: id }, { id }],
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
      if (userId === undefined || !trimmedName) throw Error("connector name is required");
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
      return agents.sort((left, right) => {
        // The default agent leads the list: it is what a chat starts from when
        // nothing else has been chosen.
        const leftDefault = String(left.stable_id ?? "") === DEFAULT_AGENT_ID;
        const rightDefault = String(right.stable_id ?? "") === DEFAULT_AGENT_ID;
        if (leftDefault !== rightDefault) return leftDefault ? -1 : 1;
        return left.name.localeCompare(right.name);
      });
    },
    /**
     * The agent that always exists. Without it a user who has never created one
     * has nothing to chat with, and deleting the last agent leaves them there.
     * Created on first use, then kept — the same shape the Go implementation
     * gave it, so a database carried over from it keeps working.
     */
    async ensureDefaultAgent(userId) {
      if (userId === undefined) return undefined;
      const existing = await db.selectOne("advanced_chat_agents", {
        user_id: userId,
        stable_id: DEFAULT_AGENT_ID,
      });
      if (existing) return existing;
      // An agent the user happens to have named after the default is adopted
      // rather than colliding with the unique (user_id, name) index.
      const named = await db.selectOne("advanced_chat_agents", {
        user_id: userId,
        name: DEFAULT_AGENT_NAME,
      });
      const now = new Date().toISOString();
      if (named) {
        await db.update(
          "advanced_chat_agents",
          { id: named.id, user_id: userId },
          { stable_id: DEFAULT_AGENT_ID, updated_at: now },
        );
        return db.selectOne("advanced_chat_agents", {
          id: named.id,
          user_id: userId,
        });
      }
      return db.create("advanced_chat_agents", {
        id: newID("aca"),
        user_id: userId,
        stable_id: DEFAULT_AGENT_ID,
        name: DEFAULT_AGENT_NAME,
        // Empty on purpose, as it was before: the model comes from the composer,
        // and an empty prompt means no system message. Editing it changes a run
        // like any other agent.
        prompt: "",
        default_model: "",
        user_channel_id: null,
        stream: false,
        skill_ids: "[]",
        mcp_server_ids: "[]",
        knowledge_base_ids: "[]",
        preset_messages: "[]",
        created_at: now,
        updated_at: now,
      });
    },
    async createAgent(userId, input) {
      const name = input.name.trim();
      if (userId === undefined || !name) throw Error("agent name is required");
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
      const existing: any = await agentByID(userId, id);
      if (!existing) return undefined;
      const name = input.name.trim();
      if (!name) throw Error("agent name is required");
      await db.update(
        "advanced_chat_agents",
        { id: existing.id, user_id: userId },
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
        id: existing.id,
        user_id: userId,
      });
    },
    async deleteAgent(userId, id) {
      const existing: any = await agentByID(userId, id);
      if (!existing) return;
      await db.remove("advanced_chat_agents", {
        user_id: userId,
        $or: [{ stable_id: id }, { id }],
      });
    },
    async agentIsDefault(userId, id) {
      const existing: any = await agentByID(userId, id);
      return (
        String(existing?.stable_id ?? "") === DEFAULT_AGENT_ID ||
        String(existing?.id ?? "") === DEFAULT_AGENT_ID
      );
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
    async saveSessionSnapshot(userId, sessionId, input) {
      const id = String(sessionId ?? "").trim();
      // An id the client made up still has to be usable as a key, so keep it
      // small and refuse the empty one.
      if (userId === undefined || !id || id.length > 191) return undefined;
      const mode = ["chat", "assistant", "agent_group"].includes(
        String(input.runMode ?? ""),
      )
        ? String(input.runMode)
        : "assistant";
      let agentId = String(input.agentId ?? "").trim();
      if (mode === "agent_group") agentId = "";
      else if (!agentId) agentId = DEFAULT_AGENT_ID;
      // A session may name the default agent, so make sure it exists before the
      // row points at it.
      if (agentId === DEFAULT_AGENT_ID) await service.ensureDefaultAgent(userId);
      const now = new Date().toISOString();
      const fields = {
        title: String(input.title ?? "").trim().slice(0, 200),
        run_mode: mode,
        agent_id: agentId,
        agent_group_id: mode === "agent_group" ? String(input.agentGroupId ?? "") : "",
        skill_ids: JSON.stringify(input.skillIds ?? []),
        mcp_server_ids: JSON.stringify(input.mcpServerIds ?? []),
        knowledge_base_ids: JSON.stringify(input.knowledgeBaseIds ?? []),
        connector_device_id: String(input.connectorDeviceId ?? ""),
        connector_workspace_path: String(input.connectorWorkspacePath ?? ""),
        connector_auto_approve: input.connectorAutoApprove === true,
        connector_approval_mode: String(input.connectorApprovalMode ?? "manual"),
        connector_command_prefixes: JSON.stringify(
          input.connectorCommandPrefixes ?? [],
        ),
        model_name: String(input.modelName ?? "").trim(),
        user_channel_id: input.userChannelId || null,
        max_tokens: Number(input.maxTokens ?? 0) || 0,
        temperature: input.temperature ?? null,
        reasoning_effort: String(input.reasoningEffort ?? ""),
        auto_compress_context: input.autoCompressContext !== false,
        disabled_tool_groups: JSON.stringify(input.disabledToolGroups ?? []),
        updated_at: now,
      };
      const existing = await db.selectOne("advanced_chat_sessions", {
        id,
        user_id: userId,
      });
      if (existing)
        // `folder_id` is left alone: the frontend moves sessions between folders
        // through its own route and never sends the field here.
        await db.update("advanced_chat_sessions", { id, user_id: userId }, fields);
      else
        await db.create("advanced_chat_sessions", {
          id,
          user_id: userId,
          folder_id: "",
          ...fields,
          created_at: now,
        });
      return service.getSession(userId, id);
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
      // Abort the upstream request too. Marking the row alone would leave the
      // call running to completion and overwrite this status afterwards.
      inFlightRuns.get(runId)?.abort();
      const now = new Date().toISOString();
      // The status is part of the filter, so two stop requests racing each
      // other cannot both write the terminal row and its event.
      const changed = await db.update(
        "advanced_chat_runs",
        { id: runId, user_id: userId, status: existing.status },
        {
          status: "cancelled",
          status_message: "cancelled",
          finished_at: now,
          updated_at: now,
        },
      );
      if (changed)
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
      if (userId === undefined || !name || !scheduleType || !input.message.trim()) {
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
    async complete(userId, input, hooks) {
      const requestedModel = String(input.model ?? "").trim();
      // The legacy answered these two with their own messages
      // (`advanced_chat_completion.go`: "Messages are required" / "Model is
      // required"), which is also what makes a rejection diagnosable.
      if (!input.messages.length) throw new ChatInputError("Messages are required");
      const emit = (type: ChatStreamEvent["type"], payload: Record<string, unknown>) =>
        hooks?.onEvent?.({ type, payload });
      // The client owns the session id and saves the session itself, so a run
      // that arrives first must still work: an unknown id is created rather than
      // answered with "session not found", which is what a first message used to
      // get when its snapshot had not landed yet.
      const session = input.sessionId
        ? ((await db.selectOne("advanced_chat_sessions", {
            id: input.sessionId,
            user_id: userId,
          })) ??
          (await service.saveSessionSnapshot(userId, input.sessionId, {
            title: input.title,
            runMode: input.mode,
            agentId: input.agentId,
            agentGroupId: input.agentGroupId,
            skillIds: input.skillIds,
            mcpServerIds: input.mcpServerIds,
            knowledgeBaseIds: input.knowledgeBaseIds,
            connectorDeviceId: input.connectorDeviceId,
            connectorWorkspacePath: input.connectorWorkspacePath,
            connectorAutoApprove: input.connectorAutoApprove,
            connectorApprovalMode: input.connectorApprovalMode,
            connectorCommandPrefixes: input.connectorCommandPrefixes,
            modelName: input.model,
            userChannelId: input.userChannelId,
            maxTokens: input.maxTokens,
            temperature: input.temperature,
            reasoningEffort: input.reasoningEffort,
            autoCompressContext: input.autoCompressContext,
            disabledToolGroups: input.disabledToolGroups,
          })))
        : await db.create("advanced_chat_sessions", {
            id: newID("acs"),
            user_id: userId,
            folder_id: "",
            title: String(input.title ?? "").slice(0, 200),
            run_mode: String(input.mode ?? "assistant"),
            agent_id: String(input.agentId ?? ""),
            agent_group_id: String(input.agentGroupId ?? ""),
            skill_ids: JSON.stringify(input.skillIds ?? []),
            mcp_server_ids: JSON.stringify(input.mcpServerIds ?? []),
            knowledge_base_ids: JSON.stringify(input.knowledgeBaseIds ?? []),
            connector_device_id: String(input.connectorDeviceId ?? ""),
            connector_workspace_path: String(input.connectorWorkspacePath ?? ""),
            connector_auto_approve: input.connectorAutoApprove === true,
            connector_approval_mode: String(
              input.connectorApprovalMode ?? "manual",
            ),
            connector_command_prefixes: JSON.stringify(
              input.connectorCommandPrefixes ?? [],
            ),
            model_name: requestedModel,
            user_channel_id: input.userChannelId || null,
            max_tokens: input.maxTokens || 0,
            temperature: input.temperature ?? null,
            reasoning_effort: input.reasoningEffort || "",
            auto_compress_context: input.autoCompressContext !== false,
            disabled_tool_groups: JSON.stringify(input.disabledToolGroups ?? []),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
      // Only a malformed id can get here now: an unknown one is created above.
      if (!session) throw new ChatInputError("Invalid session id");
      const sessionId = String(session.id);
      const now = new Date().toISOString();
      // Resolve everything the run uses before touching the upstream: the
      // request wins, the session is the fallback, and the agent only fills a
      // gap the session never set. A chat with no agent chosen runs the default
      // one, which is why it is created on demand rather than left missing.
      const agentKey =
        String(input.agentId ?? session.agent_id ?? "").trim() || DEFAULT_AGENT_ID;
      const agent =
        agentKey === DEFAULT_AGENT_ID
          ? await service.ensureDefaultAgent(userId)
          : ((await db.selectOne("advanced_chat_agents", {
              user_id: userId,
              stable_id: agentKey,
            })) ??
            (await db.selectOne("advanced_chat_agents", {
              user_id: userId,
              id: agentKey,
            })));
      const mode = String(input.mode ?? session.run_mode ?? "chat").trim() || "chat";
      const modelName = String(agent?.default_model ?? "").trim() || requestedModel;
      // An agent group run carries no model of its own — every member resolves
      // theirs — so the client sends an empty one and the legacy only demanded a
      // model outside that mode (`modelName == "" && mode != agentGroup`).
      if (!modelName && mode !== "agent_group")
        throw new ChatInputError("Model is required");
      if (mode === "agent_group")
        // The Studio orchestration that fans a run out to a group's members is
        // not ported yet, so a group run cannot be served. Saying that is better
        // than continuing with an empty model and failing later on a channel
        // that serves model "".
        throw new ChatInputError(
          "Agent group runs are not implemented yet; use assistant mode for now",
        );
      const userChannelId =
        input.userChannelId ??
        (agent?.user_channel_id ? Number(agent.user_channel_id) : undefined) ??
        (session.user_channel_id ? Number(session.user_channel_id) : undefined);
      const maxTokens =
        input.maxTokens ?? (Number(session.max_tokens ?? 0) || 0);
      const temperature =
        input.temperature ??
        (session.temperature === null || session.temperature === undefined
          ? undefined
          : Number(session.temperature));
      const reasoningEffort =
        input.reasoningEffort ?? String(session.reasoning_effort ?? "");
      const disabledToolGroups =
        input.disabledToolGroups ??
        decodeList(session.disabled_tool_groups).map(String);
      const skillIds = resolveList(
        input.skillIds,
        session.skill_ids,
        agent?.skill_ids,
      );
      const knowledgeBaseIds = resolveList(
        input.knowledgeBaseIds,
        session.knowledge_base_ids,
        agent?.knowledge_base_ids,
      );
      const mcpServerIds = resolveList(
        input.mcpServerIds,
        session.mcp_server_ids,
        agent?.mcp_server_ids,
      );
      const connectorDeviceId = String(
        input.connectorDeviceId ?? session.connector_device_id ?? "",
      );
      await db.update(
        "advanced_chat_sessions",
        { id: sessionId, user_id: userId },
        {
          model_name: modelName,
          run_mode: mode,
          agent_id: agentKey,
          user_channel_id: userChannelId ?? null,
          auto_compress_context: input.autoCompressContext !== false,
          skill_ids: JSON.stringify(skillIds),
          knowledge_base_ids: JSON.stringify(knowledgeBaseIds),
          mcp_server_ids: JSON.stringify(mcpServerIds),
          disabled_tool_groups: JSON.stringify(disabledToolGroups),
          updated_at: now,
        },
      );
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
      void userMessage;
      const runId = newID("acr");
      await db.create("advanced_chat_runs", {
        id: runId,
        session_id: sessionId,
        user_id: userId,
        status: "running",
        assistant_message_id: "",
        mode,
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
      // The run executes inside this call, so the only way a stop request can
      // reach it is through a registry the handler can find by run id.
      const runController = new AbortController();
      const abortRun = () => runController.abort();
      if (hooks?.signal) {
        if (hooks.signal.aborted) runController.abort();
        else hooks.signal.addEventListener("abort", abortRun, { once: true });
      }
      inFlightRuns.set(runId, runController);
      const cancelled = async () => {
        const row = await db.selectOne("advanced_chat_runs", {
          id: runId,
          user_id: userId,
        });
        return String(row?.status ?? "") === "cancelled";
      };
      const markCancelled = async () => {
        const finishedAt = new Date().toISOString();
        // `stopRun` may already have written the terminal state; never move a
        // finished run back out of it.
        const changed = await db.update(
          "advanced_chat_runs",
          { id: runId, user_id: userId, status: "running" },
          {
            status: "cancelled",
            status_message: "cancelled",
            finished_at: finishedAt,
            updated_at: finishedAt,
          },
        );
        // A stop request that arrived first wrote both the row and its own
        // event; a second event would collide with it on (run_id, seq).
        if (!changed) return;
        await db.create("advanced_chat_run_events", {
          run_id: runId,
          session_id: sessionId,
          user_id: userId,
          seq: 999999,
          event: "cancelled",
          payload: "{}",
          created_at: finishedAt,
        });
      };
      const cancelledResult = (): ChatResult => ({
        sessionId,
        runId,
        message: { id: "", role: "assistant", content: "", tool_calls: [] },
        finishReason: "cancelled",
        inputTokens: 0,
        outputTokens: 0,
        cancelled: true,
      });
      try {
        return await executeRun();
      } finally {
        inFlightRuns.delete(runId);
        hooks?.signal?.removeEventListener("abort", abortRun);
      }

      async function executeRun(): Promise<ChatResult> {
        const [channelRows, configs, catalogModels] = await Promise.all([
          db.select("channels", { enabled: true }),
          db.select("model_configs", { enabled: true }),
          db.select("models", { enabled: true }),
        ]);
        const channelsByID = new Map(
          channelRows.map((row: any) => [Number(row.id), row]),
        );
        const catalogByID = new Map(
          catalogModels.map((row: any) => [Number(row.id), row]),
        );
        // Candidates are enabled bindings on enabled channels whose enabled
        // catalog model carries the requested name — the name the picker
        // offered, not the upstream alias. `userChannelId` pins a channel by its
        // own id (old/internal/service/chat_executor.go `serverChatCandidates`
        // filters `channels.id`, not the legacy `channels.user_channel_id`).
        const candidates = configs
          .flatMap((config: any) => {
            const channel = channelsByID.get(Number(config.channel_id));
            if (!channel) return [];
            if (userChannelId && Number(channel.id) !== userChannelId) return [];
            const catalog = catalogByID.get(Number(config.model_id));
            if (!catalog || String(catalog.model_name ?? "") !== modelName)
              return [];
            return [{ config, channel }];
          })
          // Same order as the old query: priority DESC, weight DESC, id ASC.
          .sort(
            (left: any, right: any) =>
              Number(right.channel.priority ?? 0) -
                Number(left.channel.priority ?? 0) ||
              Number(right.channel.weight ?? 0) - Number(left.channel.weight ?? 0) ||
              Number(left.channel.id) - Number(right.channel.id),
          );
        const selected = candidates[0];
        if (!selected)
          throw Error(
            `no enabled upstream channel serves model ${modelName}`,
          );
        const channel = selected.channel;
        const upstreamModel =
          String(selected.config.upstream_model_name ?? "").trim() || modelName;
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
              provider.provide({
                userId,
                sessionId,
                agentId: agentKey,
                skillIds,
                knowledgeBaseIds,
                mcpServerIds,
                mode,
              }),
            ),
          )
        )
          .filter(Boolean)
          .join("\n\n");
        const availableTools = filterToolsByDisabledGroups(
          service.tools(),
          disabledToolGroups,
        );
        emit("status", { message: "loading_tools" });
        const systemPrompt =
          [
            String(agent?.prompt ?? "").trim(),
            optionalContext,
            injectedContext,
          ]
            .filter(Boolean)
            .join("\n\n") || undefined;
        const toolPayload = availableTools
          .filter((tool) => tool?.name)
          .map((tool) => ({
            name: String(tool.name),
            description: String(tool.description ?? ""),
            parameters: tool.parameters ?? {},
          }));
        const request = adapters.build({
          channelType: channel.type,
          model: upstreamModel,
          apiKey: channel.api_key || "",
          stream: input.stream === true,
          messages,
          maxTokens,
          temperature,
          reasoningEffort,
          system: systemPrompt,
          tools: toolPayload,
        });
        if (!request) throw Error("no adapter registered for upstream channel");
        const headers = {
          ...request.headers,
          ...(input.stream ? { Accept: "text/event-stream" } : {}),
        };
        emit("status", { message: "stream_started" });
        let response: Response;
        try {
          response = await fetchCompletionWithRetry(
            ctx,
            upstreamURL(channel.base_url, request.urlPath),
            { method: "POST", headers, body: JSON.stringify(request.body) },
            mode,
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
              signal: runController.signal,
              onRetry: (attempt, total) =>
                emit("status", { message: `retrying:${attempt}/${total}` }),
            },
          );
        } catch (error) {
          if (runController.signal.aborted || (await cancelled())) {
            await markCancelled();
            return cancelledResult();
          }
          throw error;
        }
        let streamedContent = "";
        const streaming =
          input.stream === true &&
          response.headers.get("content-type")?.includes("text/event-stream") ===
            true;
        if (streaming && response.ok) {
          emit("status", { message: "assistant_started" });
          await adapters.stream(channel.type, response.clone(), (delta) => {
            streamedContent += delta;
            emit("text", { delta, round: 1 });
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
        let parsed = adapters.parse(channel.type, data);
        let content = parsed?.content || streamedContent;
        let toolCalls: unknown[] = parsed?.toolCalls ?? [];
        let finishReason = parsed?.finishReason || "stop";
        const inputTokens = Number(parsed?.inputTokens || 0);
        const outputTokens = Number(parsed?.outputTokens || 0);
        const contentParts: Array<{ round: number; content: string }> =
          streamedContent.trim()
            ? [{ round: 1, content: streamedContent }]
            : [];
        const toolCallDetails: Array<Record<string, unknown>> = [];
        let runEventSeq = 0;
        // An assistant turn is not a single question and answer: a tool call has
        // to be able to start another round. The limits match the ones the Go
        // implementation used per run mode.
        const maxToolRounds =
          mode === "assistant" || mode === "agent_group" ? 20 : 8;
        const conversation: any[] = [...messages];
        let round = 1;
        for (
          let step = 0;
          Array.isArray(toolCalls) && toolCalls.length > 0 && step < maxToolRounds;
          step += 1
        ) {
          const calls = toolCalls as any[];
          const results: Array<{
            id: string;
            name: string;
            status: string;
            arguments: unknown;
            result?: string;
            error?: string;
          }> = [];
          for (const call of calls) {
            const name = String(call.function?.name ?? call.name ?? "");
            const id = String(call.id ?? "");
            let args: unknown = {};
            try {
              args = JSON.parse(
                String(call.function?.arguments ?? call.arguments ?? "{}"),
              );
            } catch {
              args = {};
            }
            const definition = availableTools.find((tool) => tool.name === name);
            if (!definition?.execute) {
              const message = `unknown tool: ${name}`;
              results.push({ id, name, status: "error", arguments: args, error: message });
              emit("tool_call", {
                id,
                name,
                status: "error",
                arguments: args,
                result: JSON.stringify({ error: message }),
                round,
              });
              continue;
            }
            try {
              // Publish the tool call before awaiting it. Connector commands may
              // wait for an approval or a long-running local process; the client
              // merges the later result event into this same call by id.
              emit("tool_call", { id, name, status: "running", arguments: args, round });
              const value = await definition.execute(args, {
                userId,
                sessionId,
                runId,
                agentId: agentKey,
                skillIds,
                knowledgeBaseIds,
                mcpServerIds,
                mode,
                disabledToolGroups,
                // The device, the folder and the approval mode travel with the
                // run: a connector tool executed without them either lands in
                // the server's own directory or cannot tell whether the user
                // has already allowed the action.
                connectorDeviceId,
                connectorWorkspacePath: String(
                  input.connectorWorkspacePath ??
                    session.connector_workspace_path ??
                    "",
                ),
                connectorApprovalMode: String(
                  input.connectorApprovalMode ??
                    session.connector_approval_mode ??
                    "manual",
                ),
                connectorAutoApprove:
                  input.connectorAutoApprove === true ||
                  session.connector_auto_approve === true ||
                  Number(session.connector_auto_approve ?? 0) === 1,
              });
              const serialized = JSON.stringify(value ?? null);
              results.push({ id, name, status: "ok", arguments: args, result: serialized });
              emit("tool_call", {
                id,
                name,
                status: "ok",
                arguments: args,
                result: serialized,
                round,
              });
            } catch (error) {
              const message = error instanceof Error ? error.message : String(error);
              results.push({ id, name, status: "error", arguments: args, error: message });
              emit("tool_call", {
                id,
                name,
                status: "error",
                arguments: args,
                result: JSON.stringify({ error: message }),
                round,
              });
            }
          }
          toolCallDetails.push(...results);
          // `agent_task` belongs to the Agent Studio convention for sub-agent
          // snapshots, whose payloads carry `task_id`/`agent_id`; a tool round is
          // this run's own progress and is recorded under its own name so it does
          // not masquerade as a sub-agent.
          await db.create("advanced_chat_run_events", {
            run_id: runId,
            session_id: sessionId,
            user_id: userId,
            seq: (runEventSeq += 1),
            event: "tool_round",
            payload: JSON.stringify({ round, tool_calls: results }),
            created_at: new Date().toISOString(),
          });
          conversation.push({ role: "assistant", content, toolCalls });
          conversation.push(
            ...results.map((item) => ({
              role: "tool",
              content: item.result ?? JSON.stringify({ error: item.error }),
              toolCallId: item.id,
            })),
          );
          round += 1;
          emit("status", { message: "model_round" });
          await db.update(
            "advanced_chat_runs",
            { id: runId, user_id: userId },
            {
              current_round: round,
              tool_calls: toolCallDetails.length,
              updated_at: new Date().toISOString(),
            },
          );
          const followup = adapters.build({
            channelType: channel.type,
            model: upstreamModel,
            apiKey: channel.api_key || "",
            stream: false,
            messages: conversation as any,
            maxTokens,
            temperature,
            reasoningEffort,
            system: systemPrompt,
            // Without tools on the follow-up the agent could not chain a second
            // step, which made the previous single round the whole run.
            tools: toolPayload,
          });
          if (!followup) break;
          let followupResponse: Response;
          try {
            followupResponse = await fetchCompletionWithRetry(
              ctx,
              upstreamURL(channel.base_url, followup.urlPath),
              {
                method: "POST",
                headers: followup.headers,
                body: JSON.stringify(followup.body),
              },
              mode,
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
                signal: runController.signal,
              },
            );
          } catch (error) {
            if (runController.signal.aborted || (await cancelled())) {
              await markCancelled();
              return cancelledResult();
            }
            throw error;
          }
          if (!followupResponse.ok) {
            // Keep the rounds that already succeeded instead of losing the turn.
            finishReason = "error";
            break;
          }
          const followupData = await followupResponse.json().catch(() => ({}));
          parsed = adapters.parse(channel.type, followupData);
          const roundContent = parsed?.content ?? "";
          if (roundContent) {
            content = roundContent;
            contentParts.push({ round, content: roundContent });
          }
          finishReason = parsed?.finishReason || "stop";
          toolCalls = parsed?.toolCalls ?? [];
        }
        // A stop request may have landed while the last round was in flight; the
        // run must not come back to life as `completed` after that.
        if (runController.signal.aborted || (await cancelled())) {
          await markCancelled();
          return cancelledResult();
        }
        const finishedAt = new Date().toISOString();
        const assistant = await db.create("advanced_chat_messages", {
          id: newID("acm"),
          session_id: sessionId,
          user_id: userId,
          role: "assistant",
          content,
          content_parts: JSON.stringify(contentParts),
          tool_calls: JSON.stringify(toolCallDetails),
          input_tokens: inputTokens,
          output_tokens: outputTokens,
          sort_order: prior.length + 1,
          created_at: finishedAt,
          updated_at: finishedAt,
        });
        await db.create("advanced_chat_run_events", {
          run_id: runId,
          session_id: sessionId,
          user_id: userId,
          seq: (runEventSeq += 1),
          event: "completed",
          payload: JSON.stringify({
            content,
            content_parts: contentParts,
            finish_reason: finishReason,
            tool_call_details: toolCallDetails,
          }),
          created_at: finishedAt,
        });
        await db.update(
          "advanced_chat_runs",
          { id: runId, user_id: userId },
          {
            tool_calls: toolCallDetails.length,
            current_round: round,
            status: "completed",
            status_message: "",
            assistant_message_id: String(assistant.id),
            tool_call_details: JSON.stringify(toolCallDetails),
            finished_at: finishedAt,
            updated_at: finishedAt,
          },
        );
        await db.update(
          "advanced_chat_sessions",
          { id: sessionId, user_id: userId },
          { updated_at: finishedAt, model_name: modelName },
        );
        await ctx.emit("advanced-chat.usage", {
          userId,
          modelName,
          inputTokens,
          outputTokens,
          metadata: { sessionId, runId, channelId: Number(selected.channel.id), modelConfigId: Number(selected.config.id) },
        }).catch(() => undefined);
        emit("done", {
          message: { content, content_parts: contentParts },
          tool_call_details: toolCallDetails,
          input_tokens: inputTokens,
          output_tokens: outputTokens,
        });
        return {
          sessionId,
          runId,
          message: {
            id: String(assistant.id),
            role: "assistant",
            content,
            tool_calls: toolCallDetails,
          },
          finishReason,
          inputTokens,
          outputTokens,
        };
      }
    },
  };
  ctx.registerComponent("advanced-chat", service);
  registerAdvancedChatRoutes(ctx, service);
}
