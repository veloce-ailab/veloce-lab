import { Context } from "yumeri";
import "@velocelab/dashboard";

export const depend = ["dashboard"];
export const provide = ["settings"];

export function apply(ctx: Context) {
  // The settings shell and its pages live in this plugin, so the labels it
  // renders are registered here as well. Group labels are read back as
  // `settings.group.<id>`; contributors may override any group by registering
  // the same key from their own package.
  ctx.i18n({
    settings: {
      title: { zh: "设置", en: "Settings", ja: "設定" },
      sidebar: { zh: "设置导航", en: "Settings navigation", ja: "設定ナビゲーション" },
      account: { zh: "账户", en: "Account", ja: "アカウント" },
      openMenu: { zh: "打开设置菜单", en: "Open settings menu", ja: "設定メニューを開く" },
      closeMenu: { zh: "关闭设置菜单", en: "Close settings menu", ja: "設定メニューを閉じる" },
      proxy: { zh: "网络代理", en: "Network proxy", ja: "ネットワークプロキシ" },
      theme: { zh: "主题设置", en: "Theme", ja: "テーマ設定" },
      about: { zh: "软件信息", en: "About", ja: "ソフトウェア情報" },
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
}
