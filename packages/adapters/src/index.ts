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
  const cachedInputTokens = [
    usage.cached_tokens,
    usage.cached_input_tokens,
    usage.cache_read_input_tokens,
    usage.cacheReadInputTokens,
    usage.prompt_tokens_details?.cached_tokens,
    usage.input_tokens_details?.cached_tokens,
    usage.cachedContentTokenCount,
  ].reduce((maximum, item) => {
    const parsed = Number(item);
    return Number.isFinite(parsed) && parsed >= 0 ? Math.max(maximum, parsed) : maximum;
  }, 0);
  return {
    inputTokens: number(usage.prompt_tokens, usage.input_tokens, usage.promptTokenCount, usage.inputTokenCount, usage.input),
    outputTokens: number(usage.completion_tokens, usage.output_tokens, usage.candidatesTokenCount, usage.outputTokenCount, usage.output),
    cachedInputTokens,
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

export function openAIChatMessages(
  messages: ChatMessage[] | undefined,
): Array<Record<string, unknown>> {
  return (Array.isArray(messages) ? messages : []).map((message) => {
    const toolCalls = openAIToolCalls(message.toolCalls);
    return {
      role: message.role,
      content: message.content,
      ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
      ...(message.toolCallId ? { tool_call_id: message.toolCallId } : {}),
      ...(message.name ? { name: message.name } : {}),
    };
  });
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
    async stream(type, response, onDelta) {
      const handler = find(type)?.stream;
      if (!handler) return false;
      await handler(response, onDelta);
      return true;
    },
    normalizeType,
  });
}
