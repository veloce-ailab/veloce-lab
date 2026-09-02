import { Context, Schema } from 'yumeri';
export interface AppConfig {
    siteName: string;
}
export declare const depend: string[];
export declare const provide: string[];
export declare const config: Schema<AppConfig>;
declare module 'yumeri' {
    interface Components {
        config: AppConfig;
    }
}
export declare function apply(ctx: Context, pluginConfig: AppConfig): void;
