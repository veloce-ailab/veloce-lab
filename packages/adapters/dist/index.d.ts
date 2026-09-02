import { Context } from "yumeri";
export declare const depend: string[];
export declare const provide: string[];
export interface AdapterRegistry {
    names(): string[];
}
declare module "yumeri" {
    interface Components {
        adapters: AdapterRegistry;
    }
}
export declare function apply(ctx: Context): void;
