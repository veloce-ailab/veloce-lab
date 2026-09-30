import { Context, Core, Database, Service, Session } from "yumeri";
import "@velocelab/dashboard";
import "@velocelab/database-core";
import "@velocelab/notification";
import { messageTranslations } from "./translations.js";

export const depend = ["database", "dashboard", "notification"];
export const provide = ["message"];
export interface MessageAction { href?: string; method?: "GET" | "POST" | "PUT" | "DELETE"; body?: Record<string, unknown> }
export interface MessageType { id: string; plugin: string; label: string; labelKey?: string }
export interface MessageInput { userId: number; type: string; dedupeKey: string; icon?: string; title: string; subtitle?: string; action?: MessageAction }
export interface MessageRecord extends MessageInput { id: number; source: string; read: boolean; created_at: string; updated_at: string }
interface StoredMessage { id?: number; user_id: number; type?: string; dedupe_key: string; icon: string; title: string; subtitle: string; action: string; source: string; read: boolean; created_at: string; updated_at: string }
interface MessagePreference { id?: number; user_id: number; plugin: string; type: string; enabled: boolean }
interface NotificationService { send(input: { userId: number; title: string; body?: string; tag?: string; url?: string }): Promise<void> }
declare module "@yumerijs/types" { interface Tables { messages: StoredMessage; message_preferences: MessagePreference } }
declare module "yumeri" { interface Components { message: MessageService } }
const currentUser = (session: Session) => (session.properties.user as { id?: number } | undefined)?.id;
const registries = new WeakMap<Core, Map<string, MessageType>>();
const initialized = new WeakSet<Core>();
const record = (row: StoredMessage): MessageRecord => ({ id: Number(row.id), userId: row.user_id, type: row.type || `${row.source}:legacy`, dedupeKey: row.dedupe_key, icon: row.icon, title: row.title, subtitle: row.subtitle, action: row.action ? JSON.parse(row.action) : undefined, source: row.source, read: Boolean(row.read), created_at: row.created_at, updated_at: row.updated_at });

export class MessageService extends Service {
  private readonly typesById: Map<string, MessageType>;
  private readonly db: Database;
  private readonly notification: NotificationService;
  constructor(ctx: Context) { super(ctx); const core = ctx.getCore(); this.typesById = registries.get(core) ?? new Map(); registries.set(core, this.typesById); this.db = ctx.component.database as Database; this.notification = ctx.component.notification as NotificationService; }
  registerType(owner: Context, type: MessageType) { if (this.typesById.has(type.id)) throw new Error(`Message type already registered: ${type.id}`); this.typesById.set(type.id, type); owner.affect(() => { if (this.typesById.get(type.id) === type) this.typesById.delete(type.id); }); }
  types() { return [...this.typesById.values()]; }
  async preferences(userId: number) { return await this.db.select("message_preferences", { user_id: userId }); }
  async setEnabled(userId: number, plugin: string, type: string, enabled: boolean) { if (!this.types().some(item => item.plugin === plugin && (!type || item.id === type))) throw Error("Unknown message type"); const key = { user_id: userId, plugin, type }; const existing = await this.db.selectOne("message_preferences", key); if (existing) await this.db.update("message_preferences", key, { enabled }); else await this.db.create("message_preferences", { ...key, enabled }); }
  async send(input: MessageInput): Promise<MessageRecord | undefined> { const type = this.typesById.get(input.type); if (!type) throw Error(`Message type is not registered: ${input.type}`); const prefs = await this.preferences(input.userId); if (prefs.some(item => item.plugin === type.plugin && !item.enabled && (!item.type || item.type === type.id))) return; const now = new Date().toISOString(); const action = input.action ? JSON.stringify(input.action) : ""; const key = { user_id: input.userId, type: type.id, dedupe_key: `${type.id}:${input.dedupeKey}` }; const data = { icon: input.icon || "bell", title: input.title, subtitle: input.subtitle || "", action, source: type.plugin, read: false, updated_at: now }; const existing = await this.db.selectOne("messages", key); let result: MessageRecord; if (existing) { await this.db.update("messages", { id: existing.id }, data); result = record({ ...existing, ...data, type: type.id }); } else result = record(await this.db.create("messages", { ...key, ...data, created_at: now })); await this.notification.send({ userId: input.userId, title: input.title, body: input.subtitle, tag: `message-${type.id}-${input.dedupeKey}`, url: input.action?.href }); return result; }
  async remove(userId: number, id: number) { await this.db.remove("messages", { id, user_id: userId }); }
  async markRead(userId: number, id: number) { await this.db.update("messages", { id, user_id: userId }, { read: true, updated_at: new Date().toISOString() }); }
  async list(userId: number) { return (await this.db.select("messages", { user_id: userId })).sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at))).map(record); }
}

export async function apply(ctx: Context) {
  const core = ctx.getCore();
  if (initialized.has(core)) return;
  for (const [key, translations] of Object.entries(messageTranslations)) ctx.i18n(key, translations);
  const db = ctx.component.database as Database;
  await db.extend("messages", { id: { type: "integer", autoIncrement: true }, user_id: { type: "integer", nullable: false }, type: "string", dedupe_key: { type: "string", nullable: false }, icon: { type: "string", initial: "bell" }, title: { type: "string", nullable: false }, subtitle: "string", action: "json", source: { type: "string", nullable: false }, read: { type: "boolean", initial: false }, created_at: "timestamp", updated_at: "timestamp" }, { unique: [["user_id", "dedupe_key"]] });
  await db.extend("message_preferences", { id: { type: "integer", autoIncrement: true }, user_id: { type: "integer", nullable: false }, plugin: { type: "string", nullable: false }, type: { type: "string", nullable: false }, enabled: { type: "boolean", initial: true } }, { unique: [["user_id", "plugin", "type"]] });
  if (!(ctx.getCore() as Core & { services: Record<string, unknown> }).services.message) ctx.registerService("message", MessageService);
  const service = (ctx.component.message as MessageService | undefined) ?? new MessageService(ctx);
  service.registerType(ctx, { id: "message:test", plugin: "message", label: "测试消息", labelKey: "message.testTitle" });
  ctx.component.dashboard.addEntry({ dev: new URL("../frontend/index.tsx", import.meta.url).pathname, prod: new URL("./frontend/message.js", import.meta.url).pathname, plugin: "message" });
  ctx.route("/api/user/messages").methods("GET").action(async session => { const id = currentUser(session); if (id) session.respond({ messages: await service.list(id) }, "json"); });
  ctx.route("/api/user/messages/types").methods("GET").action(async session => { const id = currentUser(session); if (id) session.respond({ types: service.types(), preferences: await service.preferences(id) }, "json"); });
  ctx.route("/api/user/messages/preferences").methods("POST").action(async session => { const id = currentUser(session); const body = await session.parseRequestBody() as any; if (id && typeof body?.plugin === "string" && typeof body?.enabled === "boolean") { await service.setEnabled(id, body.plugin, String(body.type || ""), body.enabled); session.respond({ ok: true }, "json"); } });
  ctx.route("/api/user/messages/delete").methods("POST").action(async session => { const id = currentUser(session); const body = await session.parseRequestBody() as any; if (id && Number(body?.id)) { await service.remove(id, Number(body.id)); session.respond({ ok: true }, "json"); } });
  ctx.route("/api/user/messages/read").methods("POST").action(async session => { const id = currentUser(session); const body = await session.parseRequestBody() as any; if (id && Number(body?.id)) { await service.markRead(id, Number(body.id)); session.respond({ ok: true }, "json"); } });
  ctx.route("/api/user/messages/test").methods("POST").action(async session => { const id = currentUser(session); if (!id) { session.status = 401; session.respond({ error: "unauthorized" }, "json"); return; } try { const body = await session.parseRequestBody() as { language?: string } | undefined; const language = body?.language === "en" || body?.language === "ja" ? body.language : "zh"; const message = await service.send({ userId: id, type: "message:test", dedupeKey: `test-${Date.now()}`, title: messageTranslations["message.testTitle"][language], subtitle: messageTranslations["message.testBody"][language] }); if (!message) { session.status = 403; session.respond({ error: "test message type is disabled" }, "json"); return; } session.respond({ message }, "json"); } catch (error) { session.status = 400; session.respond({ error: error instanceof Error ? error.message : String(error) }, "json"); } });
  initialized.add(core);
  ctx.affect(() => { initialized.delete(core); });
}
