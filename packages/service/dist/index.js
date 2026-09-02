import { createHash, randomBytes, scryptSync, timingSafeEqual, } from "node:crypto";
import { Schema } from "yumeri";
export const depend = [
    "velocelab-core",
    "config",
    "cache",
    "model",
    "adapters",
    "channel",
];
export const provide = ["service"];
export const config = Schema.object({
    tokenSecret: Schema.string("Token secret").default("change-me-in-production"),
});
function hashPassword(password) {
    const salt = randomBytes(16).toString("hex");
    return `scrypt$${salt}$${scryptSync(password, salt, 64).toString("hex")}`;
}
function verifyPassword(password, encoded) {
    const [, salt, digest] = encoded.split("$");
    return (!!salt &&
        !!digest &&
        timingSafeEqual(Buffer.from(digest, "hex"), scryptSync(password, salt, 64)));
}
function issueToken(user, secret) {
    return createHash("sha256")
        .update(`${user.id}:${user.username}:${secret}`)
        .digest("hex");
}
export function apply(ctx, cfg) {
    const model = ctx.component.model;
    const service = {
        names: () => ["auth", "billing", "chat", "plugins"],
        initialSetupRequired: async () => !(await model.users.findAdmin()),
        async setupInitialAdmin(input) {
            const username = input.username.trim();
            const email = input.email.trim().toLowerCase();
            if (!username)
                throw Error("username is required");
            if ([...username].length < 3)
                throw Error("username is too short");
            if (!email.includes("@"))
                throw Error("valid email is required");
            if (input.password.length < 8)
                throw Error("password must be at least 8 characters");
            if (!(await service.initialSetupRequired()))
                throw Error("Initial setup is already complete");
            const user = await model.users.create({
                username,
                email,
                password_hash: hashPassword(input.password),
                is_admin: true,
                email_verified: true,
            });
            return { user, token: issueToken(user, cfg.tokenSecret) };
        },
        async loginWithPassword(identifier, password) {
            if (await service.initialSetupRequired())
                throw Error("initial setup is required");
            const user = await model.users.findByIdentifier(identifier.trim());
            if (!user || !verifyPassword(password, user.password_hash))
                throw Error("invalid username/email or password");
            return { user, token: issueToken(user, cfg.tokenSecret) };
        },
    };
    ctx.registerComponent("service", service);
}
