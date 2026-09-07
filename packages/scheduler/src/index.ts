import { randomUUID } from "node:crypto";
import { Context, Database, Schema, Session } from "yumeri";
import "@velocelab/dashboard";
import "@velocelab/advanced-chat";
import "@velocelab/model";
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
export function apply(ctx: Context, cfg: SchedulerConfig) {
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
  const db = ctx.component.database as Database;
  const chat = ctx.component["advanced-chat"];
  const user = (s: Session) => Number((s.properties.user as any)?.id ?? 0);
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
      const now = new Date().toISOString();
      s.status = 201;
      s.respond(
        await db.create("advanced_chat_scheduled_tasks", {
          id: randomUUID(),
          user_id: id,
          name: String(input.name ?? "Task"),
          description: String(input.description ?? ""),
          agent_id: String(input.agent_id ?? ""),
          schedule_type: String(input.schedule_type ?? "manual"),
          run_at: input.run_at ?? null,
          interval_seconds: Number(input.interval_seconds ?? 0),
          session_mode: String(input.session_mode ?? "auto"),
          session_id: String(input.session_id ?? ""),
          auto_delete_session: input.auto_delete_session === true,
          status: "idle",
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
        s.status = 500;
        s.respond(
          { error: error instanceof Error ? error.message : String(error) },
          "json",
        );
      }
    });
}
