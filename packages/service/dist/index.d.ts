import { Context, Schema } from "yumeri";
import type { User } from "@velocelab/model";
export declare const depend: string[];
export declare const provide: string[];
export interface SetupInput {
    username: string;
    email: string;
    password: string;
}
export interface ServiceRegistry {
    names(): string[];
    initialSetupRequired(): Promise<boolean>;
    setupInitialAdmin(input: SetupInput): Promise<{
        user: User;
        token: string;
    }>;
    loginWithPassword(identifier: string, password: string): Promise<{
        user: User;
        token: string;
    }>;
    verifyToken(token: string): Promise<User | undefined>;
}
declare module "yumeri" {
    interface Components {
        service: ServiceRegistry;
    }
}
export declare const config: Schema<{
    tokenSecret: string;
}>;
export declare function apply(ctx: Context, cfg: {
    tokenSecret: string;
}): void;
