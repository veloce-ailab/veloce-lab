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

  ctx.route("/api/public/settings").methods("GET").action((session) => {
    session.respond(
      {
        backend_version: "0.1.0",
        site_name: "Veloce",
        edition: "community",
        community_enabled: true,
      },
      "json",
    );
  });
  ctx.route("/api/configuration").methods("GET").action((session) => {
    const configuration = service.publicConfiguration();
    session.respond(
      {
        auth_agreement_mode: configuration.authAgreementMode,
        password_registration_enabled: configuration.passwordRegistrationEnabled,
        password_hcaptcha_enabled: configuration.passwordHCaptchaEnabled,
      },
      "json",
    );
  });

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
