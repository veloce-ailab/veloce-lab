import { Context, Schema, Session } from "yumeri";

export const depend = ["velocelab-core", "model", "service", "middleware", "ratelimit", "advanced-chat"];
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
  const advancedChat = ctx.component["advanced-chat"] as import("@velocelab/advanced-chat").AdvancedChatService;

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

  const objectBody = async (session: Session) => {
    return (await session.parseRequestBody()) as Record<string, unknown>;
  };

  const stringList = (value: unknown) => {
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string")
      : [];
  };

  const agentResponse = (agent: import("@velocelab/model").HarnessAgent) => {
    return {
      ...agent,
      id: agent.stable_id || String(agent.id ?? ""),
    };
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
    .route("/api/user/advanced-chat/devices", ctx)
    .methods("GET")
    .action(async (session: Session) => {
      const user = await currentUser(session);
      if (!user?.id) return;
      const devices = await advancedChat.listConnectors(user.id);
      session.respond(devices.map(({ token_hash: _tokenHash, ...device }) => device), "json");
    });

  ctx
    .getCore()
    .route("/api/user/advanced-chat/devices/token", ctx)
    .methods("POST")
    .action(async (session: Session) => {
      const user = await currentUser(session);
      if (!user?.id) return;
      try {
        const body = await session.parseRequestBody();
        const created = await advancedChat.createConnector(user.id, value(body, "name"), value(body, "remark"));
        const { token_hash: _tokenHash, ...device } = created.device;
        session.respond({ ...device, token: created.token }, "json");
      } catch (error) {
        session.status = 400;
        session.respond({ error: error instanceof Error ? error.message : String(error) }, "json");
      }
    });

  ctx
    .getCore()
    .route("/api/user/advanced-chat/agents", ctx)
    .methods("GET")
    .action(async (session: Session) => {
      const user = await currentUser(session);
      if (!user?.id) return;
      const agents = await advancedChat.listAgents(user.id);
      session.respond(agents.map(agentResponse), "json");
    });

  ctx
    .getCore()
    .route("/api/user/advanced-chat/agents", ctx)
    .methods("POST")
    .action(async (session: Session) => {
      const user = await currentUser(session);
      if (!user?.id) return;
      try {
        const body = await objectBody(session);
        const agent = await advancedChat.createAgent(user.id, {
          name: String(body.name ?? ""),
          prompt: String(body.prompt ?? ""),
          defaultModel: String(body.default_model ?? ""),
          userChannelId: Number(body.user_channel_id ?? 0) || undefined,
          stream: body.stream === true,
          skillIds: stringList(body.skill_ids),
          mcpServerIds: stringList(body.mcp_server_ids),
        });
        session.status = 201;
        session.respond(agentResponse(agent), "json");
      } catch (error) {
        session.status = 400;
        session.respond({ error: error instanceof Error ? error.message : String(error) }, "json");
      }
    });

  ctx
    .getCore()
    .route("/api/user/advanced-chat/agents/:id", ctx)
    .methods("PUT")
    .action(async (session: Session, _params: URLSearchParams, id: string) => {
      const user = await currentUser(session);
      if (!user?.id) return;
      try {
        const body = await objectBody(session);
        const agent = await advancedChat.updateAgent(user.id, id, {
          name: String(body.name ?? ""),
          prompt: String(body.prompt ?? ""),
          defaultModel: String(body.default_model ?? ""),
          userChannelId: Number(body.user_channel_id ?? 0) || undefined,
          stream: body.stream === true,
          skillIds: stringList(body.skill_ids),
          mcpServerIds: stringList(body.mcp_server_ids),
        });
        if (!agent) {
          session.status = 404;
          session.respond({ error: "Agent not found" }, "json");
          return;
        }
        session.respond(agentResponse(agent), "json");
      } catch (error) {
        session.status = 400;
        session.respond({ error: error instanceof Error ? error.message : String(error) }, "json");
      }
    });

  ctx
    .getCore()
    .route("/api/user/advanced-chat/agents/:id", ctx)
    .methods("DELETE")
    .action(async (session: Session, _params: URLSearchParams, id: string) => {
      const user = await currentUser(session);
      if (!user?.id) return;
      await advancedChat.deleteAgent(user.id, id);
      session.respond({ success: true }, "json");
    });

  ctx
    .getCore()
    .route("/api/user/advanced-chat/sessions", ctx)
    .methods("GET")
    .action(async (session: Session) => {
      const user = await currentUser(session);
      if (!user?.id) return;
      session.respond(await advancedChat.listSessions(user.id), "json");
    });

  ctx
    .getCore()
    .route("/api/user/advanced-chat/sessions", ctx)
    .methods("POST")
    .action(async (session: Session) => {
      const user = await currentUser(session);
      if (!user?.id) return;
      const body = await objectBody(session);
      const created = await advancedChat.createSession(user.id, {
        agentId: typeof body.agent_id === "string" ? body.agent_id : undefined,
        title: typeof body.title === "string" ? body.title : undefined,
        modelName: typeof body.model_name === "string" ? body.model_name : undefined,
        userChannelId: Number(body.user_channel_id ?? 0) || undefined,
      });
      session.status = 201;
      session.respond(created, "json");
    });

  ctx
    .getCore()
    .route("/api/user/advanced-chat/scheduled-tasks", ctx)
    .methods("GET")
    .action(async (session: Session) => {
      const user = await currentUser(session);
      if (!user?.id) return;
      session.respond(await advancedChat.listScheduledTasks(user.id), "json");
    });

  ctx
    .getCore()
    .route("/api/user/advanced-chat/scheduled-tasks", ctx)
    .methods("POST")
    .action(async (session: Session) => {
      const user = await currentUser(session);
      if (!user?.id) return;
      try {
        const body = await objectBody(session);
        const task = await advancedChat.createScheduledTask(user.id, {
          name: String(body.name ?? ""),
          description: String(body.description ?? ""),
          agentId: String(body.agent_id ?? ""),
          scheduleType: String(body.schedule_type ?? "manual"),
          message: String(body.message ?? ""),
          modelName: String(body.model_name ?? ""),
          userChannelId: Number(body.user_channel_id ?? 0) || undefined,
          intervalSeconds: Number(body.interval_seconds ?? 0) || undefined,
          runAt: typeof body.run_at === "string" ? body.run_at : undefined,
        });
        session.status = 201;
        session.respond(task, "json");
      } catch (error) {
        session.status = 400;
        session.respond({ error: error instanceof Error ? error.message : String(error) }, "json");
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
