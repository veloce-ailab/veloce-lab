import { Context, Schema, Session, resolveDescription } from "yumeri";
import "@velocelab/dashboard";

export const depend = ["dashboard"];
export const provide = ["settings"];

/** A configuration schema as yumeri's `Schema` serialises to JSON. */
export interface PluginConfigSchema {
  type: string;
  description?: string;
  i18nKey?: string;
  isRequired?: boolean;
  defaultValue?: unknown;
  properties?: Record<string, PluginConfigSchema>;
  items?: PluginConfigSchema;
  enum?: unknown[];
}

interface PluginModuleMeta {
  config?: PluginConfigSchema;
  depend?: string[];
  provide?: string[];
}

/**
 * The part of the yumeri plugin loader this page drives. The loader owns the
 * configuration file: `saveConfig` writes the in-memory document back to it, a
 * disabled plugin is stored under a `~` prefixed key, and `pluginStatus` is
 * rebuilt from those keys on every start, so the file stays the single source of
 * truth for which plugins are enabled.
 */
interface PluginLoader {
  config: { plugins?: Record<string, Record<string, unknown>>; [key: string]: unknown };
  pluginStatus: Record<string, string>;
  plugins: Record<string, PluginModuleMeta>;
  saveConfig(): Promise<void>;
  reloadPlugin(name: string): Promise<void>;
  unloadPlugin(name: string): Promise<void>;
  loadSinglePlugin(name: string, triggerPendingCheck?: boolean): Promise<boolean>;
}

/** Key a plugin is stored under, whether it is currently enabled or disabled. */
function configKey(loader: PluginLoader, name: string): string | undefined {
  const plugins = loader.config.plugins;
  if (!plugins || !name) return undefined;
  if (name in plugins) return name;
  return `~${name}` in plugins ? `~${name}` : undefined;
}

/**
 * Plugins the loader would unload together with this one. Disabling cascades
 * through `depend`, so the list is reported ahead of the action: without it,
 * turning off a package others build on silently takes them down too, this
 * settings page included.
 */
function dependentsOf(target: string, entries: Array<{ name: string; enabled: boolean; depend: string[]; provide: string[] }>): string[] {
  // `depend` and `provide` are service names, not package names, so the two
  // lists meet in the middle: a plugin is a dependent when one of the services
  // it depends on is provided by the target.
  const dependentsOfService = new Map<string, string[]>();
  for (const entry of entries) {
    for (const service of entry.depend) {
      dependentsOfService.set(service, [...(dependentsOfService.get(service) ?? []), entry.name]);
    }
  }
  const known = new Map(entries.map((entry) => [entry.name, entry]));
  const found = new Set<string>();
  const queue = [target];
  while (queue.length) {
    const current = known.get(queue.shift()!);
    if (!current) continue;
    for (const service of current.provide) {
      for (const dependent of dependentsOfService.get(service) ?? []) {
        if (dependent === target || found.has(dependent)) continue;
        if (!known.get(dependent)?.enabled) continue;
        found.add(dependent);
        queue.push(dependent);
      }
    }
  }
  return [...found];
}

function requestLanguages(session: Session): string[] {
  const headers = session.client.req?.headers as Record<string, string | string[] | undefined> | undefined;
  const raw = Array.isArray(headers?.["accept-language"]) ? headers["accept-language"].join(",") : String(headers?.["accept-language"] ?? "");
  return raw.split(",").flatMap((entry) => {
    const language = entry.trim().split(";", 1)[0];
    if (!language) return [];
    const base = language.split("-", 1)[0];
    return base === language ? [language] : [language, base];
  });
}

function localizedSchema(schema: PluginConfigSchema, core: ReturnType<Context["getCore"]>, langs: string[]): PluginConfigSchema {
  const localized: PluginConfigSchema = { ...schema };
  const description = resolveDescription(schema as Schema<any>, core.i18n, langs);
  if (description !== undefined) localized.description = description;
  if (schema.properties) localized.properties = Object.fromEntries(Object.entries(schema.properties).map(([key, child]) => [key, localizedSchema(child, core, langs)]));
  if (schema.items) localized.items = localizedSchema(schema.items, core, langs);
  return localized;
}


async function describePlugin(loader: PluginLoader, name: string): Promise<PluginModuleMeta> {
  const loaded = loader.plugins[name];
  if (loaded) return loaded;
  try {
    const module = (await import(name)) as PluginModuleMeta & { default?: PluginModuleMeta };
    const fallback = module.default && typeof module.default === "object" ? module.default : {};
    return {
      config: module.config ?? fallback.config,
      depend: module.depend ?? fallback.depend ?? [],
      provide: module.provide ?? fallback.provide ?? [],
    };
  } catch {
    return { depend: [], provide: [] };
  }
}

export function apply(ctx: Context) {
  // The settings shell and its pages live in this plugin, so the labels it
  // renders are registered here as well. Section labels are declared by the
  // contributing package itself (`group: { id, labelKey, order }`);
  // `settings.group.<id>` only backstops the shell's own `general` bucket and
  // any section a contribution joined without declaring a label.
  ctx.i18n({
    auth: { config: {
      username: { zh: "管理员账号，启动时创建或覆盖", en: "Administrator username", ja: "管理者ユーザー名" }, password: { zh: "管理员密码，每次启动都覆盖", en: "Administrator password", ja: "管理者パスワード" }, email: { zh: "管理员邮箱", en: "Administrator email", ja: "管理者メールアドレス" }, passwordLoginEnabled: { zh: "允许账号密码登录", en: "Allow password login", ja: "パスワードログインを許可" }, passwordRegistrationEnabled: { zh: "允许账号密码自助注册", en: "Allow password registration", ja: "パスワード登録を許可" }, registrationMode: { zh: "允许自助注册的方式", en: "Registration mode", ja: "登録モード" }, allowedLoginMethods: { zh: "允许登录方式", en: "Allowed login methods", ja: "許可するログイン方法" }, allowedRegistrationProviders: { zh: "允许注册的 Provider", en: "Providers allowed to register", ja: "登録を許可する Provider" },
    }},
    google: { config: { clientId: { zh: "Google OAuth 客户端 ID", en: "Google OAuth client ID", ja: "Google OAuth クライアント ID" }, clientSecret: { zh: "Google OAuth 客户端密钥", en: "Google OAuth client secret", ja: "Google OAuth クライアントシークレット" }, redirectUri: { zh: "Google OAuth 授权回调地址", en: "Google OAuth authorized redirect URI", ja: "Google OAuth 許可済みリダイレクト URI" }, allowRegistration: { zh: "允许首次 Google 登录时创建账号", en: "Allow account creation on first Google login", ja: "Google 初回ログイン時のアカウント作成を許可" }, hostedDomain: { zh: "Google Workspace 域名限制", en: "Google Workspace domain restriction", ja: "Google Workspace ドメイン制限" } } },
    oidc: { config: { providers: { zh: "OIDC 登录提供商", en: "OIDC providers", ja: "OIDC プロバイダー" }, provider: { id: { zh: "Provider 唯一 ID", en: "Unique provider ID", ja: "Provider 固有 ID" }, name: { zh: "登录页显示名称", en: "Display name", ja: "表示名" }, icon: { zh: "可选图标 URL", en: "Optional icon URL", ja: "任意のアイコン URL" }, issuer: { zh: "OIDC Issuer 地址", en: "OIDC issuer URL", ja: "OIDC Issuer URL" }, clientId: { zh: "OIDC 客户端 ID", en: "OIDC client ID", ja: "OIDC クライアント ID" }, clientSecret: { zh: "OIDC 客户端密钥", en: "OIDC client secret", ja: "OIDC クライアントシークレット" }, redirectUri: { zh: "OIDC 授权回调地址", en: "OIDC authorized redirect URI", ja: "OIDC 許可済みリダイレクト URI" }, allowRegistration: { zh: "允许首次 OIDC 登录时创建账号", en: "Allow account creation on first OIDC login", ja: "OIDC 初回ログイン時のアカウント作成を許可" }, scopes: { zh: "授权 scopes", en: "Authorization scopes", ja: "認可スコープ" }, scope: { zh: "Scope", en: "Scope", ja: "スコープ" } } } },
    channel: { config: { contextMessageCount: { zh: "默认上下文消息数", en: "Default context message count", ja: "既定のコンテキストメッセージ数" }, webhookPayloadMaxBytes: { zh: "Webhook 最大负载字节数", en: "Maximum webhook payload bytes", ja: "Webhook 最大ペイロードバイト数" } } },
    "advanced-chat": { config: { connectorOnlineWindowSeconds: { zh: "连接器在线窗口（秒）", en: "Connector online window seconds", ja: "コネクターオンライン時間（秒）" }, retryAttempts: { zh: "聊天重试次数", en: "Chat retry attempts", ja: "チャット再試行回数" }, assistantRetryAttempts: { zh: "助手重试次数", en: "Assistant retry attempts", ja: "アシスタント再試行回数" }, retryDelayMs: { zh: "聊天重试延迟（毫秒）", en: "Chat retry delay milliseconds", ja: "チャット再試行遅延（ミリ秒）" }, retryMaxDelayMs: { zh: "聊天最大重试延迟（毫秒）", en: "Chat retry maximum delay milliseconds", ja: "チャット最大再試行遅延（ミリ秒）" }, requestTimeoutMs: { zh: "请求超时（毫秒）", en: "Request timeout milliseconds", ja: "リクエストタイムアウト（ミリ秒）" } } },
    cache: { config: { address: { zh: "Redis 地址", en: "Redis address", ja: "Redis アドレス" }, username: { zh: "Redis 用户名", en: "Redis username", ja: "Redis ユーザー名" }, password: { zh: "Redis 密码", en: "Redis password", ja: "Redis パスワード" }, database: { zh: "Redis 数据库", en: "Redis database", ja: "Redis データベース" }, tls: { zh: "启用 Redis TLS", en: "Enable Redis TLS", ja: "Redis TLS を有効化" } } },
    file: { config: { root: { zh: "文件存储根目录", en: "File storage root", ja: "ファイルストレージのルート" } } },
    memory: { config: { root: { zh: "记忆存储根目录", en: "Memory storage root", ja: "メモリーストレージのルート" } } },
    ratelimit: { config: { requestsPerMinute: { zh: "每分钟请求数", en: "Requests per minute", ja: "1分あたりのリクエスト数" }, burst: { zh: "突发请求数", en: "Burst size", ja: "バーストサイズ" } } },
    sqlite: { config: { path: { zh: "SQLite 数据库路径", en: "SQLite database path", ja: "SQLite データベースパス" } } },
    pgsql: { config: { host: { zh: "PostgreSQL 主机", en: "PostgreSQL host", ja: "PostgreSQL ホスト" }, port: { zh: "PostgreSQL 端口", en: "PostgreSQL port", ja: "PostgreSQL ポート" }, user: { zh: "PostgreSQL 用户", en: "PostgreSQL user", ja: "PostgreSQL ユーザー" }, password: { zh: "PostgreSQL 密码", en: "PostgreSQL password", ja: "PostgreSQL パスワード" }, database: { zh: "PostgreSQL 数据库", en: "PostgreSQL database", ja: "PostgreSQL データベース" } } },
    mysql: { config: { host: { zh: "MySQL 主机", en: "MySQL host", ja: "MySQL ホスト" }, port: { zh: "MySQL 端口", en: "MySQL port", ja: "MySQL ポート" }, user: { zh: "MySQL 用户", en: "MySQL user", ja: "MySQL ユーザー" }, password: { zh: "MySQL 密码", en: "MySQL password", ja: "MySQL パスワード" }, database: { zh: "MySQL 数据库", en: "MySQL database", ja: "MySQL データベース" } } },
    dashboard: { config: { dev: { zh: "从源码提供前端，而不是使用构建产物", en: "Serve the frontend from source instead of the build", ja: "ビルドではなくソースからフロントエンドを配信" } } },
    settings: {
      title: { zh: "设置", en: "Settings", ja: "設定" },
      sidebar: { zh: "设置导航", en: "Settings navigation", ja: "設定ナビゲーション" },
      account: { zh: "账户", en: "Account", ja: "アカウント" },
      openMenu: { zh: "打开设置菜单", en: "Open settings menu", ja: "設定メニューを開く" },
      closeMenu: { zh: "关闭设置菜单", en: "Close settings menu", ja: "設定メニューを閉じる" },
      proxy: { zh: "网络代理", en: "Network proxy", ja: "ネットワークプロキシ" },
      theme: { zh: "主题设置", en: "Theme", ja: "テーマ設定" },
      about: { zh: "软件信息", en: "About", ja: "ソフトウェア情報" },
      plugins: {
        title: { zh: "插件", en: "Plugins", ja: "プラグイン" },
        list: { zh: "插件列表", en: "Plugin list", ja: "プラグイン一覧" },
        search: { zh: "搜索插件", en: "Search plugins", ja: "プラグインを検索" },
        empty: { zh: "没有匹配的插件", en: "No plugin matches", ja: "一致するプラグインがありません" },
        select: {
          zh: "从左侧选择一个插件查看它的配置。",
          en: "Select a plugin to view and edit its configuration.",
          ja: "左側からプラグインを選ぶと設定を表示します。",
        },
        status: {
          enabled: { zh: "已启用", en: "Enabled", ja: "有効" },
          pending: { zh: "未加载", en: "Not loaded", ja: "未読み込み" },
          disabled: { zh: "已禁用", en: "Disabled", ja: "無効" },
        },
        enable: { zh: "启用", en: "Enable", ja: "有効化" },
        disable: { zh: "禁用", en: "Disable", ja: "無効化" },
        reload: { zh: "重载", en: "Reload", ja: "再読み込み" },
        save: { zh: "保存", en: "Save", ja: "保存" },
        saved: { zh: "配置已保存", en: "Configuration saved", ja: "設定を保存しました" },
        enabled: { zh: "插件已启用", en: "Plugin enabled", ja: "プラグインを有効化しました" },
        disabled: { zh: "插件已禁用", en: "Plugin disabled", ja: "プラグインを無効化しました" },
        reloaded: { zh: "插件已重载", en: "Plugin reloaded", ja: "プラグインを再読み込みしました" },
        failed: { zh: "操作失败", en: "The operation failed", ja: "操作に失敗しました" },
        loadFailed: { zh: "加载插件列表失败", en: "Could not load the plugin list", ja: "プラグイン一覧を読み込めませんでした" },
        pendingHint: {
          zh: "这个插件是启用的,但没有加载起来,通常是因为依赖没有满足。",
          en: "The plugin is enabled but did not load, usually because a dependency is missing.",
          ja: "有効ですが読み込まれていません。多くの場合、依存関係が満たされていません。",
        },
        unloaded: {
          zh: "依赖它的插件一并卸载",
          en: "Plugins depending on it were unloaded as well",
          ja: "依存するプラグインも併せて解除されました",
        },
        confirmDisable: {
          zh: "禁用后该插件会被立即卸载,依赖它的插件也会一并卸载。",
          en: "Disabling unloads the plugin immediately, together with the plugins that depend on it.",
          ja: "無効化すると即座に解除され、依存するプラグインも解除されます。",
        },
        confirmDisableDependents: {
          zh: "这些插件会同时被卸载",
          en: "These plugins will be unloaded as well",
          ja: "次のプラグインも併せて解除されます",
        },
        dependents: {
          zh: "会随它一起卸载",
          en: "Unloaded with it",
          ja: "併せて解除されるもの",
        },
        dependentsSelf: {
          zh: "包含当前这个设置页面,禁用后需要改配置文件才能恢复。",
          en: "This includes the page you are on, so recovering it means editing the configuration file.",
          ja: "この設定ページ自身が含まれるため、復旧には設定ファイルの編集が必要です。",
        },
        noSchema: {
          zh: "该插件没有导出配置 schema。",
          en: "This plugin does not declare a configuration schema.",
          ja: "このプラグインは設定スキーマを公開していません。",
        },
        noOptions: {
          zh: "该插件没有可配置项。",
          en: "This plugin has no configurable options.",
          ja: "設定できる項目はありません。",
        },
        required: { zh: "必填", en: "Required", ja: "必須" },
        defaultValue: { zh: "默认", en: "Default", ja: "既定値" },
        invalidJson: { zh: "JSON 格式不正确", en: "Invalid JSON", ja: "JSON の形式が不正です" },
        addItem: { zh: "添加一项", en: "Add item", ja: "項目を追加" },
        removeItem: { zh: "移除", en: "Remove", ja: "削除" },
        dependsOn: { zh: "依赖", en: "Depends on", ja: "依存" },
        provides: { zh: "提供", en: "Provides", ja: "提供" },
      },
      group: {
        general: { zh: "通用", en: "General", ja: "一般" },
        ai: { zh: "智能体", en: "Agents", ja: "エージェント" },
        chat: { zh: "聊天", en: "Chat", ja: "チャット" },
        system: { zh: "系统", en: "System", ja: "システム" },
      },
    },
  });
  ctx.component.dashboard.addEntry({
    id: "settings",
    dev: new URL("../frontend/index.tsx", import.meta.url).pathname,
    prod: new URL("./frontend/settings.js", import.meta.url).pathname,
    plugin: "settings",
  });

  // Plugin management is driven through the loader the framework already
  // exposes, so the configuration file stays the only place that records which
  // plugins are enabled: `~name` means disabled, and every action here saves
  // before it acts.
  const loader = () => (ctx.getCore() as unknown as { loader?: PluginLoader }).loader;

  // Who is allowed to reach these routes is not decided here: access control is
  // a layer in front of the application, and duplicating a permission check in
  // the plugin that happens to own the page only spreads the rule around.

  // A malformed or empty body is a client mistake, not a server fault, so it is
  // reported as a missing argument rather than allowed to throw.
  const readBody = async (session: Session) => {
    try {
      const parsed = await session.parseRequestBody();
      return (parsed && typeof parsed === "object" ? parsed : {}) as Record<string, unknown>;
    } catch {
      return {} as Record<string, unknown>;
    }
  };

  const unavailable = (session: Session) => {
    session.status = 503;
    session.respond({ error: "Plugin loader is not available" }, "json");
  };

  ctx.route("/api/settings/plugins").methods("GET").action(async (session: Session) => {
    const current = loader();
    if (!current) return unavailable(session);
    const plugins = current.config.plugins ?? {};
    const listed = await Promise.all(Object.keys(plugins).map(async (key) => {
      const disabled = key.startsWith("~");
      const name = disabled ? key.slice(1) : key;
      const meta = await describePlugin(current, name);
      return {
        name,
        title: ctx.getCore().getShortPluginName(name),
        enabled: !disabled,
        status: current.pluginStatus[name] ?? (disabled ? "disabled" : "pending"),
        depend: meta.depend ?? [],
        provide: meta.provide ?? [],
        schema: meta.config ? localizedSchema(meta.config, ctx.getCore(), requestLanguages(session)) : null,
        config: plugins[key] ?? {},
      };
    }));
    // Enabled plugins first, then alphabetically, so the ones actually running
    // are the ones in view.
    listed.sort((left, right) => Number(right.enabled) - Number(left.enabled) || left.name.localeCompare(right.name));
    session.respond({
      plugins: listed.map((entry) => ({ ...entry, dependents: dependentsOf(entry.name, listed) })),
    }, "json");
  });

  ctx.route("/api/settings/plugins/config").methods("POST").action(async (session: Session) => {
    const current = loader();
    if (!current) return unavailable(session);
    const body = await readBody(session);
    const name = String(body.name ?? "");
    if (!name) {
      session.status = 400;
      session.respond({ error: "name is required" }, "json");
      return;
    }
    const key = configKey(current, name);
    if (!key) {
      session.status = 404;
      session.respond({ error: "Plugin is not listed in the configuration file" }, "json");
      return;
    }
    const config = body.config;
    if (!config || typeof config !== "object" || Array.isArray(config)) {
      session.status = 400;
      session.respond({ error: "config must be an object" }, "json");
      return;
    }
    current.config.plugins![key] = config as Record<string, unknown>;
    await current.saveConfig();
    session.respond({ ok: true, name, enabled: !key.startsWith("~") }, "json");
  });

  ctx.route("/api/settings/plugins/action").methods("POST").action(async (session: Session) => {
    const current = loader();
    if (!current) return unavailable(session);
    const body = await readBody(session);
    const name = String(body.name ?? "");
    const action = String(body.action ?? "");
    if (!name) {
      session.status = 400;
      session.respond({ error: "name is required" }, "json");
      return;
    }
    const key = configKey(current, name);
    if (!key) {
      session.status = 404;
      session.respond({ error: "Plugin is not listed in the configuration file" }, "json");
      return;
    }
    const plugins = current.config.plugins!;
    // Every action carries the edited configuration, so a state change never
    // loses what the form held.
    const config = body.config;
    if (config && typeof config === "object" && !Array.isArray(config)) {
      plugins[key] = config as Record<string, unknown>;
    }
    const before = { ...current.pluginStatus };

    if (action === "disable") {
      if (key.startsWith("~")) {
        session.status = 409;
        session.respond({ error: "Plugin is already disabled" }, "json");
        return;
      }
      plugins[`~${name}`] = plugins[key];
      delete plugins[key];
      await current.saveConfig();
      await current.unloadPlugin(name);
    } else if (action === "enable") {
      if (!key.startsWith("~")) {
        session.status = 409;
        session.respond({ error: "Plugin is already enabled" }, "json");
        return;
      }
      plugins[name] = plugins[key];
      delete plugins[key];
      await current.saveConfig();
      // A dependency that is still disabled leaves the plugin pending rather
      // than failing the request; the reported status says which happened.
      await current.loadSinglePlugin(name, true);
    } else if (action === "reload") {
      if (key.startsWith("~")) {
        session.status = 409;
        session.respond({ error: "Plugin is disabled and cannot be reloaded" }, "json");
        return;
      }
      await current.saveConfig();
      await current.reloadPlugin(name);
    } else {
      session.status = 400;
      session.respond({ error: "Unknown action" }, "json");
      return;
    }

    // Disabling cascades to the plugins that depend on this one through the
    // loader, which reports nothing about it, so the change is read back.
    const unloaded = Object.keys(before).filter((plugin) => before[plugin] === "enabled" && current.pluginStatus[plugin] !== "enabled");
    session.respond({ ok: true, name, action, status: current.pluginStatus[name] ?? "pending", unloaded }, "json");
  });
}
