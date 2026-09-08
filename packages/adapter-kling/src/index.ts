import { Context } from "yumeri";
import { AdapterInput, AdapterRegistry } from "@velocelab/adapters";
export const depend = ["adapters"];
export const provide: string[] = [];
export function apply(ctx: Context) {
  (ctx.component.adapters as AdapterRegistry).register({
    types: ["kling", "klingai", "kling_ai"],
    build: (input: AdapterInput) => {
      const media = { ...(input.media ?? {}) } as Record<string, unknown>;
      if (media.image_url && !media.image) media.image = media.image_url;
      if (media.n !== undefined && media.num_videos === undefined)
        media.num_videos = media.n;
      if (media.size !== undefined && media.aspect_ratio === undefined) {
        const size = String(media.size).trim().toLowerCase();
        if (["16:9", "9:16", "1:1", "4:3", "3:4", "21:9"].includes(size))
          media.aspect_ratio = size;
      }
      delete media.image_url;
      delete media.n;
      delete media.size;
      delete media.resolution;
      return {
        urlPath:
          input.operation === "video_status"
            ? `/v1/videos/image2video/${encodeURIComponent(input.model)}`
            : "/v1/videos/image2video",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          ...(input.apiKey ? { Authorization: `Bearer ${input.apiKey}` } : {}),
        },
        body: { model_name: input.model, ...media },
      };
    },
  });
}
