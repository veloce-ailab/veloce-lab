import { Context, Session } from "yumeri";
import type { ModelService, User } from "@velocelab/model";

export const depend = ["model"];
export const provide = ["user"];
export interface UserService {
  current(session: Session): Promise<User | undefined>;
}
declare module "yumeri" { interface Components { user: UserService; } }

export function apply(ctx: Context) {
  const model = ctx.component.model as ModelService;
  const service: UserService = {
    async current(session) {
      const raw = session.client.req?.headers.cookie ?? "";
      const match = String(raw).match(/(?:^|;\s*)userid=(\d+)/);
      const id = match ? Number(match[1]) : 0;
      if (!id) return undefined;
      return model.users.findById(id);
    },
  };
  ctx.registerComponent("user", service);
  ctx.use("user-context", async (session: Session, next: () => Promise<void>) => {
    if (!session.properties.user) {
      const current = await service.current(session);
      if (current) session.properties.user = current;
    }
    await next();
  });
}
