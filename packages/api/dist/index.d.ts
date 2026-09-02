import { Context } from 'yumeri';
export declare const depend: string[];
export declare const provide: string[];
export interface ApiRegistry {
    version: string;
}
declare module 'yumeri' {
    interface Components {
        api: ApiRegistry;
    }
}
export declare function apply(ctx: Context): void;
