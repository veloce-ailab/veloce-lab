import { Schema } from "yumeri";
export const depend = ["velocelab-core"];
export const provide = ["config"];
export const config = Schema.object({
    siteName: Schema.string("Site name").default("Veloce"),
    baseUrl: Schema.string("Public base URL").default(""),
    edition: Schema.string("Build edition").default("community"),
    systemMode: Schema.string("System mode").default("operation"),
    communityEnabled: Schema.boolean("Community features enabled").default(true),
    rateLimitEnabled: Schema.boolean("Rate limiting enabled").default(true),
});
export function apply(ctx, pluginConfig) {
    ctx.registerComponent("config", {
        publicSettings: () => ({
            backend_version: "0.1.0",
            site_name: pluginConfig.siteName,
            base_url: pluginConfig.baseUrl,
            edition: pluginConfig.edition,
            system_mode: pluginConfig.systemMode,
            community_enabled: pluginConfig.communityEnabled,
            rate_limit_enabled: pluginConfig.rateLimitEnabled,
        }),
    });
}
