import { Context } from 'yumeri';
export const depend = ['velocelab-core', 'config'];
export const provide = ['model'];
export interface ModelService { ready(): boolean; }
declare module 'yumeri' { interface Components { model: ModelService; } }
export function apply(ctx: Context) { ctx.registerComponent('model', { ready: () => true }); }
