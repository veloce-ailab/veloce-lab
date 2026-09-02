import { Context } from 'yumeri';
export const depend = ['velocelab-core', 'cache'];
export const provide = ['ratelimit'];
export interface RateLimitService { allow(key: string): boolean; }
declare module 'yumeri' { interface Components { ratelimit: RateLimitService; } }
export function apply(ctx: Context) { ctx.registerComponent('ratelimit', { allow: () => true }); }
