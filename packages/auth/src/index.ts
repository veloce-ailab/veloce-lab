import { Context, Schema, Session } from "yumeri";
import bcrypt from "bcryptjs";
import { ServiceRegistry } from "@velocelab/service";
import "@velocelab/database-core";
import type { EmailVerificationCode, PhoneVerificationCode, OIDCBindRequest, WebAuthnChallenge, PasskeyCredential } from "./types.js";
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
export const depend = ["service", "user", "database"];
export const provide = ["auth"];
export interface AuthConfig { }
export const config: Schema<AuthConfig> = Schema.object({});
export interface AuthService {
  enabled(): boolean;
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
 * Everything else is refused by the middleware below, so this list is the whole
 * of the public surface: the authentication page, the first-run wizard that has
 * to run before any account exists, and the assets both of them load.
 */
const publicPaths = new Set(["/login", "/setup"]);
const publicAPIPaths = new Set([
  "/api/public/settings",
  "/api/configuration",
  "/api/setup",
  "/api/setup/status",
  "/api/dashboard/manifest",
  "/api/static/plugin",
  "/auth/password/login",
  "/auth/password/register",
  "/auth/logout",
]);
const publicAPIPrefixes = ["/api/advanced-chat/connectors/"];
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

export async function apply(ctx: Context) {
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
  const service = ctx.component.service as ServiceRegistry;
  const userService = ctx.component.user;
  const revokedTokens = new Set<string>();
  const auth: AuthService = { enabled: () => true };
  ctx.registerComponent("auth", auth);

  const setSessionCookie = (session: Session, token: string, expires: Date) => {
    session.setCookie(sessionCookieName, token, {
      httpOnly: true,
      sameSite: "Lax",
      path: "/",
      secure: session.protocol === "https",
      expires,
    });
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
      if (!token || revokedTokens.has(token)) continue;
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

  ctx
    .route("/auth/password/login")
    .methods("POST")
    .action(async (session) => {
      try {
        const body = (await session.parseRequestBody()) as any;
        const result = await service.loginWithPassword(
          String(body.identifier ?? ""),
          String(body.password ?? ""),
        );
        setSessionCookie(session, result.token, new Date(Date.now() + sessionLifetimeSeconds * 1000));
        session.respond(result, "json");
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
        if (!service.publicConfiguration().passwordRegistrationEnabled)
          throw Error("password registration is disabled");
        const body = (await session.parseRequestBody()) as any;
        const username = String(body.username ?? "").trim();
        const email = String(body.email ?? "")
          .trim()
          .toLowerCase();
        const password = String(body.password ?? "");
        if (username.length < 3 || !email.includes("@") || password.length < 8)
          throw Error("username, email, and password are required");
        if (
          (await userService.findByIdentifier(username)) ||
          (await userService.findByIdentifier(email))
        )
          throw Error("user already exists");
        const group = await userService.ensureDefaultGroup();
        const user = await userService.create({
          username,
          email,
          phone: null,
          oidc_sub: null,
          password_hash: bcrypt.hashSync(password, bcrypt.genSaltSync(10)),
          is_admin: false,
          email_verified: false,
          avatar_url: "",
          balance: "0",
          group_id: group.id ?? 0,
          referral_code: null,
          referrer_id: null,
        });
        session.status = 201;
        session.respond({ user }, "json");
      } catch (error) {
        session.status = 400;
        session.respond(
          { error: error instanceof Error ? error.message : String(error) },
          "json",
        );
      }
    });
  ctx
    .route("/auth/logout")
    .methods("POST", "GET")
    .action(async (session) => {
      const header = session.client.req?.headers.authorization ?? "";
      const token = String(header)
        .replace(/^bearer\s+/i, "")
        .trim();
      if (token) revokedTokens.add(token);
      const cookie = String(session.cookie?.[sessionCookieName] ?? "");
      if (cookie) revokedTokens.add(cookie);
      setSessionCookie(session, "", new Date(0));
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
        // so a browser that holds a token can reload the page it is on. This is
        // what carries the first-run wizard: it has a token but no login yet.
        if (resolved.source === "bearer" && String(session.cookie?.[sessionCookieName] ?? "") !== resolved.token)
          setSessionCookie(session, resolved.token, new Date(Date.now() + sessionLifetimeSeconds * 1000));
        await next();
        return;
      }
      if (isPublicRequest(pathname)) {
        await next();
        return;
      }
      const target = (await service.initialSetupRequired()) ? "/setup" : "/login";
      const headers = session.client.req?.headers as Record<string, string> | undefined;
      if (isNavigation(pathname, headers)) {
        session.status = 302;
        session.head.Location =
          target === "/login" ? `${target}?next=${encodeURIComponent(pathname)}` : target;
        session.respond("", "plain");
        return;
      }
      session.status = 401;
      session.respond({ error: "Authorization is required" }, "json");
    },
  );
}
