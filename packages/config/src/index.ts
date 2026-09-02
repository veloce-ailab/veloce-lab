import { Context, Schema } from 'yumeri';
export interface AppConfig { siteName: string; }
export const depend = ['velocelab-core'];
export const provide = ['config'];
export const config: Schema<AppConfig> = Schema.object({ siteName: Schema.string('Site name').default('Veloce Lab') });
declare module 'yumeri' { interface Components { config: AppConfig; } }
export function apply(ctx: Context, pluginConfig: AppConfig) { ctx.registerComponent('config', pluginConfig); }
