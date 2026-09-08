import { Context } from "yumeri";
import { AdapterInput, AdapterRegistry } from "@velocelab/adapters";
export const depend = ["adapters"];
export const provide: string[] = [];
async function stream(response: Response, onDelta: (delta: string) => void) {
  const text = await response.text();
  for (const line of text.split(/\r?\n/)) {
    if (!line.startsWith("data:")) continue;
    try {
      const value = JSON.parse(line.slice(5));
      const parts = value.candidates?.[0]?.content?.parts ?? [];
      for (const part of parts) if (typeof part.text === "string") onDelta(part.text);
    } catch {}
  }
}
export function apply(ctx: Context) {
  (ctx.component.adapters as AdapterRegistry).register({
    types: ["gemini", "google"],
    build: (input: AdapterInput) => ({
      urlPath: `/v1beta/models/${encodeURIComponent(input.model.replace(/^models\//, ""))}:generateContent`,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(input.apiKey ? { "x-goog-api-key": input.apiKey } : {}),
      },
      body: {
        contents: input.messages
          .filter((message) => message.role !== "system")
          .map((message) => ({
            role: message.role === "assistant" ? "model" : "user",
            parts: [{ text: message.content }],
          })),
        ...(input.system
          ? { systemInstruction: { parts: [{ text: input.system }] } }
          : {}),
        ...(input.maxTokens || input.temperature !== undefined
          ? {
              generationConfig: {
                ...(input.maxTokens
                  ? { maxOutputTokens: input.maxTokens }
                  : {}),
                ...(input.temperature === undefined
                  ? {}
                  : { temperature: input.temperature }),
              },
            }
          : {}),
      },
    }),
    parse: (body) => {
      const value = (body ?? {}) as any;
      const parts = value.candidates?.[0]?.content?.parts ?? [];
      return {
        content: parts.map((part: any) => part.text ?? "").join(""),
        toolCalls: parts.filter((part: any) => part.functionCall).map((part: any) => part.functionCall),
        inputTokens: Number(value.usageMetadata?.promptTokenCount ?? 0),
        outputTokens: Number(value.usageMetadata?.candidatesTokenCount ?? 0),
      };
    },
    stream,
  });
}
