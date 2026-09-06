import { Context } from "yumeri";
import type {
  AdapterDefinition,
  AdapterInput,
  AdapterRegistry,
} from "@velocelab/adapters";
export const depend = ["adapters"];
export const provide: string[] = [];
const adapter: AdapterDefinition = {
  types: ["moonshot", "kimi"],
  build: (input: AdapterInput) => ({
    urlPath:
      input.model.toLowerCase() === "kimi-k2.6"
        ? "/v1/chat/completions"
        : "/v1/chat/completions",
    headers: {
      "Content-Type": "application/json",
      Accept: input.stream ? "text/event-stream" : "application/json",
      ...(input.apiKey ? { Authorization: `Bearer ${input.apiKey}` } : {}),
    },
    body: {
      model: input.model,
      messages: input.messages,
      ...(input.model.toLowerCase() === "kimi-k2.6" ? { temperature: 1 } : {}),
      ...(input.stream ? { stream: true } : {}),
    },
  }),
};
export function apply(ctx: Context) {
  (ctx.component.adapters as AdapterRegistry).register(adapter);
}
