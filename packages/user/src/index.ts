import { Context, Session } from "yumeri";
import type { User, UserAvatar, Group, UserGroupMembership, UserChannel, UserChannelGroupAccess, UserChannelUserAccess, CheckInRecord } from "./types.js";
import "@velocelab/database-core";

export type { User, UserAvatar, Group, UserGroupMembership, UserChannel, UserChannelGroupAccess, UserChannelUserAccess, CheckInRecord } from "./types.js";

declare module "@yumerijs/types" {
  interface Tables {
    users: User;
    user_avatars: UserAvatar;
    groups: Group;
    user_group_memberships: UserGroupMembership;
    user_channels: UserChannel;
    user_channel_group_accesses: UserChannelGroupAccess;
    user_channel_user_accesses: UserChannelUserAccess;
    check_in_records: CheckInRecord;
  }
}

export const depend = ["database"];
export const provide = ["user"];
export interface UserService {
  current(session: Session): Promise<User | undefined>;
  findById(id: number): Promise<User | undefined>;
  findByIdentifier(identifier: string): Promise<User | undefined>;
  findAdmin(): Promise<User | undefined>;
  ensureDefaultGroup(): Promise<Group>;
  create(data: Omit<User, "id" | "created_at" | "updated_at">): Promise<User>;
  update(id: number, data: Partial<User>): Promise<User | undefined>;
}
declare module "yumeri" {
  interface Components {
    user: UserService;
  }
}

export async function apply(ctx: Context) {
  const db = ctx.component.database;
  await db.extend("users", {
    id: { type: "integer", autoIncrement: true },
    username: { type: "string", nullable: false },
    email: { type: "string", nullable: false },
    phone: "string",
    oidc_sub: "string",
    password_hash: { type: "string", nullable: false },
    email_verified: { type: "boolean", nullable: false },
    avatar_url: { type: "string", initial: "" },
    balance: { type: "decimal", initial: 0 },
    group_id: { type: "integer", initial: 0 },
    referral_code: "string",
    referrer_id: "integer",
    is_admin: { type: "boolean", nullable: false },
    created_at: "timestamp",
    updated_at: "timestamp",
  }, { unique: ["username", "email", "phone", "oidc_sub", "referral_code"] });
  await db.extend("user_avatars", {
    user_id: { type: "integer", nullable: false },
    mime_type: { type: "string", nullable: false },
    data: { type: "text", nullable: false },
    updated_at: "timestamp",
  }, { unique: ["user_id"] });
  await db.extend("groups", {
    id: { type: "integer", autoIncrement: true },
    name: { type: "string", nullable: false },
    multiplier: { type: "decimal", initial: 1 },
    created_at: "timestamp",
    updated_at: "timestamp",
  }, { unique: ["name"] });
  await db.extend("user_group_memberships", {
    id: { type: "integer", autoIncrement: true },
    user_id: { type: "integer", nullable: false },
    group_id: { type: "integer", nullable: false },
    expires_at: "timestamp",
    created_at: "timestamp",
    updated_at: "timestamp",
  }, { unique: [["user_id", "group_id"]] });
  await db.extend("user_channels", {
    id: { type: "integer", autoIncrement: true }, name: { type: "string", nullable: false }, description: "string", multiplier: { type: "decimal", initial: 1 }, routing_algorithm: { type: "string", initial: "priority" }, enabled: { type: "boolean", initial: true }, rate_limit_enabled: { type: "boolean", initial: false }, rate_limit_requests_per_minute: { type: "integer", initial: 0 }, rate_limit_burst: { type: "integer", initial: 0 }, created_at: "timestamp", updated_at: "timestamp",
  }, { unique: ["name"] });
  await db.extend("user_channel_group_accesses", {
    id: { type: "integer", autoIncrement: true }, user_channel_id: { type: "integer", nullable: false }, group_id: { type: "integer", nullable: false }, created_at: "timestamp", updated_at: "timestamp",
  }, { unique: [["user_channel_id", "group_id"]] });
  await db.extend("user_channel_user_accesses", {
    id: { type: "integer", autoIncrement: true }, user_channel_id: { type: "integer", nullable: false }, user_id: { type: "integer", nullable: false }, created_at: "timestamp", updated_at: "timestamp",
  }, { unique: [["user_channel_id", "user_id"]] });
  const users = {
    findById: (id: number) => db.selectOne("users", { id }),
    async update(id: number, data: Partial<User>) {
      await db.update("users", { id }, { ...data, updated_at: new Date().toISOString() });
      return db.selectOne("users", { id });
    },
  };
  const service: UserService = {
    findById: users.findById,
    findByIdentifier: (identifier) => db.selectOne("users", { $or: [{ username: identifier }, { email: identifier.toLowerCase() }] }),
    findAdmin: () => db.selectOne("users", { is_admin: true }),
    ensureDefaultGroup: async () => {
      const existing = await db.selectOne("groups", { name: "user" });
      if (existing) return existing;
      return db.create("groups", { name: "user", multiplier: "1", created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    },
    create: async (data) => {
      const now = new Date().toISOString();
      const user = await db.create("users", { ...data, created_at: now, updated_at: now });
      return user;
    },
    update: users.update,
    async current(session) {
      const raw = session.client.req?.headers.cookie ?? "";
      const match = String(raw).match(/(?:^|;\s*)userid=(\d+)/);
      const id = match ? Number(match[1]) : 0;
      if (!id) return undefined;
      return users.findById(id);
    },
  };
  ctx.registerComponent("user", service);
  ctx.use(
    "user-context",
    async (session: Session, next: () => Promise<void>) => {
      if (!session.properties.user) {
        const current = await service.current(session);
        if (current) session.properties.user = current;
      }
      await next();
    },
  );
  ctx
    .route("/api/user/me")
    .methods("GET", "PUT")
    .action(async (session) => {
      const current =
        (session.properties.user as User | undefined) ??
        (await service.current(session));
      if (!current) {
        session.status = 401;
        session.respond({ error: "Authorization is required" }, "json");
        return;
      }
      if ((session.client.req?.method ?? "GET").toUpperCase() === "GET") {
        session.respond(current, "json");
        return;
      }
      const input = (await session.parseRequestBody()) as Record<string, unknown>;
      const updates: Partial<User> = {};
      if (typeof input.username === "string" && input.username.trim())
        updates.username = input.username.trim().slice(0, 80);
      if (typeof input.email === "string" && input.email.includes("@"))
        updates.email = input.email.trim().toLowerCase();
      if (typeof input.phone === "string")
        updates.phone = input.phone.trim().slice(0, 40) || null;
      if (typeof input.avatar_url === "string")
        updates.avatar_url = input.avatar_url.trim().slice(0, 500);
      const updated = await users.update(current.id, updates);
      session.respond(updated ?? current, "json");
  });
  await db.extend("check_in_records", {
    id: { type: "integer", autoIncrement: true },
    user_id: { type: "integer", nullable: false },
    check_in_date: { type: "string", nullable: false },
    reward_amount: { type: "decimal", nullable: false },
    streak_days: { type: "integer", initial: 1 },
    reward_kind: "string",
    created_at: "timestamp",
  }, { unique: [["user_id", "check_in_date"]] });
}
