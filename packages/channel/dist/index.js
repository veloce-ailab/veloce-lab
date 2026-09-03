export const depend = ["velocelab-core", "model", "adapters"];
export const provide = ["channel"];
export function apply(ctx) {
    ctx.registerComponent("channel", { list: () => [] });
}
