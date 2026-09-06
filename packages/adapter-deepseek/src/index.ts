import { Context } from "yumeri";
import type {
  AdapterDefinition,
  AdapterInput,
  AdapterRegistry,
} from "@velocelab/adapters";
export const depend = ["adapters"];
export const provide: string[] = [];
function build(input: AdapterInput) {
  const payload: Record<string, unknown> = {
    model: input.model,
    messages: input.messages,
    ...(input.maxTokens ? { max_tokens: input.maxTokens } : {}),
    ...(input.temperature === undefined
      ? {}
      : { temperature: input.temperature }),
    ...(input.stream ? { stream: true } : {}),
  };
  const match = input.model.match(
    /^(.*?)-(high|medium|low|thinking|reasoner)$/,
  );
  if (match) {
    payload.model = match[1];
    payload.thinking = { type: "enabled" };
    payload.reasoning_effort =
      match[2] === "thinking" || match[2] === "reasoner" ? "medium" : match[2];
  }
  return {
    urlPath: input.model.includes("claude")
      ? "/anthropic/v1/messages"
      : "/v1/chat/completions",
    headers: {
      "Content-Type": "application/json",
      Accept: input.stream ? "text/event-stream" : "application/json",
      ...(input.apiKey ? { Authorization: `Bearer ${input.apiKey}` } : {}),
    },
    body: payload,
  };
}
const adapter: AdapterDefinition = {
  types: ["deepseek", "deep_seek"],
  build,
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
