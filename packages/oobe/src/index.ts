import { Context, Session } from "yumeri";
import type { ServiceRegistry, SetupInput } from "@velocelab/service";

export const depend = ["service"];
export const provide = ["oobe"];

export interface OobeService {
  required(): Promise<boolean>;
}

declare module "yumeri" {
  interface Components {
    oobe: OobeService;
  }
}

export function apply(ctx: Context) {
  const service = ctx.component.service as ServiceRegistry;
  const oobe: OobeService = {
    required: () => service.initialSetupRequired(),
  };
  ctx.registerComponent("oobe", oobe);

  ctx.route("/api/setup/status").methods("GET").action(async (session) => {
    session.respond({ required: await oobe.required() }, "json");
  });
  ctx.route("/api/setup").methods("POST").action(async (session) => {
    try {
      const body = (await session.parseRequestBody()) as Record<string, unknown>;
      const input: SetupInput = {
        username: String(body.username ?? ""),
        email: String(body.email ?? ""),
        password: String(body.password ?? ""),
      };
      session.respond(await service.setupInitialAdmin(input), "json");
    } catch (error) {
      session.status = 400;
      session.respond(
        { error: error instanceof Error ? error.message : String(error) },
        "json",
      );
    }
  });
}
