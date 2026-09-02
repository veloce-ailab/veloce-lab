import { Context } from 'yumeri';
export declare const depend: string[];
export declare const provide: string[];
export interface ServiceRegistry {
    names(): string[];
}
declare module 'yumeri' {
    interface Components {
        service: ServiceRegistry;
    }
}
export declare function apply(ctx: Context): void;
