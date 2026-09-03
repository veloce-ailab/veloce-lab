import { Context } from "yumeri";
export interface User {
    id?: number;
    username: string;
    email: string;
    password_hash: string;
    is_admin: boolean;
    email_verified: boolean;
    created_at: string;
    updated_at: string;
}
export interface SystemSetting {
    key: string;
    value: string;
    created_at: string;
    updated_at: string;
}
export interface ModelService {
    users: {
        findById(id: number): Promise<User | undefined>;
        findByIdentifier(identifier: string): Promise<User | undefined>;
        findAdmin(): Promise<User | undefined>;
        create(user: Omit<User, "id" | "created_at" | "updated_at">): Promise<User>;
    };
    settings: {
        get(key: string, fallback: string): Promise<string>;
        set(key: string, value: string): Promise<void>;
    };
}
declare module "yumeri" {
    interface Tables {
        users: User;
        system_settings: SystemSetting;
    }
    interface Components {
        model: ModelService;
    }
}
export declare const depend: string[];
export declare const provide: string[];
export declare function apply(ctx: Context): Promise<void>;
