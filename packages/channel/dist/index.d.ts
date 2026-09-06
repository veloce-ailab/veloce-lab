import { Context, Schema } from "yumeri";
export declare const depend: string[];
export declare const provide: string[];
export interface ChannelConfig {
    enabled: boolean;
    contextMessageCount: string;
    webhookPayloadMaxBytes: string;
}
export interface ProviderDefinition {
    id: string;
    name: string;
    description?: string;
    plugin_id?: string;
    config?: unknown;
}
export interface WebhookSummary {
    external_chat_id: string;
    external_user_id: string;
    external_user_name: string;
    external_message_id: string;
    content: string;
}
export interface ChannelService {
    enabled(): boolean;
    providers(): ProviderDefinition[];
    normalizeProvider(provider: string): string;
    webhookSummary(provider: string, payload: unknown): WebhookSummary;
}
export declare const config: Schema<ChannelConfig>;
declare module "yumeri" {
    interface Components {
        channel: ChannelService;
    }
}
export declare function apply(ctx: Context, pluginConfig: ChannelConfig): void;
