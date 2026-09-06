import { Context } from "yumeri";
import type {
  AdapterDefinition,
  AdapterInput,
  AdapterRegistry,
} from "@velocelab/adapters";
export const depend = ["adapters"];
export const provide: string[] = [];
const adapter: AdapterDefinition = {
  types: ["xai", "x_ai", "grok"],
  build: (input: AdapterInput) => {
    const modelMatch = input.model.match(/^(.*?)(?:-(high|low))?(-search)?$/);
    const model = modelMatch?.[1] || input.model;
    const body: Record<string, unknown> = {
      model,
      messages: input.messages,
      ...(input.maxTokens ? { max_completion_tokens: input.maxTokens } : {}),
      ...(input.temperature === undefined
        ? {}
        : { temperature: input.temperature }),
      ...(input.stream ? { stream: true } : {}),
    };
    if (modelMatch?.[2]) body.reasoning_effort = modelMatch[2];
    if (modelMatch?.[3]) body.search_parameters = { mode: "on" };
    return {
      urlPath: "/v1/chat/completions",
      headers: {
        "Content-Type": "application/json",
        Accept: input.stream ? "text/event-stream" : "application/json",
        ...(input.apiKey ? { Authorization: `Bearer ${input.apiKey}` } : {}),
      },
      body,
    };
  },
};
export function apply(ctx: Context) {
  (ctx.component.adapters as AdapterRegistry).register(adapter);
}
