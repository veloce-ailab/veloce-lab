import { Schema } from "yumeri";
export const depend = ["velocelab-core", "service", "middleware"];
export const provide = ["api"];
export const config = Schema.object({
    siteName: Schema.string("Site name").default("Veloce"),
    baseUrl: Schema.string("Public base URL").default(""),
    edition: Schema.string("Build edition").default("community"),
    systemMode: Schema.string("System mode").default("operation"),
    communityEnabled: Schema.boolean("Community features enabled").default(true),
    rateLimitEnabled: Schema.boolean("Rate limiting enabled").default(true),
});
export function apply(ctx, pluginConfig) {
    const service = ctx.component
        .service;
    ctx.registerComponent("api", { version: "0.1.0" });
    // Context.route() uses platform path joining; Core.route preserves HTTP slashes on Windows.
    ctx
        .getCore()
        .route("/api/public/settings", ctx)
        .methods("GET")
        .action((session) => {
        session.respond({
            backend_version: "0.1.0",
            site_name: pluginConfig.siteName,
            base_url: pluginConfig.baseUrl,
            edition: pluginConfig.edition,
            system_mode: pluginConfig.systemMode,
            community_enabled: pluginConfig.communityEnabled,
            rate_limit_enabled: pluginConfig.rateLimitEnabled,
        }, "json");
    });
    ctx
        .getCore()
        .route("/api/setup/status", ctx)
        .methods("GET")
        .action(async (session) => {
        session.respond({ required: await service.initialSetupRequired() }, "json");
    });
    const value = (body, key) => {
        const item = body[key];
        return Array.isArray(item) ? (item[0] ?? "") : (item ?? "");
    };
    ctx
        .getCore()
        .route("/api/setup", ctx)
        .methods("POST")
        .action(async (session) => {
        try {
            const body = await session.parseRequestBody();
            const result = await service.setupInitialAdmin({
                username: value(body, "username"),
                email: value(body, "email"),
                password: value(body, "password"),
            });
            session.respond(result, "json");
        }
        catch (error) {
            session.status = 400;
            session.respond({ error: error instanceof Error ? error.message : String(error) }, "json");
        }
    });
    ctx
        .getCore()
        .route("/auth/password/login", ctx)
        .methods("POST")
        .action(async (session) => {
        try {
            const body = await session.parseRequestBody();
            const result = await service.loginWithPassword(value(body, "identifier"), value(body, "password"));
            session.respond(result, "json");
        }
        catch (error) {
            session.status = 401;
            session.respond({ error: error instanceof Error ? error.message : String(error) }, "json");
        }
    });
}
