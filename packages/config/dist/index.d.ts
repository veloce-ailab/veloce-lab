import { Context, Schema } from 'yumeri';
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
export declare const depend: string[];
export declare const provide: string[];
export declare const config: Schema<AppConfig>;
declare module 'yumeri' {
    interface Components {
        config: ConfigService;
    }
}
export declare function apply(ctx: Context, pluginConfig: AppConfig): void;
