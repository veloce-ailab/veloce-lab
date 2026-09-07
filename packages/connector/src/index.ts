import { Context } from "yumeri";
import "@velocelab/dashboard";
export const depend: string[] = [];
export const provide = ["connector"];
export interface ConnectorService {
  execute(userId: number, action: string, input: Record<string, unknown>): Promise<unknown>;
  register(handler: ConnectorHandler): () => void;
}
export interface ConnectorHandler {
  execute(userId: number, action: string, input: Record<string, unknown>): Promise<unknown>;
}
declare module "yumeri" { interface Components { connector: ConnectorService; } }
export function apply(ctx: Context) {
  ctx.component.dashboard.addEntry({ dev: new URL("../frontend/index.tsx", import.meta.url).pathname, prod: new URL("../frontend/connector.js", import.meta.url).pathname, plugin: "connector" });
  const handlers: ConnectorHandler[] = [];
  ctx.registerComponent("connector", {
    async execute(userId, action, input) {
      for (const handler of [...handlers].reverse()) {
        try { return await handler.execute(userId, action, input); } catch (error) {
          if (error instanceof Error && error.message !== "Unsupported connector action") throw error;
        }
      }
      throw Error("No connector runtime is enabled");
    },
    register(handler) {
      handlers.push(handler);
      return () => { const index = handlers.indexOf(handler); if (index >= 0) handlers.splice(index, 1); };
    },
  });
}
