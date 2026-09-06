import { Context, Schema } from "yumeri";
export declare const depend: string[];
export declare const provide: string[];
export interface RateLimitConfig {
    enabled: boolean;
    requestsPerMinute: string;
    burst: string;
}
export interface RateLimitDecision {
    allowed: boolean;
    limit: number;
    remaining: number;
    retryAfter: number;
}
export interface UserChannelLimit {
    id?: number;
    rate_limit_enabled: boolean;
    rate_limit_requests_per_minute: number;
    rate_limit_burst: number;
}
export interface RateLimitService {
    allow(key: string): RateLimitDecision;
    allowUserChannel(userId: number, channel?: UserChannelLimit): RateLimitDecision;
    publicConfig(): RateLimitConfig;
}
export declare const config: Schema<RateLimitConfig>;
declare module "yumeri" {
    interface Components {
        ratelimit: RateLimitService;
    }
}
export declare function apply(ctx: Context, pluginConfig: RateLimitConfig): void;
