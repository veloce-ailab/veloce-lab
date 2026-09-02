export const provide = ["velocelab-core"];
export const usage = "Provides shared Veloce Lab backend services.";
export function apply(ctx) {
    ctx.registerComponent("velocelab-core", { getCore: () => ctx.getCore() });
}
