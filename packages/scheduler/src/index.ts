import { randomUUID } from "node:crypto";
import { Context, Schema, Session } from "yumeri";
import "@velocelab/dashboard";
import "@velocelab/advanced-chat";
import "@velocelab/model-catalog";
interface ScheduledTaskRun { id?: number; task_name: string; status: string; trigger: string; node_name: string; message: string; duration_ms: number; started_at: string; created_at: string }
declare module "@yumerijs/types" { interface Tables { scheduled_task_runs: ScheduledTaskRun } }
export const depend = ["dashboard", "database", "advanced-chat", "model"];
export const provide = ["scheduler"];
export interface ScheduledJob {
  name: string;
  intervalMs?: number;
  run: () => Promise<void> | void;
}
export interface SchedulerService {
  register(job: ScheduledJob): () => void;
  list(): string[];
  run(name: string): Promise<boolean>;
}
export interface SchedulerConfig {
  enabled: boolean;
}
export const config: Schema<SchedulerConfig> = Schema.object({
  enabled: Schema.boolean("Enable scheduler").default(true),
});
declare module "yumeri" {
  interface Components {
    scheduler: SchedulerService;
  }
}
export async function apply(ctx: Context, cfg: SchedulerConfig) {
  ctx.component.dashboard.addEntry({
    dev: new URL("../frontend/index.tsx", import.meta.url).pathname,
    prod: new URL("../frontend/scheduler.js", import.meta.url).pathname,
    plugin: "scheduler",
  });
  const jobs = new Map<string, ScheduledJob>();
  const timers = new Map<string, ReturnType<typeof setInterval>>();
  const service: SchedulerService = {
    register(job) {
      jobs.set(job.name, job);
      if (cfg.enabled && job.intervalMs)
        timers.set(
          job.name,
          setInterval(() => void job.run(), job.intervalMs),
        );
      return () => {
        const timer = timers.get(job.name);
        if (timer) clearInterval(timer);
        timers.delete(job.name);
        jobs.delete(job.name);
      };
    },
    list: () => [...jobs.keys()],
    async run(name) {
      const job = jobs.get(name);
      if (!job) return false;
      await job.run();
      return true;
    },
  };
  ctx.registerComponent("scheduler", service);
  const db = ctx.component.database;
  await db.extend("scheduled_task_runs", {
    id: { type: "integer", autoIncrement: true },
    task_name: "string",
    status: "string",
    trigger: "string",
    node_name: "string",
    message: "string",
    duration_ms: "bigint",
    started_at: "timestamp",
    created_at: "timestamp",
  });
  const chat = ctx.component["advanced-chat"];
  const user = (s: Session) => Number((s.properties.user as any)?.id ?? 0);
  const dispatchDue = async () => {
    if (!cfg.enabled) return;
    const now = new Date();
    const tasks: any[] = await db.select("advanced_chat_scheduled_tasks", {
      enabled: true,
    });
    for (const task of tasks) {
      if (
        !task.next_run_at ||
        new Date(String(task.next_run_at)) > now ||
        ["queued", "running"].includes(String(task.last_status))
      )
        continue;
      await db.update(
        "advanced_chat_scheduled_tasks",
        { id: task.id, user_id: task.user_id },
        {
          last_status: "running",
          last_run_at: now.toISOString(),
          updated_at: now.toISOString(),
        },
      );
      try {
        const result = await chat.complete(Number(task.user_id), {
          model: String(task.model_name ?? ""),
          messages: [{ role: "user", content: String(task.message ?? "") }],
          userChannelId: Number(task.user_channel_id ?? 0) || undefined,
          stream: false,
        });
        const next =
          task.schedule_type === "interval"
            ? new Date(
                Date.now() +
                  Math.max(60, Number(task.interval_seconds ?? 60)) * 1000,
              ).toISOString()
            : null;
        await db.update(
          "advanced_chat_scheduled_tasks",
          { id: task.id, user_id: task.user_id },
          {
            last_status: "completed",
            last_run_id: result.runId,
            next_run_at: next,
            enabled: task.schedule_type === "once" ? false : true,
            updated_at: new Date().toISOString(),
          },
        );
      } catch (error) {
        await db.update(
          "advanced_chat_scheduled_tasks",
          { id: task.id, user_id: task.user_id },
          {
            last_status: "failed",
            last_error: error instanceof Error ? error.message : String(error),
            next_run_at:
              task.schedule_type === "interval"
                ? new Date(
                    Date.now() +
                      Math.max(60, Number(task.interval_seconds ?? 60)) * 1000,
                  ).toISOString()
                : null,
            updated_at: new Date().toISOString(),
          },
        );
      }
    }
  };
  setInterval(() => void dispatchDue(), 30_000);
  ctx
    .route("/api/user/advanced-chat/scheduled-tasks")
    .methods("GET")
    .action(async (s) => {
      const id = user(s);
      if (id)
        s.respond(
          await db.select("advanced_chat_scheduled_tasks", { user_id: id }),
          "json",
        );
    });
  ctx
    .route("/api/user/advanced-chat/scheduled-tasks")
    .methods("POST")
    .action(async (s) => {
      const id = user(s);
      if (!id) return;
      const input = (await s.parseRequestBody()) as any;
      const scheduleType = String(
        input.schedule_type ?? "manual",
      ).toLowerCase();
      const intervalSeconds = Number(input.interval_seconds ?? 0);
      if (
        !["manual", "once", "interval"].includes(scheduleType) ||
        (scheduleType === "once" && !input.run_at) ||
        (scheduleType === "interval" && intervalSeconds < 60) ||
        !String(input.message ?? "").trim()
      ) {
        s.status = 400;
        s.respond({ error: "Invalid scheduled task configuration" }, "json");
        return;
      }
      const now = new Date().toISOString();
      s.status = 201;
      s.respond(
        await db.create("advanced_chat_scheduled_tasks", {
          id: randomUUID(),
          user_id: id,
          name: String(input.name ?? "Task"),
          description: String(input.description ?? ""),
          agent_id: String(input.agent_id ?? ""),
          schedule_type: scheduleType,
          run_at: input.run_at ?? null,
          interval_seconds: intervalSeconds,
          session_mode: String(input.session_mode ?? "auto"),
          session_id: String(input.session_id ?? ""),
          auto_delete_session: input.auto_delete_session === true,
          message: String(input.message).slice(0, 20000),
          last_status: "idle",
          next_run_at:
            scheduleType === "once"
              ? input.run_at
              : scheduleType === "interval"
                ? new Date(Date.now() + intervalSeconds * 1000).toISOString()
                : null,
          created_at: now,
          updated_at: now,
        } as any),
        "json",
      );
    });
  ctx
    .route("/api/user/advanced-chat/scheduled-tasks/:id")
    .methods("PUT")
    .action(async (s, _p, taskId) => {
      const id = user(s);
      if (!id) return;
      const input = (await s.parseRequestBody()) as any;
      await db.update(
        "advanced_chat_scheduled_tasks",
        { id: taskId, user_id: id },
        { ...input, updated_at: new Date().toISOString() },
      );
      s.respond(
        await db.selectOne("advanced_chat_scheduled_tasks", {
          id: taskId,
          user_id: id,
        }),
        "json",
      );
    });
  ctx
    .route("/api/user/advanced-chat/scheduled-tasks/:id")
    .methods("DELETE")
    .action(async (s, _p, taskId) => {
      const id = user(s);
      if (id) {
        await db.remove("advanced_chat_scheduled_tasks", {
          id: taskId,
          user_id: id,
        });
        s.respond({ success: true }, "json");
      }
    });
  ctx
    .route("/api/user/advanced-chat/scheduled-tasks/:id/run")
    .methods("POST")
    .action(async (s, _p, taskId) => {
      const id = user(s);
      if (!id) return;
      const task: any = await db.selectOne("advanced_chat_scheduled_tasks", {
        id: taskId,
        user_id: id,
      });
      if (!task) {
        s.status = 404;
        s.respond({ error: "Task not found" }, "json");
        return;
      }
      try {
        const startedAt = new Date().toISOString();
        const result = await chat.complete(id, {
          model: String(task.model_name ?? ""),
          messages: [{ role: "user", content: String(task.message ?? "") }],
          userChannelId: Number(task.user_channel_id ?? 0) || undefined,
          stream: false,
        });
        await db.update(
          "advanced_chat_scheduled_tasks",
          { id: taskId, user_id: id },
          {
            last_run_at: new Date().toISOString(),
            last_run_id: result.runId,
            last_status: "completed",
            last_error: "",
            updated_at: new Date().toISOString(),
          },
        );
        await db.create("scheduled_task_runs", {
          task_name: String(task.name ?? taskId),
          status: "completed",
          trigger: "manual",
          node_name: "",
          message: String(task.message ?? ""),
          duration_ms: 0,
          started_at: startedAt,
          created_at: new Date().toISOString(),
        } as any);
        s.respond(result, "json");
      } catch (error) {
        await db.update(
          "advanced_chat_scheduled_tasks",
          { id: taskId, user_id: id },
          {
            last_run_at: new Date().toISOString(),
            last_status: "failed",
            last_error: error instanceof Error ? error.message : String(error),
            updated_at: new Date().toISOString(),
          },
        );
        await db.create("scheduled_task_runs", {
          task_name: String(task.name ?? taskId),
          status: "failed",
          trigger: "manual",
          node_name: "",
          message: String(task.message ?? ""),
          duration_ms: 0,
          started_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
        } as any);
        s.status = 500;
        s.respond(
          { error: error instanceof Error ? error.message : String(error) },
          "json",
        );
      }
    });
  ctx
    .route("/api/user/advanced-chat/scheduled-tasks/:id/runs")
    .methods("GET")
    .action(async (s, _p, taskId) => {
      const id = user(s);
      if (id) {
        const task: any = await db.selectOne("advanced_chat_scheduled_tasks", {
          id: taskId,
          user_id: id,
        });
        s.respond(
          task
            ? await db.select("scheduled_task_runs", {
                task_name: String(task.name ?? taskId),
              })
            : [],
          "json",
        );
      }
    });
}
