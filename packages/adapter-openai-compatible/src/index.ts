import { Context } from "yumeri";
import { AdapterInput, AdapterRegistry } from "@velocelab/adapters";
export const depend = ["adapters"];
export const provide: string[] = [];
function mapMessages(input: AdapterInput) {
  return input.messages.map((message) => ({
    role: message.role,
    content: message.content,
    ...(message.toolCalls ? { tool_calls: message.toolCalls } : {}),
    ...(message.toolCallId ? { tool_call_id: message.toolCallId } : {}),
    ...(message.name ? { name: message.name } : {}),
  }));
}
const types = [
  "openrouter",
  "open_router",
  "perplexity",
  "lingyiwanwu",
  "lingyi",
  "01ai",
  "yi",
  "mokaai",
  "moka",
  "xinference",
  "submodel",
  "ollama",
  "mistral",
  "baidu_v2",
  "qianfan",
  "qianfan_v2",
  "minimax",
  "hailuo",
  "volcengine",
  "volc",
  "doubao",
  "ark",
];
export function apply(ctx: Context) {
  (ctx.component.adapters as AdapterRegistry).register({
    types,
    build: (input: AdapterInput) => ({
      urlPath: "/v1/chat/completions",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(input.apiKey ? { Authorization: `Bearer ${input.apiKey}` } : {}),
      },
      body: {
        model: input.model,
        messages: mapMessages(input),
        ...(input.maxTokens ? { max_tokens: input.maxTokens } : {}),
        ...(input.temperature === undefined
          ? {}
          : { temperature: input.temperature }),
        ...(input.stream ? { stream: true } : {}),
      },
    }),
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
  });
}
