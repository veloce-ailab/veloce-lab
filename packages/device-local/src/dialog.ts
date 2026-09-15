// Opens a folder-selection window on the machine running this instance.
//
// There is no portable Node API for this, so the platform's own picker is
// spawned: PowerShell and `pick-folder.ps1` on Windows (which shows the modern
// Explorer-style dialog), `choose folder` via osascript on macOS, zenity or
// kdialog on Linux. `DEVICE_LOCAL_PICK_COMMAND` replaces the whole thing with a
// command that is handed the initial folder as its only argument and prints the
// chosen folder — which is how a headless server, a container or a test supplies
// its own picker.
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);

export interface FolderDialogOptions {
  title?: string;
  initialPath?: string;
  timeoutMs?: number;
}

export interface FolderDialogResult {
  path: string;
  cancelled: boolean;
}

export interface FolderPickerCommand {
  command: string;
  args: string[];
}

/** Quotes a value for an AppleScript double-quoted string literal. */
const appleScriptLiteral = (value: string) =>
  `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

/**
 * The picker script shipped with this plugin. It sits at the package root, one
 * level above both `src/dialog.ts` and its compiled `dist/dialog.js`, so the
 * same relative lookup works whether the plugin was loaded from source or build.
 */
export function windowsPickerScriptPath(): string {
  const override = (process.env.DEVICE_LOCAL_PICK_SCRIPT ?? "").trim();
  if (override) return override;
  return fileURLToPath(new URL("../pick-folder.ps1", import.meta.url));
}

function macScript(options: FolderDialogOptions): string {
  const title = options.title ?? "Select a folder";
  const location = options.initialPath
    ? ` default location POSIX file ${appleScriptLiteral(options.initialPath)}`
    : "";
  return `POSIX path of (choose folder with prompt ${appleScriptLiteral(title)}${location})`;
}

/**
 * Splits a command line the way a shell would for the simple cases that appear
 * here, so an override containing a quoted path with spaces still works.
 */
export function splitCommandLine(value: string): string[] {
  const parts: string[] = [];
  let current = "";
  let quote = "";
  for (const character of value.trim()) {
    if (quote) {
      if (character === quote) quote = "";
      else current += character;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (/\s/.test(character)) {
      if (current) parts.push(current);
      current = "";
      continue;
    }
    current += character;
  }
  if (current) parts.push(current);
  return parts;
}

/** What a finished picker run means, as a pure function of its outcome. */
export function interpretPick(outcome: {
  stdout?: string;
  failed?: boolean;
  failureCode?: string | number;
  message?: string;
  killed?: boolean;
}): FolderDialogResult {
  const printed = String(outcome.stdout ?? "").trim();
  if (!outcome.failed) return { path: printed, cancelled: printed === "" };
  // A killed process is the timeout, which is worth reporting rather than
  // pretending the user dismissed the window.
  if (outcome.killed) throw Error("The folder dialog timed out");
  if (outcome.failureCode === "ENOENT")
    throw Error(
      `Cannot open a folder window: ${outcome.message ?? "the picker command"} is not available on this machine`,
    );
  // Exit code 1 with nothing on stdout is how every picker reports a dismissal.
  // Any other failure — a missing display, a crash, a refused spawn — is a real
  // error and must not be dressed up as a cancellation.
  if (outcome.failureCode === 1 && !printed) return { path: "", cancelled: true };
  if (printed) return { path: printed, cancelled: false };
  throw Error(
    `The folder window could not be opened${outcome.message ? `: ${outcome.message}` : ""}`,
  );
}

/**
 * The command that opens this platform's folder window. Exported so the choice
 * can be asserted without opening anything.
 */
export function folderPickerCommand(
  platform: NodeJS.Platform,
  options: FolderDialogOptions = {},
): FolderPickerCommand | undefined {
  const override = (process.env.DEVICE_LOCAL_PICK_COMMAND ?? "").trim();
  if (override) {
    const [command, ...args] = splitCommandLine(override);
    return {
      command,
      args: options.initialPath ? [...args, options.initialPath] : args,
    };
  }
  if (platform === "win32")
    return {
      // Windows PowerShell rather than pwsh: 5.1 is always present, and -STA is
      // required or the shell dialogs refuse to open on a multi-threaded
      // apartment thread. The script itself picks the dialog, preferring the
      // modern IFileOpenDialog over the two older fallbacks.
      command: "powershell.exe",
      args: [
        "-NoProfile",
        "-STA",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        windowsPickerScriptPath(),
        "-Title",
        options.title ?? "Select a folder",
        ...(options.initialPath
          ? ["-InitialPath", options.initialPath]
          : []),
      ],
    };
  if (platform === "darwin")
    return { command: "osascript", args: ["-e", macScript(options)] };
  if (platform === "linux") {
    const title = options.title ?? "Select a folder";
    // zenity is the common case; kdialog is the KDE fallback, tried when zenity
    // is not installed.
    const extra = options.initialPath ? [`--filename=${options.initialPath}/`] : [];
    const kdialogExtra = options.initialPath ? [options.initialPath] : [];
    return {
      command: "sh",
      args: [
        "-c",
        [
          `if command -v zenity >/dev/null 2>&1; then exec zenity --file-selection --directory --title=${JSON.stringify(title)} ${extra.join(" ")}; fi`,
          `if command -v kdialog >/dev/null 2>&1; then exec kdialog --getexistingdirectory ${kdialogExtra.join(" ")} --title ${JSON.stringify(title)}; fi`,
          "echo 'no folder picker available (install zenity or kdialog)' >&2; exit 127",
        ].join("\n"),
      ],
    };
  }
  return undefined;
}

export function folderDialogTimeoutMs(): number {
  const configured = Number(process.env.DEVICE_LOCAL_PICK_TIMEOUT_MS ?? "");
  if (Number.isFinite(configured) && configured > 0) return configured;
  return 120_000;
}

/**
 * Opens the folder window and resolves with what the user chose. Cancelling is
 * not an error: the command prints nothing and exits non-zero.
 */
export async function pickFolder(
  options: FolderDialogOptions = {},
): Promise<FolderDialogResult> {
  const command = folderPickerCommand(process.platform, options);
  if (!command)
    throw Error(
      `This platform (${process.platform}) has no folder picker; set DEVICE_LOCAL_PICK_COMMAND`,
    );
  try {
    const { stdout } = await run(command.command, command.args, {
      timeout: options.timeoutMs ?? folderDialogTimeoutMs(),
      windowsHide: true,
      maxBuffer: 1024 * 1024,
    });
    return interpretPick({ stdout });
  } catch (error) {
    const failure = error as NodeJS.ErrnoException & {
      killed?: boolean;
      signal?: string;
      stdout?: string;
      stderr?: string;
      code?: number | string;
    };
    return interpretPick({
      stdout: failure.stdout,
      failed: true,
      failureCode: failure.killed || failure.signal ? undefined : failure.code,
      killed: Boolean(failure.killed || failure.signal),
      message:
        failure.code === "ENOENT"
          ? `"${command.command}"`
          : String(failure.stderr || failure.message || "").trim(),
    });
  }
}
