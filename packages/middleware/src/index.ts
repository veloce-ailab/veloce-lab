import { Context } from 'yumeri';
export const depend = ['velocelab-core', 'ratelimit', 'service'];
export const provide = ['middleware'];
export interface MiddlewareService { installed(): boolean; }
declare module 'yumeri' { interface Components { middleware: MiddlewareService; } }
export function apply(ctx: Context) { ctx.registerComponent('middleware', { installed: () => true }); }
