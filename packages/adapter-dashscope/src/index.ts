import { Context } from "yumeri";
import type {
  AdapterDefinition,
  AdapterInput,
  AdapterRegistry,
} from "@velocelab/adapters";
export const depend = ["adapters"];
export const provide: string[] = [];
const adapter: AdapterDefinition = {
  types: ["ali", "dashscope", "qwen", "aliyun"],
  build: (input: AdapterInput) => {
    const body: Record<string, unknown> = {
      model: input.model,
      ...(input.operation === "image_generate" || input.operation === "image_edit"
        ? { ...(input.media ?? {}) }
        : { messages: input.messages }),
      ...(input.maxTokens ? { max_tokens: input.maxTokens } : {}),
      ...(input.temperature === undefined
        ? {}
        : { temperature: input.temperature }),
      ...(input.stream
        ? { stream: true, stream_options: { include_usage: true } }
        : {}),
    };
    return {
      urlPath:
        input.operation === "image_generate"
          ? "/api/v1/services/aigc/text2image/image-synthesis"
          : input.operation === "image_edit"
            ? "/api/v1/services/aigc/image2image/image-synthesis"
            : input.model.toLowerCase().includes("claude")
              ? "/apps/anthropic/v1/messages"
              : input.operation === "chat"
                ? "/compatible-mode/v1/chat/completions"
                : "/api/v2/apps/protocols/compatible-mode/v1/responses",
      headers: {
        "Content-Type": "application/json",
        Accept: input.stream ? "text/event-stream" : "application/json",
        ...(input.apiKey ? { Authorization: `Bearer ${input.apiKey}` } : {}),
        ...(input.stream ? { "X-DashScope-SSE": "enable" } : {}),
      },
      body,
    };
  },
  parse: (body) => {
    const value = (body ?? {}) as any;
    const choice = value.choices?.[0] ?? {};
    const message = choice.message ?? {};
    return {
      content: typeof message.content === "string" ? message.content : "",
      toolCalls: Array.isArray(message.tool_calls) ? message.tool_calls : [],
      inputTokens: Number(value.usage?.prompt_tokens ?? 0),
      outputTokens: Number(value.usage?.completion_tokens ?? 0),
      finishReason: typeof choice.finish_reason === "string" ? choice.finish_reason : "stop",
    };
  },
};
export function apply(ctx: Context) {
  (ctx.component.adapters as AdapterRegistry).register(adapter);
}
