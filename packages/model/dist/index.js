export const depend = ['velocelab-core', 'config', 'database'];
export const provide = ['model'];
export function apply(ctx) { ctx.registerComponent('model', { ready: () => true }); }
