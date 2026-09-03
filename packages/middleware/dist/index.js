export const depend = ["velocelab-core", "ratelimit", "service"];
export const provide = ["middleware"];
export function apply(ctx) {
    const service = ctx.component.service;
    const middleware = {
        installed: () => true,
        async authenticate(session) {
            const header = session.client.req?.headers.authorization ?? "";
            const parts = header.trim().split(/\s+/);
            if (parts.length !== 2 || parts[0].toLowerCase() !== "bearer")
                return false;
            const user = await service.verifyToken(parts[1]);
            if (!user)
                return false;
            session.properties.user = user;
            return true;
        },
        isAdmin: (session) => Boolean(session.properties.user
            ?.is_admin),
    };
    ctx.registerComponent("middleware", middleware);
}
