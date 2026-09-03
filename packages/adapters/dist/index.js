export const depend = ["velocelab-core", "model"];
export const provide = ["adapters"];
export function apply(ctx) {
    ctx.registerComponent("adapters", { names: () => [] });
}
