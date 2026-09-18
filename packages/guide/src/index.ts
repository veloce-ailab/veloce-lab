import { Context, Session } from "yumeri";
import "@velocelab/dashboard";

// `depend` is checked against registered components and services, not against
// another plugin's `provide` list, so it names only what this plugin reaches for
// at apply time. The settings frame it registers a page into is a frontend
// concern: if that frame is absent the page is simply never rendered.
export const depend = ["dashboard"];
export const provide = ["guide"];

/**
 * The setup guide is guidance about the instance, not a capability of it, so it
 * lives on its own instead of inside the settings shell. It measures what it can
 * through the services other plugins already publish and says nothing it did not
 * check.
 */

/** Services the checklist consults; a missing one drops its step. */
interface ChannelAdminService {
  list(): Promise<unknown[]>;
}

interface UserService {
  findAdmin(): Promise<unknown>;
}

interface PluginLoader {
  config: { plugins?: Record<string, Record<string, unknown>> };
}

/**
 * One thing worth settling before the instance is really in use. The server
 * reports only what it measured, and the wording lives in the frontend keyed by
 * step id, so copy changes never need a server change.
 */
export interface GuideStep {
  id: string;
  done: boolean;
  /** What the check found, shown when the step is not done. */
  detail?: string;
  /** Where the user goes to settle it. */
  path: string;
}

export function apply(ctx: Context) {
  ctx.i18n({
    guide: {
      title: { zh: "设置向导", en: "Setup guide", ja: "セットアップガイド" },
      subtitle: {
        zh: "把实例配置成真正能用的样子。",
        en: "Get the instance into a state that actually works.",
        ja: "インスタンスを実際に使える状態にします。",
      },
      remaining: { zh: "项待完成", en: "left to settle", ja: "件が未完了" },
      allDone: { zh: "要检查的都完成了。", en: "Everything on the list is settled.", ja: "確認項目はすべて完了しています。" },
      loadFailed: { zh: "读取向导状态失败", en: "Could not read the guide state", ja: "ガイドの状態を取得できませんでした" },
      open: { zh: "去处理", en: "Open", ja: "開く" },
      done: { zh: "已完成", en: "Done", ja: "完了" },
      todo: { zh: "待完成", en: "To do", ja: "未完了" },
      step: {
        admin: {
          title: { zh: "确认管理员账号", en: "Confirm an administrator account", ja: "管理者アカウントを確認" },
          description: {
            zh: "还没有管理员账号,先建一个再继续。",
            en: "There is no administrator account yet; create one before going further.",
            ja: "管理者アカウントがまだありません。先に作成してください。",
          },
        },
        channel: {
          title: { zh: "接入模型通道", en: "Connect a model channel", ja: "モデルチャネルを接続" },
          description: {
            zh: "还没有模型上游通道,聊天和智能体都没有可以调用的上游。",
            en: "There is no upstream model channel, so chat and agents have nothing to call.",
            ja: "モデルの上流チャネルがなく、チャットとエージェントが動作しません。",
          },
        },
        plugins: {
          title: { zh: "确认被禁用的插件", en: "Review disabled plugins", ja: "無効なプラグインを確認" },
          description: {
            zh: "有插件处于禁用状态,确认一下是不是你要的。",
            en: "Some plugins are disabled; check that this is what you want.",
            ja: "無効になっているプラグインがあります。意図どおりか確認してください。",
          },
        },
      },
    },
  });
  ctx.component.dashboard.addEntry({
    id: "guide",
    dev: new URL("../frontend/index.tsx", import.meta.url).pathname,
    prod: new URL("./frontend/guide.js", import.meta.url).pathname,
    plugin: "guide",
  });

  const loader = () => (ctx.getCore() as unknown as { loader?: PluginLoader }).loader;

  /**
   * `ctx.component.name` only exposes what `depend` declared, and anything
   * declared there makes this plugin wait — and stay pending — when the other
   * plugin is absent. The steps below are optional integrations, so they are
   * looked up in the live registry instead: present when the plugin is, absent
   * without consequence.
   */
  const component = <T,>(name: string) =>
    (ctx.getCore() as unknown as { getComponent(name: string): T | undefined }).getComponent(name);

  const steps = async (): Promise<GuideStep[]> => {
    const found: GuideStep[] = [];
    const plugins = loader()?.config.plugins ?? {};

    const users = component<UserService>("user");
    if (users) {
      const admin = await users.findAdmin().catch(() => undefined);
      found.push({ id: "admin", done: Boolean(admin), path: "/settings/security" });
    }

    const channels = component<ChannelAdminService>("channel-admin");
    if (channels) {
      const rows = await channels.list().catch(() => [] as unknown[]);
      found.push({ id: "channel", done: rows.length > 0, path: "/settings/channels" });
    }

    // A disabled plugin is not a fault, but it is the usual reason something
    // looks missing, so the names are surfaced rather than hidden.
    const disabled = Object.keys(plugins).filter((key) => key.startsWith("~")).map((key) => key.slice(1));
    found.push({
      id: "plugins",
      done: disabled.length === 0,
      detail: disabled.length ? disabled.join(", ") : undefined,
      path: "/settings/plugins",
    });

    return found;
  };

  ctx.route("/api/guide/steps").methods("GET").action(async (session: Session) => {
    session.respond({ steps: await steps() }, "json");
  });
}
