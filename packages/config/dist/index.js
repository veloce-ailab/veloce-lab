import { Schema } from 'yumeri';
export const depend = ['velocelab-core'];
export const provide = ['config'];
export const config = Schema.object({ siteName: Schema.string('Site name').default('Veloce Lab') });
export function apply(ctx, pluginConfig) { ctx.registerComponent('config', pluginConfig); }
