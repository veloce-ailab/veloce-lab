// Two things a conversation can carry besides its messages: a goal, and a plan.
//
// A goal is a standing instruction. It stays in the context until it is reported
// complete, and a run that ends while the goal is still open is followed by
// another one that asks the model to keep going — a model that stops halfway is
// the normal case, not an error, but it should not be the end of the work.
//
// Plan mode is the opposite: the conversation is not allowed to act until a plan
// has been written and approved, and the approved plan then stays in the context
// as the thing to carry out.
//
// Both are per session and both are contributed by a context provider, which is
// evaluated for every request. That is also what keeps them present after the
// transcript is compacted: compaction trims messages, the provider is rebuilt.
import { Context, Database, Schema, Session } from "yumeri";
import type {
  AdvancedChatService,
  ChatInput,
  ChatRunCompletion,
  ChatToolDefinition,
  HarnessSession,
} from "@velocelab/advanced-chat";
import "@velocelab/advanced-chat";
import "@velocelab/dashboard";

export const depend = ["database", "dashboard", "advanced-chat"];
export const provide = ["runtype"];

export interface RuntypeConfig {
  /** How many times an unfinished goal is pushed back to the model. */
  goalContinuations: string;
  /** How long to wait before the follow-up run, so the browser finishes this one. */
  continuationDelayMs: string;
  /** A plan longer than this is rejected rather than injected on every request. */
  maxPlanChars: string;
}

export const config: Schema<RuntypeConfig> = Schema.object({
  goalContinuations: Schema.string("How many times an unfinished goal is pushed back")
    .key("runtype.config.goalContinuations")
    .default("3"),
  continuationDelayMs: Schema.string("Delay before the follow-up run (milliseconds)")
    .key("runtype.config.continuationDelayMs")
    .default("800"),
  maxPlanChars: Schema.string("Longest plan accepted from the model")
    .key("runtype.config.maxPlanChars")
    .default("20000"),
});

/** The message that asks the model to keep going. Recognized verbatim. */
const GOAL_CONTINUATION = "请完成目标。";
/** The message that starts executing an approved plan. */
const PLAN_APPROVED = "计划已批准，请按计划开始执行。";

export interface RuntypeState {
  mode: "chat" | "plan";
  goal: string;
  goalDone: boolean;
  /** The approved plan, in Markdown. */
  plan: string;
  planSummary: string;
  /** A plan the model submitted and the user has not answered yet. */
  pendingPlan: string;
  pendingSummary: string;
  /** Follow-ups already spent on the current goal. */
  continuations: number;
  continuationLimit: number;
}

interface RuntypeSessionRow {
  user_id: number;
  session_id: string;
  mode: string;
  goal: string;
  goal_done: boolean;
  plan: string;
  plan_summary: string;
  pending_plan: string;
  pending_summary: string;
  continuations: number;
  updated_at: string;
}

declare module "@yumerijs/types" {
  interface Tables {
    runtype_sessions: RuntypeSessionRow;
  }
}

const truthy = (value: unknown) =>
  value === true || value === 1 || value === "1" || value === "true";

/**
 * A one-paragraph summary of a plan: what the approval card shows before the
 * user opens the whole thing. Derived from the plan itself rather than asked
 * for separately, so a model that writes a good plan cannot forget the summary.
 */
export function summarizePlan(plan: string, limit = 240): string {
  const plain = plan
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/^\s{0,3}(#{1,6}\s+|>\s?|[-*+]\s+|\d+\.\s+)/gm, "")
    .replace(/[*_`~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return plain.length > limit ? `${plain.slice(0, limit).trimEnd()}…` : plain;
}

/**
 * What the model is told about the goal and the plan. Short and imperative: this
 * text is sent with every request, so it costs tokens on each turn.
 */
export function runtypeContext(state: RuntypeState): string | undefined {
  const parts: string[] = [];
  if (state.mode === "plan") {
    parts.push(
      [
        "## Plan mode",
        "This conversation is in plan mode: investigate the request and write a plan. Do not edit files, run commands that change state, or otherwise act on the plan yet.",
        "When the plan is ready, call `runtype_exit_plan` with the complete plan in Markdown. The user approves it before anything is executed, so submitting the plan ends your turn.",
      ].join("\n"),
    );
  }
  if (state.pendingPlan) {
    parts.push(
      `## Plan awaiting approval\nThe user is reading the plan below. Do not execute it and do not submit it again; wait for their decision.\n\n${state.pendingPlan}`,
    );
  } else if (state.plan && state.mode !== "plan") {
    // In plan mode the conversation is writing a new plan; the old approved one
    // would read as permission to act on work that is now being replanned.
    parts.push(
      `## Approved plan\nThe user approved this plan. Carry it out, and say why before deviating from it.\n\n${state.plan}`,
    );
  }
  const goal = state.goal.trim();
  if (goal) {
    parts.push(
      state.goalDone
        ? `## Goal\n${goal}\n\nThe goal has been reported complete.`
        : `## Goal\n${goal}\n\nThis goal is not finished. Keep working until it is, and call \`runtype_goal_complete\` only once it is actually done. Ending the turn before then does not end the work: the session will ask you to continue.`,
    );
  }
  return parts.length ? parts.join("\n\n") : undefined;
}

export async function apply(ctx: Context, cfg: RuntypeConfig) {
  ctx.i18n({
    runtype: {
      settings: { zh: "目标与计划", en: "Goals and plans", ja: "ゴールと計画" },
      config: {
        goalContinuations: { zh: "未完成目标的续跑次数", en: "Follow-ups for an unfinished goal", ja: "未完了ゴールの再実行回数" },
        continuationDelayMs: { zh: "续跑前的等待（毫秒）", en: "Delay before the follow-up (ms)", ja: "再実行までの待機（ミリ秒）" },
        maxPlanChars: { zh: "计划最大字符数", en: "Longest accepted plan", ja: "計画の最大文字数" },
      },
    },
  });
  const db = ctx.component.database as Database;
  ctx.component.dashboard.addEntry({
    dev: new URL("../frontend/index.tsx", import.meta.url).pathname,
    prod: new URL("./frontend/runtype.js", import.meta.url).pathname,
    plugin: "runtype",
  });
  await db.extend(
    "runtype_sessions",
    {
      user_id: { type: "integer", nullable: false },
      session_id: { type: "string", nullable: false },
      mode: { type: "string", initial: "chat" },
      goal: { type: "text", initial: "" },
      goal_done: { type: "boolean", initial: false },
      plan: { type: "text", initial: "" },
      plan_summary: { type: "text", initial: "" },
      pending_plan: { type: "text", initial: "" },
      pending_summary: { type: "text", initial: "" },
      continuations: { type: "integer", initial: 0 },
      updated_at: "timestamp",
    },
    { unique: [["user_id", "session_id"]] },
  );

  const continuationLimit = Math.max(0, Number(cfg.goalContinuations) || 0);
  const continuationDelayMs = Math.max(0, Number(cfg.continuationDelayMs) || 0);
  const maxPlanChars = Math.max(1000, Number(cfg.maxPlanChars) || 20000);
  const chat = ctx.component["advanced-chat"] as AdvancedChatService;

  const fromRow = (row: RuntypeSessionRow | undefined): RuntypeState => ({
    mode: row?.mode === "plan" ? "plan" : "chat",
    goal: String(row?.goal ?? ""),
    goalDone: truthy(row?.goal_done),
    plan: String(row?.plan ?? ""),
    planSummary: String(row?.plan_summary ?? ""),
    pendingPlan: String(row?.pending_plan ?? ""),
    pendingSummary: String(row?.pending_summary ?? ""),
    continuations: Number(row?.continuations ?? 0),
    continuationLimit,
  });

  const rowOf = (userId: number, sessionId: string) =>
    db.selectOne("runtype_sessions", { user_id: userId, session_id: sessionId });

  const stateOf = async (userId: number, sessionId: string) =>
    fromRow(await rowOf(userId, sessionId));

  const write = async (
    userId: number,
    sessionId: string,
    patch: Partial<RuntypeSessionRow>,
  ) => {
    const now = new Date().toISOString();
    const existing = await rowOf(userId, sessionId);
    if (!existing) {
      try {
        await db.create("runtype_sessions", {
          user_id: userId,
          session_id: sessionId,
          mode: "chat",
          goal: "",
          goal_done: false,
          plan: "",
          plan_summary: "",
          pending_plan: "",
          pending_summary: "",
          continuations: 0,
          ...patch,
          updated_at: now,
        });
        return;
      } catch {
        // Another write created the row first; the update below is still what
        // this caller asked for.
      }
    }
    await db.update(
      "runtype_sessions",
      { user_id: userId, session_id: sessionId },
      { ...patch, updated_at: now },
    );
  };

  /** A run already in flight owns the conversation; a follow-up waits for it. */
  const sessionBusy = async (userId: number, sessionId: string) => {
    const running = await db.select("advanced_chat_runs", {
      session_id: sessionId,
      user_id: userId,
      status: "running",
    });
    return running.length > 0;
  };

  /**
   * A new turn in the conversation, started by the server. It carries only the
   * message: the history, the agent and the model all come from the session, the
   * same way they would for a message the user typed.
   */
  const startRun = async (userId: number, sessionId: string, prompt: string) => {
    const session = (await db.selectOne("advanced_chat_sessions", {
      id: sessionId,
      user_id: userId,
    })) as HarnessSession | undefined;
    // Nothing to continue: a goal set on a draft session whose first message has
    // not been sent yet, or a session that was deleted meanwhile.
    if (!session) return;
    // Agent groups fan a run out to their members; a group turn has no single
    // model of its own to continue with.
    if (String(session.run_mode ?? "chat") === "agent_group") return;
    const input: ChatInput = {
      sessionId,
      model: String(session.model_name ?? ""),
      messages: [{ role: "user", content: prompt }],
      userChannelId: Number(session.user_channel_id ?? 0) || undefined,
      maxTokens: Number(session.max_tokens ?? 0) || undefined,
      temperature: session.temperature == null ? undefined : Number(session.temperature),
      reasoningEffort: String(session.reasoning_effort ?? ""),
      mode: String(session.run_mode ?? "chat"),
      autoCompressContext: truthy(session.auto_compress_context) || session.auto_compress_context === undefined,
      stream: false,
      // Progress is written as rounds land, so the open page shows the follow-up
      // working instead of a frozen conversation.
      progressStream: true,
    };
    await chat.complete(userId, input);
  };

  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  /** A follow-up runs after the response is gone, so its failure only has the log. */
  const reportFailure = (what: string) => (error: unknown) =>
    console.error(`[runtype] ${what} failed:`, error instanceof Error ? error.message : error);

  const afterRun = async (completion: ChatRunCompletion) => {
    const { userId, sessionId, userMessage } = completion;
    if (!sessionId) return;
    // The turn ended on a question or an approval request: the user is the one
    // who has to move, and pushing the goal forward would talk over them.
    if (completion.awaitingUser) return;
    const state = await stateOf(userId, sessionId);
    const goal = state.goal.trim();
    if (!goal || state.goalDone) return;
    // Only the follow-up of a previous follow-up continues the chain; anything
    // else is the user speaking again, which starts the budget over.
    const chained = userMessage.trim() === GOAL_CONTINUATION;
    const spent = chained ? state.continuations : 0;
    if (spent >= continuationLimit) return;
    if (await sessionBusy(userId, sessionId)) return;
    await write(userId, sessionId, { continuations: spent + 1 });
    // The browser is still finishing the turn that just ended; starting the next
    // request inside it would make the page juggle two runs at once.
    if (continuationDelayMs) await sleep(continuationDelayMs);
    if (await sessionBusy(userId, sessionId)) return;
    // The user may have completed, edited or cleared the goal in the meantime.
    const latest = await stateOf(userId, sessionId);
    if (!latest.goal.trim() || latest.goalDone) return;
    await startRun(userId, sessionId, GOAL_CONTINUATION);
  };

  ctx.on("advanced-chat.run-completed", async (completion: ChatRunCompletion) => {
    // Not awaited: the run that ended must not be held open by the one it
    // triggers, and its own failure is not the finished run's failure.
    void afterRun(completion).catch(reportFailure("the goal follow-up"));
  });

  chat.registerContextProvider({
    id: "runtype",
    async provide({ userId, sessionId }) {
      if (!sessionId) return undefined;
      return runtypeContext(await stateOf(userId, sessionId));
    },
  });

  const tools: ChatToolDefinition[] = [
    {
      name: "runtype_exit_plan",
      description:
        "Leave plan mode by submitting the plan you wrote, in Markdown. The user has to approve it before the conversation may act, so calling this ends your turn: do not start carrying the plan out in the same turn.",
      parameters: {
        type: "object",
        properties: {
          plan: { type: "string", description: "The complete plan, in Markdown." },
          summary: {
            type: "string",
            description: "One or two sentences the user reads first. Derived from the plan when omitted.",
          },
        },
        required: ["plan"],
      },
      execute: async (input, context) => {
        const sessionId = String(context.sessionId ?? "");
        if (!sessionId) throw Error("This tool needs a session");
        const state = await stateOf(context.userId, sessionId);
        if (state.mode !== "plan") throw Error("This conversation is not in plan mode");
        const plan = String((input as { plan?: unknown } | undefined)?.plan ?? "").trim();
        if (!plan) throw Error("A plan is required to leave plan mode");
        if (plan.length > maxPlanChars) throw Error(`The plan is longer than ${maxPlanChars} characters`);
        const summary = String((input as { summary?: unknown } | undefined)?.summary ?? "").trim();
        await write(context.userId, sessionId, {
          pending_plan: plan,
          pending_summary: summary || summarizePlan(plan),
        });
        return {
          status: "pending_approval",
          message:
            "The plan is with the user for approval. End your turn and wait: do not execute any step of it yet.",
        };
      },
    },
    {
      name: "runtype_goal_complete",
      description:
        "Report that the session goal is finished. Call it only when the goal is really done; until then the conversation is asked to keep going.",
      parameters: {
        type: "object",
        properties: {
          summary: { type: "string", description: "What was done, in one or two sentences." },
        },
        required: ["summary"],
      },
      execute: async (input, context) => {
        const sessionId = String(context.sessionId ?? "");
        if (!sessionId) throw Error("This tool needs a session");
        const state = await stateOf(context.userId, sessionId);
        if (!state.goal.trim()) throw Error("This session has no goal");
        const summary = String((input as { summary?: unknown } | undefined)?.summary ?? "").trim();
        await write(context.userId, sessionId, { goal_done: true });
        return { status: "goal_complete", summary };
      },
    },
  ];
  for (const tool of tools) chat.registerTool(tool);

  const owner = (session: Session) =>
    (session.properties.user as { id?: number } | undefined)?.id;
  const body = async (session: Session) =>
    (await session.parseRequestBody()) as Record<string, unknown>;

  ctx
    .route("/api/runtype/state")
    .methods("GET")
    .action(async (session: Session, query: URLSearchParams) => {
      const userId = owner(session);
      const sessionId = String(query.get("session_id") ?? "").trim();
      if (userId === undefined) return;
      if (!sessionId) {
        session.status = 400;
        session.respond({ error: "session_id is required" }, "json");
        return;
      }
      session.respond(await stateOf(userId, sessionId), "json");
    });

  ctx
    .route("/api/runtype/mode")
    .methods("PUT")
    .action(async (session: Session) => {
      const userId = owner(session);
      const input = await body(session);
      const sessionId = String(input.session_id ?? "").trim();
      if (userId === undefined) return;
      if (!sessionId) {
        session.status = 400;
        session.respond({ error: "session_id is required" }, "json");
        return;
      }
      const mode = input.mode === "plan" ? "plan" : "chat";
      // Leaving plan mode by hand abandons the plan that was waiting: it was
      // never approved, and the conversation is allowed to act again.
      await write(
        userId,
        sessionId,
        mode === "chat"
          ? { mode, pending_plan: "", pending_summary: "" }
          : { mode },
      );
      session.respond(await stateOf(userId, sessionId), "json");
    });

  ctx
    .route("/api/runtype/goal")
    .methods("PUT")
    .action(async (session: Session) => {
      const userId = owner(session);
      const input = await body(session);
      const sessionId = String(input.session_id ?? "").trim();
      if (userId === undefined) return;
      if (!sessionId) {
        session.status = 400;
        session.respond({ error: "session_id is required" }, "json");
        return;
      }
      const goal = String(input.goal ?? "").trim().slice(0, 4000);
      // Editing the goal starts it over: the old completion does not apply, and
      // neither does the budget the previous goal spent.
      await write(userId, sessionId, {
        goal,
        goal_done: false,
        continuations: 0,
      });
      session.respond(await stateOf(userId, sessionId), "json");
    });

  ctx
    .route("/api/runtype/plan")
    .methods("PUT")
    .action(async (session: Session) => {
      const userId = owner(session);
      const input = await body(session);
      const sessionId = String(input.session_id ?? "").trim();
      if (userId === undefined) return;
      if (!sessionId) {
        session.status = 400;
        session.respond({ error: "session_id is required" }, "json");
        return;
      }
      // The user is done with an approved plan: drop it so it stops being
      // injected on every request.
      if (input.clear === true) {
        await write(userId, sessionId, { plan: "", plan_summary: "" });
        session.respond(await stateOf(userId, sessionId), "json");
        return;
      }
      const state = await stateOf(userId, sessionId);
      if (!state.pendingPlan) {
        session.status = 409;
        session.respond({ error: "There is no plan waiting for approval" }, "json");
        return;
      }
      const feedback = String(input.feedback ?? "").trim();
      const approved = input.approved === true;
      // The page can run the next turn itself, which streams it like any other
      // turn. When it says so, the prompt comes back in the response instead of
      // being sent here — one turn, run by whoever showed up first.
      const deferRun = input.defer_run === true;

      /** Answers with the state, plus the turn the page should send, if any. */
      const answer = async (prompt?: string) => {
        const next = await stateOf(userId, sessionId);
        session.respond(prompt ? { ...next, run: { prompt } } : next, "json");
      };

      if (approved) {
        // The plan becomes the thing to carry out, and the conversation leaves
        // plan mode; the follow-up run picks the plan up from the context.
        await write(userId, sessionId, {
          plan: state.pendingPlan,
          plan_summary: state.pendingSummary,
          pending_plan: "",
          pending_summary: "",
          mode: "chat",
          continuations: 0,
        });
        if (deferRun) {
          await answer(PLAN_APPROVED);
          return;
        }
        await answer();
        if (!(await sessionBusy(userId, sessionId))) {
          void startRun(userId, sessionId, PLAN_APPROVED).catch(reportFailure("the approved plan run"));
        }
        return;
      }
      // A rejected plan is dropped and the conversation stays in plan mode, so
      // the model can try again — with the feedback when there is any.
      await write(userId, sessionId, {
        pending_plan: "",
        pending_summary: "",
        mode: "plan",
      });
      const revision = feedback
        ? `计划未获批准。请按以下意见修改计划，然后再次调用 runtype_exit_plan 提交：\n${feedback}`
        : "";
      if (revision && deferRun) {
        await answer(revision);
        return;
      }
      await answer();
      if (revision && !(await sessionBusy(userId, sessionId))) {
        void startRun(userId, sessionId, revision).catch(reportFailure("the plan revision run"));
      }
    });
}
