import { randomUUID } from "node:crypto";
import type { Database } from "yumeri";
import type { ChatToolDefinition } from "./index.js";

const statuses = ["pending", "in_progress", "completed", "skipped"];
const text = (value: unknown, max: number) =>
  String(value ?? "")
    .trim()
    .slice(0, max);

export function registerSessionTaskTools(
  db: Database,
  register: (tool: ChatToolDefinition) => () => void,
) {
  const result = async (userId: number, sessionId: string) => ({
    tasks: await db.select("advanced_chat_session_tasks", {
      user_id: userId,
      session_id: sessionId,
    }),
  });
  const tools: ChatToolDefinition[] = [
    {
      name: "tasks_plan",
      description:
        "Create or replace the ordered task plan for the current session.",
      parameters: {
        type: "object",
        required: ["tasks"],
        properties: { tasks: { type: "array", maxItems: 50 } },
      },
      execute: async (input, context) => {
        if (!context.sessionId)
          throw Error("task planning requires a persisted session");
        const items = Array.isArray((input as any)?.tasks)
          ? (input as any).tasks
          : [];
        if (!items.length || items.length > 50)
          throw Error("tasks must contain 1-50 items");
        await db.remove("advanced_chat_session_tasks", {
          user_id: context.userId,
          session_id: context.sessionId,
        });
        const now = new Date().toISOString();
        for (let index = 0; index < items.length; index += 1) {
          const title = text(items[index]?.title, 200);
          if (!title) throw Error("each task needs a non-empty title");
          await db.create("advanced_chat_session_tasks", {
            id: `task-${randomUUID()}`,
            user_id: context.userId,
            session_id: context.sessionId,
            position: index + 1,
            title,
            description: text(items[index]?.description, 2000),
            status: "pending",
            note: "",
            created_at: now,
            updated_at: now,
          } as any);
        }
        return result(context.userId, context.sessionId);
      },
    },
    {
      name: "tasks_update",
      description: "Update one session task status while executing the plan.",
      parameters: {
        type: "object",
        required: ["id", "status"],
        properties: {
          id: { type: "string" },
          status: { type: "string", enum: statuses },
          note: { type: "string" },
        },
      },
      execute: async (input, context) => {
        if (!context.sessionId)
          throw Error("task updates require a persisted session");
        const value = input as any;
        const id = text(value?.id, 80);
        const status = text(value?.status, 20);
        if (!id || !statuses.includes(status))
          throw Error("id and a valid status are required");
        const task = await db.selectOne("advanced_chat_session_tasks", {
          id,
          user_id: context.userId,
          session_id: context.sessionId,
        });
        if (!task) throw Error("task not found in this session");
        await db.update(
          "advanced_chat_session_tasks",
          { id, user_id: context.userId, session_id: context.sessionId },
          {
            status,
            note: text(value?.note, 2000),
            updated_at: new Date().toISOString(),
          },
        );
        return result(context.userId, context.sessionId);
      },
    },
    {
      name: "tasks_list",
      description: "Read the current session task plan and statuses.",
      parameters: { type: "object", properties: {} },
      execute: async (_input, context) => {
        if (!context.sessionId)
          throw Error("task listing requires a persisted session");
        return result(context.userId, context.sessionId);
      },
    },
  ];
  return tools.map(register);
}
