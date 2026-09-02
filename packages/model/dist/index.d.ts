import { Context } from 'yumeri';
export declare const depend: string[];
export declare const provide: string[];
export interface ModelService {
    ready(): boolean;
}
declare module 'yumeri' {
    interface Components {
        model: ModelService;
    }
}
export declare function apply(ctx: Context): void;
