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
