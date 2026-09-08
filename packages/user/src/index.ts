import { Context, Session } from "yumeri";
import { ModelService, User } from "@velocelab/model";

export const depend = ["model"];
export const provide = ["user"];
export interface UserService {
  current(session: Session): Promise<User | undefined>;
}
declare module "yumeri" {
  interface Components {
    user: UserService;
  }
}

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
  ctx.use(
    "user-context",
    async (session: Session, next: () => Promise<void>) => {
      if (!session.properties.user) {
        const current = await service.current(session);
        if (current) session.properties.user = current;
      }
      await next();
    },
  );
  ctx
    .route("/api/user/me")
    .methods("GET")
    .action(async (session) => {
      const current =
        (session.properties.user as User | undefined) ??
        (await service.current(session));
      if (!current) {
        session.status = 401;
        session.respond({ error: "Authorization is required" }, "json");
        return;
      }
      session.respond(current, "json");
    });
  ctx
    .route("/api/user/me")
    .methods("PUT")
    .action(async (session) => {
      const current =
        (session.properties.user as User | undefined) ??
        (await service.current(session));
      if (!current) {
        session.status = 401;
        session.respond({ error: "Authorization is required" }, "json");
        return;
      }
      const input = (await session.parseRequestBody()) as Record<
        string,
        unknown
      >;
      const updates: Partial<User> = {};
      if (typeof input.username === "string" && input.username.trim())
        updates.username = input.username.trim().slice(0, 80);
      if (typeof input.email === "string" && input.email.includes("@"))
        updates.email = input.email.trim().toLowerCase();
      if (typeof input.phone === "string")
        updates.phone = input.phone.trim().slice(0, 40) || null;
      if (typeof input.avatar_url === "string")
        updates.avatar_url = input.avatar_url.trim().slice(0, 500);
      const updated = await model.users.update(current.id, updates);
      session.respond(updated ?? current, "json");
    });
}
