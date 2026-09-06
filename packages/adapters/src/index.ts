import { Context } from "yumeri";

export const depend: string[] = [];
export const provide = ["adapters"];
export type Protocol = "openai" | "responses" | "openai-video" | "kling" | "midjourney" | "claude" | "gemini";
export type Endpoint = "chat" | "responses" | "claude_messages" | "gemini_generate" | "image_generation" | "image_edit" | "video_generation" | "video_status";
export interface AdapterInput { channelType: string; endpoint: Endpoint; model: string; apiKey: string; stream: boolean; payload: Record<string, unknown>; }
export interface AdapterRequest { protocol: Protocol; path?: string; headers: Record<string, string>; payload: Record<string, unknown>; }
export interface AdapterDefinition { types: string[]; request(input: AdapterInput): AdapterRequest; }
export interface AdapterRegistry { names(): string[]; register(adapter: AdapterDefinition): () => void; request(input: AdapterInput): AdapterRequest | undefined; normalizeType(value: string): string; }
declare module "yumeri" { interface Components { adapters: AdapterRegistry; } }
export function normalizeType(value: string) { return value.trim().toLowerCase().replaceAll(" ", "").replaceAll("-", "_"); }
export function apply(ctx: Context) { const adapters: AdapterDefinition[] = []; const find = (type: string) => [...adapters].reverse().find((item) => item.types.some((name) => normalizeType(name) === normalizeType(type))); ctx.registerComponent("adapters", { names: () => adapters.flatMap((adapter) => adapter.types), register(adapter) { adapters.push(adapter); return () => { const index = adapters.indexOf(adapter); if (index >= 0) adapters.splice(index, 1); }; }, request: (input) => find(input.channelType)?.request(input), normalizeType }); }
