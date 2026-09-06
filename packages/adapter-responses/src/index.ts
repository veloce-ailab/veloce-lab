import { Context } from "yumeri";
import type { AdapterRegistry } from "@velocelab/adapters";
export const depend = ["adapters"];
export const provide: string[] = [];
export function apply(ctx: Context) { (ctx.component.adapters as AdapterRegistry).register({ types: ["responses", "response", "openai_responses"], request: (input) => ({ protocol: "responses", path: "/v1/responses", headers: { "Content-Type": "application/json", Accept: "application/json", ...(input.apiKey ? { Authorization: `Bearer ${input.apiKey}` } : {}) }, payload: input.payload }) }); }
