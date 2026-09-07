import { Context, Schema } from "yumeri";
import "@velocelab/dashboard";
export const depend = ["dashboard"];
export const provide = ["scheduler"];
export interface ScheduledJob { name: string; intervalMs?: number; run: () => Promise<void> | void; }
export interface SchedulerService { register(job: ScheduledJob): () => void; list(): string[]; run(name: string): Promise<boolean>; }
export interface SchedulerConfig { enabled: boolean; }
export const config: Schema<SchedulerConfig> = Schema.object({ enabled: Schema.boolean("Enable scheduler").default(true) });
declare module "yumeri" { interface Components { scheduler: SchedulerService; } }
export function apply(ctx: Context, cfg: SchedulerConfig) {
  ctx.component.dashboard.addEntry({ dev: new URL("../frontend/index.tsx", import.meta.url).pathname, prod: new URL("../frontend/scheduler.js", import.meta.url).pathname, plugin: "scheduler" });
  const jobs = new Map<string, ScheduledJob>();
  const timers = new Map<string, ReturnType<typeof setInterval>>();
  const service: SchedulerService = { register(job) { jobs.set(job.name, job); if (cfg.enabled && job.intervalMs) timers.set(job.name, setInterval(() => void job.run(), job.intervalMs)); return () => { const timer = timers.get(job.name); if (timer) clearInterval(timer); timers.delete(job.name); jobs.delete(job.name); }; }, list: () => [...jobs.keys()], async run(name) { const job = jobs.get(name); if (!job) return false; await job.run(); return true; } };
  ctx.registerComponent("scheduler", service);
}
