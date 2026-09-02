import { Context } from "yumeri";
export const depend = ["velocelab-core", "config"];
export const provide = ["cache"];
export interface CacheService {
  get<T>(key: string): T | undefined;
  set<T>(key: string, value: T): void;
  delete(key: string): void;
}
declare module "yumeri" {
  interface Components {
    cache: CacheService;
  }
}
export function apply(ctx: Context) {
  const store = new Map<string, unknown>();
  ctx.registerComponent("cache", {
    get: <T>(key: string) => store.get(key) as T | undefined,
    set: <T>(key: string, value: T) => {
      store.set(key, value);
    },
    delete: (key: string) => {
      store.delete(key);
    },
  });
}
