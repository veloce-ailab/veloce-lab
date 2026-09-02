export const depend = ['velocelab-core', 'service', 'middleware'];
export const provide = ['api'];
export function apply(ctx) { ctx.registerComponent('api', { version: '0.1.0' }); }
