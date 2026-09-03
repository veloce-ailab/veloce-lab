import { Context, Schema, Session } from "yumeri";

export const depend = ["velocelab-core", "model", "service", "middleware", "ratelimit"];
export const provide = ["api"];

export interface ApiConfig {
  siteName: string;
  baseUrl: string;
  edition: string;
  communityEnabled: boolean;
}

export const config: Schema<ApiConfig> = Schema.object({
  siteName: Schema.string("Site name").default("Veloce"),
  baseUrl: Schema.string("Public base URL").default(""),
  edition: Schema.string("Build edition").default("community"),
  communityEnabled: Schema.boolean("Community features enabled").default(true),
});

export interface ApiRegistry {
  version: string;
}

declare module "yumeri" {
  interface Components {
    api: ApiRegistry;
  }
}

export function apply(ctx: Context, pluginConfig: ApiConfig) {
  const service = ctx.component
    .service as import("@velocelab/service").ServiceRegistry;
  const rateLimit = ctx.component
    .ratelimit as import("@velocelab/ratelimit").RateLimitService;
  const middleware = ctx.component
    .middleware as import("@velocelab/middleware").MiddlewareService;
  const model = ctx.component.model as import("@velocelab/model").ModelService;

  ctx.registerComponent("api", { version: "0.1.0" });

  // Context.route() uses platform path joining; Core.route preserves HTTP slashes on Windows.
  ctx
    .getCore()
    .route("/api/public/settings", ctx)
    .methods("GET")
    .action((session: Session) => {
      session.respond(
        {
          backend_version: "0.1.0",
          site_name: pluginConfig.siteName,
          base_url: pluginConfig.baseUrl,
          edition: pluginConfig.edition,
          community_enabled: pluginConfig.communityEnabled,
          rate_limit_enabled: rateLimit.publicConfig().enabled,
          rate_limit_requests_per_minute:
            rateLimit.publicConfig().requestsPerMinute,
          rate_limit_burst: rateLimit.publicConfig().burst,
        },
        "json",
      );
    });

  ctx
    .getCore()
    .route("/api/configuration", ctx)
    .methods("GET")
    .action((session: Session) => {
      session.respond({
        site_name: pluginConfig.siteName,
        base_url: pluginConfig.baseUrl,
        edition: pluginConfig.edition,
        community_enabled: pluginConfig.communityEnabled,
        auth_agreement_mode: service.publicConfiguration().authAgreementMode,
        password_registration_enabled: service.publicConfiguration().passwordRegistrationEnabled,
        password_hcaptcha_enabled: service.publicConfiguration().passwordHCaptchaEnabled,
      }, "json");
    });

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

  const currentUser = async (session: Session) => {
    if (!(await middleware.authenticate(session))) {
      session.status = 401;
      session.respond({ error: "Authorization is required" }, "json");
      return undefined;
    }
    return session.properties.user as import("@velocelab/model").User;
  };

  const requireAdmin = async (session: Session) => {
    const user = await currentUser(session);
    if (!user) return undefined;
    if (middleware.isAdmin(session)) return user;
    session.status = 403;
    session.respond({ error: "Admin access required" }, "json");
    return undefined;
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
    .route("/api/user/me", ctx)
    .methods("GET")
    .action(async (session: Session) => {
      const user = await currentUser(session);
      if (user) session.respond(user, "json");
    });


  ctx
    .getCore()
    .route("/api/channels", ctx)
    .methods("GET")
    .action(async (session: Session) => {
      if (!(await requireAdmin(session))) return;
      const channels = await model.channels.list();
      session.respond(channels, "json");
    });

  ctx
    .getCore()
    .route("/api/models", ctx)
    .methods("GET")
    .action(async (session: Session) => {
      if (!(await requireAdmin(session))) return;
      const models = await model.models.list();
      session.respond(models, "json");
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
