import { Context } from "yumeri";
import type {
  AdapterDefinition,
  AdapterInput,
  AdapterRegistry,
} from "@velocelab/adapters";
export const depend = ["adapters"];
export const provide: string[] = [];
const adapter: AdapterDefinition = {
  types: ["zhipu", "zhipu_v4", "bigmodel", "glm"],
  build: (input: AdapterInput) => ({
    urlPath: "/api/paas/v4/chat/completions",
    headers: {
      "Content-Type": "application/json",
      Accept: input.stream ? "text/event-stream" : "application/json",
      ...(input.apiKey ? { Authorization: `Bearer ${input.apiKey}` } : {}),
    },
    body: {
      model: input.model,
      messages: input.messages,
      ...(input.temperature === undefined
        ? {}
        : { temperature: input.temperature }),
      ...(input.stream ? { stream: true } : {}),
    },
  }),
  parse: (body) => {
    const value = (body ?? {}) as any;
    const message = value.choices?.[0]?.message ?? {};
    return {
      content: typeof message.content === "string" ? message.content : "",
      toolCalls: Array.isArray(message.tool_calls) ? message.tool_calls : [],
      inputTokens: Number(value.usage?.prompt_tokens ?? 0),
      outputTokens: Number(value.usage?.completion_tokens ?? 0),
      finishReason:
        typeof value.choices?.[0]?.finish_reason === "string"
          ? value.choices[0].finish_reason
          : "stop",
    };
  },
};
export function apply(ctx: Context) {
  (ctx.component.adapters as AdapterRegistry).register(adapter);
}
