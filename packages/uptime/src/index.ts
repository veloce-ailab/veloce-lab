import { Context, Session } from "yumeri";
import "@velocelab/dashboard";
import "@velocelab/database-core";

export const depend = ["database", "dashboard"];
export const provide = ["uptime"];
interface StatusMonitor { id?: number; name: string; target_url: string; check_type: string; method: string; interval_seconds: number; retention_hours: number; enabled: boolean; last_status: string; last_latency_ms: number; last_status_code: number; last_message: string; last_checked_at?: string | null; created_at: string; updated_at: string }
interface StatusCheck { monitor_id: number; status: string; latency_ms: number; status_code: number; message: string; checked_at: string; created_at: string }
declare module "@yumerijs/types" { interface Tables { status_monitors: StatusMonitor; status_checks: StatusCheck } }

export interface UptimeService {
  list(): Promise<Record<string, unknown>[]>;
}

declare module "yumeri" {
  interface Components { uptime: UptimeService; }
}

export async function apply(ctx: Context) {
  ctx.i18n("uptime.settings", { zh: "统计信息", en: "Statistics", ja: "統計" });
  const db = ctx.component.database;
  await db.extend("status_monitors", {
    id: { type: "integer", autoIncrement: true },
    name: { type: "string", nullable: false },
    target_url: { type: "string", nullable: false },
    check_type: { type: "string", initial: "http" },
    method: { type: "string", initial: "GET" },
    interval_seconds: { type: "integer", initial: 60 },
    retention_hours: { type: "integer", initial: 168 },
    enabled: { type: "boolean", initial: true },
    last_status: { type: "string", initial: "pending" },
    last_latency_ms: "integer",
    last_status_code: "integer",
    last_message: "string",
    last_checked_at: "timestamp",
    created_at: "timestamp",
    updated_at: "timestamp",
  });
  await db.extend("status_checks", {
    id: { type: "integer", autoIncrement: true },
    monitor_id: { type: "integer", nullable: false },
    status: { type: "string", nullable: false },
    latency_ms: "integer",
    status_code: "integer",
    message: "string",
    checked_at: "timestamp",
    created_at: "timestamp",
  });
  ctx.component.dashboard.addEntry({ dev: new URL("../frontend/index.tsx", import.meta.url).pathname, prod: new URL("./frontend/uptime.js", import.meta.url).pathname, plugin: "uptime" });
  const service: UptimeService = {
    async list() {
      return db.select("status_monitors", {} as any);
    },
  };
  ctx.registerComponent("uptime", service);

  const admin = (session: Session) =>
    session.properties.user as { id?: number; is_admin?: boolean } | undefined;
  const readBody = async (session: Session) =>
    (await session.parseRequestBody()) as Record<string, unknown>;

  ctx.route("/api/status").methods("GET").action(async (session) => {
    const monitors = await db.select("status_monitors", { enabled: true } as any);
    const checks = await db.select("status_checks", {} as any);
    session.respond({
      enabled: monitors.length > 0,
      generated_at: new Date().toISOString(),
      monitors: monitors.map((monitor: any) => ({
        id: monitor.id,
        name: monitor.name,
        status: monitor.last_status || "pending",
        latency_ms: Number(monitor.last_latency_ms || 0),
        last_checked_at: monitor.last_checked_at || null,
        uptime: (() => {
          const recent = checks.filter((check: any) => check.monitor_id === monitor.id).slice(-60);
          return recent.length
            ? (recent.filter((check: any) => check.status === "up").length / recent.length) * 100
            : monitor.last_status === "up" ? 100 : 0;
        })(),
        recent_checks: checks.filter((check: any) => check.monitor_id === monitor.id).slice(-60),
      })),
    }, "json");
  });

  ctx.route("/api/admin/status-monitors").methods("GET").action(async (session) => {
    if (!admin(session)?.is_admin) return;
    const monitors = await service.list();
    const result = await Promise.all(monitors.map(async (monitor: any) => ({
      ...monitor,
      recent_checks: await db.select("status_checks", { monitor_id: monitor.id } as any),
    })));
    session.respond(result, "json");
  });
  ctx.route("/api/admin/status-monitors").methods("POST").action(async (session) => {
    if (!admin(session)?.is_admin) return;
    const input = await readBody(session);
    const now = new Date().toISOString();
    const monitor = await db.create("status_monitors", {
      name: String(input.name ?? "").trim(),
      target_url: String(input.target_url ?? "").trim(),
      check_type: String(input.check_type ?? "http"),
      method: String(input.method ?? "GET"),
      interval_seconds: Math.max(30, Number(input.interval_seconds ?? 60)),
      retention_hours: Math.max(1, Number(input.retention_hours ?? 168)),
      enabled: input.enabled !== false,
      last_status: "pending",
      last_latency_ms: 0,
      last_status_code: 0,
      last_message: "",
      created_at: now,
      updated_at: now,
    } as any);
    session.status = 201;
    session.respond(monitor, "json");
  });
  ctx.route("/api/admin/status-monitors/:id").methods("PUT").action(async (session, _params, id) => {
    if (!admin(session)?.is_admin) return;
    const input = await readBody(session);
    const updates = Object.fromEntries(
      ["name", "target_url", "check_type", "method", "interval_seconds", "retention_hours", "enabled"]
        .filter((key) => input[key] !== undefined)
        .map((key) => [key, input[key]]),
    );
    await db.update("status_monitors", { id: Number(id) } as any, { ...updates, updated_at: new Date().toISOString() } as any);
    session.respond(await db.selectOne("status_monitors", { id: Number(id) } as any), "json");
  });
  ctx.route("/api/admin/status-monitors/:id").methods("DELETE").action(async (session, _params, id) => {
    if (!admin(session)?.is_admin) return;
    await db.remove("status_checks", { monitor_id: Number(id) } as any);
    await db.remove("status_monitors", { id: Number(id) } as any);
    session.respond({ success: true }, "json");
  });
  ctx.route("/api/admin/status-monitors/:id/check").methods("POST").action(async (session, _params, id) => {
    if (!admin(session)?.is_admin) return;
    const monitor = await db.selectOne("status_monitors", { id: Number(id) } as any) as any;
    if (!monitor) {
      session.status = 404;
      session.respond({ error: "Status monitor not found" }, "json");
      return;
    }
    const started = Date.now();
    let status = "down";
    let statusCode = 0;
    let message = "Request failed";
    try {
      const response = await fetch(String(monitor.target_url), {
        method: String(monitor.method || "GET").toUpperCase() === "HEAD" ? "HEAD" : "GET",
        signal: AbortSignal.timeout(15_000),
      });
      statusCode = response.status;
      status = response.ok ? "up" : "down";
      message = `HTTP ${response.status}`;
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    const now = new Date().toISOString();
    const latency = Date.now() - started;
    await db.update("status_monitors", { id: Number(id) } as any, {
      last_status: status,
      last_latency_ms: latency,
      last_status_code: statusCode,
      last_message: message,
      last_checked_at: now,
      updated_at: now,
    } as any);
    const check = await db.create("status_checks", {
      monitor_id: Number(id),
      status,
      latency_ms: latency,
      status_code: statusCode,
      message,
      checked_at: now,
      created_at: now,
    } as any);
    session.respond(check, "json");
  });
}
