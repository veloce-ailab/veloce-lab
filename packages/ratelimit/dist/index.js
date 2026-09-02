export const depend = ["velocelab-core", "cache"];
export const provide = ["ratelimit"];
export function apply(ctx) {
    ctx.registerComponent("ratelimit", { allow: () => true });
}
