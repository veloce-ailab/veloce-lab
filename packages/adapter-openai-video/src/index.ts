import { Context } from "yumeri";
import { AdapterInput, AdapterRegistry } from "@velocelab/adapters";
export const depend = ["adapters"];
export const provide: string[] = [];
export function apply(ctx: Context) {
  (ctx.component.adapters as AdapterRegistry).register({
    types: ["openai_video", "video", "veo", "seedance"],
    build: (input: AdapterInput) => ({
      urlPath: "/v1/video/generations",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(input.apiKey ? { Authorization: `Bearer ${input.apiKey}` } : {}),
      },
      body: {
        model: input.model,
        messages: input.messages,
        ...(input.media ?? {}),
      },
    }),
  });
}
