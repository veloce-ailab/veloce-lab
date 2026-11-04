export interface ToolPreviewCall {
  id: string
  name: string
  tool?: string
  server?: string
  status: string
  arguments?: Record<string, unknown>
  result?: string
}

export interface ToolFileDiff {
  path: string
  original: string | null
  modified: string
  scope: "file" | "snippet" | "unknown"
}

const record = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value))
const string = (value: unknown): string | undefined => typeof value === "string" ? value : undefined

function resultValue(result?: string): unknown {
  if (result === undefined || result === "") return undefined
  try {
    const parsed: unknown = JSON.parse(result)
    // Connector tasks wrap the inline action's result when served remotely.
    if (record(parsed) && typeof parsed.result === "string" && !Object.hasOwn(parsed, "content")) {
      try { return JSON.parse(parsed.result) } catch { return parsed.result }
    }
    return parsed
  } catch { return result }
}

export function toolPreviewPath(call: ToolPreviewCall): string {
  const result = resultValue(call.result)
  return string(call.arguments?.path) || (record(result) ? string(result.path) : "") || ""
}

export function toolFileContent(call: ToolPreviewCall): string | null {
  const result = resultValue(call.result)
  if (record(result)) {
    if (typeof result.content === "string") return result.content
    if (record(result.data) && typeof result.data.content === "string") return result.data.content
    if (typeof result.output === "string") {
      try { const nested: unknown = JSON.parse(result.output); if (record(nested) && typeof nested.content === "string") return nested.content } catch { /* An envelope without a file snapshot is not file text. */ }
    }
    return null
  }
  return typeof result === "string" ? result : null
}

export function toolCommandTranscript(call: ToolPreviewCall) {
  const args = call.arguments || {}
  let result = resultValue(call.result)
  let envelopeError = ""
  if (record(result) && typeof result.output === "string" && (typeof result.task_id === "string" || typeof result.status === "string")) {
    envelopeError = string(result.error) || ""
    try { result = JSON.parse(result.output) } catch { result = result.output || envelopeError }
  }
  let command = string(args.command) || string(args.cmd) || ""
  let cwd = string(args.cwd) || string(args.workspace_path) || string(args.connector_workspace_path) || ""
  let output = ""
  let exitCode: number | undefined
  if (record(result)) {
    command = command || string(result.command) || ""
    cwd = cwd || string(result.cwd) || ""
    output = string(result.output) ?? [string(result.stdout), string(result.stderr)].filter(value => value !== undefined).join("")
    if (typeof result.exit_code === "number") exitCode = result.exit_code
    if (!output) output = string(result.error_message) || string(result.error) || envelopeError
  } else if (typeof result === "string") {
    output = result
    // Local and remote connectors historically emitted these three headers.
    // Only remove a complete, recognized prefix so output resembling metadata survives.
    const prefix = result.match(/^\$ ([^\n]*)\r?\ncwd: ([^\n]*)\r?\nexit code: (-?\d+)(?:\r?\n|$)/)
    if (prefix && (!command || prefix[1].replace(/\r$/, "") === command)) {
      command = command || prefix[1].replace(/\r$/, "")
      cwd = cwd || prefix[2].replace(/\r$/, "")
      exitCode = Number(prefix[3])
      output = result.slice(prefix[0].length)
    } else if (command && result.startsWith(`$ ${command}\n`)) {
      output = result.slice(command.length + 3)
    }
  }
  return { command, cwd, output, exitCode }
}

function snapshot(source: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) if (typeof source[key] === "string") return source[key] as string
  return undefined
}

export function toolFileDiffs(call: ToolPreviewCall, kind: "write" | "replace"): ToolFileDiff[] {
  const args = call.arguments || {}
  const result = resultValue(call.result)
  const resultRecord = record(result) ? result : {}
  const path = toolPreviewPath(call)
  const original = args.preview_old_content_available === false
    ? snapshot(resultRecord, ["before", "old_content", "original"])
    : snapshot(args, ["preview_old_content"]) ?? snapshot(resultRecord, ["before", "old_content", "original"])
  const modified = snapshot(args, ["preview_new_content"]) ?? snapshot(resultRecord, ["after", "new_content", "modified"])
  if (kind === "write") {
    const content = modified ?? string(args.content)
    return content === undefined ? [] : [{ path, original: original ?? null, modified: content, scope: original === undefined ? "unknown" : "file" }]
  }
  const replacements = Array.isArray(args.replacements)
    ? args.replacements.filter(record)
    : [args]
  if (original !== undefined) {
    let next = original
    for (const replacement of replacements) {
      const oldText = string(replacement.old_text)
      const newText = string(replacement.new_text)
      if (oldText && newText !== undefined) next = next.split(oldText).join(newText)
    }
    return [{ path, original, modified: modified ?? next, scope: "file" }]
  }
  return replacements.flatMap((replacement) => {
    const oldText = string(replacement.old_text)
    const newText = string(replacement.new_text)
    return oldText === undefined || newText === undefined ? [] : [{
      path: string(replacement.path) || path,
      original: oldText,
      modified: newText,
      scope: "snippet" as const,
    }]
  })
}

export function toolPreviewLanguage(path: string): string {
  const extension = path.split(".").at(-1)?.toLowerCase() || ""
  const languages: Record<string, string> = { ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript", mjs: "javascript", cjs: "javascript", json: "json", css: "css", scss: "scss", html: "html", md: "markdown", py: "python", go: "go", rs: "rust", java: "java", yaml: "yaml", yml: "yaml", toml: "ini", sh: "shell", bash: "shell", sql: "sql", xml: "xml", c: "c", cpp: "cpp", cs: "csharp" }
  return languages[extension] || "plaintext"
}
