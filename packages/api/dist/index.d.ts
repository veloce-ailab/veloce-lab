import { Context, Schema } from "yumeri";
export declare const depend: string[];
export declare const provide: string[];
export interface ApiConfig {
    siteName: string;
    baseUrl: string;
    edition: string;
    systemMode: string;
    communityEnabled: boolean;
    rateLimitEnabled: boolean;
}
export declare const config: Schema<ApiConfig>;
export interface ApiRegistry {
    version: string;
}
declare module "yumeri" {
    interface Components {
        api: ApiRegistry;
    }
}
export declare function apply(ctx: Context, pluginConfig: ApiConfig): void;
