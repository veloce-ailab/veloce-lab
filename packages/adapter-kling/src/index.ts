import { Context } from "yumeri";
import type { AdapterRegistry } from "@velocelab/adapters";
export const depend = ["adapters"];
export const provide: string[] = [];
export function apply(ctx: Context) {
  (ctx.component.adapters as AdapterRegistry).register({
    types: ["kling", "klingai", "kling_ai"],
    request: (input) => ({
      path:
        input.endpoint === "video_status"
          ? `/v1/videos/image2video/${encodeURIComponent(input.model)}`
          : "/v1/videos/image2video",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(input.apiKey ? { Authorization: `Bearer ${input.apiKey}` } : {}),
      },
      payload: { model: input.model, ...(input.media ?? {}) },
    }),
  });
}
