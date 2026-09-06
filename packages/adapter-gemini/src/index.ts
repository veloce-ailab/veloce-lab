import { Context } from "yumeri";
import type { AdapterRegistry } from "@velocelab/adapters";
export const depend = ["adapters"];
export const provide: string[] = [];
export function apply(ctx: Context) { (ctx.component.adapters as AdapterRegistry).register({ types: ["gemini", "google"], request: (input) => ({ protocol: "gemini", path: `/v1beta/models/${encodeURIComponent(input.model.replace(/^models\//, ""))}:generateContent`, headers: { "Content-Type": "application/json", Accept: "application/json", ...(input.apiKey ? { "x-goog-api-key": input.apiKey } : {}) }, payload: input.payload }) }); }
