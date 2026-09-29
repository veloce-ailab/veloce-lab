import { Context, Core, Service, Session } from "yumeri";
import type { PWAService } from "@velocelab/pwa";
import "@velocelab/dashboard";
import "@velocelab/pwa";
export const depend = ["dashboard", "pwa"];
export const provide = ["notification"];
export interface NotificationInput { userId: number; title: string; body?: string; tag?: string; url?: string }
export interface NotificationService { send(input: NotificationInput): Promise<void>; take(userId: number): NotificationInput[] }
declare module "yumeri" { interface Components { notification: NotificationService } }
const queues = new WeakMap<Core, Map<number, NotificationInput[]>>();
const initialized = new WeakSet<Core>();
const workerScript = `
self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || data.type !== "veloce.notification") return;
  event.waitUntil(self.registration.showNotification(String(data.title || "Veloce"), {
    body: String(data.body || ""), icon: data.icon || "/logo.png", tag: data.tag || undefined,
    data: { url: data.url || "/" },
  }));
});
self.addEventListener("push", (event) => {
  const data = event.data ? event.data.json() : {};
  event.waitUntil(self.registration.showNotification(String(data.title || "Veloce"), {
    body: String(data.body || ""), icon: data.icon || "/logo.png", tag: data.tag || undefined,
    data: { url: data.url || "/" },
  }));
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
    const url = event.notification.data?.url || "/";
    const found = list.find((client) => client.url === new URL(url, self.location.origin).href);
    return found ? found.focus() : clients.openWindow(url);
  }));
});
`;
export class Notification extends Service implements NotificationService {
  private readonly pending: Map<number, NotificationInput[]>;
  constructor(ctx: Context) { super(ctx); const core = ctx.getCore(); this.pending = queues.get(core) ?? new Map(); queues.set(core, this.pending); }
  async send(input: NotificationInput) { this.pending.set(input.userId, [...(this.pending.get(input.userId) ?? []), input].slice(-20)); }
  take(userId: number) { const result = this.pending.get(userId) ?? []; this.pending.delete(userId); return result; }
}
export function apply(ctx: Context) {
  const core = ctx.getCore();
  if (initialized.has(core)) return;
  const pwa = ctx.component.pwa as PWAService;
  const unregisterWorkerScript = pwa.registerWorkerScript("notification", workerScript); ctx.affect(unregisterWorkerScript);
  if (!(ctx.getCore() as Core & { services: Record<string, unknown> }).services.notification) ctx.registerService("notification", Notification);
  const notification = (ctx.component.notification as NotificationService | undefined) ?? new Notification(ctx);
  ctx.route("/api/user/notifications/pending").methods("GET").action(async (session: Session) => {
    const userId = (session.properties.user as { id?: number } | undefined)?.id;
    if (userId) session.respond({ notifications: notification.take(userId) }, "json");
  });
  ctx.component.dashboard.addEntry({ dev: new URL("../frontend/index.tsx", import.meta.url).pathname, prod: new URL("./frontend/notification.js", import.meta.url).pathname, plugin: "notification" });
  initialized.add(core);
  ctx.affect(() => { initialized.delete(core); });
}
