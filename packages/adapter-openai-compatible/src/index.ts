import { Context } from "yumeri";
import { AdapterInput, AdapterRegistry } from "@velocelab/adapters";
import { imageGenerationParams, openAIChatMessages, openAIChatTools } from "@velocelab/adapters";
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
/** The images endpoint every OpenAI-compatible provider exposes under the same path. */
function imageBuild(input: AdapterInput) {
  const params = imageGenerationParams(input.media);
  return {
    urlPath: "/v1/images/generations",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(input.apiKey ? { Authorization: `Bearer ${input.apiKey}` } : {}),
    },
    body: {
      model: input.model,
      prompt: params.prompt,
      ...(params.n ? { n: params.n } : {}),
      ...(params.size ? { size: params.size } : {}),
      ...(params.quality ? { quality: params.quality } : {}),
      ...(params.style ? { style: params.style } : {}),
      response_format: "b64_json",
      ...(params.referenceImage ? { image: params.referenceImage } : {}),
    },
  };
}

export function apply(ctx: Context) {
  (ctx.component.adapters as AdapterRegistry).register({
    types,
    build: (input: AdapterInput) => {
      if (input.operation === "image_generate" || input.operation === "image_edit") return imageBuild(input);
      const tools = openAIChatTools(input.tools);
      return {
        urlPath: "/v1/chat/completions",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          ...(input.apiKey ? { Authorization: `Bearer ${input.apiKey}` } : {}),
        },
        body: {
          model: input.model,
          messages: openAIChatMessages(input.messages, input.system),
          ...(input.maxTokens ? { max_tokens: input.maxTokens } : {}),
          ...(input.temperature === undefined
            ? {}
            : { temperature: input.temperature }),
          ...(input.stream ? { stream: true } : {}),
          ...(tools ? { tools, tool_choice: "auto" } : {}),
        },
      };
    },
    parse: (body) => {
      const value = (body ?? {}) as any;
      const choice = value.choices?.[0] ?? {};
      const message = choice.message ?? {};
      return {
        content: typeof message.content === "string" ? message.content : "",
        toolCalls: Array.isArray(message.tool_calls) ? message.tool_calls : [],
        inputTokens: Number(value.usage?.prompt_tokens ?? 0),
        outputTokens: Number(value.usage?.completion_tokens ?? 0),
        finishReason: typeof choice.finish_reason === "string" ? choice.finish_reason : "stop",
      };
    },
  });
}
