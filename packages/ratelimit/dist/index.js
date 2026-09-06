import { Schema } from "yumeri";
export const depend = [];
export const provide = ["ratelimit"];
export const config = Schema.object({
    enabled: Schema.boolean("Enable rate limiting").default(true),
    requestsPerMinute: Schema.string("Requests per minute").default("60"),
    burst: Schema.string("Burst size").default("10"),
});
const minute = 60_000;
function integer(value) {
    const result = Number.parseInt(value, 10);
    return Number.isSafeInteger(result) ? result : 0;
}
function consume(entries, key, limit, now) {
    for (const [entryKey, entry] of entries) {
        if (now - entry.lastSeen > minute * 5)
            entries.delete(entryKey);
    }
    let entry = entries.get(key);
    if (!entry || now - entry.windowStart >= minute) {
        entry = { windowStart: now, count: 0, lastSeen: now };
        entries.set(key, entry);
    }
    entry.count += 1;
    entry.lastSeen = now;
    if (entry.count <= limit) {
        return { allowed: true, limit, remaining: limit - entry.count, retryAfter: 0 };
    }
    return {
        allowed: false,
        limit,
        remaining: 0,
        retryAfter: Math.max(1, Math.ceil((minute - (now - entry.windowStart)) / 1000)),
    };
}
export function apply(ctx, pluginConfig) {
    const entries = new Map();
    const userChannelEntries = new Map();
    ctx.registerComponent("ratelimit", {
        allow(key) {
            if (!pluginConfig.enabled)
                return { allowed: true, limit: 0, remaining: 0, retryAfter: 0 };
            const requests = integer(pluginConfig.requestsPerMinute);
            if (requests <= 0)
                return { allowed: true, limit: 0, remaining: 0, retryAfter: 0 };
            return consume(entries, key, requests + Math.max(0, integer(pluginConfig.burst)), Date.now());
        },
        allowUserChannel(userId, channel) {
            if (!userId || !channel?.id || !channel.rate_limit_enabled || channel.rate_limit_requests_per_minute <= 0) {
                return { allowed: true, limit: 0, remaining: 0, retryAfter: 0 };
            }
            const limit = channel.rate_limit_requests_per_minute + Math.max(0, channel.rate_limit_burst);
            if (limit <= 0)
                return { allowed: true, limit: 0, remaining: 0, retryAfter: 0 };
            return consume(userChannelEntries, `${userId}:${channel.id}`, limit, Date.now());
        },
        publicConfig: () => pluginConfig,
    });
}
