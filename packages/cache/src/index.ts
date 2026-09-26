import { Context, Schema } from "yumeri";

export const depend: string[] = [];
export const provide = ["cache"];

export interface CacheConfig {
  defaultTtlMs: string;
  billingBalanceTtlMs: string;
  maxEntries: string;
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
  defaultTtlMs: Schema.string("Default in-memory cache TTL milliseconds (0 means no expiry)").key("cache.config.defaultTtlMs").default("0"),
  billingBalanceTtlMs: Schema.string("Billing balance cache TTL milliseconds").key("cache.config.billingBalanceTtlMs").default("600000"),
  maxEntries: Schema.string("Maximum in-memory cache entries").key("cache.config.maxEntries").default("10000"),
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

export function apply(ctx: Context, pluginConfig: CacheConfig) {
  ctx.i18n({ cache: { config: { defaultTtlMs: { zh: "默认内存缓存 TTL（毫秒）", en: "Default in-memory cache TTL milliseconds", ja: "既定のメモリキャッシュ TTL（ミリ秒）" }, billingBalanceTtlMs: { zh: "计费余额缓存 TTL（毫秒）", en: "Billing balance cache TTL milliseconds", ja: "請求残高キャッシュ TTL（ミリ秒）" }, maxEntries: { zh: "最大内存缓存条目数", en: "Maximum in-memory cache entries", ja: "メモリキャッシュ最大件数" } } } });
  const defaultTtlMs = Math.max(0, Number(pluginConfig.defaultTtlMs) || 0);
  const maxEntries = Math.max(1, Number(pluginConfig.maxEntries) || 10000);
  const billingBalanceTtlMs = Math.max(0, Number(pluginConfig.billingBalanceTtlMs) || 600000);
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
      if (!store.has(key) && store.size >= maxEntries) store.delete(store.keys().next().value as string);
       const lifetime = ttlMs ?? defaultTtlMs;
       store.set(key, { value, expiresAt: lifetime > 0 ? Date.now() + lifetime : undefined });
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
          expiresAt: billingBalanceTtlMs > 0 ? Date.now() + billingBalanceTtlMs : undefined,
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
