import { Context, Session } from 'yumeri';

export const depend = ['velocelab-core', 'file'];
export const provide = ['http'];
export const usage = 'Registers the Veloce Lab HTTP API routes.';

export interface HttpService { health(): { status: 'ok'; service: string }; }

declare module 'yumeri' { interface Components { http: HttpService; } }

export function apply(ctx: Context) {
  const http: HttpService = { health: () => ({ status: 'ok', service: 'velocelab' }) };
  ctx.registerComponent('http', http);
  // Context.route() uses platform path joining; Core.route preserves HTTP slashes on Windows.
  ctx.getCore().route('/health', ctx).methods('GET').action((session: Session) => session.respond(http.health(), 'json'));
}
