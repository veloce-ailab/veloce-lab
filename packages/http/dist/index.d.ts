import { Context } from "yumeri";
export declare const depend: string[];
export declare const provide: string[];
export declare const usage = "Registers the Veloce Lab HTTP API routes.";
export interface HttpService {
    health(): {
        status: "ok";
        service: string;
    };
}
declare module "yumeri" {
    interface Components {
        http: HttpService;
    }
}
export declare function apply(ctx: Context): void;
