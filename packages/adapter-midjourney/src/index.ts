import { Context } from "yumeri";
import type { AdapterRegistry } from "@velocelab/adapters";
export const depend = ["adapters"];
export const provide: string[] = [];
export function apply(ctx: Context) { (ctx.component.adapters as AdapterRegistry).register({ types: ["midjourney", "mj"], request: (input) => ({ protocol: "midjourney", path: "/v1/chat/completions", headers: { "Content-Type": "application/json", Accept: "application/json", ...(input.apiKey ? { Authorization: `Bearer ${input.apiKey}` } : {}) }, payload: input.payload }) }); }
