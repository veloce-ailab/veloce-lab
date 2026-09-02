import { Context } from "yumeri";
export declare const depend: string[];
export declare const provide: string[];
export interface RateLimitService {
    allow(key: string): boolean;
}
declare module "yumeri" {
    interface Components {
        ratelimit: RateLimitService;
    }
}
export declare function apply(ctx: Context): void;
