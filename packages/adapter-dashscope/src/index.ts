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
      messages: input.messages,
      ...(input.maxTokens ? { max_tokens: input.maxTokens } : {}),
      ...(input.temperature === undefined
        ? {}
        : { temperature: input.temperature }),
      ...(input.stream
        ? { stream: true, stream_options: { include_usage: true } }
        : {}),
    };
    return {
      urlPath: "/compatible-mode/v1/chat/completions",
      headers: {
        "Content-Type": "application/json",
        Accept: input.stream ? "text/event-stream" : "application/json",
        ...(input.apiKey ? { Authorization: `Bearer ${input.apiKey}` } : {}),
        ...(input.stream ? { "X-DashScope-SSE": "enable" } : {}),
      },
      body,
    };
  },
};
export function apply(ctx: Context) {
  (ctx.component.adapters as AdapterRegistry).register(adapter);
}
