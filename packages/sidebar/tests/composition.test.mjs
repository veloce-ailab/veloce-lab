import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { test } from "node:test"
import vm from "node:vm"
import ts from "typescript"
import * as React from "react"
import * as jsx from "react/jsx-runtime"
import { renderToStaticMarkup } from "react-dom/server"

const root = fileURLToPath(new URL("../../../", import.meta.url))
const plugins = ["sidebar", "chat-environment", "chat-git", "chat-terminal", "chat-files"]

// Execute the actual frontend entries against the actual dashboard slot registry
// and lifecycle. UI primitives and transport are isolated from a browser/server.
async function harness() {
  const context = vm.createContext({ window: {}, console })
  const cache = new Map()
  const buttons = [], queries = [], requests = []
  const primitive = ({ children }) => React.createElement("div", null, children)
  const ui = {
    Button: props => { buttons.push(props); return React.createElement("button", { "aria-label": props["aria-label"] }, props.children) },
    ResizableSidebar: props => React.createElement("div", { className: props.className, "data-sidebar": true }, props.children),
    useI18n: () => ({ language: "en" }),
    useToast: () => ({ error() {} }),
    cn: (...values) => values.filter(Boolean).join(" "),
    api: { get: async (url, config) => { requests.push({ url, config }); return { data: {} } } },
  }
  for (const name of ["Input", "Select", "SelectContent", "SelectItem", "SelectTrigger", "SelectValue", "Popover", "PopoverContent", "PopoverTrigger"]) ui[name] = primitive
  const stubs = new Map([
    ["react", React], ["react/jsx-runtime", jsx],
    ["react-router-dom", { Navigate: primitive, Route: primitive, Routes: primitive }],
    ["@tanstack/react-query", { useQuery: options => { queries.push(options); return { isLoading: false, isFetching: false, isError: false, refetch: async () => {} } } }],
    ["lucide-react", Object.fromEntries(["Check", "ChevronRight", "Folder", "Monitor", "FileText", "TerminalSquare", "PanelRightClose", "PanelRightOpen", "FileDiff", "GitBranch", "GitCompareArrows", "RefreshCw", "RotateCcw", "Upload", "X", "FileCode2", "FileMinus2", "FilePenLine", "FilePlus2", "FileQuestion"].map(name => [name, () => React.createElement("i")]))],
    ["@/lib/utils", { cn: ui.cn }],
    ["terminal-window", { ConnectorTerminalWindow: primitive }],
  ])
  async function synthetic(key, exports) {
    if (!cache.has(key)) {
      const module = new vm.SyntheticModule(Object.keys(exports), function () { for (const [name, value] of Object.entries(exports)) this.setExport(name, value) }, { context, identifier: key })
      cache.set(key, module)
      await module.link(() => { throw Error("Unexpected synthetic dependency") })
      await module.evaluate()
    }
    return cache.get(key)
  }
  async function load(file) {
    if (cache.has(file)) return cache.get(file)
    const source = await readFile(file, "utf8")
    const { outputText } = ts.transpileModule(source, { fileName: file, compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX } })
    const module = new vm.SourceTextModule(outputText, { context, identifier: file })
    cache.set(file, module)
    await module.link(async (specifier, owner) => {
      if (stubs.has(specifier)) return synthetic(specifier, stubs.get(specifier))
      if (specifier === "@velocelab/dashboard/frontend") return synthetic("dashboard-runtime", { ...ui, DashboardSlot: slots.namespace.DashboardSlot })
      if (specifier === "@/lib/slots") return slots
      if (specifier === "./ConnectorTerminalWindow") return synthetic("terminal-window", stubs.get("terminal-window"))
      const target = path.resolve(path.dirname(owner.identifier), specifier)
      return load(target + (path.extname(target) ? "" : ".tsx"))
    })
    await module.evaluate()
    return module
  }
  const slots = await load(path.join(root, "packages/dashboard/frontend/lib/slots.tsx"))
  const extension = await load(path.join(root, "packages/dashboard/frontend/extension.tsx"))
  const install = async name => {
    const entry = await load(path.join(root, "packages", name, "frontend/index.tsx"))
    const ctx = new extension.namespace.DashboardContext()
    await ctx.plugin(entry.namespace.default)
    return ctx
  }
  return { slots: slots.namespace, install, Context: extension.namespace.DashboardContext, buttons, queries, requests }
}

const data = () => ({
  session: { id: "session-a", connector_device_id: "device-a", connector_workspace_path: "/work/a", connector_approval_mode: "manual" },
  runMode: "assistant", messages: [], device: { id: "device-a", name: "My device", online: true }, devices: [], recentWorkspacePaths: [],
  setDevice() {}, setWorkspacePath() {}, openWorkspacePicker() {},
})

function renderSlot(h, name, value = data()) {
  return renderToStaticMarkup(React.createElement(h.slots.DashboardSlot, { name, scope: "/chat", data: value }))
}

test("panels load in any order and unload independently through DashboardContext", async () => {
  const h = await harness()
  const contexts = new Map()
  for (const name of [...plugins].reverse()) contexts.set(name, await h.install(name))
  const panelIDs = () => h.slots.dashboardSlots.list("chat.sidebar.panels", "/chat").map(item => item.id)
  assert.deepEqual(Array.from(panelIDs()), ["chat-environment.panel", "chat-git.panel", "chat-terminal.panel", "chat-files.panel"])
  assert.equal(h.slots.dashboardSlots.list("chat.sidebar.panels").length, 0)
  assert.equal(h.slots.dashboardSlots.list("frame.right-sidebar", "/chat").length, 1)
  await contexts.get("chat-git").dispose()
  assert.equal(panelIDs().includes("chat-git.panel"), false)
  assert.equal(panelIDs().includes("chat-terminal.panel"), true)
  await contexts.get("sidebar").dispose()
  assert.equal(renderSlot(h, "frame.right-sidebar"), "")
  assert.equal(renderSlot(h, "chat.toolbar.sidebar"), "")
  for (const ctx of contexts.values()) await ctx.dispose()
  assert.equal(panelIDs().length, 0)
})

test("sidebar forwards live host data to unknown panels and keeps them mounted when folded", async () => {
  const h = await harness()
  await h.install("sidebar")
  const seen = []
  const ctx = new h.Context()
  ctx.slot("chat.sidebar.panels", props => { seen.push(props); return React.createElement("span", null, props.session.id) }, "third-party.panel", 100, "/chat")
  const current = data()
  const open = renderSlot(h, "frame.right-sidebar", current)
  assert.match(open, /lg:flex/)
  assert.equal(seen.at(-1).messages, current.messages)
  assert.equal(seen.at(-1).setDevice, current.setDevice)
  renderSlot(h, "chat.toolbar.sidebar", current)
  h.buttons.find(button => button["aria-controls"] === "chat-right-sidebar").onClick()
  const closed = renderSlot(h, "frame.right-sidebar", current)
  assert.doesNotMatch(closed, /lg:flex/)
  assert.match(closed, /session-a/)
  const next = { ...current, session: { ...current.session, id: "session-b" } }
  assert.match(renderSlot(h, "frame.right-sidebar", next), /session-b/)
  await ctx.dispose()
  assert.doesNotMatch(renderSlot(h, "frame.right-sidebar", next), /session-b/)
})

test("generated files follow live messages, omit failed reports and update duplicate paths", async () => {
  const h = await harness()
  await h.install("chat-files")
  const report = (filePath, name, status = "ok") => ({ name: "report_generated_file", status, arguments: { path: filePath, name } })
  const current = data()
  current.messages = [{ tool_calls: [report("/a.txt", "First"), report("/failed.txt", "Failed", "error")] }]
  let html = renderSlot(h, "chat.sidebar.panels", current)
  assert.match(html, /First/)
  assert.doesNotMatch(html, /Failed/)
  current.messages = [...current.messages, { tool_calls: [report("/a.txt", "Updated"), report("C:\\out\\b.txt", "<New>")] }]
  html = renderSlot(h, "chat.sidebar.panels", current)
  assert.match(html, /Updated/)
  assert.match(html, /&lt;New&gt;/)
  assert.doesNotMatch(html, /First/)
  assert.equal((html.match(/title="\/a.txt"/g) || []).length, 2)
  assert.ok(html.indexOf("&lt;New&gt;") < html.indexOf("Updated"))
})

test("Git uses the supplied workspace and does not fetch a second session", async () => {
  const h = await harness()
  await h.install("chat-git")
  const current = data()
  renderSlot(h, "chat.sidebar.panels", current)
  const status = h.queries.find(query => query.queryKey[0] === "advanced-chat-workspace-git-status")
  assert.equal(status.enabled, true)
  await status.queryFn()
  assert.equal(h.requests.length, 1)
  assert.equal(h.requests[0].url, "/user/advanced-chat/workspace/git/status")
  assert.equal(h.requests[0].config.params.connector_device_id, "device-a")
  assert.equal(h.requests[0].config.params.connector_workspace_path, "/work/a")
  const entry = h.slots.dashboardSlots.list("chat.sidebar.panels", "/chat")[0]
  const firstKey = entry.component(current).key
  assert.notEqual(entry.component({ ...current, session: { ...current.session, connector_workspace_path: "/work/b" } }).key, firstKey)
  assert.notEqual(entry.component({ ...current, session: { ...current.session, id: "session-b" } }).key, firstKey)
  h.queries.length = 0
  renderSlot(h, "chat.sidebar.panels", { ...current, runMode: "chat" })
  assert.equal(h.queries[0].enabled, false)
})
