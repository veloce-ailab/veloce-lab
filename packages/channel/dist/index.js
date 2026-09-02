export const depend = ['velocelab-core', 'config', 'model', 'adapters'];
export const provide = ['channel'];
export function apply(ctx) { ctx.registerComponent('channel', { list: () => [] }); }
