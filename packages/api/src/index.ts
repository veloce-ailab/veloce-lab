import { Context, Session } from 'yumeri';

export const depend = ['velocelab-core', 'config', 'service', 'middleware'];
export const provide = ['api'];
export interface ApiRegistry { version: string; }
declare module 'yumeri' { interface Components { api: ApiRegistry; } }

export function apply(ctx: Context) {
  ctx.registerComponent('api', { version: '0.1.0' });
  // Context.route() uses platform path joining; Core.route preserves HTTP slashes on Windows.
  ctx.getCore().route('/api/public/settings', ctx).methods('GET').action((session: Session) => {
    session.respond(ctx.component.config.publicSettings(), 'json');
  });
}
