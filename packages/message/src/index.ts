import { Context, Database, Schema, Session } from "yumeri";
import "@velocelab/dashboard";
import "@velocelab/database-core";

export const depend = ["database", "dashboard"];
export const provide = ["message"];
export interface MessageAction { href?: string; method?: "GET" | "POST" | "PUT" | "DELETE"; body?: Record<string, unknown> }
export interface MessageInput { userId: number; dedupeKey: string; icon?: string; title: string; subtitle?: string; action?: MessageAction; source: string }
export interface MessageRecord extends MessageInput { id: number; read: boolean; created_at: string; updated_at: string }
export interface MessageService { send(input: MessageInput): Promise<MessageRecord>; remove(userId: number, id: number): Promise<void>; markRead(userId: number, id: number): Promise<void>; list(userId: number): Promise<MessageRecord[]> }
interface StoredMessage { id?: number; user_id: number; dedupe_key: string; icon: string; title: string; subtitle: string; action: string; source: string; read: boolean; created_at: string; updated_at: string }
declare module "@yumerijs/types" { interface Tables { messages: StoredMessage } }
declare module "yumeri" { interface Components { message: MessageService } }

const currentUser = (session: Session) => (session.properties.user as { id?: number } | undefined)?.id;
const record = (row: StoredMessage): MessageRecord => ({ id: Number(row.id), userId: row.user_id, dedupeKey: row.dedupe_key, icon: row.icon, title: row.title, subtitle: row.subtitle, action: row.action ? JSON.parse(row.action) : undefined, source: row.source, read: Boolean(row.read), created_at: row.created_at, updated_at: row.updated_at });

export async function apply(ctx: Context) {
  const db = ctx.component.database as Database;
  await db.extend("messages", { id:{type:"integer",autoIncrement:true}, user_id:{type:"integer",nullable:false}, dedupe_key:{type:"string",nullable:false}, icon:{type:"string",initial:"bell"}, title:{type:"string",nullable:false}, subtitle:"string", action:"json", source:{type:"string",nullable:false}, read:{type:"boolean",initial:false}, created_at:"timestamp", updated_at:"timestamp" }, { unique:[["user_id", "dedupe_key"]] });
  const service: MessageService = {
    async send(input) {
      const now = new Date().toISOString(); const action = input.action ? JSON.stringify(input.action) : "";
      const existing = await db.selectOne("messages", { user_id: input.userId, dedupe_key: input.dedupeKey });
      if (existing) { await db.update("messages", { id: existing.id }, { icon: input.icon || "bell", title: input.title, subtitle: input.subtitle || "", action, source: input.source, read: false, updated_at: now } as any); return record({ ...existing, ...input, user_id: input.userId, icon: input.icon || "bell", subtitle: input.subtitle || "", action, read: false, updated_at: now } as any); }
      const created = await db.create("messages", { user_id: input.userId, dedupe_key: input.dedupeKey, icon: input.icon || "bell", title: input.title, subtitle: input.subtitle || "", action, source: input.source, read: false, created_at: now, updated_at: now } as any);
      return record(created as any);
    },
    async remove(userId, id) { await db.remove("messages", { id, user_id: userId }); },
    async markRead(userId, id) { await db.update("messages", { id, user_id: userId }, { read: true, updated_at: new Date().toISOString() } as any); },
    async list(userId) { return (await db.select("messages", { user_id: userId })).sort((a: any, b: any) => String(b.updated_at).localeCompare(String(a.updated_at))).map(record); },
  };
  ctx.registerComponent("message", service);
  ctx.i18n({ message: { title:{zh:"消息",en:"Messages",ja:"メッセージ"}, empty:{zh:"暂无消息",en:"No messages",ja:"メッセージはありません"}, delete:{zh:"删除消息",en:"Delete message",ja:"メッセージを削除"}, source:{zh:"来自",en:"From",ja:"送信元"} } });
  ctx.component.dashboard.addEntry({ dev:new URL("../frontend/index.tsx",import.meta.url).pathname, prod:new URL("./frontend/message.js",import.meta.url).pathname, plugin:"message" });
  ctx.route("/api/user/messages").methods("GET").action(async session => { const id=currentUser(session); if (!id) { session.status=401; session.respond({error:"unauthorized"},"json"); return; } session.respond({messages: await service.list(id)},"json"); });
  ctx.route("/api/user/messages/delete").methods("POST").action(async session => { const id=currentUser(session); const body=await session.parseRequestBody() as any; if (!id || !Number(body?.id)) { session.status=400; session.respond({error:"invalid message"},"json"); return; } await service.remove(id, Number(body.id)); session.respond({ok:true},"json"); });
  ctx.route("/api/user/messages/read").methods("POST").action(async session => { const id=currentUser(session); const body=await session.parseRequestBody() as any; if (!id || !Number(body?.id)) { session.status=400; session.respond({error:"invalid message"},"json"); return; } await service.markRead(id, Number(body.id)); session.respond({ok:true},"json"); });
}
