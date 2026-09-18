import { Context, Session } from "yumeri";
import { createHash, randomBytes } from "node:crypto";
import type { User, UserSession, UserAvatar, Group, UserGroupMembership, UserChannel, UserChannelGroupAccess, UserChannelUserAccess, CheckInRecord } from "./types.js";
import "@velocelab/database-core";
import "@velocelab/dashboard";

export type { User, UserSession, UserAvatar, Group, UserGroupMembership, UserChannel, UserChannelGroupAccess, UserChannelUserAccess, CheckInRecord } from "./types.js";

declare module "@yumerijs/types" {
  interface Tables {
    users: User;
    user_sessions: UserSession;
    user_avatars: UserAvatar;
    groups: Group;
    user_group_memberships: UserGroupMembership;
    user_channels: UserChannel;
    user_channel_group_accesses: UserChannelGroupAccess;
    user_channel_user_accesses: UserChannelUserAccess;
    check_in_records: CheckInRecord;
  }
}

export const depend = ["database", "dashboard"];
export const provide = ["user"];
export const sessionCookieName = "veloce_session";
const sessionLifetimeSeconds = 7 * 24 * 60 * 60;

export interface UserService {
  current(session: Session): Promise<User | undefined>;
  establishSession(session: Session, user: User): Promise<{ token: string; expiresAt: Date }>;
  revokeSession(session: Session): Promise<void>;
  findById(id: number): Promise<User | undefined>;
  findByIdentifier(identifier: string): Promise<User | undefined>;
  findAdmin(): Promise<User | undefined>;
  ensureDefaultGroup(): Promise<Group>;
  create(data: Omit<User, "id" | "created_at" | "updated_at">): Promise<User>;
  update(id: number, data: Partial<User>): Promise<User | undefined>;
}

/**
 * The session user when `@velocelab/auth` is not enabled: the deployment has no
 * accounts to resolve, so every request runs as this built-in default user. It
 * keeps `id: 0` — outside the range of any real row, so its data stays separate
 * — and it administers the deployment, because otherwise nothing that requires
 * an administrator (channels, models, providers) could be configured at all.
 */
const defaultUser = { id: 0, is_admin: true } as User;
declare module "yumeri" {
  interface Components {
    user: UserService;
  }
}

export async function apply(ctx: Context) {
  ctx.i18n({ user: { settings: { zh: "账户", en: "Account", ja: "アカウント" }, security: { zh: "安全", en: "Security", ja: "セキュリティ" } } });
  ctx.component.dashboard.addEntry({
    id: "user",
    dev: new URL("../frontend/index.tsx", import.meta.url).pathname,
    prod: new URL("./frontend/user.js", import.meta.url).pathname,
    plugin: "user",
  });
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
  await db.extend("user_sessions", {
    id: { type: "integer", autoIncrement: true },
    user_id: { type: "integer", nullable: false },
    token_hash: { type: "string", nullable: false },
    expires_at: { type: "string", nullable: false },
    last_seen_at: "timestamp",
    revoked_at: "timestamp",
    created_at: "timestamp",
  }, { unique: ["token_hash"] });
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
  const sessionTokens = (session: Session) => {
    const parts = String(session.client.req?.headers.authorization ?? "").trim().split(/\s+/);
    const bearer = parts.length === 2 && parts[0].toLowerCase() === "bearer" ? parts[1] : "";
    const cookie = String(session.cookie?.[sessionCookieName] ?? "");
    return [...new Set([bearer, cookie].filter(Boolean))];
  };
  const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");
  const setSessionCookie = (session: Session, token: string, expires: Date) => session.setCookie(sessionCookieName, token, {
    httpOnly: true,
    sameSite: "Lax",
    path: "/",
    secure: session.protocol === "https",
    expires,
  });
  const authEnabled = () => Boolean((ctx.getCore() as unknown as { getComponent(name: string): unknown }).getComponent("auth"));
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
    async establishSession(session, user) {
      if (user.id === undefined) throw Error("user is required to establish a session");
      const token = randomBytes(32).toString("base64url");
      const now = new Date();
      const expiresAt = new Date(now.getTime() + sessionLifetimeSeconds * 1000);
      await db.create("user_sessions", {
        user_id: user.id,
        token_hash: tokenHash(token),
        expires_at: expiresAt.toISOString(),
        last_seen_at: now.toISOString(),
        revoked_at: null,
        created_at: now.toISOString(),
      });
      setSessionCookie(session, token, expiresAt);
      return { token, expiresAt };
    },
    async revokeSession(session) {
      for (const token of sessionTokens(session))
        await db.update("user_sessions", { token_hash: tokenHash(token), revoked_at: null }, { revoked_at: new Date().toISOString() });
      setSessionCookie(session, "", new Date(0));
    },
    async current(session) {
      for (const token of sessionTokens(session)) {
        const row = await db.selectOne("user_sessions", { token_hash: tokenHash(token), revoked_at: null }) as UserSession | undefined;
        if (row && new Date(row.expires_at).getTime() > Date.now()) {
          const user = await users.findById(row.user_id);
          if (user) {
            if (Date.now() - new Date(row.last_seen_at).getTime() > 5 * 60_000)
              void db.update("user_sessions", { id: row.id }, { last_seen_at: new Date().toISOString() });
            return user;
          }
        }
      }
      return authEnabled() ? undefined : defaultUser;
    },
  };
  ctx.registerComponent("user", service);
  ctx.setInterval(() => {
    const now = new Date().toISOString();
    void db.remove("user_sessions", { expires_at: { $lte: now } }).catch(() => undefined);
  }, 3600_000);
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
      if (!current && ctx.component.auth) {
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
