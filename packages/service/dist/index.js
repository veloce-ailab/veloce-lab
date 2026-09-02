export const depend = ['velocelab-core', 'config', 'cache', 'model', 'adapters', 'channel'];
export const provide = ['service'];
export function apply(ctx) { ctx.registerComponent('service', { names: () => ['auth', 'billing', 'chat', 'plugins'] }); }
