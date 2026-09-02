export const depend = ['velocelab-core', 'file'];
export const provide = ['http'];
export const usage = 'Registers the Veloce Lab HTTP API routes.';
export function apply(ctx) {
    const http = { health: () => ({ status: 'ok', service: 'velocelab' }) };
    ctx.registerComponent('http', http);
    // Context.route() uses platform path joining; Core.route preserves HTTP slashes on Windows.
    ctx.getCore().route('/health', ctx).methods('GET').action((session) => session.respond(http.health(), 'json'));
}
