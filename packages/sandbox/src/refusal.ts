// How a kernel refusal is recognised in a command's output.
//
// The sandbox itself says nothing: a write outside the workspace simply fails
// with EROFS or EACCES and the command's own shell prints the message. That
// message follows the command's locale, so an English-only check would silently
// stop working on most of this project's machines. Recognising a refusal is only
// ever used to *add* an explanation, never to decide whether something runs.
import type { SandboxBackend } from "./backends.js";

const REFUSAL_MARKERS =
  /read-only file system|operation not permitted|permission denied|eperm|erofs|只读文件系统|权限不够|不允许的操作|読み取り専用|許可されていません/i;

/** One line that turns "Read-only file system" into a statement about policy. */
export const SANDBOX_HINT =
  "Sandbox: the command may only write inside its workspace; the kernel refused everything else.";

/** Whether the output carries a refusal that came from the sandbox. */
export function sandboxRefusal(output: string): boolean {
  return REFUSAL_MARKERS.test(output);
}

/**
 * The output as the model reads it: a refused command keeps its own message and
 * gains one line saying which boundary it hit, so the refusal is not mistaken
 * for a broken machine.
 */
export function withSandboxHint(
  output: string,
  exitCode: number,
  backend: SandboxBackend | undefined,
): string {
  if (!backend || exitCode === 0) return output;
  if (!sandboxRefusal(output)) return output;
  return `${output}\n${SANDBOX_HINT}`.trim();
}
