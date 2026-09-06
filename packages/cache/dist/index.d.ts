import { Context, Schema } from "yumeri";
export declare const depend: string[];
export declare const provide: string[];
export interface CacheConfig {
    enabled: boolean;
    address: string;
    username: string;
    password: string;
    database: string;
    tls: boolean;
}
export interface CacheService {
    get<T>(key: string): T | undefined;
    set<T>(key: string, value: T, ttlMs?: number): void;
    delete(key: string): void;
    acquireUserBillingLock(userId: number): Promise<() => void>;
    storeUserBillingBalance(userId: number, balance: string): void;
    invalidateUserBillingBalance(userId: number): void;
}
export declare const config: Schema<CacheConfig>;
declare module "yumeri" {
    interface Components {
        cache: CacheService;
    }
}
export declare function apply(ctx: Context, _pluginConfig: CacheConfig): void;
