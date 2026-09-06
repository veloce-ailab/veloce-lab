import { Context } from "yumeri";
import type { AdapterDefinition, AdapterRegistry } from "@velocelab/adapters";
export const depend = ["adapters"];
export const provide: string[] = [];
export function apply(ctx: Context) { const registry = ctx.component.adapters as AdapterRegistry; const adapter: AdapterDefinition = { types: ["completion", "completions", "chat_completion", "chat_completions"], request: (input) => ({ protocol: "openai", path: "/v1/chat/completions", headers: { "Content-Type": "application/json", Accept: "application/json", ...(input.apiKey ? { Authorization: `Bearer ${input.apiKey}` } : {}) }, payload: input.payload }) }; registry.register(adapter); }
