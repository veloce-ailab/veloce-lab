import { Context, Database, Session } from "yumeri";
import "@velocelab/database-core";

export interface CatalogModel { id?: number; model_name: string; provider: string; provider_icon_url: string; quota_type: number; input_price: string; output_price: string; enabled: boolean; created_at: string; updated_at: string }

declare module "@yumerijs/types" { interface Tables { models: CatalogModel } }
export const depend = ["database"];
export const provide = ["model-catalog"];
export interface ModelCatalogService { list(): Promise<CatalogModel[]> }
declare module "yumeri" { interface Components { "model-catalog": ModelCatalogService } }

export async function apply(ctx: Context) {
  const db = ctx.component.database as Database;
  await db.extend("models", {
    id: { type: "integer", autoIncrement: true }, model_name: { type: "string", nullable: false }, provider: "string", provider_icon_url: "string", quota_type: { type: "integer", initial: 0 }, input_price: { type: "decimal", initial: 0 }, output_price: { type: "decimal", initial: 0 }, enabled: { type: "boolean", initial: true }, created_at: "timestamp", updated_at: "timestamp",
  }, { unique: ["model_name"] });
  const catalog: ModelCatalogService = { list: () => db.select("models", {}) };
  ctx.registerComponent("model-catalog", catalog);
  ctx.route("/api/models").methods("GET").action(async (session: Session) => {
    const user = (session.properties.user as { id?: number; is_admin?: boolean } | undefined) ?? { id: 0, is_admin: false };
    if (!user.is_admin) { session.status = 403; session.respond({ error: "Admin access required" }, "json"); return; }
    session.respond(await catalog.list(), "json");
  });
}
