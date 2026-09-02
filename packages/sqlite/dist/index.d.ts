import { Context, Schema } from "yumeri";
export interface SqliteConfig {
    path: string;
}
export declare const depend: string[];
export declare const provide: string[];
export declare const config: Schema<SqliteConfig>;
export declare function apply(ctx: Context, pluginConfig: SqliteConfig): Promise<void>;
