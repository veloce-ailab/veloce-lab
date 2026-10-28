import { Context, Schema, Session } from "yumeri";
import "@velocelab/advanced-chat";
import "@velocelab/dashboard";
import type { AdvancedChatService } from "@velocelab/advanced-chat";
export const depend = ["advanced-chat", "dashboard"];
export const provide = ["tools"];
export const config = Schema.object({ disabledTools: Schema.array(Schema.string()).key("tools.config.disabledTools").default([]) });
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute?(input: unknown, context: ToolContext): Promise<unknown>;
}
export interface ToolContext {
  userId: number;
  sessionId?: string;
  runId?: string;
}
export interface ToolsService {
  list(): ToolDefinition[];
  listRegistered(): Array<ToolDefinition & { enabled: boolean }>;
  register(tool: ToolDefinition): () => void;
  get(name: string): ToolDefinition | undefined;
}
declare module "yumeri" {
  interface Components {
    tools: ToolsService;
  }
}
export function apply(ctx: Context, pluginConfig: { disabledTools?: string[] } = {}) {
  ctx.i18n({ tools: {
    title: { zh: "工具管理", en: "Tool management", ja: "ツール管理" },
    description: { zh: "查看当前注册的聊天工具并控制是否提供给模型。", en: "Review registered chat tools and control which ones are available to models.", ja: "登録済みのチャットツールを確認し、モデルで使用するか管理します。" },
    registered: { zh: "已注册工具", en: "Registered tools", ja: "登録済みツール" },
    loading: { zh: "正在加载工具…", en: "Loading tools…", ja: "ツールを読み込み中…" },
    empty: { zh: "当前没有注册工具。", en: "No tools are currently registered.", ja: "登録済みのツールはありません。" },
    on: { zh: "已启用", en: "Enabled", ja: "有効" },
    off: { zh: "已禁用", en: "Disabled", ja: "無効" },
    enable: { zh: "启用", en: "Enable", ja: "有効化" },
    disable: { zh: "禁用", en: "Disable", ja: "無効化" },
    enabled: { zh: "工具已启用", en: "Tool enabled", ja: "ツールを有効化しました" },
    disabled: { zh: "工具已禁用", en: "Tool disabled", ja: "ツールを無効化しました" },
    failed: { zh: "工具状态更新失败", en: "Could not update tool state", ja: "ツールの状態を更新できませんでした" },
  } });
  const chat = ctx.component["advanced-chat"] as AdvancedChatService;
  const disabled = new Set((pluginConfig.disabledTools ?? []).map(String));
  for (const name of disabled) chat.setToolEnabled(name, false);
  const dashboard = ctx.component.dashboard as unknown as { addEntry(entry: Record<string, unknown>): void };
  dashboard.addEntry({ id: "tools", dev: new URL("../frontend/index.tsx", import.meta.url).pathname, prod: new URL("./frontend/tools.js", import.meta.url).pathname, plugin: "tools" });
  const service: ToolsService = {
    list: () => chat.tools(),
    listRegistered: () => chat.registeredTools().map((tool) => ({ ...tool, enabled: !disabled.has(tool.name) })),
    register: (tool) => {
      if (disabled.has(tool.name)) chat.setToolEnabled(tool.name, false);
      return chat.registerTool(tool);
    },
    get: (name) => chat.tools().find((tool) => tool.name === name),
  };
  ctx.registerComponent("tools", service);

  const loader = () => (ctx.getCore() as unknown as { loader?: { config: { plugins?: Record<string, Record<string, unknown>> }; saveConfig(): Promise<void> } }).loader;
  ctx.route("/api/tools").methods("GET").action(async (session: Session) => {
    session.respond({ tools: service.listRegistered() }, "json");
  });
  ctx.route("/api/tools/:name").methods("POST").action(async (session: Session, _query: URLSearchParams, name: string) => {
    let body: Record<string, unknown> = {};
    try { body = await session.parseRequestBody() as Record<string, unknown> ?? {}; } catch { /* rejected below */ }
    const enabled = body.enabled;
    if (typeof enabled !== "boolean" || !name) {
      session.status = 400;
      session.respond({ error: "name and boolean enabled are required" }, "json");
      return;
    }
    const definition = chat.registeredTools().find((tool) => tool.name === name);
    if (!definition) {
      session.status = 404;
      session.respond({ error: "Tool is not registered" }, "json");
      return;
    }
    if (enabled) disabled.delete(name);
    else disabled.add(name);
    chat.setToolEnabled(name, enabled);
    const current = loader();
    const config = current?.config.plugins?.["@velocelab/tools"];
    if (config) config.disabledTools = [...disabled];
    await current?.saveConfig();
    session.respond({ ok: true, name, enabled, disabledTools: [...disabled] }, "json");
  });
}
