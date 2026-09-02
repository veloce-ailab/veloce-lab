export const depend = ['velocelab-core', 'api', 'http'];
export const provide = ['app'];
export function apply(ctx) { ctx.registerComponent('app', { ready: () => true }); }
