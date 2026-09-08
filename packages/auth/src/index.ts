import { Context, Schema, Session } from "yumeri";
import bcrypt from "bcryptjs";
import { ServiceRegistry } from "@velocelab/service";
import "@velocelab/dashboard";
import "@velocelab/database-core";
import { EmailVerificationCode, PhoneVerificationCode, OIDCBindRequest, WebAuthnChallenge, PasskeyCredential } from "@velocelab/model-catalog";

declare module "@yumerijs/types" {
  interface Tables {
    email_verification_codes: EmailVerificationCode;
    phone_verification_codes: PhoneVerificationCode;
    oidc_bind_requests: OIDCBindRequest;
    webauthn_challenges: WebAuthnChallenge;
    passkey_credentials: PasskeyCredential;
  }
}
export const depend = ["service", "user", "dashboard"];
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
  ctx.component.dashboard.addEntry({
    dev: new URL("../frontend/index.tsx", import.meta.url).pathname,
    prod: new URL("../frontend/auth.js", import.meta.url).pathname,
    plugin: "auth",
  });
  const service = ctx.component.service as ServiceRegistry;
  const userService = ctx.component.user;
  const revokedTokens = new Set<string>();
  const auth: AuthService = { enabled: () => true };
  ctx.registerComponent("auth", auth);
  ctx
    .route("/auth/password/login")
    .methods("POST")
    .action(async (session) => {
      try {
        const body = (await session.parseRequestBody()) as any;
        session.respond(
          await service.loginWithPassword(
            String(body.identifier ?? ""),
            String(body.password ?? ""),
          ),
          "json",
        );
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
      session.respond({ success: true }, "json");
    });
  ctx.use(
    "authentication",
    async (session: Session, next: () => Promise<void>) => {
      const path = session.pathname || "";
      const publicRoute =
        path === "/api/public/settings" ||
        path === "/api/configuration" ||
        path === "/api/setup/status" ||
        path === "/api/setup" ||
        path === "/auth/password/login" ||
        path === "/auth/password/register" ||
        path.startsWith("/api/advanced-chat/connectors/");
      if (!path.startsWith("/api/") && !path.startsWith("/auth/"))
        return next();
      if (publicRoute) return next();
      const header = session.client.req?.headers.authorization ?? "";
      const parts = String(header).trim().split(/\s+/);
      let invalidBearer = false;
      if (parts.length === 2 && parts[0].toLowerCase() === "bearer") {
        const user = revokedTokens.has(parts[1])
          ? undefined
          : await service.verifyToken(parts[1]);
        if (user) session.properties.user = user;
        else invalidBearer = true;
      }
      if (invalidBearer || !session.properties.user) {
        session.status = 401;
        session.respond({ error: "Authorization is required" }, "json");
        return;
      }
      await next();
    },
  );
}
