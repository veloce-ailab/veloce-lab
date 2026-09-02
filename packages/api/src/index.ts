import { Context } from 'yumeri';
export const depend = ['velocelab-core', 'service', 'middleware'];
export const provide = ['api'];
export interface ApiRegistry { version: string; }
declare module 'yumeri' { interface Components { api: ApiRegistry; } }
export function apply(ctx: Context) { ctx.registerComponent('api', { version: '0.1.0' }); }
