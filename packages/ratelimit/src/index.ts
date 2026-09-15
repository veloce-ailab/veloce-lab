import { Context, Schema, Session } from "yumeri";

// This plugin is a layer, not a dependency: it declares none and installs
// itself with `ctx.use`, so an instance that never enables it is simply not
// rate limited. Everything other plugins may want from it is reached through
// the optional `ratelimit` component, which is absent when it is not loaded.
export const depend: string[] = [];
export const provide = ["ratelimit"];

export interface RateLimitConfig {
  requestsPerMinute: string;
  burst: string;
}

export interface RateLimitDecision {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfter: number;
  /** Unix seconds at which the window resets. */
  resetAt: number;
}

export interface UserChannelLimit {
  id?: number;
  rate_limit_enabled: boolean;
  rate_limit_requests_per_minute: number;
  rate_limit_burst: number;
}

export interface RateLimitService {
  /** Consume one unit of the named budget and report what is left. */
  allow(key: string, limit?: number, windowMs?: number): RateLimitDecision;
  allowUserChannel(
    userId: number,
    channel?: UserChannelLimit,
  ): RateLimitDecision;
  /** Refuse the current request when the named budget is exhausted. */
  enforce(
    session: Session,
    key: string,
    options?: { limit?: number; windowMs?: number },
  ): boolean;
  publicConfig(): RateLimitConfig;
}

export const config: Schema<RateLimitConfig> = Schema.object({
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
/** A bucket nobody has touched for this long is dead weight. */
const idleWindow = minute * 5;
/** Sign-in is the one endpoint worth a budget of its own. */
const credentialPaths = new Set([
  "/auth/password/login",
  "/auth/password/register",
]);
const credentialsPerMinute = 10;

function integer(value: unknown, fallback = 0): number {
  const result =
    typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  return Number.isSafeInteger(result) ? result : fallback;
}

/**
 * Static assets are not requests a person makes: one page load pulls dozens of
 * them, so charging them against the caller's budget would rate limit the
 * application's own bundle loading.
 */
const assetPattern =
  /\.(?:js|mjs|cjs|jsx|ts|mts|cts|tsx|css|map|txt|svg|png|jpe?g|gif|webp|avif|ico|woff2?|ttf|otf|wasm)$/i;

function isExemptPath(pathname: string) {
  if (pathname.startsWith("/@") || pathname.startsWith("/node_modules/.vite/"))
    return true;
  return assetPattern.test(pathname);
}

function consume(
  entries: Map<string, Entry>,
  key: string,
  limit: number,
  windowMs: number,
  now: number,
): RateLimitDecision {
  for (const [entryKey, entry] of entries) {
    if (now - entry.lastSeen > idleWindow) entries.delete(entryKey);
  }

  let entry = entries.get(key);
  if (!entry || now - entry.windowStart >= windowMs) {
    entry = { windowStart: now, count: 0, lastSeen: now };
    entries.set(key, entry);
  }

  entry.count += 1;
  entry.lastSeen = now;
  const resetAt = Math.ceil((entry.windowStart + windowMs) / 1000);
  if (entry.count <= limit) {
    return {
      allowed: true,
      limit,
      remaining: limit - entry.count,
      retryAfter: 0,
      resetAt,
    };
  }

  return {
    allowed: false,
    limit,
    remaining: 0,
    retryAfter: Math.max(1, Math.ceil((entry.windowStart + windowMs - now) / 1000)),
    resetAt,
  };
}

export function apply(ctx: Context, pluginConfig: RateLimitConfig) {
  const entries = new Map<string, Entry>();
  const userChannelEntries = new Map<string, Entry>();

  const configuredLimit = () =>
    integer(pluginConfig.requestsPerMinute, 0) +
    Math.max(0, integer(pluginConfig.burst, 0));

  const refuse = (session: Session, decision: RateLimitDecision) => {
    session.status = 429;
    session.head["Retry-After"] = String(decision.retryAfter);
    session.head["X-RateLimit-Limit"] = String(decision.limit);
    session.head["X-RateLimit-Remaining"] = "0";
    session.head["X-RateLimit-Reset"] = String(decision.resetAt);
    session.respond(
      { error: "Too many requests", retry_after: decision.retryAfter },
      "json",
    );
  };

  ctx.registerComponent("ratelimit", {
    allow(key, limit, windowMs) {
      const effective = limit ?? configuredLimit();
      if (!key || effective <= 0)
        return {
          allowed: true,
          limit: 0,
          remaining: 0,
          retryAfter: 0,
          resetAt: 0,
        };
      return consume(entries, key, effective, windowMs ?? minute, Date.now());
    },
    allowUserChannel(userId, channel) {
      if (
        !userId ||
        !channel?.id ||
        !channel.rate_limit_enabled ||
        channel.rate_limit_requests_per_minute <= 0
      ) {
        return {
          allowed: true,
          limit: 0,
          remaining: 0,
          retryAfter: 0,
          resetAt: 0,
        };
      }
      const limit =
        channel.rate_limit_requests_per_minute +
        Math.max(0, channel.rate_limit_burst);
      if (limit <= 0)
        return {
          allowed: true,
          limit: 0,
          remaining: 0,
          retryAfter: 0,
          resetAt: 0,
        };
      return consume(
        userChannelEntries,
        `${userId}:${channel.id}`,
        limit,
        minute,
        Date.now(),
      );
    },
    enforce(session, key, options) {
      const limit = options?.limit ?? configuredLimit();
      if (limit <= 0) return true;
      const decision = consume(
        entries,
        key,
        limit,
        options?.windowMs ?? minute,
        Date.now(),
      );
      if (decision.allowed) {
        session.head["X-RateLimit-Limit"] = String(decision.limit);
        session.head["X-RateLimit-Remaining"] = String(decision.remaining);
        return true;
      }
      refuse(session, decision);
      return false;
    },
    publicConfig: () => pluginConfig,
  });

  /**
   * One budget per caller, not per endpoint: a client cannot sidestep the limit
   * by spreading its requests across routes. The identity is the signed-in user
   * when the authentication middleware has already resolved one, and the client
   * address otherwise, so the limit applies before and after sign-in.
   */
  ctx.use("ratelimit", async (session: Session, next: () => Promise<void>) => {
    const pathname = session.pathname || "/";
    if (isExemptPath(pathname)) {
      await next();
      return;
    }
    const limit = configuredLimit();
    if (limit <= 0) {
      await next();
      return;
    }
    const now = Date.now();
    const user = session.properties.user as { id?: number } | undefined;
    const userId = Number(user?.id ?? 0);
    const address = String(session.ip ?? "").trim() || "unknown";
    const identity = userId ? `user:${userId}` : `ip:${address}`;

    const decision = consume(entries, `all:${identity}`, limit, minute, now);
    if (!decision.allowed) {
      refuse(session, decision);
      return;
    }
    session.head["X-RateLimit-Limit"] = String(decision.limit);
    session.head["X-RateLimit-Remaining"] = String(decision.remaining);

    if (credentialPaths.has(pathname)) {
      // Guessing a password is many cheap requests from one address, so the
      // address pays for them regardless of who is signed in.
      const attempt = consume(
        entries,
        `credentials:${address}`,
        credentialsPerMinute + Math.max(0, integer(pluginConfig.burst, 0)),
        minute,
        now,
      );
      if (!attempt.allowed) {
        refuse(session, attempt);
        return;
      }
    }
    await next();
  });
}
