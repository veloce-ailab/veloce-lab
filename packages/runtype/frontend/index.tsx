// What a conversation shows of its goal and its plan: a row directly above the
// composer, and the dialogs behind it.
//
// The state belongs to the server (`@velocelab/runtype`): the model writes the
// plan and marks the goal done through tools, the user approves from here, and a
// reload or a second window sees the same thing. The page only reads and writes
// it, and polls while it is open — a plan arrives in the middle of a run, when no
// component on this page is re-rendered.
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Check, FileText, Flag, Pencil, Target, X } from "lucide-react"
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Textarea,
  api,
  registerComposerCommand,
  useI18n,
  useToast,
  type DashboardContext,
} from "@velocelab/dashboard/frontend"
import type { ChatSlotData } from "@velocelab/advanced-chat/frontend/slots"
import { Markdown } from "./markdown"

interface RuntypeState {
  mode: "chat" | "plan"
  goal: string
  goalDone: boolean
  plan: string
  planSummary: string
  pendingPlan: string
  pendingSummary: string
  continuations: number
  continuationLimit: number
}

const EMPTY: RuntypeState = {
  mode: "chat",
  goal: "",
  goalDone: false,
  plan: "",
  planSummary: "",
  pendingPlan: "",
  pendingSummary: "",
  continuations: 0,
  continuationLimit: 0,
}

function copyFor(language: string) {
  const zh = language === "zh"
  return {
    goal: zh ? "目标" : "Goal",
    goalTitle: zh ? "会话目标" : "Session goal",
    goalHint: zh
      ? "这个会话要达成什么？目标会一直留在上下文里，完成后由 AI 调用 runtype_goal_complete 报告。"
      : "What should this conversation achieve? The goal stays in the context until the AI reports it done with runtype_goal_complete.",
    goalPlaceholder: zh ? "例如：把选课系统迁移到新的 API，并补齐测试" : "e.g. Migrate the enrolment system to the new API and cover it with tests",
    clearGoal: zh ? "清除目标" : "Clear goal",
    save: zh ? "保存" : "Save",
    saving: zh ? "保存中" : "Saving",
    done: zh ? "已完成" : "Done",
    planMode: zh ? "计划模式" : "Plan mode",
    leavePlanMode: zh ? "退出计划模式" : "Leave plan mode",
    planAwaiting: zh ? "计划待审批" : "Plan awaiting approval",
    planAwaitingHint: zh ? "点击查看完整计划" : "Click to read the whole plan",
    approvedPlan: zh ? "查看计划" : "View plan",
    clearPlan: zh ? "清除计划" : "Clear plan",
    approvedPlanTitle: zh ? "已批准的计划" : "Approved plan",
    approve: zh ? "批准" : "Approve",
    reject: zh ? "驳回" : "Reject",
    feedback: zh ? "修改意见（可选，会发给 AI 让它重写计划）" : "Feedback (optional; the AI revises the plan with it)",
    feedbackPlaceholder: zh ? "哪里需要改？" : "What should change?",
    close: zh ? "关闭" : "Close",
    saveGoalFailed: zh ? "保存目标失败" : "Could not save the goal",
    modeFailed: zh ? "切换计划模式失败" : "Could not switch plan mode",
    decideFailed: zh ? "提交计划决定失败" : "Could not record that decision",
    commandGoal: zh ? "设置目标" : "Set a goal",
    commandGoalHint: zh ? "目标会一直留在上下文里，直到完成" : "The goal stays in the context until it is done",
    commandPlan: zh ? "计划模式" : "Plan mode",
    commandPlanHint: zh ? "先写计划，用户批准后再执行" : "Write a plan first; act once it is approved",
    commandLeavePlan: zh ? "退出计划模式" : "Leave plan mode",
    commandLeavePlanHint: zh ? "不再限制动作，可以继续执行" : "Stop restricting actions and continue",
  }
}

/**
 * The bar keeps the slash commands too, so its dialogs are what they open. The
 * commands are registered while a conversation is on screen and dropped with it,
 * which is also what makes `/plan` know whether plan mode is already on.
 */
function RuntypeBar(props: Record<string, unknown>) {
  const data = props as ChatSlotData
  const sessionId = data.session?.id || ""
  const { language } = useI18n()
  const { error } = useToast()
  const copy = useMemo(() => copyFor(language), [language])
  const [state, setState] = useState<RuntypeState | null>(null)
  const [goalDraft, setGoalDraft] = useState("")
  const [editingGoal, setEditingGoal] = useState(false)
  const [viewing, setViewing] = useState<"pending" | "approved" | null>(null)
  const [feedback, setFeedback] = useState("")
  const [busy, setBusy] = useState(false)
  const sessionRef = useRef(sessionId)
  sessionRef.current = sessionId

  const apply = useCallback((value: unknown) => {
    if (!value || typeof value !== "object") return
    setState({ ...EMPTY, ...(value as Partial<RuntypeState>) })
  }, [])

  const reload = useCallback(async () => {
    const current = sessionRef.current
    if (!current) return
    try {
      const response = await api.get("/runtype/state", { params: { session_id: current } })
      if (sessionRef.current === current) apply(response.data)
    } catch {
      // A conversation whose state cannot be read simply shows no bar.
    }
  }, [apply])

  useEffect(() => {
    setState(null)
    if (!sessionId) return
    void reload()
    // The model writes this state mid-run, when nothing on the page has changed
    // in a way this component can observe.
    const timer = window.setInterval(() => void reload(), 4000)
    const onVisible = () => { if (document.visibilityState === "visible") void reload() }
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [sessionId, reload])

  // A finished run (the plan tool ran, the goal was completed) is the moment the
  // state changes; the transcript's length is the cheapest signal for it.
  const messageCount = data.messages?.length ?? 0
  useEffect(() => { void reload() }, [messageCount, reload])

  const saveGoal = async (goal: string) => {
    if (!sessionId) return
    setBusy(true)
    try {
      const response = await api.put("/runtype/goal", { session_id: sessionId, goal })
      apply(response.data)
      setEditingGoal(false)
    } catch {
      error(copy.saveGoalFailed)
    } finally {
      setBusy(false)
    }
  }

  const setMode = async (mode: "chat" | "plan") => {
    if (!sessionId) return
    try {
      const response = await api.put("/runtype/mode", { session_id: sessionId, mode })
      apply(response.data)
    } catch {
      error(copy.modeFailed)
    }
  }

  const decide = async (approved: boolean, reason = "") => {
    if (!sessionId) return
    setBusy(true)
    try {
      // The page runs the turn after a decision when it can, so the answer
      // streams into the transcript instead of appearing only once it is over.
      // Without that handle the server runs it, which also covers a page that is
      // not open at all.
      const deferRun = Boolean(data.sendMessage)
      const response = await api.put("/runtype/plan", {
        session_id: sessionId,
        approved,
        feedback: reason,
        defer_run: deferRun,
      })
      apply(response.data)
      setViewing(null)
      setFeedback("")
      const prompt = (response.data as { run?: { prompt?: string } } | undefined)?.run?.prompt
      if (deferRun && prompt) data.sendMessage?.(prompt)
    } catch {
      error(copy.decideFailed)
    } finally {
      setBusy(false)
    }
  }

  const clearPlan = async () => {
    if (!sessionId) return
    try {
      const response = await api.put("/runtype/plan", { session_id: sessionId, clear: true })
      apply(response.data)
      setViewing(null)
    } catch {
      error(copy.decideFailed)
    }
  }

  const openGoalEditor = () => {
    setGoalDraft(state?.goal ?? "")
    setEditingGoal(true)
  }

  const planMode = state?.mode === "plan"
  useEffect(() => {
    if (!sessionId) return
    return registerComposerCommand({
      id: "runtype.goal",
      name: "goal",
      label: copy.commandGoal,
      hint: copy.commandGoalHint,
      kind: "action",
      onSelect: openGoalEditor,
    })
  }, [sessionId, copy, state?.goal])

  useEffect(() => {
    if (!sessionId) return
    return registerComposerCommand({
      id: "runtype.plan",
      name: "plan",
      label: planMode ? copy.commandLeavePlan : copy.commandPlan,
      hint: planMode ? copy.commandLeavePlanHint : copy.commandPlanHint,
      kind: "action",
      onSelect: () => void setMode(planMode ? "chat" : "plan"),
    })
  }, [sessionId, copy, planMode])

  if (!sessionId || !state) return null
  const goal = state.goal.trim()
  const hasPlan = Boolean(state.plan) || Boolean(state.pendingPlan) || planMode
  if (!goal && !hasPlan) return null

  return (
    <div className="flex w-full flex-wrap items-center gap-2 text-xs">
      {planMode && (
        <span className="flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-2.5 py-1 font-medium text-primary">
          <Flag size={13} />
          {copy.planMode}
          <button
            type="button"
            className="ml-0.5 rounded-full p-0.5 opacity-70 hover:bg-primary/10 hover:opacity-100"
            onClick={() => void setMode("chat")}
            title={copy.leavePlanMode}
          >
            <X size={12} />
          </button>
        </span>
      )}

      {state.pendingPlan ? (
        <div className="flex w-full items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-amber-900 dark:text-amber-100">
          <FileText size={15} className="mt-0.5 shrink-0" />
          <button
            type="button"
            className="min-w-0 flex-1 text-left"
            onClick={() => setViewing("pending")}
            title={copy.planAwaitingHint}
          >
            <span className="block font-medium">{copy.planAwaiting}</span>
            <span className="mt-0.5 block line-clamp-2 opacity-80">{state.pendingSummary || copy.planAwaitingHint}</span>
          </button>
          <span className="flex shrink-0 items-center gap-1">
            <Button size="sm" className="h-6 px-2" disabled={busy} onClick={() => void decide(true)}>
              <Check size={13} />{copy.approve}
            </Button>
            <Button size="sm" variant="ghost" className="h-6 px-2" disabled={busy} onClick={() => setViewing("pending")}>
              <X size={13} />{copy.reject}
            </Button>
          </span>
        </div>
      ) : state.plan ? (
        <span className="flex items-center gap-1 rounded-full border px-2.5 py-1">
          <button
            type="button"
            className="flex min-w-0 items-center gap-1.5 hover:text-foreground"
            onClick={() => setViewing("approved")}
            title={state.planSummary || copy.approvedPlan}
          >
            <FileText size={13} />
            <span className="max-w-[28ch] truncate">{state.planSummary || copy.approvedPlan}</span>
          </button>
          <button
            type="button"
            className="rounded-full p-0.5 opacity-60 hover:bg-muted hover:opacity-100"
            onClick={() => void clearPlan()}
            title={copy.clearPlan}
            aria-label={copy.clearPlan}
          >
            <X size={11} />
          </button>
        </span>
      ) : null}

      {goal && (
        <button
          type="button"
          className="flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 hover:bg-muted"
          onClick={openGoalEditor}
          title={goal}
        >
          <Target size={13} className={state.goalDone ? "text-emerald-500" : "text-primary"} />
          <span className="max-w-[38ch] truncate">{goal}</span>
          {state.goalDone ? (
            <span className="text-emerald-600">{copy.done}</span>
          ) : state.continuations > 0 && state.continuationLimit > 0 ? (
            <span className="tabular-nums text-muted-foreground">{state.continuations}/{state.continuationLimit}</span>
          ) : null}
          <Pencil size={11} className="opacity-60" />
        </button>
      )}

      <Dialog open={editingGoal} onOpenChange={setEditingGoal}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Target size={16} />{copy.goalTitle}</DialogTitle>
            <DialogDescription>{copy.goalHint}</DialogDescription>
          </DialogHeader>
          <Textarea
            autoFocus
            className="min-h-32"
            value={goalDraft}
            placeholder={copy.goalPlaceholder}
            onChange={(event) => setGoalDraft(event.target.value)}
          />
          <DialogFooter>
            {state.goal && (
              <Button variant="ghost" size="sm" disabled={busy} onClick={() => void saveGoal("")}>{copy.clearGoal}</Button>
            )}
            <Button size="sm" disabled={busy} onClick={() => void saveGoal(goalDraft)}>{busy ? copy.saving : copy.save}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={viewing !== null} onOpenChange={(open) => { if (!open) { setViewing(null); setFeedback("") } }}>
        <DialogContent className="max-h-[80vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm">
              <FileText size={16} />
              {viewing === "pending" ? copy.planAwaiting : copy.approvedPlanTitle}
            </DialogTitle>
            {viewing === "pending" && <DialogDescription>{copy.planAwaitingHint}</DialogDescription>}
          </DialogHeader>
          <Markdown text={viewing === "pending" ? state.pendingPlan : state.plan} />
          {viewing === "pending" && (
            <>
              <Textarea
                className="min-h-20"
                value={feedback}
                placeholder={copy.feedbackPlaceholder}
                aria-label={copy.feedback}
                onChange={(event) => setFeedback(event.target.value)}
              />
              <DialogFooter>
                <Button variant="ghost" size="sm" disabled={busy} onClick={() => void decide(false, feedback)}>
                  <X size={14} />{copy.reject}
                </Button>
                <Button size="sm" disabled={busy} onClick={() => void decide(true)}>
                  <Check size={14} />{copy.approve}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default function apply(ctx: DashboardContext) {
  // Directly above the composer: the goal and the plan are what the next message
  // is judged against, so they belong beside the input rather than in the
  // transcript, where they would scroll away.
  ctx.slot("chat.composer.above", RuntypeBar, "runtype.bar", 10, "/chat")
}
