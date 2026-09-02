import { Context, Core } from 'yumeri';
export declare const provide: string[];
export declare const usage = "Provides shared Veloce Lab backend services.";
export interface CoreService {
    getCore(): Core;
}
declare module 'yumeri' {
    interface Components {
        'velocelab-core': CoreService;
    }
}
export declare function apply(ctx: Context): void;
