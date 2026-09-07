import { Context, Database, Session } from "yumeri";
import "@velocelab/model";

export const depend = ["database", "model"];
export const provide = ["plugin-management"];

export interface PluginManagementService {
  list(): Promise<any[]>;
  schema(pluginId: string): Promise<any | undefined>;
}

declare module "yumeri" {
  interface Components {
    "plugin-management": PluginManagementService;
  }
}

export function apply(ctx: Context) {
  const db = ctx.component.database as Database;
  const service: PluginManagementService = {
    list: () => db.select("plugins", {}),
    async schema(pluginId) {
      const row: any = await db.selectOne("plugins", { id: pluginId });
      if (!row) return undefined;
      try {
        return JSON.parse(String(row.settings_json ?? "{}"));
      } catch {
        return {};
      }
    },
  };
  ctx.registerComponent("plugin-management", service);
  const admin = (s: Session) => Boolean((s.properties.user as any)?.is_admin);
  ctx
    .route("/api/admin/plugins")
    .methods("GET")
    .action(async (s) => {
      if (!admin(s)) {
        s.status = 403;
        s.respond({ error: "Admin access required" }, "json");
        return;
      }
      s.respond(
        (await service.list()).map((plugin: any) => ({
          ...plugin,
          manifest_json: undefined,
          settings_json: undefined,
          global_config_json: undefined,
        })),
        "json",
      );
    });
  ctx
    .route("/api/admin/plugins/:id/schema")
    .methods("GET")
    .action(async (s, _p, id) => {
      if (!admin(s)) {
        s.status = 403;
        s.respond({ error: "Admin access required" }, "json");
        return;
      }
      const schema = await service.schema(id);
      if (schema === undefined) {
        s.status = 404;
        s.respond({ error: "Plugin not found" }, "json");
        return;
      }
      s.respond(schema, "json");
    });
}
