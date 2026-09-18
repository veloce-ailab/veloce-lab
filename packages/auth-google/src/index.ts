import { Context, Schema, Session } from "yumeri";
import { createHash, randomBytes } from "node:crypto";
import { sanitizeNext } from "@velocelab/auth";
import type { AuthProvider, ExternalIdentity } from "@velocelab/auth";
import "@velocelab/auth";
import "@velocelab/database-core";

export const depend = ["auth", "database"];
export const provide = ["auth-google"];

const providerId = "google";
const authorizationEndpoint = "https://accounts.google.com/o/oauth2/v2/auth";
const tokenEndpoint = "https://oauth2.googleapis.com/token";
const userInfoEndpoint = "https://openidconnect.googleapis.com/v1/userinfo";
const stateLifetimeMilliseconds = 10 * 60_000;

export interface GoogleAuthConfig {
  clientId: string;
  clientSecret: string;
  /** Must exactly match the Google Cloud OAuth application's authorized redirect URI. */
  redirectUri: string;
  /** Whether this provider itself permits creating a local account on first login. */
  allowRegistration: boolean;
  /** Optional Google Workspace domain restriction, e.g. example.com. */
  hostedDomain: string;
}

export const config: Schema<GoogleAuthConfig> = Schema.object({
  clientId: Schema.string("Google OAuth Client ID"),
  clientSecret: Schema.string("Google OAuth Client Secret"),
  redirectUri: Schema.string("Google OAuth authorized redirect URI, e.g. https://app.example.com/api/auth/callback/google"),
  allowRegistration: Schema.boolean("允许通过 Google 首次登录时注册").default(true),
  hostedDomain: Schema.string("可选：仅允许指定 Google Workspace 域名"),
});

interface GoogleLoginRequest {
  state: string;
  code_verifier: string;
  return_to?: string | null;
  expires_at: string;
  created_at: string;
}

interface GoogleTokenResponse {
  access_token?: string;
  token_type?: string;
}

interface GoogleProfile {
  sub?: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  given_name?: string;
  picture?: string;
  hd?: string;
}

declare module "@yumerijs/types" {
  interface Tables {
    auth_google_login_requests: GoogleLoginRequest;
  }
}

function configured(cfg: GoogleAuthConfig) {
  return Boolean(cfg.clientId.trim() && cfg.clientSecret.trim() && cfg.redirectUri.trim());
}

function pkceChallenge(verifier: string) {
  return createHash("sha256").update(verifier).digest("base64url");
}

function failure(session: Session, status: number, message: string) {
  session.status = status;
  session.respond({ error: message }, "json");
}

async function responseJson<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = payload as { error?: string; error_description?: string };
    throw Error(error.error_description || error.error || `Google returned HTTP ${response.status}`);
  }
  return payload as T;
}

export async function apply(ctx: Context, cfg: GoogleAuthConfig) {
  const db = ctx.component.database;
  const auth = ctx.component.auth;
  await db.extend("auth_google_login_requests", {
    state: { type: "string", nullable: false },
    code_verifier: { type: "string", nullable: false },
    return_to: "string",
    expires_at: { type: "string", nullable: false },
    created_at: "timestamp",
  }, { unique: ["state"] });

  const provider: AuthProvider = {
    id: providerId,
    displayName: "Google",
    available: () => configured(cfg),
    registrationEnabled: () => cfg.allowRegistration === true,
  };
  ctx.affect(auth.registerProvider(provider));

  ctx.route("/api/auth/provider/google").methods("GET").action(async (session: Session, query: URLSearchParams) => {
    if (!configured(cfg)) {
      failure(session, 503, "Google login is not configured");
      return;
    }
    const state = randomBytes(32).toString("base64url");
    const codeVerifier = randomBytes(32).toString("base64url");
    const now = new Date();
    const returnTo = sanitizeNext(query.get("next")) || "/";
    await db.create("auth_google_login_requests", {
      state,
      code_verifier: codeVerifier,
      return_to: returnTo,
      expires_at: new Date(now.getTime() + stateLifetimeMilliseconds).toISOString(),
      created_at: now.toISOString(),
    });
    const authorization = new URL(authorizationEndpoint);
    authorization.searchParams.set("client_id", cfg.clientId.trim());
    authorization.searchParams.set("redirect_uri", cfg.redirectUri.trim());
    authorization.searchParams.set("response_type", "code");
    authorization.searchParams.set("scope", "openid email profile");
    authorization.searchParams.set("state", state);
    authorization.searchParams.set("code_challenge", pkceChallenge(codeVerifier));
    authorization.searchParams.set("code_challenge_method", "S256");
    authorization.searchParams.set("prompt", "select_account");
    if (cfg.hostedDomain.trim()) authorization.searchParams.set("hd", cfg.hostedDomain.trim().toLowerCase());
    session.status = 302;
    session.head.Location = authorization.toString();
    session.respond("", "plain");
  });

  ctx.route("/api/auth/callback/google").methods("GET").action(async (session: Session, query: URLSearchParams) => {
    try {
      if (!configured(cfg)) throw Error("Google login is not configured");
      const state = String(query.get("state") ?? "");
      const code = String(query.get("code") ?? "");
      const upstreamError = String(query.get("error") ?? "");
      if (upstreamError) throw Error(`Google login was cancelled or denied: ${upstreamError}`);
      if (!state || !code) throw Error("Google callback is missing state or code");
      const request = await db.selectOne("auth_google_login_requests", { state }) as GoogleLoginRequest | undefined;
      await db.remove("auth_google_login_requests", { state });
      if (!request || new Date(request.expires_at).getTime() <= Date.now()) throw Error("Google login state is invalid or expired");

      const form = new URLSearchParams({
        code,
        client_id: cfg.clientId.trim(),
        client_secret: cfg.clientSecret.trim(),
        redirect_uri: cfg.redirectUri.trim(),
        grant_type: "authorization_code",
        code_verifier: request.code_verifier,
      });
      const tokens = await responseJson<GoogleTokenResponse>(await fetch(tokenEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: form,
      }));
      if (!tokens.access_token || tokens.token_type?.toLowerCase() !== "bearer") throw Error("Google did not return a usable access token");
      const profile = await responseJson<GoogleProfile>(await fetch(userInfoEndpoint, {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      }));
      const expectedDomain = cfg.hostedDomain.trim().toLowerCase();
      if (expectedDomain && String(profile.hd ?? "").toLowerCase() !== expectedDomain)
        throw Error("this Google account is outside the allowed Workspace domain");
      if (!profile.sub) throw Error("Google profile did not contain a stable subject");

      const identity: ExternalIdentity = {
        provider: providerId,
        subject: profile.sub,
        email: profile.email,
        emailVerified: profile.email_verified === true,
        usernameHint: profile.given_name || profile.name || profile.email?.split("@")[0],
        avatarUrl: profile.picture,
        profile: { name: profile.name, hd: profile.hd },
      };
      await auth.completeExternalLogin(session, identity, {
        returnTo: request.return_to ?? "/",
        responseMode: "redirect",
      });
    } catch (error) {
      failure(session, 400, error instanceof Error ? error.message : "Google login failed");
    }
  });

  ctx.setInterval(() => {
    void db.remove("auth_google_login_requests", { expires_at: { $lte: new Date().toISOString() } }).catch(() => undefined);
  }, 3600_000);
}
