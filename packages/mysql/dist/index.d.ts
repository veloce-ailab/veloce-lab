import { Context, Schema } from "yumeri";
export interface MysqlConfig {
    host: string;
    port: number;
    user: string;
    password: string;
    database: string;
}
export declare const depend: string[];
export declare const provide: string[];
export declare const config: Schema<MysqlConfig>;
export declare function apply(ctx: Context, pluginConfig: MysqlConfig): Promise<void>;
