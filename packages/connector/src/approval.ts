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
