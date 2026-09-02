export const depend = ["velocelab-core", "config", "database"];
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
    const users = {
        findByIdentifier: (identifier) => db.selectOne("users", {
            $or: [{ username: identifier }, { email: identifier.toLowerCase() }],
        }),
        findAdmin: () => db.selectOne("users", { is_admin: true }),
        async create(data) {
            const now = new Date().toISOString();
            return db.create("users", { ...data, created_at: now, updated_at: now });
        },
    };
    ctx.registerComponent("model", { users });
}
