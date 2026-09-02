import { Context, Core } from "yumeri";

export const provide = ["velocelab-core"];
export const usage = "Provides shared Veloce Lab backend services.";

export interface CoreService {
  getCore(): Core;
}

declare module "yumeri" {
  interface Components {
    "velocelab-core": CoreService;
  }
}

export function apply(ctx: Context) {
  ctx.registerComponent("velocelab-core", { getCore: () => ctx.getCore() });
}
