import { Context, Session } from "yumeri";
import type { ServiceRegistry } from "@velocelab/service";
export const depend = ["service"];
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
  ctx.use("authentication", async (session: Session, next: () => Promise<void>) => {
    const path = session.pathname || "";
    const publicRoute = path === "/api/public/settings" ||
      path === "/api/configuration" ||
      path === "/api/setup/status" ||
      path === "/api/setup" ||
      path === "/auth/password/login" ||
      path.startsWith("/api/advanced-chat/connectors/");
    if (!path.startsWith("/api/") && !path.startsWith("/auth/")) {
      await next();
      return;
    }
    if (publicRoute) {
      await next();
      return;
    }
    if (!(await middleware.authenticate(session))) {
      session.status = 401;
      session.respond({ error: "Authorization is required" }, "json");
      return;
    }
    await next();
  });
}
