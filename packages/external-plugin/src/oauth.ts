// MCP OAuth.
//
// A Codex plugin's app surface is a registration id, but the service behind it
// is a remote MCP server. Those servers use the MCP authorization spec: the
// server points at its protected-resource metadata, that names an authorization
// server, and the client registers itself dynamically and runs an authorization
// code flow with PKCE.
//
// Nothing here is specific to ChatGPT. The app id is deliberately not used: it
// is only meaningful to the client that registered it. What this needs is the
// MCP endpoint, which every app-backed plugin already ships in `.mcp.json`.
import { createHash, randomBytes } from "node:crypto";

const TIMEOUT_MS = 15_000;

export interface OAuthServer {
  url: string;
  oauth?: { resource?: string; scopes: string[] };
}

export interface OAuthDiscovery {
  resource: string;
  scopes: string[];
  issuer: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  registrationEndpoint: string;
  codeChallengeMethods: string[];
}

export interface OAuthClient {
  clientId: string;
  clientSecret: string;
  tokenEndpointAuthMethod: "none" | "client_secret_post" | "client_secret_basic";
}

export interface OAuthTokenSet {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  scope: string;
  expiresAt: string;
}

export interface OAuthChallenge {
  /** `resource_metadata="…"` from the 401. */
  resourceMetadata: string;
  /** `authorization_uri="…"`, which some servers send instead of an issuer. */
  authorizationUri: string;
  scope: string;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

async function fetchJson(url: string, init: RequestInit = {}): Promise<Record<string, unknown> | undefined> {
  try {
    const response = await fetch(url, {
      ...init,
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) return undefined;
    return record(await response.json());
  } catch {
    return undefined;
  }
}

/** Reads the Bearer challenge without consuming a body that may not exist. */
export function parseBearerChallenge(header: string): OAuthChallenge {
  const value = header || "";
  const parameter = (name: string) => {
    const match = new RegExp(`${name}\\s*=\\s*"([^"]*)"`, "i").exec(value)
      || new RegExp(`${name}\\s*=\\s*'([^']*)'`, "i").exec(value);
    return match?.[1]?.trim() || "";
  };
  return {
    resourceMetadata: parameter("resource_metadata"),
    authorizationUri: parameter("authorization_uri"),
    scope: parameter("scope"),
  };
}

/**
 * Sends one unauthenticated initialize. A 401 carries the resource metadata
 * URL the MCP spec requires; anything else means the server is not asking for
 * OAuth at the transport level.
 */
export async function probeOAuthChallenge(serverUrl: string): Promise<OAuthChallenge | undefined> {
  try {
    const response = await fetch(serverUrl, {
      method: "POST",
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        accept: "application/json, text/event-stream",
        "content-type": "application/json",
        "mcp-protocol-version": "2025-06-18",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo: { name: "veloce-lab", version: "1.0.0" },
        },
      }),
    });
    if (response.status !== 401) return undefined;
    return parseBearerChallenge(response.headers.get("www-authenticate") || "");
  } catch {
    return undefined;
  }
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function resourceMetadataCandidates(server: OAuthServer, challenge: OAuthChallenge): string[] {
  const urls: string[] = [];
  if (challenge.resourceMetadata) urls.push(challenge.resourceMetadata);
  const resources = unique([server.oauth?.resource || "", server.url]);
  for (const value of resources) {
    try {
      const resource = new URL(value);
      const path = resource.pathname.replace(/\/+$/, "");
      if (path) urls.push(new URL(`/.well-known/oauth-protected-resource${path}`, resource.origin).toString());
      urls.push(new URL("/.well-known/oauth-protected-resource", resource.origin).toString());
    } catch {
      // A malformed resource is simply not a candidate.
    }
  }
  return unique(urls);
}

function authorizationMetadataCandidates(issuer: string, challenge: OAuthChallenge): string[] {
  // Some servers (Figma) name their metadata document in the challenge instead
  // of deriving it from an issuer; try that first, then the usual locations.
  const urls: string[] = challenge.authorizationUri ? [challenge.authorizationUri] : [];
  try {
    const base = new URL(issuer);
    const path = base.pathname.replace(/\/+$/, "");
    if (path) {
      urls.push(new URL(`/.well-known/oauth-authorization-server${path}`, base.origin).toString());
      urls.push(new URL(`/.well-known/openid-configuration${path}`, base.origin).toString());
    }
    urls.push(new URL("/.well-known/oauth-authorization-server", base.origin).toString());
    urls.push(new URL("/.well-known/openid-configuration", base.origin).toString());
  } catch {
    // Nothing to try.
  }
  return unique(urls);
}

function parseScopes(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(stringValue).filter(Boolean);
  const text = stringValue(value);
  return text ? text.split(/[\s,]+/).filter(Boolean) : [];
}

/**
 * Reads the discovery chain for a remote MCP server:
 * protected resource -> authorization server -> endpoints.
 */
export async function discoverOAuth(server: OAuthServer): Promise<OAuthDiscovery> {
  const challenge = (await probeOAuthChallenge(server.url)) || {
    resourceMetadata: "",
    authorizationUri: "",
    scope: "",
  };

  let resourceDocument: Record<string, unknown> | undefined;
  for (const candidate of resourceMetadataCandidates(server, challenge)) {
    const document = await fetchJson(candidate);
    if (!document) continue;
    const servers = Array.isArray(document.authorization_servers)
      ? document.authorization_servers.map(stringValue).filter(Boolean)
      : [];
    if (servers.length === 0) continue;
    resourceDocument = document;
    break;
  }
  if (!resourceDocument) {
    throw Error(
      "This MCP server did not publish OAuth resource metadata. It may not support OAuth from this server; paste an access token instead.",
    );
  }

  const issuers = Array.isArray(resourceDocument.authorization_servers)
    ? resourceDocument.authorization_servers.map(stringValue).filter(Boolean)
    : [];
  let metadata: Record<string, unknown> | undefined;
  let issuer = "";
  for (const candidate of issuers) {
    for (const url of authorizationMetadataCandidates(candidate, challenge)) {
      const document = await fetchJson(url);
      if (!document || !stringValue(document.authorization_endpoint) || !stringValue(document.token_endpoint)) {
        continue;
      }
      metadata = document;
      issuer = stringValue(document.issuer) || candidate;
      break;
    }
    if (metadata) break;
  }
  if (!metadata) {
    throw Error("This MCP server's authorization server did not publish usable OAuth endpoints.");
  }

  const methods = Array.isArray(metadata.code_challenge_methods_supported)
    ? metadata.code_challenge_methods_supported.map(stringValue).filter(Boolean)
    : [];
  if (methods.length > 0 && !methods.includes("S256")) {
    throw Error("This MCP server's authorization server does not support PKCE S256.");
  }

  const resource = stringValue(resourceDocument.resource) || server.oauth?.resource || server.url;
  const resourceScopes = parseScopes(resourceDocument.scopes_supported);
  const scopes = resourceScopes.length
    ? resourceScopes
    : server.oauth?.scopes?.length
      ? server.oauth.scopes
      : parseScopes(challenge.scope);

  return {
    resource,
    scopes,
    issuer,
    authorizationEndpoint: stringValue(metadata.authorization_endpoint),
    tokenEndpoint: stringValue(metadata.token_endpoint),
    registrationEndpoint: stringValue(metadata.registration_endpoint),
    codeChallengeMethods: methods,
  };
}

/** Creates the client at the authorization server's registration endpoint. */
export async function registerOAuthClient(discovery: OAuthDiscovery, redirectUri: string): Promise<OAuthClient> {
  if (!discovery.registrationEndpoint) {
    throw Error(
      "This MCP server requires a pre-registered OAuth client and does not support automatic registration. Paste an access token instead.",
    );
  }
  const response = await fetch(discovery.registrationEndpoint, {
    method: "POST",
    redirect: "follow",
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      client_name: "Veloce Lab",
      redirect_uris: [redirectUri],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    }),
  });
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    const detail = stringValue(payload.error_description) || stringValue(payload.error);
    throw Error(`The MCP server refused to register an OAuth client${detail ? `: ${detail}` : ` (HTTP ${response.status})`}.`);
  }
  const clientId = stringValue(payload.client_id);
  if (!clientId) {
    throw Error("The MCP server's client registration returned no client id.");
  }
  const declared = stringValue(payload.token_endpoint_auth_method);
  const clientSecret = stringValue(payload.client_secret);
  const tokenEndpointAuthMethod: OAuthClient["tokenEndpointAuthMethod"] =
    declared === "client_secret_basic" || declared === "client_secret_post"
      ? declared
      : clientSecret
        ? "client_secret_post"
        : "none";
  return { clientId, clientSecret, tokenEndpointAuthMethod };
}

export function createPkce(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString("base64url");
  return {
    verifier,
    challenge: createHash("sha256").update(verifier).digest("base64url"),
  };
}

export function oauthAuthorizationUrl(
  discovery: OAuthDiscovery,
  client: OAuthClient,
  options: { redirectUri: string; state: string; challenge: string },
): string {
  const url = new URL(discovery.authorizationEndpoint);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", client.clientId);
  url.searchParams.set("redirect_uri", options.redirectUri);
  url.searchParams.set("code_challenge", options.challenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("state", options.state);
  if (discovery.scopes.length) url.searchParams.set("scope", discovery.scopes.join(" "));
  // RFC 8707: the token is for this exact resource, not every resource the
  // authorization server knows.
  if (discovery.resource) url.searchParams.set("resource", discovery.resource);
  return url.toString();
}

function tokenSet(payload: Record<string, unknown>, previousRefresh: string): OAuthTokenSet {
  const accessToken = stringValue(payload.access_token);
  if (!accessToken) {
    throw Error(stringValue(payload.error_description) || stringValue(payload.error) || "The token endpoint returned no access token.");
  }
  const expiresIn = Number(payload.expires_in);
  const expiresAt = Number.isFinite(expiresIn) && expiresIn > 0
    ? new Date(Date.now() + expiresIn * 1000).toISOString()
    : "";
  return {
    accessToken,
    refreshToken: stringValue(payload.refresh_token) || previousRefresh,
    tokenType: stringValue(payload.token_type) || "Bearer",
    scope: stringValue(payload.scope),
    expiresAt,
  };
}

function tokenRequest(
  tokenEndpoint: string,
  client: OAuthClient,
  parameters: Record<string, string>,
): Promise<Response> {
  const body = new URLSearchParams({ ...parameters, client_id: client.clientId });
  const headers: Record<string, string> = {
    "content-type": "application/x-www-form-urlencoded",
    accept: "application/json",
  };
  if (client.clientSecret && client.tokenEndpointAuthMethod === "client_secret_post") {
    body.set("client_secret", client.clientSecret);
  }
  if (client.clientSecret && client.tokenEndpointAuthMethod === "client_secret_basic") {
    headers.authorization = `Basic ${Buffer.from(`${client.clientId}:${client.clientSecret}`).toString("base64")}`;
    body.delete("client_id");
  }
  return fetch(tokenEndpoint, {
    method: "POST",
    redirect: "follow",
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers,
    body: body.toString(),
  });
}

export async function exchangeOAuthCode(
  discovery: OAuthDiscovery,
  client: OAuthClient,
  options: { code: string; codeVerifier: string; redirectUri: string },
): Promise<OAuthTokenSet> {
  const response = await tokenRequest(discovery.tokenEndpoint, client, {
    grant_type: "authorization_code",
    code: options.code,
    redirect_uri: options.redirectUri,
    code_verifier: options.codeVerifier,
    ...(discovery.resource ? { resource: discovery.resource } : {}),
  });
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    throw Error(
      stringValue(payload.error_description) || stringValue(payload.error) || `The token endpoint returned HTTP ${response.status}.`,
    );
  }
  return tokenSet(payload, "");
}

export async function refreshOAuthToken(
  options: {
    tokenEndpoint: string;
    clientId: string;
    clientSecret: string;
    tokenEndpointAuthMethod: OAuthClient["tokenEndpointAuthMethod"];
    refreshToken: string;
    resource: string;
  },
): Promise<OAuthTokenSet> {
  const response = await tokenRequest(
    options.tokenEndpoint,
    {
      clientId: options.clientId,
      clientSecret: options.clientSecret,
      tokenEndpointAuthMethod: options.tokenEndpointAuthMethod,
    },
    {
      grant_type: "refresh_token",
      refresh_token: options.refreshToken,
      ...(options.resource ? { resource: options.resource } : {}),
    },
  );
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    throw Error(
      stringValue(payload.error_description) || stringValue(payload.error) || `The token endpoint returned HTTP ${response.status}.`,
    );
  }
  return tokenSet(payload, options.refreshToken);
}

export function oauthRedirectUri(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/api/user/external-plugin/oauth/callback`;
}
