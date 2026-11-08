// What a session's approval mode means for connector work.
//
// One name covers two mechanisms: whether a queued task has to wait for a
// decision before it runs, and whether a command runs inside the kernel sandbox.
// Both producers of tasks (`device-local`, `workspace`, the chat runtime) and
// both executors (the in-process local connector and the external agent) have to
// agree on that, so the vocabulary lives here rather than being spelled out as
// `approval_mode ?? "manual"` in every call site.
//
//   sandbox      workspace-confined work runs unattended; a command that reaches
//                outside its workspace is refused by the kernel, not by a prompt
//   full_access  nothing is confined and nothing is asked
//   assistant    the configured approval assistant decides, so the task waits
//
// `manual` and `safe` are retired names from before the sandbox existed. They
// resolve to `sandbox`: a stored session that still carries one must not fall
// back to asking the user for every command, and it must not silently widen to
// full access either.
//
// A sandbox-mode caller can *ask* for one command to leave the boundary (see
// `sandboxEscalationRequest` below). Asking is not a mode: it does not change
// what the session means, it turns one task into a question the user answers,
// and only that answer lets the task run unconfined.

/** The modes a new session may carry; `manual`/`safe` are accepted but never offered. */
export const CONNECTOR_APPROVAL_MODES = [
  "sandbox",
  "full_access",
  "assistant",
] as const;

export type ConnectorApprovalMode = (typeof CONNECTOR_APPROVAL_MODES)[number];

/** Where a session starts: workspace-confined work needs no approval. */
export const DEFAULT_CONNECTOR_APPROVAL_MODE: ConnectorApprovalMode = "sandbox";

/**
 * The mode a tool call carries. `auto_approve` is the older flag that predates
 * modes; it still means the same thing full access does today.
 */
export function connectorApprovalMode(
  input: Record<string, unknown> | undefined,
  autoApprove = false,
): ConnectorApprovalMode {
  const declared = String(input?.approval_mode ?? "").trim();
  if (declared === "sandbox" || declared === "full_access" || declared === "assistant")
    return declared;
  if (autoApprove || input?.auto_approve === true) return "full_access";
  return DEFAULT_CONNECTOR_APPROVAL_MODE;
}

/** Whether the task waits for a decision instead of running as soon as it is queued. */
export function connectorTaskNeedsApproval(
  input: Record<string, unknown> | undefined,
  autoApprove = false,
): boolean {
  return connectorApprovalMode(input, autoApprove) === "assistant";
}

/** Whether the executor has to run the work inside the kernel sandbox. */
export function connectorTaskIsSandboxed(
  input: Record<string, unknown> | undefined,
  autoApprove = false,
): boolean {
  return connectorApprovalMode(input, autoApprove) === "sandbox";
}

/**
 * The tool argument with which a sandbox-mode session asks for one command to
 * run outside its workspace.
 *
 * Sandbox mode answers "may this write there?" with the kernel instead of a
 * prompt, so a command that genuinely cannot stay inside — a package manager
 * writing to a shared cache, a tool that needs a system path — used to be a dead
 * end. This argument is the ask, and nothing else: it does not carry a decision
 * with it. The task it creates always waits for the user, and the executor reads
 * the decision from the task row, not from the arguments that were asked with.
 */
export const SANDBOX_ESCALATION_ARGUMENT = "request_full_access";

/** The one-line reason the approval prompt shows next to the command. */
export const SANDBOX_ESCALATION_REASON_ARGUMENT = "full_access_reason";

/**
 * The payload key that records the ask and the user's answer.
 *
 * It lives inside the task row because only the server writes that row. The
 * arguments are model output, so a `sandbox_escalation: { approved: true }` the
 * model invented must be replaced rather than believed — `withSandboxEscalation`
 * is what makes sure of that.
 */
export const SANDBOX_ESCALATION_KEY = "sandbox_escalation";

/** One request to run a task outside the sandbox, and its decision. */
export interface SandboxEscalation {
  /** Why the command cannot stay inside the workspace; may be empty. */
  reason: string;
  /** Set by the decision route alone, when the user approved this task. */
  approved: boolean;
  /** When the user approved it. */
  approved_at?: string;
}

const ESCALATION_REASON_CHARS = 300;

const escalationText = (value: unknown) =>
  String(value ?? "").replace(/\s+/g, " ").trim().slice(0, ESCALATION_REASON_CHARS);

/**
 * The escalation a tool call asks for, or nothing.
 *
 * Only sandbox work has a boundary to leave: `full_access` already runs
 * unconfined and `assistant` already asks, so in neither one does the request
 * turn into a prompt about a sandbox the session is not in.
 */
export function sandboxEscalationRequest(
  input: Record<string, unknown> | undefined,
): SandboxEscalation | undefined {
  if (!input || input[SANDBOX_ESCALATION_ARGUMENT] !== true) return undefined;
  if (connectorApprovalMode(input) !== "sandbox") return undefined;
  return {
    reason: escalationText(input[SANDBOX_ESCALATION_REASON_ARGUMENT]),
    approved: false,
  };
}

/** The escalation a task row carries, whatever its decision. */
export function sandboxEscalation(
  payload: Record<string, unknown> | undefined,
): SandboxEscalation | undefined {
  const value = payload?.[SANDBOX_ESCALATION_KEY];
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const approvedAt = typeof record.approved_at === "string" ? record.approved_at : "";
  return {
    reason: escalationText(record.reason),
    approved: record.approved === true,
    ...(approvedAt ? { approved_at: approvedAt } : {}),
  };
}

/** Whether the user approved this task leaving the sandbox. */
export function sandboxEscalationGranted(
  payload: Record<string, unknown> | undefined,
): boolean {
  return sandboxEscalation(payload)?.approved === true;
}

/**
 * The payload as it is stored, with the escalation record written by the server.
 *
 * Any escalation the caller supplied is dropped first: the record is a decision
 * log, and a decision only exists if the connector wrote it.
 */
export function withSandboxEscalation(
  payload: Record<string, unknown> | undefined,
  escalation: SandboxEscalation | undefined,
): Record<string, unknown> {
  const next = { ...(payload ?? {}) };
  delete next[SANDBOX_ESCALATION_KEY];
  if (!escalation) return next;
  next[SANDBOX_ESCALATION_KEY] = {
    // Normalised here so the one place that writes the record is also the one
    // place that decides how long a reason may be.
    reason: escalationText(escalation.reason),
    approved: escalation.approved === true,
    ...(escalation.approved_at ? { approved_at: escalation.approved_at } : {}),
  };
  return next;
}
