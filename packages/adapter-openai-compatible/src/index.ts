import { Context } from "yumeri";
import type { AdapterRegistry } from "@velocelab/adapters";
export const depend = ["adapters"];
export const provide: string[] = [];
const types = [
  "openrouter",
  "open_router",
  "perplexity",
  "lingyiwanwu",
  "lingyi",
  "01ai",
  "yi",
  "mokaai",
  "moka",
  "xinference",
  "submodel",
  "ollama",
  "mistral",
  "baidu_v2",
  "qianfan",
  "qianfan_v2",
  "minimax",
  "hailuo",
  "volcengine",
  "volc",
  "doubao",
  "ark",
];
export function apply(ctx: Context) {
  (ctx.component.adapters as AdapterRegistry).register({
    types,
    request: (input) => ({
      path: "/v1/chat/completions",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(input.apiKey ? { Authorization: `Bearer ${input.apiKey}` } : {}),
      },
      payload: {
        model: input.model,
        messages: input.messages,
        ...(input.maxTokens ? { max_tokens: input.maxTokens } : {}),
        ...(input.temperature === undefined
          ? {}
          : { temperature: input.temperature }),
        ...(input.stream ? { stream: true } : {}),
      },
    }),
  });
}
