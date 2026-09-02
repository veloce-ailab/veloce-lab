import { Context } from 'yumeri';
export declare const depend: string[];
export declare const provide: string[];
export interface ChannelService {
    list(): string[];
}
declare module 'yumeri' {
    interface Components {
        channel: ChannelService;
    }
}
export declare function apply(ctx: Context): void;
