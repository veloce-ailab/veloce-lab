import { Context } from "yumeri";
import type { AdapterRegistry } from "@velocelab/adapters";
export const depend = ["adapters"];
export const provide: string[] = [];
export function apply(ctx: Context) {
  (ctx.component.adapters as AdapterRegistry).register({
    types: ["claude", "anthropic"],
    request: (input) => ({
      path: "/v1/messages",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "x-api-key": input.apiKey,
        Authorization: `Bearer ${input.apiKey}`,
        "anthropic-version": "2023-06-01",
      },
      payload: {
        model: input.model,
        max_tokens: input.maxTokens || 1024,
        messages: input.messages,
        ...(input.system ? { system: input.system } : {}),
        ...(input.temperature === undefined
          ? {}
          : { temperature: input.temperature }),
        ...(input.stream ? { stream: true } : {}),
      },
    }),
  });
}
