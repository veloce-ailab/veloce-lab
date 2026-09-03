import { Context, Schema } from "yumeri";

export const depend = ["velocelab-core", "cache"];
export const provide = ["ratelimit"];

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

export const config: Schema<RateLimitConfig> = Schema.object({
  enabled: Schema.boolean("Enable rate limiting").default(true),
  requestsPerMinute: Schema.string("Requests per minute").default("60"),
  burst: Schema.string("Burst size").default("10"),
});

declare module "yumeri" {
  interface Components {
    ratelimit: RateLimitService;
  }
}

interface Entry {
  windowStart: number;
  count: number;
  lastSeen: number;
}

const minute = 60_000;

function integer(value: string): number {
  const result = Number.parseInt(value, 10);
  return Number.isSafeInteger(result) ? result : 0;
}

function consume(entries: Map<string, Entry>, key: string, limit: number, now: number): RateLimitDecision {
  for (const [entryKey, entry] of entries) {
    if (now - entry.lastSeen > minute * 5) entries.delete(entryKey);
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

export function apply(ctx: Context, pluginConfig: RateLimitConfig) {
  const entries = new Map<string, Entry>();
  const userChannelEntries = new Map<string, Entry>();

  ctx.registerComponent("ratelimit", {
    allow(key) {
      if (!pluginConfig.enabled) return { allowed: true, limit: 0, remaining: 0, retryAfter: 0 };
      const requests = integer(pluginConfig.requestsPerMinute);
      if (requests <= 0) return { allowed: true, limit: 0, remaining: 0, retryAfter: 0 };
      return consume(entries, key, requests + Math.max(0, integer(pluginConfig.burst)), Date.now());
    },
    allowUserChannel(userId, channel) {
      if (!userId || !channel?.id || !channel.rate_limit_enabled || channel.rate_limit_requests_per_minute <= 0) {
        return { allowed: true, limit: 0, remaining: 0, retryAfter: 0 };
      }
      const limit = channel.rate_limit_requests_per_minute + Math.max(0, channel.rate_limit_burst);
      if (limit <= 0) return { allowed: true, limit: 0, remaining: 0, retryAfter: 0 };
      return consume(userChannelEntries, `${userId}:${channel.id}`, limit, Date.now());
    },
    publicConfig: () => pluginConfig,
  });
}
