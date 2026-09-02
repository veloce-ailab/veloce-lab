import { Context, Schema } from "yumeri";
export interface FileOptions {
    root: string;
}
export interface FileService {
    root: string;
    read(name: string): Promise<Buffer>;
    exists(name: string): Promise<boolean>;
}
export declare const depend: string[];
export declare const provide: string[];
export declare const config: Schema<FileOptions>;
declare module "yumeri" {
    interface Components {
        file: FileService;
    }
}
export declare function apply(ctx: Context, pluginConfig: FileOptions): Promise<void>;
