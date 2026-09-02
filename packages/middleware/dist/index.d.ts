import { Context } from "yumeri";
export declare const depend: string[];
export declare const provide: string[];
export interface MiddlewareService {
    installed(): boolean;
}
declare module "yumeri" {
    interface Components {
        middleware: MiddlewareService;
    }
}
export declare function apply(ctx: Context): void;
