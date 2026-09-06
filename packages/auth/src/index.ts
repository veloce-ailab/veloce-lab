import { Context, Session } from "yumeri";
import bcrypt from "bcryptjs";
import type { ModelService } from "@velocelab/model";
import type { ServiceRegistry } from "@velocelab/service";
export const depend = ["service", "user", "model"];
export const provide = ["auth"];
export interface AuthService { enabled(): boolean; }
declare module "yumeri" { interface Components { auth: AuthService; } }

export function apply(ctx: Context) {
  const service = ctx.component.service as ServiceRegistry;
  const model = ctx.component.model as ModelService;
  const auth: AuthService = { enabled: () => true };
  ctx.registerComponent("auth", auth);
  ctx.route("/auth/password/login").methods("POST").action(async (session) => {
    try {
      const body = (await session.parseRequestBody()) as any;
      session.respond(await service.loginWithPassword(String(body.identifier ?? ""), String(body.password ?? "")), "json");
    } catch (error) {
      session.status = 401;
      session.respond({ error: error instanceof Error ? error.message : String(error) }, "json");
    }
  });
  ctx.route("/auth/password/register").methods("POST").action(async (session) => {
    try {
      const body = (await session.parseRequestBody()) as any;
      const username = String(body.username ?? "").trim();
      const email = String(body.email ?? "").trim().toLowerCase();
      const password = String(body.password ?? "");
      if (username.length < 3 || !email.includes("@") || password.length < 8)
        throw Error("username, email, and password are required");
      if (await model.users.findByIdentifier(username) || await model.users.findByIdentifier(email))
        throw Error("user already exists");
      const group = await model.groups.ensureDefault();
      const user = await model.users.create({
        username, email, phone: null, oidc_sub: null,
        password_hash: bcrypt.hashSync(password, bcrypt.genSaltSync(10)),
        is_admin: false, email_verified: false, avatar_url: "", balance: "0",
        group_id: group.id ?? 0, referral_code: null, referrer_id: null,
      });
      session.status = 201;
      session.respond({ user }, "json");
    } catch (error) {
      session.status = 400;
      session.respond({ error: error instanceof Error ? error.message : String(error) }, "json");
    }
  });
  ctx.use("authentication", async (session: Session, next: () => Promise<void>) => {
    const path = session.pathname || "";
    const publicRoute = path === "/api/public/settings" || path === "/api/configuration" || path === "/api/setup/status" || path === "/api/setup" || path === "/auth/password/login" || path.startsWith("/api/advanced-chat/connectors/");
    if (!path.startsWith("/api/") && !path.startsWith("/auth/")) return next();
    if (publicRoute) return next();
    if (!session.properties.user) {
      session.status = 401;
      session.respond({ error: "Authorization is required" }, "json");
      return;
    }
    await next();
  });
}
