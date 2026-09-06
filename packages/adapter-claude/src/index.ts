import { Context } from "yumeri";
import type { AdapterRegistry } from "@velocelab/adapters";
export const depend = ["adapters"];
export const provide: string[] = [];
export function apply(ctx: Context) { (ctx.component.adapters as AdapterRegistry).register({ types: ["claude", "anthropic"], request: (input) => ({ protocol: "claude", path: "/v1/messages", headers: { "Content-Type": "application/json", Accept: "application/json", "x-api-key": input.apiKey, Authorization: `Bearer ${input.apiKey}`, "anthropic-version": "2023-06-01" }, payload: input.payload }) }); }
