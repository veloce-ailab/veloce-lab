import { Context } from 'yumeri';
export declare const depend: string[];
export declare const provide: string[];
export interface CacheService {
    get<T>(key: string): T | undefined;
    set<T>(key: string, value: T): void;
    delete(key: string): void;
}
declare module 'yumeri' {
    interface Components {
        cache: CacheService;
    }
}
export declare function apply(ctx: Context): void;
