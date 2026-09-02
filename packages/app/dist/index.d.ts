import { Context } from 'yumeri';
export declare const depend: string[];
export declare const provide: string[];
export interface AppService {
    ready(): boolean;
}
declare module 'yumeri' {
    interface Components {
        app: AppService;
    }
}
export declare function apply(ctx: Context): void;
