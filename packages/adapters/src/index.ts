import { Context } from "yumeri";

export const depend = ["velocelab-core", "model"];
export const provide = ["adapters"];

export type Protocol = "openai" | "responses" | "openai-video" | "kling" | "midjourney" | "claude" | "gemini";
export type Endpoint = "chat" | "responses" | "claude_messages" | "gemini_generate" | "image_generation" | "image_edit" | "video_generation" | "video_status";

export interface AdapterRequest {
  protocol: Protocol;
  path?: string;
  headers: Record<string, string>;
}

export interface AdapterRegistry {
  names(): string[];
  protocolFor(channelType: string): Protocol;
  request(channelType: string, endpoint: Endpoint, model: string, apiKey: string): AdapterRequest;
  normalizeType(value: string): string;
}

declare module "yumeri" {
  interface Components { adapters: AdapterRegistry; }
}

const adapterTypes: Record<Protocol, string[]> = {
  openai: ["completion", "completions", "chat_completion", "chat_completions", "deepseek", "moonshot", "xai", "siliconflow", "mistral", "openrouter", "perplexity", "lingyiwanwu", "mokaai", "xinference", "submodel", "ollama", "baidu_v2", "minimax", "volcengine"],
  responses: ["responses"],
  "openai-video": ["openai_video", "seedream"],
  kling: ["kling"],
  midjourney: ["midjourney"],
  claude: ["claude", "anthropic"],
  gemini: ["gemini", "ali_dashscope", "zhipu_v4"],
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
      return { protocol, path: endpointPath(endpoint, model), headers: headers(apiKey, protocol) };
    },
    normalizeType,
  });
}
