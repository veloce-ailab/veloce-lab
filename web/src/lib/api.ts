import axios from 'axios';
import type { AxiosAdapter, AxiosRequestConfig, AxiosResponse } from 'axios';

export const desktopServerStorageKey = "veloce.desktop.server_url";
export const defaultDesktopServerURL = "http://localhost:8080";
const desktopServerTokenPrefix = "veloce.desktop.server_token.";
const desktopTabServerPrefix = "veloce.desktop.tab_server.";

export const isDesktopTarget = () => import.meta.env.VITE_APP_TARGET === "desktop";
export const isDemoMode = () => import.meta.env.VITE_APP_MODE === "demo";

const configuredBackendURL = () => (import.meta.env.VITE_BACKEND_URL || "").trim().replace(/\/+$/, "");

export const getDesktopTabID = () => {
  if (typeof window === "undefined") {
    return "";
  }
  const value = new URLSearchParams(window.location.search).get("desktop_tab_id") || "";
  return /^[a-zA-Z0-9_-]{1,80}$/.test(value) ? value : "";
};

const desktopTabServerStorageKey = (tabID = getDesktopTabID()) => {
  return tabID ? `${desktopTabServerPrefix}${tabID}` : desktopServerStorageKey;
};

export const normalizeServerURL = (value: string | null | undefined) => {
  const trimmed = (value || "").trim();
  if (!trimmed) {
    return defaultDesktopServerURL;
  }
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return defaultDesktopServerURL;
    }
    return url.toString().replace(/\/+$/, "");
  } catch {
    return defaultDesktopServerURL;
  }
};

export const getDesktopServerURL = (tabID = getDesktopTabID()) => {
  if (typeof window === "undefined") {
    return defaultDesktopServerURL;
  }
  return normalizeServerURL(localStorage.getItem(desktopTabServerStorageKey(tabID)) || localStorage.getItem(desktopServerStorageKey));
};

export const desktopServerTokenKey = (serverURL = getDesktopServerURL()) => {
  return `${desktopServerTokenPrefix}${encodeURIComponent(normalizeServerURL(serverURL))}`;
};

export const getAuthToken = () => {
  if (typeof window === "undefined") {
    return "";
  }
  if (!isDesktopTarget()) {
    return localStorage.getItem("token") || "";
  }
  return localStorage.getItem(desktopServerTokenKey()) || localStorage.getItem("token") || "";
};

export const setAuthToken = (token: string) => {
  if (typeof window === "undefined") {
    return;
  }
  localStorage.setItem("token", token);
  if (isDesktopTarget()) {
    localStorage.setItem(desktopServerTokenKey(), token);
  }
};

export const clearAuthToken = () => {
  if (typeof window === "undefined") {
    return;
  }
  localStorage.removeItem("token");
  if (isDesktopTarget()) {
    localStorage.removeItem(desktopServerTokenKey());
  }
};

export const handleUnauthorized = () => {
  if (typeof window === "undefined") {
    return;
  }
  clearAuthToken();
  if (isDesktopTarget()) {
    if (window.location.hash !== "#/login") {
      window.location.hash = "#/login";
    }
    return;
  }
  if (window.location.pathname !== "/login") {
    window.location.assign("/login");
  }
};

export const setDesktopServerURL = (serverURL: string, tabID = getDesktopTabID()) => {
  if (typeof window === "undefined") {
    return defaultDesktopServerURL;
  }
  const currentToken = localStorage.getItem("token");
  if (currentToken) {
    localStorage.setItem(desktopServerTokenKey(), currentToken);
  }
  const nextURL = normalizeServerURL(serverURL);
  localStorage.setItem(desktopTabServerStorageKey(tabID), nextURL);
  if (!tabID) {
    localStorage.setItem(desktopServerStorageKey, nextURL);
  }
  const nextToken = localStorage.getItem(desktopServerTokenKey(nextURL));
  if (nextToken) {
    localStorage.setItem("token", nextToken);
  } else {
    localStorage.removeItem("token");
  }
  return nextURL;
};

export const setDesktopTabServerURL = (tabID: string, serverURL: string) => {
  if (typeof window === "undefined" || !tabID) {
    return normalizeServerURL(serverURL);
  }
  const nextURL = normalizeServerURL(serverURL);
  localStorage.setItem(desktopTabServerStorageKey(tabID), nextURL);
  return nextURL;
};

export const apiURL = (pathOrURL: string) => {
  if (/^https?:\/\//i.test(pathOrURL)) {
    return pathOrURL;
  }
  const normalizedPath = pathOrURL.startsWith("/") ? pathOrURL : `/${pathOrURL}`;
  if (isDesktopTarget()) {
    return `${getDesktopServerURL()}${normalizedPath}`;
  }
  const backendURL = configuredBackendURL();
  return backendURL ? `${backendURL}${normalizedPath}` : pathOrURL;
};

const apiBaseURL = () => apiURL("/api");

const api = axios.create({
  baseURL: apiBaseURL(),
});

const demoNow = new Date().toISOString();
let demoSessions = [
  {
    id: "demo-assistant-session",
    title: "产品方案整理",
    run_mode: "assistant",
    model_name: "gpt-5.4",
    user_channel_id: 1,
    agent_id: "default",
    skill_ids: [],
    mcp_server_ids: [],
    knowledge_base_ids: [],
    connector_device_id: "demo-device",
    connector_workspace_path: "/workspace/veloce-demo",
    connector_auto_approve: false,
    connector_approval_mode: "manual",
    connector_command_prefixes: [],
    auto_compress_context: true,
    disabled_tool_groups: [],
    created_at: demoNow,
    updated_at: demoNow,
    messages: [
      { id: "demo-user-message", role: "user", content: "请整理一份产品方案并生成 Markdown 文件。", created_at: demoNow },
      {
        id: "demo-assistant-message",
        role: "assistant",
        content: "方案已经整理完成，文件已登记到右侧文件列表。",
        created_at: demoNow,
        tool_calls: [{
          id: "demo-file-tool",
          round: 1,
          name: "report_generated_file",
          server: "assistant",
          tool: "report_generated_file",
          status: "ok",
          arguments: { path: "/workspace/veloce-demo/product-plan.md", name: "产品方案.md", description: "包含目标、范围和实施阶段的产品方案。" },
          result: JSON.stringify({ path: "/workspace/veloce-demo/product-plan.md", registered: true }),
        }],
      },
    ],
  },
  {
    id: "demo-chat-session",
    title: "普通聊天示例",
    run_mode: "chat",
    model_name: "gpt-5.4-mini",
    user_channel_id: 1,
    agent_id: "default",
    skill_ids: [], mcp_server_ids: [], knowledge_base_ids: [], connector_command_prefixes: [],
    connector_auto_approve: false, connector_approval_mode: "manual", auto_compress_context: true, disabled_tool_groups: [],
    created_at: demoNow, updated_at: demoNow,
    messages: [{ id: "demo-chat-message", role: "assistant", content: "这是不暴露任何工具的普通聊天模式。", created_at: demoNow }],
  },
];

function demoResponse(config: AxiosRequestConfig, data: unknown, status = 200): AxiosResponse {
  return { data, status, statusText: status === 200 ? "OK" : "Accepted", headers: {}, config: config as AxiosResponse["config"] };
}

function demoPayload(config: AxiosRequestConfig): Record<string, unknown> {
  if (typeof config.data === "string") {
    try { return JSON.parse(config.data); } catch { return {}; }
  }
  return config.data && typeof config.data === "object" ? config.data as Record<string, unknown> : {};
}

const demoAdapter: AxiosAdapter = async (config) => {
  const method = (config.method || "get").toLowerCase();
  const path = (config.url || "").replace(/^\/api/, "").split("?")[0];
  if (path === "/setup/status") return demoResponse(config, { required: false });
  if (path === "/public/settings") return demoResponse(config, { site_name: "Veloce Demo", system_mode: "personal", password_login_enabled: true, password_registration_enabled: false, assistant_mode_enabled: true, file_storage_enabled: true, community_enabled: true, message_channel_enabled: true });
  if (path === "/user/me") return demoResponse(config, { id: 1, username: "demo", email: "demo@veloce.local", is_admin: true });
  if (path === "/user/catalog") return demoResponse(config, [{ id: 1, name: "演示上游渠道", models: ["gpt-5.4", "gpt-5.4-mini", "claude-sonnet-4-6"] }]);
  if (path === "/user/advanced-chat/settings") return demoResponse(config, { file_storage_enabled: true, assistant_mode_enabled: true, assistant_mcp_tools_enabled: true, assistant_connector_list_files_enabled: true, assistant_connector_read_file_enabled: true, assistant_connector_write_file_enabled: true, assistant_connector_replace_text_enabled: true, assistant_connector_run_command_enabled: true, assistant_connector_web_search_enabled: true, assistant_connector_static_site_enabled: true, mcp_servers: [], builtin_mcp_servers: [], custom_mcp_servers: [] });
  if (path === "/user/advanced-chat/sessions" && method === "get") return demoResponse(config, demoSessions);
  if (path === "/user/advanced-chat/sessions/folders") return demoResponse(config, []);
  if (path === "/user/advanced-chat/agents") return demoResponse(config, [{ id: "default", name: "默认助理", prompt: "", default_model: "gpt-5.4", stream: true, knowledge_base_ids: [], created_at: demoNow, updated_at: demoNow }]);
  if (path === "/user/advanced-chat/devices") return demoResponse(config, [{ id: "demo-device", name: "Demo Workspace", hostname: "demo-runner", os: "linux", arch: "amd64", kind: "cli", status: "online", online: true, last_seen_at: demoNow }]);
  if (path === "/user/advanced-chat/files") return demoResponse(config, { files: [{ id: "demo-library-file", name: "requirements.md", type: "text/markdown", size: 2480, source: "upload", text_available: true, created_at: demoNow, updated_at: demoNow }], used_bytes: 2480, total_bytes: 0, remaining_bytes: 0 });
  if (path === "/user/advanced-chat/knowledge-bases") return demoResponse(config, { knowledge_bases: [{ id: "demo-kb", name: "产品资料", description: "演示知识库", vectorized: true }] });
  if (["/user/advanced-chat/skills", "/user/advanced-chat/agent-groups", "/user/advanced-chat/cloud-sandboxes"].includes(path)) return demoResponse(config, []);
  if (path === "/user/advanced-chat/completions" && method === "post") {
    const payload = demoPayload(config);
    const sessionID = String(payload.session_id || "demo-assistant-session");
    const session = demoSessions.find((item) => item.id === sessionID) || demoSessions[0];
    return demoResponse(config, { session, run: { id: `demo-run-${Date.now()}`, session_id: session.id, mode: payload.mode || "assistant", status: "completed", created_at: demoNow, finished_at: demoNow } }, 202);
  }
  const sessionMatch = path.match(/^\/user\/advanced-chat\/sessions\/([^/]+)$/);
  if (sessionMatch && method === "put") {
    const payload = demoPayload(config);
    demoSessions = demoSessions.map((item) => item.id === sessionMatch[1] ? { ...item, ...payload, updated_at: new Date().toISOString() } : item);
    return demoResponse(config, demoSessions.find((item) => item.id === sessionMatch[1]) || {});
  }
  if (sessionMatch && method === "delete") {
    demoSessions = demoSessions.filter((item) => item.id !== sessionMatch[1]);
    return demoResponse(config, { success: true });
  }
  if (method === "get") return demoResponse(config, []);
  return demoResponse(config, { success: true, id: `demo-${Date.now()}` });
};

if (isDemoMode() && typeof window !== "undefined") {
  localStorage.setItem("token", "veloce-demo-token");
  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (!url.includes("/api/") && !url.includes("/auth/")) return nativeFetch(input, init);
    if (url.includes("/advanced-chat/completions")) {
      const message = "这是 Demo 模式的模拟回复。普通聊天模式不会调用任何工具。";
      const stream = `event: text\ndata: ${JSON.stringify({ delta: message, round: 1 })}\n\nevent: done\ndata: ${JSON.stringify({ message: { role: "assistant", content: message, content_parts: [{ round: 1, content: message }] }, tool_call_details: [] })}\n\n`;
      return new Response(stream, { status: 200, headers: { "Content-Type": "text/event-stream" } });
    }
    if (url.includes("/auth/")) return new Response(JSON.stringify({ token: "veloce-demo-token", success: true }), { status: 200, headers: { "Content-Type": "application/json" } });
    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
}

if (isDemoMode()) {
  api.defaults.adapter = demoAdapter;
}

export const getAuthLoginURL = (referralCode?: string | null, agreementAccepted = false) => {
  return getOAuthLoginURL("/auth/login", referralCode, agreementAccepted);
};

export const getOAuthLoginURL = (loginURL: string, referralCode?: string | null, agreementAccepted = false) => {
  const code = (referralCode || localStorage.getItem("referral_code") || "").trim();
  const params = new URLSearchParams();
  if (code) {
    params.set("ref", code);
  }
  if (agreementAccepted) {
    params.set("agreement_accepted", "true");
  }
  const query = params.toString();
  const nextLoginURL = query ? `${loginURL}${loginURL.includes("?") ? "&" : "?"}${query}` : loginURL;
  return apiURL(nextLoginURL);
};

// Add a request interceptor to include the JWT token
api.interceptors.request.use((config) => {
  config.baseURL = apiBaseURL();
  const token = getAuthToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401) {
      handleUnauthorized();
    }
    return Promise.reject(error);
  }
);

export default api;
