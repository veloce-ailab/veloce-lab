import { Context, Session } from "yumeri";

export const depend = ["velocelab-core", "config", "service", "middleware"];
export const provide = ["api"];
export interface ApiRegistry {
  version: string;
}
declare module "yumeri" {
  interface Components {
    api: ApiRegistry;
  }
}

export function apply(ctx: Context) {
  ctx.registerComponent("api", { version: "0.1.0" });
  // Context.route() uses platform path joining; Core.route preserves HTTP slashes on Windows.
  ctx
    .getCore()
    .route("/api/public/settings", ctx)
    .methods("GET")
    .action((session: Session) => {
      session.respond(ctx.component.config.publicSettings(), "json");
    });
  const service = ctx.component
    .service as import("@velocelab/service").ServiceRegistry;
  ctx
    .getCore()
    .route("/api/setup/status", ctx)
    .methods("GET")
    .action(async (session: Session) => {
      session.respond(
        { required: await service.initialSetupRequired() },
        "json",
      );
    });

  const value = (
    body: Record<string, string | string[] | undefined>,
    key: string,
  ) => {
    const item = body[key];
    return Array.isArray(item) ? (item[0] ?? "") : (item ?? "");
  };

  ctx
    .getCore()
    .route("/api/setup", ctx)
    .methods("POST")
    .action(async (session: Session) => {
      try {
        const body = await session.parseRequestBody();
        const result = await service.setupInitialAdmin({
          username: value(body, "username"),
          email: value(body, "email"),
          password: value(body, "password"),
        });
        session.respond(result, "json");
      } catch (error) {
        session.status = 400;
        session.respond(
          { error: error instanceof Error ? error.message : String(error) },
          "json",
        );
      }
    });

  ctx
    .getCore()
    .route("/auth/password/login", ctx)
    .methods("POST")
    .action(async (session: Session) => {
      try {
        const body = await session.parseRequestBody();
        const result = await service.loginWithPassword(
          value(body, "identifier"),
          value(body, "password"),
        );
        session.respond(result, "json");
      } catch (error) {
        session.status = 401;
        session.respond(
          { error: error instanceof Error ? error.message : String(error) },
          "json",
        );
      }
    });
}
