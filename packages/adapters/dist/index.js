export const depend = ["velocelab-core", "config", "model"];
export const provide = ["adapters"];
export function apply(ctx) {
    ctx.registerComponent("adapters", { names: () => [] });
}
