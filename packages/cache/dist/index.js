import { Schema } from "yumeri";
export const depend = [];
export const provide = ["cache"];
export const config = Schema.object({
    enabled: Schema.boolean("Enable Redis cache").default(false),
    address: Schema.string("Redis address").default("127.0.0.1:6379"),
    username: Schema.string("Redis username").default(""),
    password: Schema.string("Redis password").default(""),
    database: Schema.string("Redis database").default("0"),
    tls: Schema.boolean("Enable Redis TLS").default(false),
});
export function apply(ctx, _pluginConfig) {
    const store = new Map();
    const billingLocks = new Map();
    ctx.registerComponent("cache", {
        get(key) {
            const entry = store.get(key);
            if (!entry)
                return undefined;
            if (entry.expiresAt && entry.expiresAt <= Date.now()) {
                store.delete(key);
                return undefined;
            }
            return entry.value;
        },
        set(key, value, ttlMs) {
            store.set(key, { value, expiresAt: ttlMs ? Date.now() + ttlMs : undefined });
        },
        delete(key) {
            store.delete(key);
        },
        async acquireUserBillingLock(userId) {
            if (!userId)
                return () => { };
            const previous = billingLocks.get(userId);
            if (previous)
                await previous;
            let release;
            const current = new Promise((resolve) => {
                release = resolve;
            });
            billingLocks.set(userId, current);
            return () => {
                if (billingLocks.get(userId) === current) {
                    billingLocks.delete(userId);
                }
                release();
            };
        },
        storeUserBillingBalance(userId, balance) {
            if (userId) {
                store.set(`veloce:billing:user:${userId}:balance`, {
                    value: balance,
                    expiresAt: Date.now() + 600_000,
                });
            }
        },
        invalidateUserBillingBalance(userId) {
            if (userId) {
                store.delete(`veloce:billing:user:${userId}:balance`);
            }
        },
    });
}
