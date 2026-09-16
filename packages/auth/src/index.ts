import { Context, Schema, Session } from "yumeri";
import bcrypt from "bcryptjs";
import { createHash, randomBytes } from "node:crypto";
import { ServiceRegistry } from "@velocelab/service";
import type { User } from "@velocelab/user";
import "@velocelab/database-core";
import "@velocelab/dashboard";
import type { EmailVerificationCode, PhoneVerificationCode, OIDCBindRequest, WebAuthnChallenge, PasskeyCredential, AuthIdentity, AuthProvider, AuthCompletion, ExternalIdentity, PublicAuthProvider } from "./types.js";
export type { AuthIdentity, AuthProvider, AuthTransaction, AuthCompletion, ExternalIdentity, PublicAuthProvider } from "./types.js";
import { ensureTables } from "./tables.js";
import { renderLoginPage } from "./login-page.js";

declare module "@yumerijs/types" {
  interface Tables {
    email_verification_codes: EmailVerificationCode;
    phone_verification_codes: PhoneVerificationCode;
    oidc_bind_requests: OIDCBindRequest;
    webauthn_challenges: WebAuthnChallenge;
    passkey_credentials: PasskeyCredential;
  }
}
export const depend = ["service", "user", "database", "dashboard"];
export const provide = ["auth"];

/**
 * Authentication owns the instance's front door and the accounts behind it.
 *
 * The configured account is the administrator: it is created on first start and
 * written back on every later start, so the configuration is the source of
 * truth and a lost password is recovered by editing the file rather than by a
 * reset flow. The plugin ships disabled, and it refuses to load without
 * credentials rather than standing in front of the application with no way in.
 */
export interface AuthConfig {
  username: string;
  password: string;
  email: string;
  /** Whether existing local accounts may sign in with username/email and password. */
  passwordLoginEnabled: boolean;
  /** Whether a visitor may create a local password account. */
  passwordRegistrationEnabled: boolean;
  /** Which self-service registration paths may create a new local user. */
  registrationMode: "disabled" | "password" | "external" | "any";
  /** Login methods the administrator permits: `password` plus registered provider ids. */
  allowedLoginMethods: string[];
  /** Provider ids allowed to create an account on their first successful login. */
  allowedRegistrationProviders: string[];
}
export const config: Schema<AuthConfig> = Schema.object({
  username: Schema.string("管理员账号,启动时创建或覆盖").required(),
  password: Schema.string("管理员密码,每次启动都覆盖为该值").required(),
  email: Schema.string("管理员邮箱,留空则使用 <用户名>@localhost"),
  passwordLoginEnabled: Schema.boolean("允许账号密码登录").default(true),
  passwordRegistrationEnabled: Schema.boolean("允许账号密码自助注册").default(false),
  registrationMode: Schema.enum(["disabled", "password", "external", "any"], "允许自助注册的方式").default("disabled"),
  allowedLoginMethods: Schema.array(Schema.string(), "允许登录方式（password 或已注册的 Provider ID）").default(["password"]),
  allowedRegistrationProviders: Schema.array(Schema.string(), "允许首次登录时创建账号的 Provider ID").default([]),
});

export interface AuthService {
  enabled(): boolean;
  registerProvider(provider: AuthProvider): () => void;
  listProviders(): PublicAuthProvider[];
  completeExternalLogin(session: Session, identity: ExternalIdentity, options?: { returnTo?: string; responseMode?: "redirect" | "json" }): Promise<AuthCompletion>;
  bindExternalIdentity(userId: number, identity: ExternalIdentity): Promise<AuthIdentity>;
  establishSession(session: Session, user: User, options?: { returnTo?: string; responseMode?: "redirect" | "json" }): Promise<AuthCompletion>;
}
declare module "yumeri" {
  interface Components {
    auth: AuthService;
  }
}

/** Cookie that carries the session for page requests. */
export const sessionCookieName = "veloce_session";
const sessionLifetimeSeconds = 7 * 24 * 60 * 60;

/**
 * Paths a request may reach without a session.
 *
 * Everything else is refused by the middleware at the bottom of this file, so
 * this list is the whole of the public surface: the authentication page, the
 * endpoints it needs before anyone has signed in, and the assets both load.
 */
const publicPaths = new Set(["/login"]);
const publicAPIPaths = new Set([
  "/api/public/settings",
  "/api/auth/configuration",
  "/api/dashboard/manifest",
  "/api/static/plugin",
  "/auth/password/login",
  "/auth/password/register",
  "/auth/logout",
  "/api/auth/logout",
]);
const publicAPIPrefixes = [
  "/api/auth/provider/",
  "/api/auth/callback/",
  "/api/advanced-chat/connectors/",
];
const assetPattern = /\.(?:js|mjs|cjs|jsx|ts|mts|cts|tsx|css|map|json|txt|svg|png|jpe?g|gif|webp|avif|ico|woff2?|ttf|otf|wasm)$/i;

/** Static files the pre-authentication pages are built from. */
export function isAssetRequest(pathname: string) {
  if (pathname.startsWith("/api/")) return false;
  // The development server compiles the application from sources, so its module
  // graph has to be reachable before a session exists.
  if (pathname.startsWith("/@") || pathname.startsWith("/node_modules/.vite/")) return true;
  return assetPattern.test(pathname);
}

/** True when a request may be answered without a session. */
export function isPublicRequest(pathname: string) {
  if (publicPaths.has(pathname)) return true;
  if (isAssetRequest(pathname)) return true;
  if (publicAPIPaths.has(pathname)) return true;
  return publicAPIPrefixes.some((prefix) => pathname.startsWith(prefix));
}

/** True when the caller wants a payload rather than a document. */
export function expectsJSON(pathname: string, headers: Record<string, string> | undefined) {
  if (pathname.startsWith("/api/")) return true;
  return String(headers?.accept ?? "").includes("application/json");
}

/** True when the caller is a browser navigating, so a redirect answers it. */
export function isNavigation(pathname: string, headers: Record<string, string> | undefined) {
  if (expectsJSON(pathname, headers)) return false;
  return String(headers?.accept ?? "").includes("text/html");
}

/** Only same-site absolute paths are honoured, so `next` cannot leave the site. */
export function sanitizeNext(value: string | null | undefined) {
  const next = String(value ?? "").trim();
  if (!next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return "";
  return next;
}

/** A user as the management API may show one: never the password hash. */
export type PublicUser = Omit<User, "password_hash">;

function publicUser(user: User): PublicUser {
  const { password_hash, ...rest } = user;
  return rest;
}

/** Bodies are read by hand so a malformed request is a 400, not a crash. */
async function readBody(session: Session) {
  try {
    return (await session.parseRequestBody()) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

export async function apply(ctx: Context, config: AuthConfig) {
  const username = String(config?.username ?? "").trim();
  const password = String(config?.password ?? "");
  const email = String(config?.email ?? "").trim().toLowerCase() || `${username || "admin"}@localhost`;
  const passwordLoginEnabled = config?.passwordLoginEnabled !== false;
  const passwordRegistrationEnabled = config?.passwordRegistrationEnabled === true;
  const registrationMode = config?.registrationMode ?? "disabled";
  const allowedLoginMethods = new Set((config?.allowedLoginMethods?.length ? config.allowedLoginMethods : ["password"]).map((value) => String(value).trim()).filter(Boolean));
  const allowedRegistrationProviders = new Set((config?.allowedRegistrationProviders ?? []).map((value) => String(value).trim()).filter(Boolean));
  if (!username || !password) {
    // Left pending by the loader rather than gating the application with no
    // account behind it: a missing credential is a configuration mistake, not a
    // reason to lock the instance.
    throw Error("authentication requires a username and a password; set them before enabling this plugin");
  }

  const db = ctx.component.database;
  await db.extend("email_verification_codes", {
    id: { type: "integer", autoIncrement: true }, email: { type: "string", nullable: false }, code_hash: { type: "string", nullable: false }, purpose: { type: "string", nullable: false }, hcaptcha_verified: { type: "boolean", initial: false }, expires_at: "timestamp", used_at: "timestamp", created_at: "timestamp",
  });
  await db.extend("phone_verification_codes", {
    id: { type: "integer", autoIncrement: true }, phone: { type: "string", nullable: false }, code_hash: { type: "string", nullable: false }, purpose: { type: "string", nullable: false }, hcaptcha_verified: { type: "boolean", initial: false }, expires_at: "timestamp", used_at: "timestamp", created_at: "timestamp",
  });
  await db.extend("oidc_bind_requests", {
    state: { type: "string", nullable: false }, user_id: { type: "integer", nullable: false }, expires_at: "timestamp", created_at: "timestamp",
  }, { unique: ["state"] });
  await db.extend("webauthn_challenges", {
    id: { type: "integer", autoIncrement: true }, challenge: { type: "string", nullable: false }, purpose: { type: "string", nullable: false }, user_id: "integer", rp_id: { type: "string", nullable: false }, origin: { type: "string", nullable: false }, expires_at: "timestamp", created_at: "timestamp",
  }, { unique: ["challenge"] });
  await db.extend("passkey_credentials", {
    id: { type: "integer", autoIncrement: true }, user_id: { type: "integer", nullable: false }, name: { type: "string", nullable: false }, credential_id: { type: "text", nullable: false }, public_key_cose: { type: "text", nullable: false }, aaguid: "text", sign_count: "integer", last_used_at: "timestamp", created_at: "timestamp", updated_at: "timestamp",
  }, { unique: ["credential_id"] });

  ctx.i18n({
    auth: {
      users: {
        title: { zh: "用户管理", en: "Users", ja: "ユーザー管理" },
        subtitle: { zh: "这里的账号就是能访问这个实例的人。", en: "These are the accounts that may reach this instance.", ja: "ここに並ぶアカウントが、このインスタンスを利用できる人です。" },
        search: { zh: "搜索用户名或邮箱", en: "Search username or email", ja: "ユーザー名またはメールで検索" },
        empty: { zh: "没有匹配的账号。", en: "No accounts match.", ja: "該当するアカウントがありません。" },
        loadFailed: { zh: "读取用户列表失败", en: "Could not read the user list", ja: "ユーザー一覧を取得できませんでした" },
        create: { zh: "新建账号", en: "New account", ja: "アカウントを作成" },
        createAction: { zh: "创建", en: "Create", ja: "作成" },
        edit: { zh: "编辑账号", en: "Edit account", ja: "アカウントを編集" },
        save: { zh: "保存", en: "Save", ja: "保存" },
        cancel: { zh: "取消", en: "Cancel", ja: "キャンセル" },
        remove: { zh: "删除", en: "Delete", ja: "削除" },
        columnUser: { zh: "账号", en: "Account", ja: "アカウント" },
        columnRole: { zh: "角色", en: "Role", ja: "権限" },
        columnCreated: { zh: "创建时间", en: "Created", ja: "作成日時" },
        columnActions: { zh: "操作", en: "Actions", ja: "操作" },
        username: { zh: "用户名", en: "Username", ja: "ユーザー名" },
        email: { zh: "邮箱", en: "Email", ja: "メールアドレス" },
        password: { zh: "密码", en: "Password", ja: "パスワード" },
        passwordKeep: { zh: "留空表示不修改", en: "Leave blank to keep the current one", ja: "空欄のままにすると変更しません" },
        admin: { zh: "管理员", en: "Administrator", ja: "管理者" },
        member: { zh: "普通用户", en: "Member", ja: "一般ユーザー" },
        adminHint: { zh: "管理员可以看到并修改实例的每一项配置。", en: "Administrators can see and change every setting on the instance.", ja: "管理者はインスタンスのすべての設定を閲覧・変更できます。" },
        created: { zh: "账号已创建", en: "Account created", ja: "アカウントを作成しました" },
        updated: { zh: "账号已更新", en: "Account updated", ja: "アカウントを更新しました" },
        deleted: { zh: "账号已删除", en: "Account deleted", ja: "アカウントを削除しました" },
        confirmRemove: { zh: "删除账号", en: "Delete account", ja: "アカウントを削除" },
        confirmRemoveBody: { zh: "该账号将无法再登录,这个操作不能撤销。", en: "This account will no longer be able to sign in, and this cannot be undone.", ja: "このアカウントはログインできなくなり、元に戻せません。" },
        errorInvalid: { zh: "用户名、邮箱和密码都是必填的,密码至少 8 位。", en: "A username, an email and a password of at least 8 characters are required.", ja: "ユーザー名・メール・8文字以上のパスワードが必要です。" },
        errorDuplicate: { zh: "用户名或邮箱已被占用。", en: "That username or email is already taken.", ja: "そのユーザー名またはメールは既に使われています。" },
        errorConfigured: { zh: "这是配置里指定的管理员账号,不能删除或降级。", en: "This is the administrator named in the configuration; it cannot be deleted or demoted.", ja: "設定で指定された管理者アカウントのため、削除も降格もできません。" },
        errorSelf: { zh: "不能删除当前登录的账号。", en: "You cannot delete the account you are signed in as.", ja: "ログイン中のアカウントは削除できません。" },
        errorNotFound: { zh: "账号不存在。", en: "That account does not exist.", ja: "そのアカウントは存在しません。" },
        errorForbidden: { zh: "需要管理员权限。", en: "Administrator access is required.", ja: "管理者権限が必要です。" },
        errorFailed: { zh: "操作失败", en: "The operation failed", ja: "操作に失敗しました" },
      },
    },
  });
  ctx.component.dashboard.addEntry({
    id: "auth",
    dev: new URL("../frontend/index.tsx", import.meta.url).pathname,
    prod: new URL("./frontend/auth.js", import.meta.url).pathname,
    plugin: "auth",
  });

  const service = ctx.component.service as ServiceRegistry;
  const userService = ctx.component.user;
  const providers = new Map<string, AuthProvider>();
  const auth: AuthService = {
    enabled: () => true,
    registerProvider(provider) {
      const id = String(provider?.id ?? "").trim();
      if (!/^[a-z0-9][a-z0-9_-]{0,63}$/i.test(id)) throw Error("provider id must contain only letters, numbers, underscores, or hyphens");
      if (!String(provider?.displayName ?? "").trim()) throw Error("provider displayName is required");
      if (providers.has(id)) throw Error(`authentication provider "${id}" is already registered`);
      providers.set(id, { ...provider, id });
      return () => { if (providers.get(id) === provider || providers.get(id)?.id === id) providers.delete(id); };
    },
    listProviders: () => listProviders(),
    completeExternalLogin: (session, identity, options) => completeExternalLogin(session, identity, options),
    bindExternalIdentity: (userId, identity) => bindExternalIdentity(userId, identity),
    establishSession: (session, user, options) => establishSession(session, user, options),
  };
  ctx.registerComponent("auth", auth);
  await ensureTables(db);

  /**
   * Revoked sessions.
   *
   * A set in memory would forget every logout on restart and grow without bound
   * while the process lives, so the list is kept in the database keyed by the
   * token's hash. The set here is only a cache of hits, and it is dropped when
   * it gets large, because the database — not the set — is what decides.
   */
  const revokedCache = new Set<string>();
  const hashToken = (token: string) =>
    createHash("sha256").update(token).digest("hex");
  const tokenExpiry = (token: string) => {
    const payload = token.split(".")[1] ?? "";
    try {
      const claims = JSON.parse(
        Buffer.from(payload, "base64url").toString("utf8"),
      );
      if (Number.isFinite(claims?.exp) && claims.exp > 0)
        return new Date(Number(claims.exp) * 1000);
    } catch {
      // A token that is not a JWT still has to be revocable, so it falls back
      // to the lifetime this plugin hands out.
    }
    return new Date(Date.now() + sessionLifetimeSeconds * 1000);
  };
  const revokeToken = async (token: string, userId: number) => {
    if (!token) return;
    const id = hashToken(token);
    if (revokedCache.size > 10000) revokedCache.clear();
    revokedCache.add(id);
    await db.upsert(
      "auth_revoked_tokens",
      [
        {
          id,
          user_id: userId,
          expires_at: tokenExpiry(token).toISOString(),
          created_at: new Date().toISOString(),
        },
      ],
      "id",
    );
  };
  const isRevoked = async (token: string) => {
    const id = hashToken(token);
    if (revokedCache.has(id)) return true;
    const row = await db.selectOne("auth_revoked_tokens", {
      id,
      expires_at: { $gt: new Date().toISOString() },
    });
    if (row) revokedCache.add(id);
    return Boolean(row);
  };
  ctx.setInterval(() => {
    void db
      .remove("auth_revoked_tokens", {
        expires_at: { $lte: new Date().toISOString() },
      })
      .catch(() => undefined);
  }, 3600_000);

  /**
   * The configured account becomes the instance's administrator. Every start
   * writes the configured password back and keeps the row's other fields, so a
   * forgotten password costs one edit and redeploy rather than a recovery flow,
   * while balance, avatar and group survive the restart.
   */
  const bootstrap = async () => {
    const password_hash = bcrypt.hashSync(password, bcrypt.genSaltSync(10));
    const byUsername = await userService.findByIdentifier(username);
    const byEmail = byUsername ? undefined : await userService.findByIdentifier(email);
    const existing = byUsername ?? byEmail;
    if (existing) {
      const updated = await userService.update(existing.id, {
        username,
        email,
        password_hash,
        is_admin: true,
        email_verified: true,
      });
      console.log(`[auth] administrator "${username}" adopted from configuration`);
      return updated ?? existing;
    }
    const group = await userService.ensureDefaultGroup();
    const created = await userService.create({
      username,
      email,
      phone: null,
      oidc_sub: null,
      password_hash,
      is_admin: true,
      email_verified: true,
      avatar_url: "",
      balance: "0",
      group_id: group.id ?? 0,
      referral_code: null,
      referrer_id: null,
    });
    console.log(`[auth] administrator "${username}" created from configuration`);
    return created;
  };
  const administrator = await bootstrap();

  const setSessionCookie = (session: Session, token: string, expires: Date) => {
    session.setCookie(sessionCookieName, token, {
      httpOnly: true,
      sameSite: "Lax",
      path: "/",
      secure: session.protocol === "https",
      expires,
    });
  };

  const externalRegistrationAllowed = (provider: AuthProvider) =>
    ["external", "any"].includes(registrationMode) &&
    allowedRegistrationProviders.has(provider.id) &&
    provider.registrationEnabled?.() !== false;
  const listProviders = (): PublicAuthProvider[] =>
    [...providers.values()].map((provider) => {
      let available = false;
      try { available = provider.available() === true; } catch { available = false; }
      return {
        id: provider.id,
        displayName: provider.displayName,
        ...(provider.icon ? { icon: provider.icon } : {}),
        available,
        loginEnabled: available && allowedLoginMethods.has(provider.id),
        registrationEnabled: available && allowedLoginMethods.has(provider.id) && externalRegistrationAllowed(provider),
      };
    }).sort((left, right) => left.displayName.localeCompare(right.displayName));
  const normalizedIdentity = (identity: ExternalIdentity) => ({
    provider: String(identity?.provider ?? "").trim(),
    subject: String(identity?.subject ?? "").trim(),
    email: String(identity?.email ?? "").trim().toLowerCase(),
    emailVerified: identity?.emailVerified === true,
    usernameHint: String(identity?.usernameHint ?? "").trim(),
    avatarUrl: String(identity?.avatarUrl ?? "").trim(),
  });
  const identityError = (identity: ExternalIdentity) => {
    const value = normalizedIdentity(identity);
    if (!value.provider || !value.subject || value.provider.length > 64 || value.subject.length > 512)
      throw Error("external identity requires a valid provider and subject");
    return value;
  };
  const uniqueExternalUsername = async (provider: string, subject: string, hint: string) => {
    const base = (hint || `${provider}-user`).toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || `${provider}-user`;
    const stem = base.length >= 3 ? base : `${provider}-${base}`.slice(0, 48);
    for (let attempt = 0; attempt < 20; attempt++) {
      const suffix = attempt ? `-${randomBytes(3).toString("hex")}` : "";
      const candidate = `${stem.slice(0, 80 - suffix.length)}${suffix}`;
      if (!(await userService.findByIdentifier(candidate))) return candidate;
    }
    throw Error("could not allocate an external username");
  };
  async function bindExternalIdentity(userId: number, source: ExternalIdentity): Promise<AuthIdentity> {
    const identity = identityError(source);
    const provider = providers.get(identity.provider);
    if (!provider) throw Error("authentication provider is not registered");
    const existing = await db.selectOne("auth_identities", { provider: identity.provider, subject: identity.subject }) as AuthIdentity | undefined;
    if (existing) {
      if (existing.user_id !== userId) throw Error("this external identity is already bound to another account");
      return existing;
    }
    const now = new Date().toISOString();
    return db.create("auth_identities", {
      user_id: userId,
      provider: identity.provider,
      subject: identity.subject,
      email_at_link_time: identity.email || null,
      profile_json: source.profile ? JSON.stringify(source.profile) : null,
      created_at: now,
      updated_at: now,
    }) as Promise<AuthIdentity>;
  }
  async function establishSession(session: Session, user: User, options: { returnTo?: string; responseMode?: "redirect" | "json" } = {}): Promise<AuthCompletion> {
    if (user.id === undefined) throw Error("user is required to establish a session");
    const token = service.issueToken(user);
    setSessionCookie(session, token, new Date(Date.now() + sessionLifetimeSeconds * 1000));
    const returnTo = sanitizeNext(options.returnTo) || "/";
    const completion = { userId: user.id, token, created: false, returnTo };
    if (options.responseMode === "redirect") {
      session.status = 302;
      session.head.Location = returnTo;
      session.respond("", "plain");
    } else {
      session.respond({ user: publicUser(user), token }, "json");
    }
    return completion;
  }
  async function completeExternalLogin(session: Session, source: ExternalIdentity, options: { returnTo?: string; responseMode?: "redirect" | "json" } = {}): Promise<AuthCompletion> {
    const identity = identityError(source);
    const provider = providers.get(identity.provider);
    if (!provider) throw Error("authentication provider is not registered");
    let available = false;
    try { available = provider.available() === true; } catch { available = false; }
    if (!available || !allowedLoginMethods.has(identity.provider)) throw Error("external login is disabled for this provider");
    const bound = await db.selectOne("auth_identities", { provider: identity.provider, subject: identity.subject }) as AuthIdentity | undefined;
    let user: User | undefined;
    let created = false;
    if (bound) {
      user = await userService.findById(bound.user_id);
      if (!user) throw Error("external identity is bound to a missing account; contact an administrator");
    }
    if (!user) {
      if (!externalRegistrationAllowed(provider)) throw Error("external registration is disabled for this provider");
      const username = await uniqueExternalUsername(identity.provider, identity.subject, identity.usernameHint);
      const emailAddress = identity.email && identity.emailVerified ? identity.email : `${identity.provider}-${createHash("sha256").update(identity.subject).digest("hex").slice(0, 24)}@external.invalid`;
      if (await userService.findByIdentifier(emailAddress)) throw Error("an account with this email already exists; sign in and bind this provider explicitly");
      const group = await userService.ensureDefaultGroup();
      user = await userService.create({
        username,
        email: emailAddress,
        phone: null,
        oidc_sub: null,
        password_hash: bcrypt.hashSync(randomBytes(32).toString("base64url"), bcrypt.genSaltSync(10)),
        is_admin: false,
        email_verified: Boolean(identity.email && identity.emailVerified),
        avatar_url: identity.avatarUrl,
        balance: "0",
        group_id: group.id ?? 0,
        referral_code: null,
        referrer_id: null,
      });
      await bindExternalIdentity(user.id!, source);
      created = true;
    }
    const completion = await establishSession(session, user, options);
    return { ...completion, created };
  };

  /**
   * The session of a request, taken from the authorization header the
   * application sends or from the cookie a browser navigation carries.
   */
  const resolveSession = async (session: Session) => {
    const parts = String(session.client.req?.headers.authorization ?? "").trim().split(/\s+/);
    const bearer = parts.length === 2 && parts[0].toLowerCase() === "bearer" ? parts[1] : "";
    const cookie = String(session.cookie?.[sessionCookieName] ?? "");
    for (const [token, source] of [[bearer, "bearer"], [cookie, "cookie"]] as const) {
      if (!token || (await isRevoked(token))) continue;
      const user = await service.verifyToken(token);
      if (user) return { user, token, source };
    }
    return undefined;
  };
  const resolveUser = async (session: Session) => (await resolveSession(session))?.user;

  /**
   * The authentication page. It is a document served by this plugin rather than
   * a page of the application, because the application cannot be loaded before
   * a session exists.
   */
  ctx
    .route("/login")
    .methods("GET")
    .action(async (session: Session, query: URLSearchParams) => {
      const next = sanitizeNext(query.get("next"));
      if (await resolveUser(session)) {
        session.status = 302;
        session.head.Location = next || "/";
        session.respond("", "plain");
        return;
      }
      session.setMime("text/html; charset=utf-8");
      session.head["Cache-Control"] = "no-store";
      session.respond(renderLoginPage({ next }), "plain");
    });

  /** What the authentication page needs before anyone has signed in. */
  ctx.route("/api/auth/configuration").methods("GET").action((session: Session) => {
    session.respond(
      {
        auth_agreement_mode: "notice",
        password_login_enabled: passwordLoginEnabled && allowedLoginMethods.has("password"),
        password_registration_enabled: passwordRegistrationEnabled && ["password", "any"].includes(registrationMode),
        password_hcaptcha_enabled: false,
        providers: listProviders().filter((provider) => provider.loginEnabled),
      },
      "json",
    );
  });
  ctx.route("/api/auth/providers").methods("GET").action((session: Session) => {
    session.respond({ providers: listProviders().filter((provider) => provider.loginEnabled) }, "json");
  });

  ctx
    .route("/auth/password/login")
    .methods("POST")
    .action(async (session) => {
      try {
        if (!passwordLoginEnabled || !allowedLoginMethods.has("password"))
          throw Error("password login is disabled");
        const body = (await session.parseRequestBody()) as any;
        const result = await service.loginWithPassword(
          String(body.identifier ?? ""),
          String(body.password ?? ""),
        );
        await establishSession(session, result.user, { responseMode: "json" });
      } catch (error) {
        session.status = 401;
        session.respond(
          { error: error instanceof Error ? error.message : String(error) },
          "json",
        );
      }
    });
  ctx
    .route("/auth/password/register")
    .methods("POST")
    .action(async (session) => {
      try {
        if (!passwordRegistrationEnabled || !["password", "any"].includes(registrationMode))
          throw Error("password registration is disabled");
        const body = (await session.parseRequestBody()) as any;
        const name = String(body.username ?? "").trim();
        const address = String(body.email ?? "")
          .trim()
          .toLowerCase();
        const secret = String(body.password ?? "");
        if (name.length < 3 || !address.includes("@") || secret.length < 8)
          throw Error("username, email, and password are required");
        if (
          (await userService.findByIdentifier(name)) ||
          (await userService.findByIdentifier(address))
        )
          throw Error("user already exists");
        const group = await userService.ensureDefaultGroup();
        const user = await userService.create({
          username: name,
          email: address,
          phone: null,
          oidc_sub: null,
          password_hash: bcrypt.hashSync(secret, bcrypt.genSaltSync(10)),
          is_admin: false,
          email_verified: false,
          avatar_url: "",
          balance: "0",
          group_id: group.id ?? 0,
          referral_code: null,
          referrer_id: null,
        });
        session.status = 201;
        session.respond({ user: publicUser(user) }, "json");
      } catch (error) {
        session.status = 400;
        session.respond(
          { error: error instanceof Error ? error.message : String(error) },
          "json",
        );
      }
    });
  const logout = async (session: Session) => {
    const header = session.client.req?.headers.authorization ?? "";
    const token = String(header)
      .replace(/^bearer\s+/i, "")
      .trim();
    const cookie = String(session.cookie?.[sessionCookieName] ?? "");
    const caller = session.properties.user as User | undefined;
    for (const value of [token, cookie]) {
      if (value) await revokeToken(value, Number(caller?.id ?? 0));
    }
    setSessionCookie(session, "", new Date(0));
    session.respond({ success: true }, "json");
  };
  // The application calls this through its `/api` client, which is what the
  // dashboard sends; the unprefixed path stays because the login page uses it.
  for (const path of ["/auth/logout", "/api/auth/logout"])
    ctx.route(path).methods("POST", "GET").action(logout);

  /**
   * User management. Any signed-in caller could reach these routes — the gate
   * above only asks whether someone is signed in — so the account operations
   * check the role themselves: handing out administrator access is the one
   * decision this surface exists to control.
   */
  const requireAdmin = (session: Session) => {
    const caller = session.properties.user as User | undefined;
    if (!caller?.is_admin) {
      session.status = 403;
      session.respond({ error: "forbidden" }, "json");
      return undefined;
    }
    return caller;
  };

  ctx
    .route("/api/auth/admin/capabilities")
    .methods("GET")
    .action((session: Session) => {
      if (!requireAdmin(session)) return;
      session.respond({
        providers: listProviders(),
        loginMethods: [{ id: "password", displayName: "账号密码", available: true }, ...listProviders().filter((provider) => provider.available)],
      }, "json");
    });

  ctx
    .route("/api/auth/users")
    .methods("GET")
    .action(async (session: Session, query: URLSearchParams) => {
      if (!requireAdmin(session)) return;
      const rows = ((await db.select("users", {})) as User[]).map(publicUser);
      const needle = String(query.get("query") ?? "").trim().toLowerCase();
      const matched = needle
        ? rows.filter((user) =>
            [user.username, user.email].some((value) => String(value ?? "").toLowerCase().includes(needle)),
          )
        : rows;
      session.respond(
        {
          users: matched.sort((left, right) => Number(right.is_admin) - Number(left.is_admin) || left.id - right.id),
          total: rows.length,
          configured: administrator?.id ?? 0,
        },
        "json",
      );
    });

  ctx
    .route("/api/auth/users")
    .methods("POST")
    .action(async (session: Session) => {
      if (!requireAdmin(session)) return;
      const body = await readBody(session);
      if (!body) {
        session.status = 400;
        session.respond({ error: "invalid" }, "json");
        return;
      }
      const name = String(body.username ?? "").trim();
      const address = String(body.email ?? "").trim().toLowerCase();
      const secret = String(body.password ?? "");
      if (name.length < 3 || !address.includes("@") || secret.length < 8) {
        session.status = 400;
        session.respond({ error: "invalid" }, "json");
        return;
      }
      if ((await userService.findByIdentifier(name)) || (await userService.findByIdentifier(address))) {
        session.status = 409;
        session.respond({ error: "duplicate" }, "json");
        return;
      }
      const group = await userService.ensureDefaultGroup();
      const created = await userService.create({
        username: name,
        email: address,
        phone: null,
        oidc_sub: null,
        password_hash: bcrypt.hashSync(secret, bcrypt.genSaltSync(10)),
        is_admin: body.is_admin === true,
        email_verified: true,
        avatar_url: "",
        balance: "0",
        group_id: group.id ?? 0,
        referral_code: null,
        referrer_id: null,
      });
      session.status = 201;
      session.respond({ user: publicUser(created) }, "json");
    });

  ctx
    .route("/api/auth/users/update")
    .methods("POST")
    .action(async (session: Session) => {
      if (!requireAdmin(session)) return;
      const body = await readBody(session);
      if (!body) {
        session.status = 400;
        session.respond({ error: "invalid" }, "json");
        return;
      }
      const target = await userService.findById(Number(body.id ?? 0));
      if (!target) {
        session.status = 404;
        session.respond({ error: "not_found" }, "json");
        return;
      }
      const updates: Partial<User> = {};
      const name = String(body.username ?? "").trim();
      const address = String(body.email ?? "").trim().toLowerCase();
      if (name && name !== target.username) {
        if (name.length < 3) {
          session.status = 400;
          session.respond({ error: "invalid" }, "json");
          return;
        }
        if (await userService.findByIdentifier(name)) {
          session.status = 409;
          session.respond({ error: "duplicate" }, "json");
          return;
        }
        updates.username = name;
      }
      if (address && address !== target.email) {
        if (!address.includes("@")) {
          session.status = 400;
          session.respond({ error: "invalid" }, "json");
          return;
        }
        if (await userService.findByIdentifier(address)) {
          session.status = 409;
          session.respond({ error: "duplicate" }, "json");
          return;
        }
        updates.email = address;
      }
      const secret = String(body.password ?? "");
      if (secret) {
        if (secret.length < 8) {
          session.status = 400;
          session.respond({ error: "invalid" }, "json");
          return;
        }
        updates.password_hash = bcrypt.hashSync(secret, bcrypt.genSaltSync(10));
      }
      // The configured account is re-promoted on the next start, so demoting it
      // would look like it took and quietly undo itself; refuse instead.
      if (typeof body.is_admin === "boolean" && body.is_admin !== target.is_admin) {
        if (target.id === administrator?.id && body.is_admin === false) {
          session.status = 409;
          session.respond({ error: "configured" }, "json");
          return;
        }
        updates.is_admin = body.is_admin;
      }
      const updated = await userService.update(target.id, updates);
      session.respond({ user: updated ? publicUser(updated) : publicUser(target) }, "json");
    });

  ctx
    .route("/api/auth/users/delete")
    .methods("POST")
    .action(async (session: Session) => {
      const caller = requireAdmin(session);
      if (!caller) return;
      const body = await readBody(session);
      const id = Number(body?.id ?? 0);
      if (!body || !id) {
        session.status = 400;
        session.respond({ error: "invalid" }, "json");
        return;
      }
      if (id === caller.id) {
        session.status = 409;
        session.respond({ error: "self" }, "json");
        return;
      }
      const target = await userService.findById(id);
      if (!target) {
        session.status = 404;
        session.respond({ error: "not_found" }, "json");
        return;
      }
      if (id === administrator?.id) {
        session.status = 409;
        session.respond({ error: "configured" }, "json");
        return;
      }
      await db.remove("users", { id });
      session.respond({ success: true }, "json");
    });

  /**
   * Authentication is a layer in front of everything, not a page inside the
   * application: a request either carries a session or is answered with a
   * redirect to the authentication page (a navigation) or a 401 (an API call).
   */
  ctx.use(
    "authentication",
    async (session: Session, next: () => Promise<void>) => {
      const pathname = session.pathname || "/";
      const resolved = await resolveSession(session);
      if (resolved) {
        session.properties.user = resolved.user;
        // A session proven by the authorization header also becomes a cookie,
        // so a browser that holds a token can reload the page it is on.
        if (resolved.source === "bearer" && String(session.cookie?.[sessionCookieName] ?? "") !== resolved.token)
          setSessionCookie(session, resolved.token, new Date(Date.now() + sessionLifetimeSeconds * 1000));
        await next();
        return;
      }
      if (isPublicRequest(pathname)) {
        await next();
        return;
      }
      const headers = session.client.req?.headers as Record<string, string> | undefined;
      if (isNavigation(pathname, headers)) {
        session.status = 302;
        session.head.Location = `/login?next=${encodeURIComponent(pathname)}`;
        session.respond("", "plain");
        return;
      }
      session.status = 401;
      session.respond({ error: "Authorization is required" }, "json");
    },
  );
}
