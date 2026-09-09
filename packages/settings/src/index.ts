import { Context } from "yumeri";
import "@velocelab/dashboard";

export const depend = ["dashboard"];
export const provide = ["settings"];

export function apply(ctx: Context) {
  ctx.i18n({
    settings: {
      title: { zh: "设置", en: "Settings", ja: "設定" },
      sidebar: { zh: "设置导航", en: "Settings navigation", ja: "設定ナビゲーション" },
    },
  });
  ctx.component.dashboard.addEntry({
    id: "settings",
    dev: new URL("../frontend/index.tsx", import.meta.url).pathname,
    prod: new URL("./frontend/settings.js", import.meta.url).pathname,
    plugin: "settings",
  });
}
