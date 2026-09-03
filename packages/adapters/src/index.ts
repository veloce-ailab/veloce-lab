import { Context } from "yumeri";

export const depend = ["velocelab-core", "model"];
export const provide = ["adapters"];

export type Protocol = "openai" | "responses" | "openai-video" | "kling" | "midjourney" | "claude" | "gemini";
export type Endpoint = "chat" | "responses" | "claude_messages" | "gemini_generate" | "image_generation" | "image_edit" | "video_generation" | "video_status";

export interface AdapterRequest {
  protocol: Protocol;
  path?: string;
  headers: Record<string, string>;
  payload: (payload: Record<string, unknown>) => Record<string, unknown>;
}

export interface AdapterRegistry {
  names(): string[];
  protocolFor(channelType: string): Protocol;
  request(channelType: string, endpoint: Endpoint, model: string, apiKey: string): AdapterRequest;
  applyPayload(channelType: string, endpoint: Endpoint, payload: Record<string, unknown>): Record<string, unknown>;
  normalizeType(value: string): string;
}

declare module "yumeri" {
  interface Components { adapters: AdapterRegistry; }
}

const adapterTypes: Record<Protocol, string[]> = {
  openai: ["completion", "completions", "chat_completion", "chat_completions", "deepseek", "deep_seek", "moonshot", "kimi", "xai", "x_ai", "grok", "siliconflow", "silicon_flow", "mistral", "openrouter", "open_router", "perplexity", "lingyiwanwu", "lingyi", "01ai", "yi", "mokaai", "moka", "xinference", "submodel", "ollama", "baidu_v2", "qianfan", "qianfan_v2", "minimax", "hailuo", "volcengine", "volc", "doubao", "ark", "ali", "dashscope", "qwen", "aliyun", "zhipu", "zhipu_v4", "bigmodel", "glm", "seedream"],
  responses: ["responses", "response", "openai_responses"],
  "openai-video": ["openai_video", "video", "veo", "seedance"],
  kling: ["kling", "klingai", "kling_ai"],
  midjourney: ["midjourney", "mj"],
  claude: ["claude", "anthropic"],
  gemini: ["gemini", "google"],
};

function normalizeType(value: string) {
  return value.trim().toLowerCase().replaceAll(" ", "").replaceAll("-", "_");
}

function protocolFor(channelType: string): Protocol {
  const type = normalizeType(channelType);
  for (const [protocol, types] of Object.entries(adapterTypes) as [Protocol, string[]][]) {
    if (types.includes(type)) return protocol;
  }
  return "openai";
}

function endpointPath(endpoint: Endpoint, model: string) {
  switch (endpoint) {
    case "chat": return "/v1/chat/completions";
    case "responses": return "/v1/responses";
    case "claude_messages": return "/v1/messages";
    case "gemini_generate": {
      const name = model.trim().replace(/^models\//, "");
      return name ? `/v1beta/models/${encodeURIComponent(name)}:generateContent` : undefined;
    }
    case "image_generation": return "/v1/images/generations";
    case "image_edit": return "/v1/images/edits";
    case "video_generation": return "/v1/video/generations";
    case "video_status": return model.trim() ? `/v1/video/generations/${encodeURIComponent(model.trim())}` : undefined;
  }
}

function pathFor(type: string, endpoint: Endpoint, model: string) {
  const normalized = normalizeType(type);
  if (["ali", "dashscope", "qwen", "aliyun"].includes(normalized)) {
    if (endpoint === "chat") return "/compatible-mode/v1/chat/completions";
    if (endpoint === "responses") return "/api/v2/apps/protocols/compatible-mode/v1/responses";
    if (endpoint === "claude_messages") return "/apps/anthropic/v1/messages";
    if (endpoint === "image_generation") return "/api/v1/services/aigc/text2image/image-synthesis";
    if (endpoint === "image_edit") return "/api/v1/services/aigc/image2image/image-synthesis";
  }
  if (["zhipu", "zhipu_v4", "bigmodel", "glm"].includes(normalized)) {
    if (endpoint === "chat") return "/api/paas/v4/chat/completions";
    if (endpoint === "claude_messages") return "/api/anthropic/v1/messages";
    if (endpoint === "image_generation") return "/api/paas/v4/images/generations";
    if (["responses", "image_edit"].includes(endpoint)) return undefined;
  }
  if (["deepseek", "deep_seek", "moonshot", "kimi", "siliconflow", "silicon_flow"].includes(normalized) && endpoint === "responses") return undefined;
  if (["deepseek", "deep_seek", "moonshot", "kimi"].includes(normalized) && endpoint === "claude_messages") return "/anthropic/v1/messages";
  if (normalized === "minimax" && endpoint === "claude_messages") return "/v1/text/chatcompletion_v2";
  if (normalized.startsWith("kling") && endpoint === "video_generation") return "/v1/videos/image2video";
  if (normalized.startsWith("kling") && endpoint === "video_status") return `/v1/videos/image2video/${encodeURIComponent(model.trim())}`;
  if (["openrouter", "open_router", "perplexity", "lingyiwanwu", "lingyi", "01ai", "yi", "mokaai", "moka", "xinference", "submodel", "ollama", "mistral", "baidu_v2", "qianfan", "qianfan_v2", "minimax", "hailuo"].includes(normalized) && endpoint === "responses") return undefined;
  return endpointPath(endpoint, model);
}

function applyPayloadFor(type: string, endpoint: Endpoint, payload: Record<string, unknown>) {
  const normalized = normalizeType(type);
  if (["ali", "dashscope", "qwen", "aliyun"].includes(normalized)) {
    if (endpoint === "chat" && payload.stream === true) {
      payload.stream_options = { ...(payload.stream_options as object ?? {}), include_usage: true };
    }
    if (endpoint === "claude_messages" && !/(qwen|deepseek-v4|kimi|glm|minimax-m)/i.test(String(payload.model ?? ""))) delete payload.system;
  }
  if (["deepseek", "deep_seek"].includes(normalized)) {
    const model = String(payload.model ?? "");
    const match = model.match(/^(.*?)-(high|medium|low|thinking|reasoner)$/);
    if (match) { payload.model = match[1]; payload.thinking = { type: "enabled" }; payload.reasoning_effort = match[2] === "thinking" || match[2] === "reasoner" ? "medium" : match[2]; }
  }
  if (["moonshot", "kimi"].includes(normalized) && endpoint === "chat" && String(payload.model).trim().toLowerCase() === "kimi-k2.6") payload.temperature = 1;
  if (["zhipu", "zhipu_v4", "bigmodel", "glm"].includes(normalized) && endpoint === "chat" && Number(payload.top_p) >= 1) payload.top_p = 0.99;
  if (["xai", "x_ai", "grok"].includes(normalized)) {
    let model = String(payload.model ?? "");
    if (model.endsWith("-search")) { model = model.slice(0, -7); payload.search_parameters = { mode: "on" }; }
    const effort = model.match(/-(high|low)$/)?.[1];
    if (effort) { model = model.slice(0, -(effort.length + 1)); payload.reasoning_effort = effort; }
    if (model.startsWith("grok-3-mini") && payload.max_tokens !== undefined) { payload.max_completion_tokens = payload.max_tokens; delete payload.max_tokens; }
    payload.model = model;
    if (endpoint === "image_generation") { payload.response_format ??= "url"; payload.n ??= 1; }
  }
  if (["siliconflow", "silicon_flow"].includes(normalized) && endpoint === "image_generation") { if (payload.size !== undefined) { payload.image_size ??= payload.size; delete payload.size; } if (payload.n !== undefined) { payload.batch_size ??= payload.n; delete payload.n; } }
  return payload;
}

function headers(apiKey: string, protocol: Protocol): Record<string, string> {
  const result = { "Content-Type": "application/json", Accept: "application/json" };
  if (!apiKey.trim()) return result;
  if (protocol === "claude") return { ...result, "x-api-key": apiKey, Authorization: `Bearer ${apiKey}`, "anthropic-version": "2023-06-01" };
  if (protocol === "gemini") return { ...result, "x-goog-api-key": apiKey };
  return { ...result, Authorization: `Bearer ${apiKey}` };
}

export function apply(ctx: Context) {
  ctx.registerComponent("adapters", {
    names: () => Object.keys(adapterTypes),
    protocolFor,
    request(channelType, endpoint, model, apiKey) {
      const protocol = protocolFor(channelType);
      const payload = (value: Record<string, unknown>) => applyPayloadFor(channelType, endpoint, value);
      return { protocol, path: pathFor(channelType, endpoint, model), headers: headers(apiKey, protocol), payload };
    },
    applyPayload: applyPayloadFor,
    normalizeType,
  });
}
