import { Context } from 'yumeri';
export const depend = ['velocelab-core', 'config', 'cache', 'model', 'adapters', 'channel'];
export const provide = ['service'];
export interface ServiceRegistry { names(): string[]; }
declare module 'yumeri' { interface Components { service: ServiceRegistry; } }
export function apply(ctx: Context) { ctx.registerComponent('service', { names: () => ['auth', 'billing', 'chat', 'plugins'] }); }
