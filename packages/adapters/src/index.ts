import { Context } from "yumeri";

export const depend: string[] = [];
export const provide = ["adapters"];

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | Array<Record<string, unknown>>;
  toolCalls?: Array<{ id: string; name: string; arguments: string }>;
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

export interface AdapterOutput {
  urlPath: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

export interface AdapterDefinition {
  types: string[];
  build(input: AdapterInput): AdapterOutput;
  parse?(body: unknown): {
    content: string;
    toolCalls?: unknown[];
    inputTokens?: number;
    outputTokens?: number;
    finishReason?: string;
  };
  stream?(response: Response, onDelta: (delta: string) => void): Promise<void>;
}

export interface AdapterRegistry {
  names(): string[];
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
export function openAIChatMessages(
  messages: ChatMessage[] | undefined,
): Array<Record<string, unknown>> {
  return (Array.isArray(messages) ? messages : []).map((message) => ({
    role: message.role,
    content: message.content,
    ...(Array.isArray(message.toolCalls) && message.toolCalls.length
      ? { tool_calls: message.toolCalls }
      : {}),
    ...(message.toolCallId ? { tool_call_id: message.toolCallId } : {}),
    ...(message.name ? { name: message.name } : {}),
  }));
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
