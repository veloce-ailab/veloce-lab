import { Context } from "yumeri";
import type { AdapterInput, AdapterRegistry } from "@velocelab/adapters";
export const depend = ["adapters"];
export const provide: string[] = [];
export function apply(ctx: Context) {
  (ctx.component.adapters as AdapterRegistry).register({
    types: ["midjourney", "mj"],
    build: (input: AdapterInput) => ({
      urlPath: "/v1/chat/completions",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(input.apiKey ? { Authorization: `Bearer ${input.apiKey}` } : {}),
      },
      body: { model: input.model, messages: input.messages },
    }),
    parse: (body) => ({
      content: typeof (body as any)?.choices?.[0]?.message?.content === "string"
        ? (body as any).choices[0].message.content
        : "",
    }),
  });
}
