export const depend = ["velocelab-core", "database"];
export const provide = ["model"];
export async function apply(ctx) {
    const db = ctx.component.database;
    await db.extend("users", {
        id: { type: "integer", autoIncrement: true },
        username: { type: "string", nullable: false },
        email: { type: "string", nullable: false },
        password_hash: { type: "string", nullable: false },
        is_admin: { type: "boolean", nullable: false },
        email_verified: { type: "boolean", nullable: false },
        created_at: "timestamp",
        updated_at: "timestamp",
    }, { unique: ["username"] });
    await db.extend("system_settings", {
        key: { type: "string", nullable: false },
        value: { type: "text", nullable: false },
        created_at: "timestamp",
        updated_at: "timestamp",
    }, { unique: ["key"] });
    const users = {
        findById: (id) => db.selectOne("users", { id }),
        findByIdentifier: (identifier) => db.selectOne("users", {
            $or: [{ username: identifier }, { email: identifier.toLowerCase() }],
        }),
        findAdmin: () => db.selectOne("users", { is_admin: true }),
        async create(data) {
            const now = new Date().toISOString();
            return db.create("users", { ...data, created_at: now, updated_at: now });
        },
    };
    const settings = {
        async get(key, fallback) {
            const setting = await db.selectOne("system_settings", { key });
            return setting?.value ?? fallback;
        },
        async set(key, value) {
            const existing = await db.selectOne("system_settings", { key });
            const now = new Date().toISOString();
            if (existing) {
                await db.update("system_settings", { key }, { value, updated_at: now });
                return;
            }
            await db.create("system_settings", {
                key,
                value,
                created_at: now,
                updated_at: now,
            });
        },
    };
    ctx.registerComponent("model", { users, settings });
}
