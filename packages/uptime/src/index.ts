import { Context, Database, Session } from "yumeri";

export const depend = ["database"];
export const provide = ["uptime"];

export interface UptimeService {
  list(): Promise<Record<string, unknown>[]>;
}

declare module "yumeri" {
  interface Components { uptime: UptimeService; }
}

export function apply(ctx: Context) {
  const db = ctx.component.database as Database;
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
    session.respond({
      enabled: monitors.length > 0,
      generated_at: new Date().toISOString(),
      monitors: monitors.map((monitor: any) => ({
        id: monitor.id,
        name: monitor.name,
        status: monitor.last_status || "pending",
        latency_ms: Number(monitor.last_latency_ms || 0),
        last_checked_at: monitor.last_checked_at || null,
        uptime: monitor.last_status === "up" ? 100 : 0,
        recent_checks: [],
      })),
    }, "json");
  });

  ctx.route("/api/admin/status-monitors").methods("GET").action(async (session) => {
    if (!admin(session)?.is_admin) return;
    session.respond(await service.list(), "json");
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
}
