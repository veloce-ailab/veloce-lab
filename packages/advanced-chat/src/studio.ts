import { randomUUID } from "node:crypto";
import type { Database } from "yumeri";
import type { ChatToolDefinition } from "./index.js";

export function registerStudioTools(
  db: Database,
  register: (tool: ChatToolDefinition) => () => void,
) {
  const event = async (
    runId: string,
    userId: number,
    payload: Record<string, unknown>,
  ) => {
    if (!runId) return;
    await db.create("advanced_chat_run_events", {
      run_id: runId,
      session_id: "",
      user_id: userId,
      seq: Date.now(),
      event: "agent_task",
      payload: JSON.stringify(payload),
      created_at: new Date().toISOString(),
    } as any);
  };
  const tools: ChatToolDefinition[] = [
    {
      name: "query_sub_agent_status",
      description:
        "Query the latest Agent Studio sub-agent progress snapshots.",
      parameters: {
        type: "object",
        properties: {
          agent_id: { type: "string" },
          max_agents: { type: "integer" },
          include_all: { type: "boolean" },
        },
      },
      execute: async (input, context) => {
        const value = (input ?? {}) as any;
        const events = context.runId
          ? await db.select("advanced_chat_run_events", {
              run_id: context.runId,
              user_id: context.userId,
              event: "agent_task",
            })
          : [];
        const states = new Map<string, any>();
        for (const row of events as any[]) {
          try {
            const payload = JSON.parse(String(row.payload ?? "{}"));
            const key = String(
              payload.task_id ??
                payload.agent_id ??
                payload.agent_name ??
                randomUUID(),
            );
            states.set(key, { ...(states.get(key) ?? {}), ...payload });
          } catch {}
        }
        const all = Boolean(value.include_all);
        const items = [...states.values()].filter(
          (item) =>
            all ||
            ["running", "approval_required"].includes(
              String(item.status ?? ""),
            ),
        );
        return {
          queried: true,
          running_count: items.filter((item) =>
            ["running", "approval_required"].includes(
              String(item.status ?? ""),
            ),
          ).length,
          sub_agents: items.slice(
            0,
            Math.min(20, Number(value.max_agents) || 10),
          ),
        };
      },
    },
    {
      name: "interrupt_sub_agents",
      description: "Record an interruption message for running sub-agents.",
      parameters: {
        type: "object",
        required: ["message"],
        properties: {
          agent_id: { type: "string" },
          message: { type: "string" },
        },
      },
      execute: async (input, context) => {
        const value = input as any;
        const message = String(value.message ?? "").trim();
        if (!message) throw Error("message is required");
        await event(context.runId ?? "", context.userId, {
          status: "interrupted",
          agent_id: String(value.agent_id ?? ""),
          message,
        });
        return {
          interrupted: true,
          message,
          agent_id: String(value.agent_id ?? ""),
        };
      },
    },
    {
      name: "resume_sub_agents",
      description: "Record that selected sub-agents should continue running.",
      parameters: {
        type: "object",
        properties: { agent_id: { type: "string" } },
      },
      execute: async (input, context) => {
        const agentId = String((input as any)?.agent_id ?? "");
        await event(context.runId ?? "", context.userId, {
          status: "resumed",
          agent_id: agentId,
        });
        return { resumed: true, agent_id: agentId };
      },
    },
  ];
  return tools.map(register);
}
