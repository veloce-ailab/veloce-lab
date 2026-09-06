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
};
export function apply(ctx: Context) {
  (ctx.component.adapters as AdapterRegistry).register(adapter);
}
