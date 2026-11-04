export type ToolActivityKind = "list" | "read" | "write" | "replace" | "command" | "search" | "fetch" | ""

export function toolActivityKind(call: { name: string; tool?: string }): ToolActivityKind {
  const name = (call.tool || call.name).toLowerCase().replace(/^(workspace_|connector_)/, "")
  const kinds: Record<string, ToolActivityKind> = {
    list_files: "list", list_directory: "list", read_file: "read", write_file: "write",
    replace_text: "replace", run_command: "command", web_search: "search", web_fetch: "fetch",
  }
  return kinds[name] || ""
}

export function toolActivitySummary(calls: Array<{ name: string; tool?: string; status: string }>, language: string) {
  const zh = language === "zh"
  const categories: Record<string, string> = zh
    ? { read: "读取文件", list: "浏览文件", write: "修改文件", replace: "修改文件", command: "运行命令", search: "搜索", fetch: "读取网页", "": "调用工具" }
    : { read: "Read files", list: "Listed files", write: "Edited files", replace: "Edited files", command: "Ran commands", search: "Searched", fetch: "Fetched pages", "": "Used tools" }
  const labels = [...new Set(calls.map((call) => categories[toolActivityKind(call)]))]
  const active = calls.some((call) => ["running", "queued", "approval_required", "pending_approval"].includes(call.status))
  if (active) return zh ? `正在处理：${labels.join("、")}` : `Working: ${labels.join(", ")}`
  return zh ? `已${labels.join("、")}` : labels.join(", ")
}
