import { Context } from 'yumeri';
export const depend = ['velocelab-core', 'api', 'http'];
export const provide = ['app'];
export interface AppService { ready(): boolean; }
declare module 'yumeri' { interface Components { app: AppService; } }
export function apply(ctx: Context) { ctx.registerComponent('app', { ready: () => true }); }
