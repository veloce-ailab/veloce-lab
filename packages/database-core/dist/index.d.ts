import type { Database, IndexDefinition, Query, Schema, Tables, UpdateData } from "@yumerijs/types";
export interface SqlDriver {
    dialect: "sqlite" | "mysql" | "pgsql";
    execute(sql: string, params?: unknown[]): Promise<{
        changes?: number;
        insertId?: number | bigint;
    }>;
    one(sql: string, params?: unknown[]): Promise<Record<string, unknown> | undefined>;
    many(sql: string, params?: unknown[]): Promise<Record<string, unknown>[]>;
    close(): Promise<void>;
}
export declare class SqlDatabase implements Database {
    private readonly driver;
    constructor(driver: SqlDriver);
    extend<K extends keyof Tables>(table: K, schema: Schema<Partial<Tables[K]>>, indexes?: IndexDefinition<Tables[K]>): Promise<void>;
    create<K extends keyof Tables>(table: K, data: Partial<Tables[K]>): Promise<Tables[K]>;
    select<K extends keyof Tables, F extends keyof Tables[K]>(table: K, query: Query<Tables[K]>, fields?: F[]): Promise<Pick<Tables[K], F>[]>;
    selectOne<K extends keyof Tables, F extends keyof Tables[K]>(table: K, query: Query<Tables[K]>, fields?: F[]): Promise<Pick<Tables[K], F> | undefined>;
    update<K extends keyof Tables>(table: K, query: Query<Tables[K]>, data: UpdateData<Partial<Tables[K]>>): Promise<number>;
    remove<K extends keyof Tables>(table: K, query: Query<Tables[K]>): Promise<number>;
    upsert<K extends keyof Tables>(table: K, data: Partial<Tables[K]>[], key: keyof Tables[K] | (keyof Tables[K])[], update?: UpdateData<Partial<Tables[K]>>): Promise<void>;
    drop<K extends keyof Tables>(table: K): Promise<void>;
    run(sql: string, params?: any[]): Promise<any>;
    get(sql: string, params?: any[]): Promise<any>;
    all(sql: string, params?: any[]): Promise<any[]>;
    close(): Promise<void>;
}
