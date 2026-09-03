import { Context, Session } from "yumeri";
import type { ServiceRegistry } from "@velocelab/service";
export const depend = ["velocelab-core", "ratelimit", "service"];
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
  const service = ctx.component.service as ServiceRegistry;
  const middleware: MiddlewareService = {
    installed: () => true,
    async authenticate(session) {
      const header = session.client.req?.headers.authorization ?? "";
      const parts = header.trim().split(/\s+/);
      if (parts.length !== 2 || parts[0].toLowerCase() !== "bearer")
        return false;
      const user = await service.verifyToken(parts[1]);
      if (!user) return false;
      session.properties.user = user;
      return true;
    },
    isAdmin: (session) =>
      Boolean(
        (session.properties.user as { is_admin?: boolean } | undefined)
          ?.is_admin,
      ),
  };
  ctx.registerComponent("middleware", middleware);
}
