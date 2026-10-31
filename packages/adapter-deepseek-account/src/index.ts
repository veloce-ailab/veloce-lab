import { createHash, randomBytes, randomUUID } from "node:crypto";
import { arch, platform, release } from "node:os";
import { Context, Session } from "yumeri";
import type { AdapterDefinition, AdapterInput, AdapterRegistry } from "@velocelab/adapters";
import { anthropicChatMessages } from "@velocelab/adapters";

export const depend = ["adapters"];
export const provide: string[] = [];

const authBase = "https://platform.deepseek.com/auth-api/v0/dsh";
const pending = new Map<string, { loginID: string; verifier: string; redirectUri: string; expiresAt: number; locale: "zh_CN" | "en_US"; timezoneOffset: string; token?: string; authorizedURL?: string; error?: string }>();
const deviceID = randomUUID();
// DeepSeek validates this against the calling application. Keep it aligned with
// the web application release instead of the adapter package version.
const clientVersion = "0.2.2-alpha.2";

const base64url = (value: Buffer) => value.toString("base64url");
const challenge = (verifier: string) => base64url(createHash("sha256").update(verifier).digest());
const json = async (response: Response) => {
  const body = await response.json().catch(() => ({})) as any;
  if (!response.ok) throw Error(String(body?.error?.message ?? body?.error ?? `DeepSeek returned HTTP ${response.status}`));
  if (body?.code !== 0 || body?.data?.biz_code !== 0) {
    throw Error(String(body?.data?.biz_msg || body?.msg || `DeepSeek rejected the request (code ${body?.code ?? "?"}, business code ${body?.data?.biz_code ?? "?"})`));
  }
  return body;
};
const clientHeaders = (locale = "zh_CN", timezoneOffset = String(-new Date().getTimezoneOffset() * 60)) => ({
  "Content-Type": "application/json",
  "x-client-platform": "web",
  "x-client-version": clientVersion,
  "x-client-locale": locale,
  "x-client-timezone-offset": timezoneOffset,
  "x-client-bundle-id": "",
});

function upstreamModelName(value: string) {
  const normalized = value.trim().toLowerCase();
  if (normalized.includes("flash")) return "deepseek-flash";
  if (normalized.includes("pro")) return "deepseek-v4-pro";
  return value;
}

function parseDSML(content: string) {
  const token = "(?:\\|DSML\\|>|｜DSML｜)";
  const marker = new RegExp(`<${token}function_calls[\\s\\S]*?<${token}/function_calls>`, "g");
  const calls: Array<{ id: string; name: string; arguments: string }> = [];
  const clean = content.replace(marker, (block) => {
    const invokePattern = new RegExp(`<${token}invoke\\b([^>]*)>([\\s\\S]*?)<${token}/invoke>`, "g");
    let invoke: RegExpExecArray | null;
    while ((invoke = invokePattern.exec(block)) !== null) {
      const name = /\bname\s*=\s*["']([^"']+)["']/.exec(invoke[1])?.[1]?.trim();
      if (!name) continue;
      const args: Record<string, unknown> = {};
      const parameterPattern = new RegExp(`<${token}parameter\\b([^>]*?)(?:\\/>|>([\\s\\S]*?)<${token}/parameter>)`, "g");
      let parameter: RegExpExecArray | null;
      while ((parameter = parameterPattern.exec(invoke[2])) !== null) {
        const key = /\bname\s*=\s*["']([^"']+)["']/.exec(parameter[1])?.[1];
        if (!key) continue;
        const raw = (parameter[2] ?? /\bvalue\s*=\s*["']([^"']*)["']/.exec(parameter[1])?.[1] ?? "").trim();
        try { args[key] = JSON.parse(raw); } catch { args[key] = raw; }
      }
      calls.push({ id: `dsml-${calls.length + 1}`, name, arguments: JSON.stringify(args) });
    }
    return "";
  }).trim();
  return { content: clean, calls };
}

function parseResponseContent(value: any) {
  const blocks = Array.isArray(value?.content) ? value.content : [];
  const nativeCalls = blocks.filter((part: any) => part?.type === "tool_use").map((part: any, index: number) => ({
    id: String(part.id || `tool-${index + 1}`),
    name: String(part.name || ""),
    arguments: JSON.stringify(part.input && typeof part.input === "object" ? part.input : {}),
  })).filter((call: any) => call.name);
  const text = blocks.filter((part: any) => part?.type === "text").map((part: any) => String(part.text || "")).join("");
  const parsed = parseDSML(typeof value?.content === "string" ? value.content : text);
  return { content: parsed.content, toolCalls: [...nativeCalls, ...parsed.calls] };
}

async function startLogin(session: Session) {
  const input = await session.parseRequestBody() as Record<string, unknown>;
  const redirectUri = String(input.redirect_uri || "http://127.0.0.1:3000/oauth/callback").trim();
  const locale: "zh_CN" | "en_US" = String(input.locale || "zh_CN") === "en_US" ? "en_US" : "zh_CN";
  const timezoneOffset = /^-?\d+$/.test(String(input.timezone_offset || "")) ? String(input.timezone_offset) : "0";
  const loginID = randomUUID();
  const verifier = base64url(randomBytes(32));
  const state = base64url(randomBytes(32));
  const login = { loginID, verifier, redirectUri, locale, timezoneOffset, expiresAt: Date.now() + 10 * 60_000 };
  pending.set(state, login);
  const response = await json(await fetch(`${authBase}/auth_init`, { method: "POST", headers: clientHeaders(locale, timezoneOffset), body: JSON.stringify({ code_challenge: challenge(verifier), code_challenge_method: "S256", state, redirect_uri: redirectUri, locale, login_source: "web" }) }));
  const data = response?.data?.biz_data;
  if (!data?.authorize_url) throw Error("DeepSeek did not return an authorization URL");
  pending.set(loginID, login);
  session.respond({ login_id: loginID, authorization_url: String(data.authorize_url) }, "json");
}

async function callback(session: Session, query: URLSearchParams) {
  const state = String(query.get("state") || "");
  const code = String(query.get("code") || "");
  const request = pending.get(state);
  if (!request || request.expiresAt < Date.now()) throw Error("DeepSeek login state is invalid or expired");
  if (!code) throw Error(String(query.get("error_description") || "DeepSeek authorization was cancelled"));
  const response = await json(await fetch(`${authBase}/auth_exchange`, { method: "POST", headers: clientHeaders(request.locale, request.timezoneOffset), body: JSON.stringify({ code, code_verifier: request.verifier, redirect_uri: request.redirectUri, device_id: deviceID, device_model: `${platform()}-${arch()}`, os_version: `${platform()} ${release()}` }) }));
  const token = String(response?.data?.biz_data?.token || "");
  if (!token) throw Error("DeepSeek did not return an account token");
  const authorizedURL = String(response?.data?.biz_data?.authorized_url || "");
  if (!authorizedURL) throw Error("DeepSeek did not return an authorization completion URL");
  const completion = new URL(authorizedURL);
  if (completion.origin !== new URL(authBase).origin || completion.pathname !== "/dsh/authorized") {
    throw Error("DeepSeek returned an invalid authorization completion URL");
  }
  completion.searchParams.set("login_source", "web");
  pending.set(request.loginID, { ...request, token, authorizedURL: completion.href });
  pending.delete(state);
  session.status = 302;
  session.head.Location = completion.href;
  session.respond("", "plain");
}

const adapter: AdapterDefinition = {
  types: ["deepseek_account", "deepseek-account"],
  configuration: { kind: "oauth_login", label: "登录 DeepSeek 账号", description: "使用 DeepSeek 平台网页登录并自动获取账号凭据。", startPath: "/adapter-deepseek-account/login/start", statusPath: "/adapter-deepseek-account/login/status" },
  build(input: AdapterInput) {
    return { urlPath: "/anthropic/v1/messages", headers: { "Content-Type": "application/json", Accept: input.stream ? "text/event-stream" : "application/json", "anthropic-version": "2023-06-01", ...(input.apiKey ? { "x-dsh-auth-token": input.apiKey } : {}) }, body: { model: upstreamModelName(input.model), max_tokens: input.maxTokens || 1024, messages: anthropicChatMessages(input.messages), ...(input.tools?.length ? { tools: input.tools.map((tool) => ({ name: tool.name, description: tool.description, input_schema: tool.parameters })) } : {}), ...(input.system ? { system: input.system } : {}), ...(input.temperature === undefined ? {} : { temperature: input.temperature }), ...(input.stream ? { stream: true } : {}) } };
  },
  parse(body: unknown) {
    const value = body as any;
    const parsed = parseResponseContent(value);
    return { content: parsed.content, toolCalls: parsed.toolCalls, inputTokens: Number(value?.usage?.input_tokens || 0), outputTokens: Number(value?.usage?.output_tokens || 0), finishReason: parsed.toolCalls.length ? "tool_use" : "stop" };
  },
  async stream(response, onDelta) {
    const text = await response.text();
    for (const line of text.split(/\r?\n/)) {
      if (!line.startsWith("data:")) continue;
      try { const value = JSON.parse(line.slice(5)); if (value.type === "content_block_delta" && typeof value.delta?.text === "string") onDelta(value.delta.text); } catch { /* Ignore keep-alive and malformed frames. */ }
    }
  },
};

export function apply(ctx: Context) {
  (ctx.component.adapters as AdapterRegistry).register(adapter);
  ctx.route("/api/adapter-deepseek-account/login/start").methods("POST").action(async (session) => { try { await startLogin(session); } catch (error) { session.status = 502; session.respond({ error: error instanceof Error ? error.message : String(error) }, "json"); } });
  const callbackAction = async (session: Session, query: URLSearchParams) => {
    try {
      await callback(session, query);
    } catch (error) {
      const state = String(query.get("state") || "");
      const request = pending.get(state);
      if (request) pending.set(request.loginID, { ...request, error: error instanceof Error ? error.message : String(error) });
      session.status = 400;
      session.respond("DeepSeek authorization failed. Return to the original page and retry.", "plain");
    }
  };
  ctx.route("/api/auth/callback/deepseek-account").methods("GET").action(callbackAction);
  ctx.route("/oauth/callback").methods("GET").action(callbackAction);
  ctx.route("/api/adapter-deepseek-account/login/status").methods("GET").action(async (session, query) => { const loginID = String(query.get("login_id") || ""); const item = pending.get(loginID); if (!item || item.expiresAt < Date.now()) { session.respond({ status: "failed", error: "Login request expired" }, "json"); return; } if (item.token) { pending.delete(loginID); session.respond({ status: "completed", token: item.token }, "json"); return; } session.respond({ status: item.error ? "failed" : "pending", error: item.error }, "json"); });
}
