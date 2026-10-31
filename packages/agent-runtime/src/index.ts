import { Context } from "yumeri";

export interface AgentModelStep {
  content: string;
  toolCalls: unknown[];
  finishReason: string;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
}

export interface AgentToolCallResult {
  id: string;
  name: string;
  status: "ok" | "error";
  arguments: unknown;
  result?: string;
  error?: string;
}

export interface AgentToolDefinition {
  name: string;
  execute?: (...args: any[]) => Promise<unknown> | unknown;
}

export interface AgentTurnInput {
  initial: AgentModelStep;
  messages: Array<Record<string, unknown>>;
  tools: AgentToolDefinition[];
  maxToolRounds: number;
  signal?: AbortSignal;
  executeTool: (tool: AgentToolDefinition, input: unknown) => Promise<unknown>;
  requestNext: (
    messages: Array<Record<string, unknown>>,
    round: number,
  ) => Promise<AgentModelStep | undefined>;
  onToolCall?: (
    call: AgentToolCallResult,
    phase: "running" | "settled",
    round: number,
  ) => void | Promise<void>;
  onToolRound?: (
    round: number,
    calls: AgentToolCallResult[],
  ) => void | Promise<void>;
  onNextModelRequest?: (round: number) => void | Promise<void>;
  onAssistantContent?: (content: string, round: number) => void;
}

export interface AgentTurnResult {
  content: string;
  finishReason: string;
  toolCallDetails: AgentToolCallResult[];
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  rounds: number;
}

export interface AgentRuntimeService {
  runTurn(input: AgentTurnInput): Promise<AgentTurnResult>;
}

declare module "yumeri" {
  interface Components {
    "agent-runtime": AgentRuntimeService;
  }
}

export const depend: string[] = [];
export const provide = ["agent-runtime"];

export function apply(ctx: Context) {
  const service: AgentRuntimeService = {
    async runTurn(input) {
      const conversation = [...input.messages];
      const toolCallDetails: AgentToolCallResult[] = [];
      let step = input.initial;
      let content = step.content;
      let finishReason = step.finishReason;
      let inputTokens = step.inputTokens;
      let outputTokens = step.outputTokens;
      let cachedInputTokens = step.cachedInputTokens;
      let rounds = 1;

      for (
        let index = 0;
        step.toolCalls.length > 0 && index < Math.max(0, input.maxToolRounds);
        index += 1
      ) {
        if (input.signal?.aborted) throw new Error("agent turn aborted");
        const round = index + 1;
        const calls: AgentToolCallResult[] = [];
        for (const rawCall of step.toolCalls) {
          const call = rawCall as Record<string, any>;
          const name = String(call.function?.name ?? call.name ?? "");
          const id = String(call.id ?? "");
          let args: unknown = {};
          try {
            const rawArguments = call.function?.arguments ?? call.arguments ?? call.input ?? "{}";
            args = typeof rawArguments === "string" ? JSON.parse(rawArguments) : rawArguments;
          } catch {
            args = {};
          }
          const tool = input.tools.find((item) => item.name === name);
          if (!tool?.execute) {
            const result: AgentToolCallResult = {
              id,
              name,
              status: "error",
              arguments: args,
              error: `unknown tool: ${name}`,
            };
            calls.push(result);
            await input.onToolCall?.(result, "settled", round);
            continue;
          }

          await input.onToolCall?.({ id, name, status: "ok", arguments: args }, "running", round);
          try {
            const value = await input.executeTool(tool, args);
            const result: AgentToolCallResult = {
              id,
              name,
              status: "ok",
              arguments: args,
              result: JSON.stringify(value ?? null),
            };
            calls.push(result);
            await input.onToolCall?.(result, "settled", round);
          } catch (error) {
            const result: AgentToolCallResult = {
              id,
              name,
              status: "error",
              arguments: args,
              error: error instanceof Error ? error.message : String(error),
            };
            calls.push(result);
            await input.onToolCall?.(result, "settled", round);
          }
        }

        toolCallDetails.push(...calls);
        await input.onToolRound?.(round, calls);
        conversation.push({
          role: "assistant",
          content: step.content,
          toolCalls: step.toolCalls.map((rawCall) => {
            const call = rawCall as Record<string, any>;
            return {
              id: String(call.id ?? ""),
              name: String(call.function?.name ?? call.name ?? ""),
              arguments: typeof (call.function?.arguments ?? call.arguments ?? call.input ?? "{}") === "string"
                ? String(call.function?.arguments ?? call.arguments ?? call.input ?? "{}")
                : JSON.stringify(call.function?.arguments ?? call.arguments ?? call.input ?? {}),
            };
          }),
        });
        conversation.push(
          ...calls.map((call) => ({
            role: "tool",
            content: call.result ?? JSON.stringify({ error: call.error }),
            toolCallId: call.id,
          })),
        );

        rounds = round + 1;
        await input.onNextModelRequest?.(rounds);
        const next = await input.requestNext(conversation, rounds);
        if (!next) {
          finishReason = "error";
          break;
        }
        step = next;
        content = step.content;
        finishReason = step.finishReason;
        inputTokens += step.inputTokens;
        outputTokens += step.outputTokens;
        cachedInputTokens += step.cachedInputTokens;
        input.onAssistantContent?.(step.content, rounds);
      }

      return {
        content,
        finishReason,
        toolCallDetails,
        inputTokens,
        outputTokens,
        cachedInputTokens,
        rounds,
      };
    },
  };
  ctx.registerComponent("agent-runtime", service);
}
