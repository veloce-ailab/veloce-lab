import { Context, Schema, Session } from "yumeri";
import { createHash, randomBytes } from "node:crypto";
import { sanitizeNext } from "@velocelab/auth";
import type { AuthProvider, ExternalIdentity } from "@velocelab/auth";
import "@velocelab/auth";
import "@velocelab/database-core";

export const depend = ["auth", "database"];
export const provide = ["auth-oidc"];

const stateLifetimeMilliseconds = 10 * 60_000;

export interface OIDCProviderConfig {
  id: string;
  name: string;
  icon: string;
  issuer: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  allowRegistration: boolean;
  scopes: string[];
}

export interface OIDCConfig { providers: OIDCProviderConfig[]; }

const providerSchema: Schema<OIDCProviderConfig> = Schema.object({
  id: Schema.string("唯一 Provider ID，例如 keycloak").required(),
  name: Schema.string("登录页显示名称").required(),
  icon: Schema.string("可选图标 URL"),
  issuer: Schema.string("OIDC Issuer URL").required(),
  clientId: Schema.string("OIDC Client ID").required(),
  clientSecret: Schema.string("OIDC Client Secret").required(),
  redirectUri: Schema.string("OIDC 已授权回调 URL").required(),
  allowRegistration: Schema.boolean("允许首次 OIDC 登录时注册").default(true),
  scopes: Schema.array(Schema.string(), "授权 scopes").default(["openid", "email", "profile"]),
});
export const config: Schema<OIDCConfig> = Schema.object({
  providers: Schema.array(providerSchema, "OIDC Providers").default([]),
});

interface OIDCLoginRequest {
  state: string;
  provider_id: string;
  code_verifier: string;
  return_to?: string | null;
  expires_at: string;
  created_at: string;
}
interface Discovery { issuer?: string; authorization_endpoint?: string; token_endpoint?: string; userinfo_endpoint?: string; }
interface TokenResponse { access_token?: string; token_type?: string; }
interface UserInfo { sub?: string; email?: string; email_verified?: boolean; preferred_username?: string; name?: string; picture?: string; }

declare module "@yumerijs/types" {
  interface Tables { auth_oidc_login_requests: OIDCLoginRequest; }
}

function validId(value: string) { return /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(value); }
function usable(provider: OIDCProviderConfig) {
  return Boolean(validId(provider.id) && provider.name.trim() && provider.issuer.trim() && provider.clientId.trim() && provider.clientSecret.trim() && provider.redirectUri.trim());
}
function issuerUrl(value: string) { return value.trim().replace(/\/+$/, ""); }
function pkceChallenge(verifier: string) { return createHash("sha256").update(verifier).digest("base64url"); }
function fail(session: Session, status: number, message: string) { session.status = status; session.respond({ error: message }, "json"); }
async function json<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = payload as { error?: string; error_description?: string };
    throw Error(detail.error_description || detail.error || `OIDC provider returned HTTP ${response.status}`);
  }
  return payload as T;
}

export async function apply(ctx: Context, cfg: OIDCConfig) {
  const db = ctx.component.database;
  const auth = ctx.component.auth;
  const providers = new Map<string, OIDCProviderConfig>();
  for (const entry of cfg.providers ?? []) {
    const provider = { ...entry, id: String(entry?.id ?? "").trim() };
    if (!validId(provider.id)) throw Error("each OIDC provider id must use letters, numbers, underscores, or hyphens");
    if (providers.has(provider.id)) throw Error(`duplicate OIDC provider id: ${provider.id}`);
    providers.set(provider.id, provider);
  }
  await db.extend("auth_oidc_login_requests", {
    state: { type: "string", nullable: false },
    provider_id: { type: "string", nullable: false },
    code_verifier: { type: "string", nullable: false },
    return_to: "string",
    expires_at: { type: "string", nullable: false },
    created_at: "timestamp",
  }, { unique: ["state"] });

  const discover = async (provider: OIDCProviderConfig): Promise<Required<Discovery>> => {
    const expectedIssuer = issuerUrl(provider.issuer);
    const discovery = await json<Discovery>(await fetch(`${expectedIssuer}/.well-known/openid-configuration`));
    if (issuerUrl(String(discovery.issuer ?? "")) !== expectedIssuer) throw Error("OIDC discovery issuer does not match configured issuer");
    if (!discovery.authorization_endpoint || !discovery.token_endpoint || !discovery.userinfo_endpoint) throw Error("OIDC discovery is missing a required endpoint");
    return discovery as Required<Discovery>;
  };

  for (const provider of providers.values()) {
    const descriptor: AuthProvider = {
      id: provider.id,
      displayName: provider.name.trim(),
      ...(provider.icon.trim() ? { icon: provider.icon.trim() } : {}),
      available: () => usable(provider),
      registrationEnabled: () => provider.allowRegistration === true,
    };
    ctx.affect(auth.registerProvider(descriptor));

    ctx.route(`/api/auth/provider/${provider.id}`).methods("GET").action(async (session: Session, query: URLSearchParams) => {
      try {
        if (!usable(provider)) throw Error("this OIDC provider is not configured");
        const discovery = await discover(provider);
        const state = randomBytes(32).toString("base64url");
        const verifier = randomBytes(32).toString("base64url");
        const now = new Date();
        await db.create("auth_oidc_login_requests", {
          state,
          provider_id: provider.id,
          code_verifier: verifier,
          return_to: sanitizeNext(query.get("next")) || "/",
          expires_at: new Date(now.getTime() + stateLifetimeMilliseconds).toISOString(),
          created_at: now.toISOString(),
        });
        const authorization = new URL(discovery.authorization_endpoint);
        authorization.searchParams.set("client_id", provider.clientId.trim());
        authorization.searchParams.set("redirect_uri", provider.redirectUri.trim());
        authorization.searchParams.set("response_type", "code");
        authorization.searchParams.set("scope", [...new Set(["openid", ...(provider.scopes ?? []).map(String).filter(Boolean)])].join(" "));
        authorization.searchParams.set("state", state);
        authorization.searchParams.set("code_challenge", pkceChallenge(verifier));
        authorization.searchParams.set("code_challenge_method", "S256");
        session.status = 302;
        session.head.Location = authorization.toString();
        session.respond("", "plain");
      } catch (error) { fail(session, 503, error instanceof Error ? error.message : "OIDC login could not start"); }
    });

    ctx.route(`/api/auth/callback/${provider.id}`).methods("GET").action(async (session: Session, query: URLSearchParams) => {
      try {
        const state = String(query.get("state") ?? "");
        const code = String(query.get("code") ?? "");
        const upstreamError = String(query.get("error") ?? "");
        if (upstreamError) throw Error(`OIDC login was cancelled or denied: ${upstreamError}`);
        if (!state || !code) throw Error("OIDC callback is missing state or code");
        const request = await db.selectOne("auth_oidc_login_requests", { state, provider_id: provider.id }) as OIDCLoginRequest | undefined;
        await db.remove("auth_oidc_login_requests", { state, provider_id: provider.id });
        if (!request || new Date(request.expires_at).getTime() <= Date.now()) throw Error("OIDC login state is invalid or expired");
        if (!usable(provider)) throw Error("this OIDC provider is not configured");
        const discovery = await discover(provider);
        const form = new URLSearchParams({ code, client_id: provider.clientId.trim(), client_secret: provider.clientSecret.trim(), redirect_uri: provider.redirectUri.trim(), grant_type: "authorization_code", code_verifier: request.code_verifier });
        const token = await json<TokenResponse>(await fetch(discovery.token_endpoint, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: form }));
        if (!token.access_token || token.token_type?.toLowerCase() !== "bearer") throw Error("OIDC provider did not return a usable access token");
        const profile = await json<UserInfo>(await fetch(discovery.userinfo_endpoint, { headers: { Authorization: `Bearer ${token.access_token}` } }));
        if (!profile.sub) throw Error("OIDC user-info response did not contain a stable subject");
        const identity: ExternalIdentity = {
          provider: provider.id,
          subject: profile.sub,
          email: profile.email,
          emailVerified: profile.email_verified === true,
          usernameHint: profile.preferred_username || profile.name || profile.email?.split("@")[0],
          avatarUrl: profile.picture,
          profile: { name: profile.name },
        };
        await auth.completeExternalLogin(session, identity, { returnTo: request.return_to ?? "/", responseMode: "redirect" });
      } catch (error) { fail(session, 400, error instanceof Error ? error.message : "OIDC login failed"); }
    });
  }

  ctx.setInterval(() => { void db.remove("auth_oidc_login_requests", { expires_at: { $lte: new Date().toISOString() } }).catch(() => undefined); }, 3600_000);
}
