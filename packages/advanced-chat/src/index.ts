import { randomBytes, createHash } from "node:crypto";
import { Context, Database, Schema } from "yumeri";
import type {
  HarnessAgent,
  HarnessConnectorDevice,
  HarnessSession,
} from "@velocelab/model";

export const depend = ["velocelab-core", "database", "model", "file"];
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
  listScheduledTasks(userId: number): Promise<import("@velocelab/model").AdvancedChatScheduledTask[]>;
  createScheduledTask(userId: number, input: ScheduledTaskInput): Promise<import("@velocelab/model").AdvancedChatScheduledTask>;
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

export function apply(ctx: Context, pluginConfig: AdvancedChatConfig) {
  const db = ctx.component.database as Database;
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
      return sessions.sort((left, right) => right.updated_at.localeCompare(left.updated_at));
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
  };
  ctx.registerComponent("advanced-chat", service);
}
