import { Context } from 'yumeri';
export const depend = ['velocelab-core', 'config', 'model'];
export const provide = ['adapters'];
export interface AdapterRegistry { names(): string[]; }
declare module 'yumeri' { interface Components { adapters: AdapterRegistry; } }
export function apply(ctx: Context) { ctx.registerComponent('adapters', { names: () => [] }); }
