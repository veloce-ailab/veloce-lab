import { Context, Schema } from "yumeri";

export interface AppConfig {
  siteName: string;
  baseUrl: string;
  edition: string;
  systemMode: string;
  communityEnabled: boolean;
  rateLimitEnabled: boolean;
}

export interface PublicSettings {
  backend_version: string;
  site_name: string;
  base_url: string;
  edition: string;
  system_mode: string;
  community_enabled: boolean;
  rate_limit_enabled: boolean;
}

export interface ConfigService {
  publicSettings(): PublicSettings;
}

export const depend = ["velocelab-core"];
export const provide = ["config"];
export const config: Schema<AppConfig> = Schema.object({
  siteName: Schema.string("Site name").default("Veloce"),
  baseUrl: Schema.string("Public base URL").default(""),
  edition: Schema.string("Build edition").default("community"),
  systemMode: Schema.string("System mode").default("operation"),
  communityEnabled: Schema.boolean("Community features enabled").default(true),
  rateLimitEnabled: Schema.boolean("Rate limiting enabled").default(true),
});

declare module "yumeri" {
  interface Components {
    config: ConfigService;
  }
}

export function apply(ctx: Context, pluginConfig: AppConfig) {
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
