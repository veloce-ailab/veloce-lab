import { Context, Session } from "yumeri";
import type { ModelService } from "@velocelab/model";

export const depend = ["model"];
export const provide = ["model-catalog"];

export interface ModelCatalogService {
  list(): ReturnType<ModelService["models"]["list"]>;
}

declare module "yumeri" {
  interface Components {
    "model-catalog": ModelCatalogService;
  }
}

export function apply(ctx: Context) {
  const model = ctx.component.model as ModelService;
  const catalog: ModelCatalogService = {
    list: () => model.models.list(),
  };
  ctx.registerComponent("model-catalog", catalog);
  ctx.route("/api/models").methods("GET").action(async (session: Session) => {
    const user = session.properties.user as { is_admin?: boolean } | undefined;
    if (!user) {
      session.status = 401;
      session.respond({ error: "Authorization is required" }, "json");
      return;
    }
    if (!user.is_admin) {
      session.status = 403;
      session.respond({ error: "Admin access required" }, "json");
      return;
    }
    session.respond(await catalog.list(), "json");
  });
}
