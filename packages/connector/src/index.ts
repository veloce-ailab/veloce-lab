import { Context } from "yumeri";
export const depend: string[] = [];
export const provide = ["connector"];
export interface ConnectorService {
  execute(userId: number, action: string, input: Record<string, unknown>): Promise<unknown>;
}
declare module "yumeri" { interface Components { connector: ConnectorService; } }
export function apply(ctx: Context) {
  ctx.registerComponent("connector", {
    async execute() { throw Error("No connector runtime is enabled"); },
  });
}
