import { Context } from 'yumeri';
export const depend = ['velocelab-core', 'config', 'model', 'adapters'];
export const provide = ['channel'];
export interface ChannelService { list(): string[]; }
declare module 'yumeri' { interface Components { channel: ChannelService; } }
export function apply(ctx: Context) { ctx.registerComponent('channel', { list: () => [] }); }
