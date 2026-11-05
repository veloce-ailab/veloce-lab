import { Context } from "yumeri";

export interface AgentModelStep {
  content: string;
  toolCalls: unknown[];
  finishReason: string;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  /** Prompt-cache writes, which are billed above the input rate. */
  cacheWriteInputTokens?: number;
  /** The one-hour TTL subset of the above, billed at its own rate. */
  cacheWrite1hInputTokens?: number;
}

export interface AgentToolCallResult {
  id: string;
  round?: number;
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
  onAssistantContent?: (content: string, round: number) => void | Promise<void>;
}

export interface AgentTurnResult {
  content: string;
  finishReason: string;
  toolCallDetails: AgentToolCallResult[];
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  cacheWriteInputTokens: number;
  cacheWrite1hInputTokens: number;
  rounds: number;
  /**
   * The conversation as this turn left it.
   *
   * A caller that wants to keep going after `tool_round_limit` resumes from here
   * rather than rebuilding the assistant and tool messages by hand.
   */
  conversation: Array<Record<string, unknown>>;
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
      let cacheWriteInputTokens = step.cacheWriteInputTokens ?? 0;
      let cacheWrite1hInputTokens = step.cacheWrite1hInputTokens ?? 0;
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
          const id = String(call.id || `call-${round}-${calls.length + 1}`);
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
              round,
              name,
              status: "error",
              arguments: args,
              error: `unknown tool: ${name}`,
            };
            calls.push(result);
            await input.onToolCall?.(result, "settled", round);
            continue;
          }

          await input.onToolCall?.({ id, round, name, status: "ok", arguments: args }, "running", round);
          try {
            const value = await input.executeTool(tool, args);
            const result: AgentToolCallResult = {
              id,
              round,
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
              round,
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
                id: String(call.id || `call-${round}-${step.toolCalls.indexOf(rawCall) + 1}`),
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
        cacheWriteInputTokens += step.cacheWriteInputTokens ?? 0;
        cacheWrite1hInputTokens += step.cacheWrite1hInputTokens ?? 0;
        await input.onAssistantContent?.(step.content, rounds);
      }

      // The loop stops for one of two reasons, and they are not the same outcome: the
      // model has nothing left to call, or the round budget ran out with calls still
      // pending. Reporting the second as a normal stop is what makes a long task look
      // finished when it is only paused.
      if (finishReason !== "error" && step.toolCalls.length > 0)
        finishReason = "tool_round_limit";

      return {
        content,
        finishReason,
        toolCallDetails,
        inputTokens,
        outputTokens,
        cachedInputTokens,
        cacheWriteInputTokens,
        cacheWrite1hInputTokens,
        rounds,
        conversation,
      };
    },
  };
  ctx.registerComponent("agent-runtime", service);
}
