import { Context } from "yumeri";

export const depend: string[] = [];
export const provide = ["adapters"];

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | Array<Record<string, unknown>>;
  toolCalls?: Array<{
    id: string;
    name: string;
    arguments: string;
    result?: string;
    error?: string;
    status?: string;
  }>;
  toolCallId?: string;
  name?: string;
}

export interface ChatTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

/**
 * What the image studio collects from its form, in provider-neutral names.
 *
 * Adapters translate these to their own field names: OpenAI's image endpoint
 * wants `size`/`quality`/`style`, DashScope wants `input.prompt` and
 * `parameters.size`, and a reference image is `image` in one and `base_image` in
 * the other. Keeping the vocabulary here means the page never has to know which
 * provider it is talking to.
 */
export interface ImageGenerationParams {
  prompt: string;
  negativePrompt?: string;
  /** `"1024x1024"`. Providers that only accept fixed ratios pick the closest. */
  size?: string;
  n?: number;
  quality?: string;
  style?: string;
  seed?: number;
  /** A data URL, for an image-to-image request. */
  referenceImage?: string;
  mimeType?: string;
}

/** The image parameters carried in `media`, defaulted for an adapter. */
export function imageGenerationParams(media: unknown): ImageGenerationParams {
  const value = media && typeof media === "object" ? media as Record<string, unknown> : {};
  const text = (key: string) => String(value[key] ?? "").trim();
  const seed = Number(value.seed);
  return {
    prompt: text("prompt"),
    ...(text("negativePrompt") ? { negativePrompt: text("negativePrompt") } : {}),
    ...(text("size") ? { size: text("size") } : {}),
    ...(Number(value.n) > 0 ? { n: Math.min(10, Math.trunc(Number(value.n))) } : {}),
    ...(text("quality") ? { quality: text("quality") } : {}),
    ...(text("style") ? { style: text("style") } : {}),
    ...(Number.isFinite(seed) ? { seed } : {}),
    ...(text("referenceImage") ? { referenceImage: text("referenceImage") } : {}),
    ...(text("mimeType") ? { mimeType: text("mimeType") } : {}),
  };
}

export interface AdapterInput {
  operation?:
    | "chat"
    | "image_generate"
    | "image_edit"
    | "video_generate"
    | "video_status";
  channelType: string;
  model: string;
  apiKey: string;
  stream: boolean;
  messages: ChatMessage[];
  tools?: ChatTool[];
  system?: string;
  maxTokens?: number;
  temperature?: number;
  reasoningEffort?: string;
  media?: Record<string, unknown>;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  /** Tokens written into the prompt cache. Anthropic bills these above the input rate. */
  cacheWriteInputTokens: number;
  /** The subset of the above written with the one-hour TTL, priced separately. */
  cacheWrite1hInputTokens: number;
  /**
   * Whether `inputTokens` already counts `cachedInputTokens`.
   *
   * OpenAI reports `prompt_tokens` inclusive of `prompt_tokens_details.cached_tokens`,
   * while Anthropic reports `input_tokens` with the cache reads and writes counted
   * separately. Callers that price the two portions at different rates have to know
   * which one they are looking at, or they subtract a cache count the input never had.
   */
  inputIncludesCache: boolean;
}

/** Normalise usage metadata from OpenAI-compatible, Anthropic, Gemini and relay responses. */
export function extractTokenUsage(body: unknown): TokenUsage {
  const value = body && typeof body === "object" ? body as Record<string, any> : {};
  const usage = value.usage ?? value.usageMetadata ?? value.usage_metadata ?? value.meta?.usage ?? {};
  const number = (...values: unknown[]) => {
    for (const item of values) {
      const parsed = Number(item);
      if (Number.isFinite(parsed) && parsed >= 0) return parsed;
    }
    return 0;
  };
  const maximum = (...values: unknown[]): number => values.reduce<number>((best, item) => {
    const parsed = Number(item);
    return Number.isFinite(parsed) && parsed >= 0 ? Math.max(best, parsed) : best;
  }, 0);
  const cachedInputTokens = maximum(
    usage.cached_tokens,
    usage.cached_input_tokens,
    usage.cache_read_input_tokens,
    usage.cacheReadInputTokens,
    usage.prompt_tokens_details?.cached_tokens,
    usage.input_tokens_details?.cached_tokens,
    usage.cachedContentTokenCount,
  );
  const cacheWrite1hInputTokens = maximum(
    usage.cache_creation?.ephemeral_1h_input_tokens,
    usage.cacheWrite1hInputTokens,
  );
  const cacheWriteInputTokens = Math.max(cacheWrite1hInputTokens, maximum(
    usage.cache_creation_input_tokens,
    usage.cache_creation?.ephemeral_5m_input_tokens,
    usage.cacheWriteInputTokens,
  ));
  // Anthropic states cache reads and writes beside `input_tokens` rather than inside
  // it. Detect that shape rather than trusting a provider name, since relays pass the
  // upstream body through unchanged.
  const declaredExclusive = (
    "cache_read_input_tokens" in usage
    || "cache_creation_input_tokens" in usage
    || "cache_creation" in usage
  );
  const promptTokens = number(usage.prompt_tokens, usage.input_tokens, usage.promptTokenCount, usage.inputTokenCount, usage.input);
  // Field names alone do not settle this. An OpenAI-shaped relay can report
  // `prompt_tokens_details.cached_tokens` while counting only the misses in
  // `prompt_tokens`, which makes the cache read larger than the input. Inclusive
  // semantics make that impossible, so the numbers get the final say.
  const inputIncludesCache = !declaredExclusive && cachedInputTokens <= promptTokens;
  return {
    inputTokens: promptTokens,
    outputTokens: number(usage.completion_tokens, usage.output_tokens, usage.candidatesTokenCount, usage.outputTokenCount, usage.output),
    cachedInputTokens,
    cacheWriteInputTokens,
    cacheWrite1hInputTokens,
    inputIncludesCache,
  };
}

export interface AdapterOutput {
  urlPath: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

export interface AdapterConfiguration {
  kind: string;
  label?: string;
  description?: string;
  startPath?: string;
  statusPath?: string;
}

/** One image a provider returned: a link to it, or the bytes themselves. */
export interface GeneratedImage {
  url?: string;
  /** Base64, without a data-URL prefix. */
  base64?: string;
  mimeType?: string;
  /** What the provider says it drew, when it says anything. */
  revisedPrompt?: string;
}

export interface GeneratedImages {
  images: GeneratedImage[];
  /** Whether the provider billed anything for the call, so a caller can price it. */
  inputTokens?: number;
  outputTokens?: number;
  /** The provider's own message, kept for a task row that has no images to show. */
  message?: string;
}

/**
 * Read generated images out of an upstream body.
 *
 * Every provider that generates images answers in its own shape, and a relay
 * may wrap any of them: OpenAI returns `data[].url` or `data[].b64_json`,
 * DashScope returns `output.results[].url`, and several compatible services
 * return `images[]` or `artifacts[].base64`. Collecting all of the known shapes
 * here means an adapter only has to implement `parseImage` when its provider
 * does something none of them cover.
 */
export function extractGeneratedImages(body: unknown): GeneratedImages {
  const root = body && typeof body === "object" ? body as Record<string, any> : {};
  const images: GeneratedImage[] = [];
  const take = (value: unknown) => {
    if (!value) return;
    if (typeof value === "string") {
      if (/^https?:\/\//i.test(value)) images.push({ url: value });
      else if (value.length > 64) images.push({ base64: value.replace(/^data:[^;]+;base64,/, "") });
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) take(item);
      return;
    }
    if (typeof value !== "object") return;
    const item = value as Record<string, any>;
    const url = String(item.url ?? item.image_url ?? item.imageUrl ?? "").trim();
    const base64 = String(item.b64_json ?? item.base64 ?? item.b64 ?? item.image_base64 ?? "").trim();
    const mimeType = String(item.mime_type ?? item.mimeType ?? "").trim() || undefined;
    const revisedPrompt = String(item.revised_prompt ?? item.revisedPrompt ?? "").trim() || undefined;
    if (!url && !base64) return;
    images.push({
      ...(url ? { url } : { base64: base64.replace(/^data:[^;]+;base64,/, "") }),
      ...(mimeType ? { mimeType } : {}),
      ...(revisedPrompt ? { revisedPrompt } : {}),
    });
  };
  take(root.data);
  take(root.images);
  take(root.output?.results);
  take(root.output?.images);
  take(root.output?.choices);
  take(root.results);
  take(root.artifacts);
  take(root.result);
  // A data-URL inside a chat-style message covers providers that answer an
  // image request with a normal completion that embeds the picture.
  const content = root.choices?.[0]?.message?.content;
  if (typeof content === "string" && /^data:image\//.test(content)) take(content);
  if (Array.isArray(content)) for (const part of content) {
    if (part && typeof part === "object" && typeof (part as any).image_url?.url === "string")
      take((part as any).image_url.url);
  }
  const message = typeof root.message === "string"
    ? root.message
    : typeof root.error?.message === "string"
      ? root.error.message
      : "";
  return {
    images,
    ...(message ? { message } : {}),
    inputTokens: Number(root.usage?.prompt_tokens ?? root.usage?.input_tokens ?? 0) || undefined,
    outputTokens: Number(root.usage?.completion_tokens ?? root.usage?.output_tokens ?? 0) || undefined,
  };
}

export interface AdapterDefinition {
  types: string[];
  configuration?: AdapterConfiguration;
  build(input: AdapterInput): AdapterOutput;
  parse?(body: unknown): {
    content: string;
    toolCalls?: unknown[];
    inputTokens?: number;
    outputTokens?: number;
    cachedInputTokens?: number;
    finishReason?: string;
  };
  stream?(response: Response, onDelta: (delta: string) => void): Promise<void>;
  /** Image results, when the provider's shape is not one `extractGeneratedImages` knows. */
  parseImage?(body: unknown): GeneratedImages;
}

export interface AdapterRegistry {
  names(): string[];
  configurations(): Array<AdapterConfiguration & { types: string[] }>;
  register(adapter: AdapterDefinition): () => void;
  build(input: AdapterInput): AdapterOutput | undefined;
  parse(
    channelType: string,
    body: unknown,
  ): ReturnType<NonNullable<AdapterDefinition["parse"]>> | undefined;
  /** Images from an image-generation response, with a generic fallback. */
  parseImage(channelType: string, body: unknown): GeneratedImages;
  stream(
    channelType: string,
    response: Response,
    onDelta: (delta: string) => void,
  ): Promise<boolean>;
  normalizeType(value: string): string;
}

/**
 * Messages in the shape chat completions expects.
 *
 * Two fields are only sent when they carry something: the legacy tagged both
 * with `omitempty` (`old/internal/service/advanced_chat_completion.go:69`), and
 * an empty array is *not* omitted by a truthiness check — so `tool_calls: []`
 * rode along on every user message, which upstreams reject as a bad parameter.
 */
function openAIToolCalls(value: ChatMessage["toolCalls"]): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return [];
  return value.flatMap((call) => {
    const raw = call as unknown as Record<string, unknown>;
    const fn = raw.function && typeof raw.function === "object"
      ? raw.function as Record<string, unknown>
      : {};
    const name = String(fn.name ?? raw.name ?? "").trim();
    const id = String(raw.id ?? "").trim();
    if (!id || !name) return [];
    const argumentsValue = fn.arguments ?? raw.arguments ?? "{}";
    const argumentsText = typeof argumentsValue === "string"
      ? argumentsValue
      : JSON.stringify(argumentsValue);
    return [{ id, type: "function", function: { name, arguments: argumentsText } }];
  });
}

/**
 * Chat-completions wire messages.
 *
 * The system prompt is not a field of its own there: it is the first message.
 * Adapters that passed only `input.messages` dropped it on the floor, which
 * silently removed the agent prompt, the injected memory, skill and MCP context
 * and everything else a plugin contributes.
 */
export function openAIChatMessages(
  messages: ChatMessage[] | undefined,
  system?: string,
): Array<Record<string, unknown>> {
  const wire = (Array.isArray(messages) ? messages : []).map((message) => {
    const toolCalls = openAIToolCalls(message.toolCalls);
    return {
      role: message.role,
      content: message.content,
      ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
      ...(message.toolCallId ? { tool_call_id: message.toolCallId } : {}),
      ...(message.name ? { name: message.name } : {}),
    };
  });
  const prompt = String(system ?? "").trim();
  return prompt ? [{ role: "system", content: prompt }, ...wire] : wire;
}

/**
 * The tool shape chat completions expects on the wire.
 *
 * `ChatTool` is `{name, description, parameters}` internally, but upstreams want
 * `{type: "function", function: {...}}`. Sending the internal shape bare made a
 * relay answer `{"message":"请求参数错误","type":"bad_response_status_code"}`
 * for every assistant run — the legacy built the wrapped form
 * (`old/internal/service/chat_executor.go:1142`), and this is that mapping.
 */
export function openAIChatTools(
  tools: ChatTool[] | undefined,
): Array<Record<string, unknown>> | undefined {
  if (!Array.isArray(tools) || tools.length === 0) return undefined;
  const mapped = tools
    .filter((tool) => tool?.name)
    .map((tool) => ({
      type: "function",
      function: {
        name: String(tool.name),
        description: String(tool.description ?? ""),
        parameters: tool.parameters ?? { type: "object", properties: {} },
      },
    }));
  return mapped.length ? mapped : undefined;
}

/** Convert the internal tool history to Anthropic's adjacent tool blocks. */
export function anthropicChatMessages(
  messages: ChatMessage[] | undefined,
): Array<Record<string, unknown>> {
  const result: Array<Record<string, unknown>> = [];
  const input = Array.isArray(messages) ? messages : [];
  for (let index = 0; index < input.length; index += 1) {
    const message = input[index];
    if (message.role === "system") continue;
    if (message.role === "tool") {
      // Orphaned results are historical debris. Only assistant-owned results
      // are emitted, and those are consumed by the assistant branch below.
      continue;
    }
    if (message.role === "assistant" && message.toolCalls?.length) {
      const following: ChatMessage[] = [];
      let next = index + 1;
      while (next < input.length && input[next].role === "tool") following.push(input[next++]);
      const resultsByID = new Map(following.map((tool) => [String(tool.toolCallId ?? ""), tool]));
      const completeCalls = message.toolCalls.filter((call) => resultsByID.has(String(call.id ?? "")));
      // A persisted assistant call without its result cannot be represented in
      // Anthropic history. Drop only that call and retain valid siblings.
      if (!completeCalls.length) {
        if (typeof message.content === "string" && message.content.trim())
          result.push({ role: "assistant", content: message.content });
        index = next - 1;
        continue;
      }
      const blocks: Array<Record<string, unknown>> = [];
      if (typeof message.content === "string" && message.content.trim())
        blocks.push({ type: "text", text: message.content });
      for (const call of completeCalls) {
        let inputValue: unknown = {};
        try {
          inputValue = typeof call.arguments === "string" ? JSON.parse(call.arguments || "{}") : call.arguments;
        } catch { /* malformed arguments become an empty object */ }
        blocks.push({ type: "tool_use", id: call.id, name: call.name, input: inputValue && typeof inputValue === "object" ? inputValue : {} });
      }
      result.push({ role: "assistant", content: blocks });
      result.push({
        role: "user",
        content: completeCalls.map((call) => {
          const tool = resultsByID.get(String(call.id ?? ""))!;
          return { type: "tool_result", tool_use_id: String(call.id), content: tool.content };
        }),
      });
      index = next - 1;
      continue;
    }
    result.push({ role: message.role === "assistant" ? "assistant" : "user", content: message.content });
  }
  return result;
}

declare module "yumeri" {
  interface Components {
    adapters: AdapterRegistry;
  }
}

export function normalizeType(value: string) {
  return value.trim().toLowerCase().replaceAll(" ", "").replaceAll("-", "_");
}

export function apply(ctx: Context) {
  const adapters: AdapterDefinition[] = [];
  const find = (type: string) =>
    [...adapters]
      .reverse()
      .find((item) =>
        item.types.some((name) => normalizeType(name) === normalizeType(type)),
      );
  ctx.registerComponent("adapters", {
    names: () => adapters.flatMap((adapter) => adapter.types),
    configurations: () => adapters.filter((adapter) => adapter.configuration).map((adapter) => ({ ...adapter.configuration!, types: adapter.types })),
    register(adapter) {
      adapters.push(adapter);
      return () => {
        const index = adapters.indexOf(adapter);
        if (index >= 0) adapters.splice(index, 1);
      };
    },
    build: (input) => find(input.channelType)?.build(input),
    parse: (type, body) => find(type)?.parse?.(body),
    parseImage: (type, body) => find(type)?.parseImage?.(body) ?? extractGeneratedImages(body),
    async stream(type, response, onDelta) {
      const handler = find(type)?.stream;
      if (!handler) return false;
      await handler(response, onDelta);
      return true;
    },
    normalizeType,
  });
}
