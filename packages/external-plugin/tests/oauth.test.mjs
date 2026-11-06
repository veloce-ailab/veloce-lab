import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import {
  createPkce,
  discoverOAuth,
  exchangeOAuthCode,
  oauthAuthorizationUrl,
  oauthRedirectUri,
  parseBearerChallenge,
  refreshOAuthToken,
  registerOAuthClient,
} from "../dist/oauth.js";

/**
 * A minimal authorization server that speaks the MCP discovery chain, dynamic
 * client registration, PKCE code exchange and refresh. It records what it was
 * asked so the test can assert the client sent the right values.
 */
async function startProvider() {
  const calls = [];
  let origin = "";
  let authorizationCode = "code-1";
  const server = createServer(async (request, response) => {
    const url = new URL(request.url || "/", origin || "http://127.0.0.1");
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = Buffer.concat(chunks).toString("utf8");
    const reply = (status, payload) => {
      response.writeHead(status, { "content-type": "application/json" });
      response.end(JSON.stringify(payload));
    };

    if (url.pathname === "/mcp" && request.method === "POST") {
      response.writeHead(401, {
        "content-type": "application/json",
        "www-authenticate": `Bearer realm="OAuth", resource_metadata="${origin}/.well-known/oauth-protected-resource/mcp", scope="read write"`,
      });
      response.end("{}");
      return;
    }
    if (url.pathname === "/.well-known/oauth-protected-resource/mcp") {
      reply(200, {
        resource: `${origin}/mcp`,
        authorization_servers: [origin],
        scopes_supported: ["read", "write"],
      });
      return;
    }
    if (url.pathname === "/.well-known/oauth-authorization-server") {
      reply(200, {
        issuer: origin,
        authorization_endpoint: `${origin}/authorize`,
        token_endpoint: `${origin}/token`,
        registration_endpoint: `${origin}/register`,
        code_challenge_methods_supported: ["S256"],
      });
      return;
    }
    if (url.pathname === "/register" && request.method === "POST") {
      calls.push({ kind: "register", body: JSON.parse(body || "{}") });
      reply(201, { client_id: "client-1", token_endpoint_auth_method: "none" });
      return;
    }
    if (url.pathname === "/token" && request.method === "POST") {
      const form = new URLSearchParams(body);
      calls.push({ kind: "token", form: Object.fromEntries(form) });
      if (form.get("grant_type") === "authorization_code") {
        if (form.get("code") !== authorizationCode) return reply(400, { error: "invalid_grant" });
        if (!form.get("code_verifier")) return reply(400, { error: "invalid_request", error_description: "PKCE verifier missing" });
        return reply(200, {
          access_token: "access-1",
          refresh_token: "refresh-1",
          token_type: "Bearer",
          scope: "read write",
          expires_in: 3600,
        });
      }
      if (form.get("grant_type") === "refresh_token") {
        if (form.get("refresh_token") !== "refresh-1") return reply(400, { error: "invalid_grant" });
        return reply(200, {
          access_token: "access-2",
          token_type: "Bearer",
          scope: "read write",
          expires_in: 3600,
        });
      }
      return reply(400, { error: "unsupported_grant_type" });
    }
    response.writeHead(404, { "content-type": "application/json" });
    response.end("{}");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  origin = `http://127.0.0.1:${address.port}`;
  return { server, origin, calls, setCode: (value) => { authorizationCode = value; } };
}

test("reads the OAuth challenge parameters", () => {
  const challenge = parseBearerChallenge(
    'Bearer realm="OAuth", resource_metadata="https://x.test/.well-known/oauth-protected-resource/mcp", scope="read write"',
  );
  assert.equal(challenge.resourceMetadata, "https://x.test/.well-known/oauth-protected-resource/mcp");
  assert.equal(challenge.scope, "read write");
  assert.equal(challenge.authorizationUri, "");
});

test("discovers a provider, registers a client and finishes the code flow", async () => {
  const provider = await startProvider();
  try {
    const discovery = await discoverOAuth({
      url: `${provider.origin}/mcp`,
      oauth: { resource: `${provider.origin}/mcp`, scopes: [] },
    });
    assert.equal(discovery.authorizationEndpoint, `${provider.origin}/authorize`);
    assert.equal(discovery.tokenEndpoint, `${provider.origin}/token`);
    assert.equal(discovery.registrationEndpoint, `${provider.origin}/register`);
    assert.deepEqual(discovery.scopes, ["read", "write"]);

    const redirectUri = oauthRedirectUri("https://veloce.test");
    assert.equal(redirectUri, "https://veloce.test/api/user/external-plugin/oauth/callback");
    const client = await registerOAuthClient(discovery, redirectUri);
    assert.equal(client.clientId, "client-1");
    assert.equal(client.tokenEndpointAuthMethod, "none");

    const pkce = createPkce();
    const authorizationUrl = new URL(
      oauthAuthorizationUrl(discovery, client, { redirectUri, state: "state-1", challenge: pkce.challenge }),
    );
    assert.equal(authorizationUrl.searchParams.get("response_type"), "code");
    assert.equal(authorizationUrl.searchParams.get("client_id"), "client-1");
    assert.equal(authorizationUrl.searchParams.get("redirect_uri"), redirectUri);
    assert.equal(authorizationUrl.searchParams.get("code_challenge_method"), "S256");
    assert.equal(authorizationUrl.searchParams.get("state"), "state-1");
    assert.equal(authorizationUrl.searchParams.get("resource"), `${provider.origin}/mcp`);
    assert.equal(authorizationUrl.searchParams.get("scope"), "read write");

    const tokens = await exchangeOAuthCode(discovery, client, {
      code: "code-1",
      codeVerifier: pkce.verifier,
      redirectUri,
    });
    assert.equal(tokens.accessToken, "access-1");
    assert.equal(tokens.refreshToken, "refresh-1");
    assert.ok(tokens.expiresAt);

    const refreshed = await refreshOAuthToken({
      tokenEndpoint: discovery.tokenEndpoint,
      clientId: client.clientId,
      clientSecret: client.clientSecret,
      tokenEndpointAuthMethod: client.tokenEndpointAuthMethod,
      refreshToken: tokens.refreshToken,
      resource: discovery.resource,
    });
    assert.equal(refreshed.accessToken, "access-2");
    assert.equal(refreshed.refreshToken, "refresh-1");

    const registration = provider.calls.find((call) => call.kind === "register");
    assert.deepEqual(registration.body.redirect_uris, [redirectUri]);
    const exchanges = provider.calls.filter((call) => call.kind === "token");
    assert.equal(exchanges.length, 2);
    assert.equal(exchanges[0].form.code_verifier, pkce.verifier);
    assert.equal(exchanges[0].form.resource, `${provider.origin}/mcp`);
    assert.equal(exchanges[1].form.refresh_token, "refresh-1");
  } finally {
    await new Promise((resolve) => provider.server.close(resolve));
  }
});

test("refuses a malformed code exchange", async () => {
  const provider = await startProvider();
  try {
    const discovery = await discoverOAuth({ url: `${provider.origin}/mcp` });
    const client = { clientId: "client-1", clientSecret: "", tokenEndpointAuthMethod: "none" };
    await assert.rejects(
      exchangeOAuthCode(discovery, client, {
        code: "wrong",
        codeVerifier: "verifier",
        redirectUri: "https://veloce.test/callback",
      }),
      /invalid_grant/,
    );
  } finally {
    await new Promise((resolve) => provider.server.close(resolve));
  }
});

test("reports when a server publishes no OAuth metadata", async () => {
  const provider = await startProvider();
  try {
    await assert.rejects(
      discoverOAuth({ url: `${provider.origin}/nothing-here` }),
      /did not publish OAuth resource metadata/,
    );
  } finally {
    await new Promise((resolve) => provider.server.close(resolve));
  }
});
