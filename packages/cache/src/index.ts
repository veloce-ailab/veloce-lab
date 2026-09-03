import { Context, Schema } from "yumeri";

export const depend = ["velocelab-core"];
export const provide = ["cache"];

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

export const config: Schema<CacheConfig> = Schema.object({
  enabled: Schema.boolean("Enable Redis cache").default(false),
  address: Schema.string("Redis address").default("127.0.0.1:6379"),
  username: Schema.string("Redis username").default(""),
  password: Schema.string("Redis password").default(""),
  database: Schema.string("Redis database").default("0"),
  tls: Schema.boolean("Enable Redis TLS").default(false),
});

declare module "yumeri" {
  interface Components {
    cache: CacheService;
  }
}

interface StoredValue {
  value: unknown;
  expiresAt?: number;
}

export function apply(ctx: Context, _pluginConfig: CacheConfig) {
  const store = new Map<string, StoredValue>();
  const billingLocks = new Map<number, Promise<void>>();

  ctx.registerComponent("cache", {
    get<T>(key) {
      const entry = store.get(key);
      if (!entry) return undefined;
      if (entry.expiresAt && entry.expiresAt <= Date.now()) {
        store.delete(key);
        return undefined;
      }
      return entry.value as T;
    },
    set<T>(key, value, ttlMs) {
      store.set(key, { value, expiresAt: ttlMs ? Date.now() + ttlMs : undefined });
    },
    delete(key) {
      store.delete(key);
    },
    async acquireUserBillingLock(userId) {
      if (!userId) return () => {};
      const previous = billingLocks.get(userId);
      if (previous) await previous;
      let release!: () => void;
      const current = new Promise<void>((resolve) => {
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
