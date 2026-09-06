import { Context, Session } from "yumeri";
export const depend: string[] = [];
export const provide = ["middleware"];
export interface MiddlewareService {
  installed(): boolean;
  authenticate(session: Session): Promise<boolean>;
  isAdmin(session: Session): boolean;
}
declare module "yumeri" {
  interface Components {
    middleware: MiddlewareService;
  }
}
export function apply(ctx: Context) {
  const middleware: MiddlewareService = {
    installed: () => true,
    async authenticate(session) { return Boolean(session.properties.user); },
    isAdmin: (session) =>
      Boolean(
        (session.properties.user as { is_admin?: boolean } | undefined)
          ?.is_admin,
      ),
  };
  ctx.registerComponent("middleware", middleware);
}
