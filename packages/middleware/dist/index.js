export const depend = ["velocelab-core", "ratelimit", "service"];
export const provide = ["middleware"];
export function apply(ctx) {
    ctx.registerComponent("middleware", { installed: () => true });
}
