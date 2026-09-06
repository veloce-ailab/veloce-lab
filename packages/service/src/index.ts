import {
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { Context, Database, Schema, Session } from "yumeri";
import bcrypt from "bcryptjs";
import type { ModelService, User } from "@velocelab/model";


export const depend = [
  "model",
  "database",
];
export const provide = ["service"];

export interface SetupInput {
  username: string;
  email: string;
  password: string;
}

export interface ServiceConfig {
  environment: string;
  dataPath: string;
  jwtSecret: string;
  nodeName: string;
  oidcIssuer: string;
  oidcClientId: string;
  oidcClientSecret: string;
  oidcRedirectUrl: string;
  bootstrapAdminEmails: string;
  bootstrapAdminOidcSubs: string;
  authAgreementMode: string;
  passwordRegistrationEnabled: boolean;
  passwordHCaptchaEnabled: boolean;
}
export interface ServiceRegistry {
  names(): string[];
  initialSetupRequired(): Promise<boolean>;
  setupInitialAdmin(input: SetupInput): Promise<{ user: User; token: string }>;
  loginWithPassword(
    identifier: string,
    password: string,
  ): Promise<{ user: User; token: string }>;
  verifyToken(token: string): Promise<User | undefined>;
  publicConfiguration(): Pick<ServiceConfig, "authAgreementMode" | "passwordRegistrationEnabled" | "passwordHCaptchaEnabled">;
}

declare module "yumeri" {
  interface Components {
    service: ServiceRegistry;
  }
}
export const config: Schema<ServiceConfig> = Schema.object({
  environment: Schema.string("Application environment").default("development"),
  dataPath: Schema.string("Data directory").default("data"),
  jwtSecret: Schema.string("JWT signing secret").default(""),
  nodeName: Schema.string("Cluster node name").default(""),
  oidcIssuer: Schema.string("OIDC issuer").default(""),
  oidcClientId: Schema.string("OIDC client ID").default(""),
  oidcClientSecret: Schema.string("OIDC client secret").default(""),
  oidcRedirectUrl: Schema.string("OIDC redirect URL").default(""),
  bootstrapAdminEmails: Schema.string("Bootstrap admin emails").default(""),
  bootstrapAdminOidcSubs: Schema.string("Bootstrap admin OIDC subjects").default(""),
  authAgreementMode: Schema.string("Authentication agreement mode").default("notice"),
  passwordRegistrationEnabled: Schema.boolean("Enable password registration").default(false),
  passwordHCaptchaEnabled: Schema.boolean("Require hCaptcha for password authentication").default(false),
});

const placeholderJwtSecret = "change-me-please";

function isDevelopmentLike(environment: string) {
  return ["", "development", "dev", "local", "test"].includes(
    environment.trim().toLowerCase(),
  );
}

async function resolveJwtSecret(config: ServiceConfig) {
  const configured = config.jwtSecret.trim();
  if (configured && configured !== placeholderJwtSecret) return configured;
  if (!isDevelopmentLike(config.environment)) {
    throw Error("JWT_SECRET must be set to a secure value outside development");
  }

  const secretPath = path.join(config.dataPath, ".jwt_secret");
  try {
    const existing = (await readFile(secretPath, "utf8")).trim();
    if (existing) return existing;
  } catch (error: any) {
    if (error?.code !== "ENOENT") throw error;
  }

  const generated = randomBytes(32).toString("hex");
  await mkdir(path.dirname(secretPath), { recursive: true });
  await writeFile(secretPath, `${generated}\n`, { mode: 0o600 });
  return generated;
}

function hashPassword(password: string) {
  return bcrypt.hashSync(password, bcrypt.genSaltSync(10));
}

function generateReferralCode() {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const raw = randomBytes(8);
  let value = "";
  let buffer = 0;
  let bits = 0;
  for (const byte of raw) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      value += alphabet[(buffer >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) value += alphabet[(buffer << (5 - bits)) & 31];
  return value;
}

function verifyPassword(password: string, encoded: string) {
  return bcrypt.compareSync(password, encoded);
}

function encodeJson(value: unknown) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function issueToken(user: User, secret: string) {
  if (!user.id) throw Error("user is required");
  const header = encodeJson({ alg: "HS256", typ: "JWT" });
  const payload = encodeJson({
    id: user.id,
    is_admin: user.is_admin,
    exp: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60,
  });
  const signature = createHmac("sha256", secret)
    .update(`${header}.${payload}`)
    .digest("base64url");
  return `${header}.${payload}.${signature}`;
}

function verifyJwt(token: string, secret: string): number | undefined {
  const [header, payload, signature, ...extra] = token.split(".");
  if (!header || !payload || !signature || extra.length) return undefined;
  const expected = createHmac("sha256", secret)
    .update(`${header}.${payload}`)
    .digest("base64url");
  if (signature.length !== expected.length) return undefined;
  if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected)))
    return undefined;
  try {
    const claims = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    );
    if (!Number.isInteger(claims.id) || typeof claims.is_admin !== "boolean")
      return undefined;
    if (
      !Number.isFinite(claims.exp) ||
      claims.exp <= Math.floor(Date.now() / 1000)
    )
      return undefined;
    return claims.id;
  } catch {
    return undefined;
  }
}

export async function apply(ctx: Context, cfg: ServiceConfig) {
  const model = ctx.component.model as ModelService;
  const db = ctx.component.database as Database;
  const jwtSecret = await resolveJwtSecret(cfg);
  const service: ServiceRegistry = {
    names: () => ["auth", "billing", "chat", "plugins"],
    initialSetupRequired: async () => !(await model.users.findAdmin()),
    async setupInitialAdmin(input) {
      const username = input.username.trim();
      const email = input.email.trim().toLowerCase();
      if (!username) throw Error("username is required");
      if ([...username].length < 3) throw Error("username is too short");
      if (!email.includes("@")) throw Error("valid email is required");
      if (input.password.length < 8)
        throw Error("password must be at least 8 characters");
      if (!(await service.initialSetupRequired()))
        throw Error("Initial setup is already complete");
      const defaultGroup = await model.groups.ensureDefault();
      const user = await model.users.create({
        username,
        email,
        phone: null,
        oidc_sub: null,
        password_hash: hashPassword(input.password),
        is_admin: true,
        email_verified: true,
        avatar_url: "",
        balance: "0",
        group_id: defaultGroup.id ?? 0,
        referral_code: generateReferralCode(),
        referrer_id: null,
      });
      return { user, token: issueToken(user, jwtSecret) };
    },
    async loginWithPassword(identifier, password) {
      if (await service.initialSetupRequired())
        throw Error("initial setup is required");
      const user = await model.users.findByIdentifier(identifier.trim());
      if (!user || !verifyPassword(password, user.password_hash))
        throw Error("invalid username/email or password");
      return { user, token: issueToken(user, jwtSecret) };
    },
    async verifyToken(authToken) {
      const userId = verifyJwt(authToken, jwtSecret);
      return userId ? model.users.findById(userId) : undefined;
    },
    publicConfiguration: () => ({
      authAgreementMode: cfg.authAgreementMode,
      passwordRegistrationEnabled: cfg.passwordRegistrationEnabled,
      passwordHCaptchaEnabled: cfg.passwordHCaptchaEnabled,
    }),
  };
  ctx.registerComponent("service", service);

  const authenticate = async (session: Session) => {
    const user = session.properties.user as User | undefined;
    if (!user) {
      session.status = 401;
      session.respond({ error: "Authorization is required" }, "json");
      return undefined;
    }
    return user;
  };

  ctx.route("/api/channels").methods("GET").action(async (session) => {
    const user = await authenticate(session);
    if (!user) return;
    if (!user.is_admin) { session.status = 403; session.respond({ error: "Admin access required" }, "json"); return; }
    session.respond(await model.channels.list(), "json");
  });
  ctx.route("/api/channels").methods("POST").action(async (session) => {
    const user = await authenticate(session);
    if (!user?.is_admin) return;
    const input = (await session.parseRequestBody()) as Record<string, unknown>;
    const now = new Date().toISOString();
    const channel = await model.channels.create({
      user_channel_id: Number(input.user_channel_id ?? 0) || null,
      name: String(input.name ?? "").trim(),
      type: String(input.type ?? "openai").trim(),
      base_url: String(input.base_url ?? "").trim(),
      api_key: String(input.api_key ?? ""),
      plugin_config: String(input.plugin_config ?? "{}"),
      multiplier: String(input.multiplier ?? "1"),
      priority: Number(input.priority ?? 1),
      weight: Number(input.weight ?? 1),
      enabled: input.enabled !== false,
      price_sync_enabled: input.price_sync_enabled === true,
      price_sync_cron: String(input.price_sync_cron ?? ""),
      consecutive_failures: 0,
      last_failure_reason: "",
      auto_disabled_reason: "",
      last_health_status: "unknown",
    } as any);
    session.status = 201;
    session.respond(channel, "json");
  });
  ctx.route("/api/channels/:id").methods("PUT").action(async (session, _params, id) => {
    const user = await authenticate(session);
    if (!user?.is_admin) return;
    const input = (await session.parseRequestBody()) as Record<string, unknown>;
    const updates = Object.fromEntries(
      ["name", "type", "base_url", "api_key", "plugin_config", "multiplier", "priority", "weight", "enabled", "price_sync_enabled", "price_sync_cron"]
        .filter((key) => input[key] !== undefined)
        .map((key) => [key, input[key]]),
    );
    session.respond(await model.channels.update(Number(id), updates as any), "json");
  });
  ctx.route("/api/channels/:id").methods("DELETE").action(async (session, _params, id) => {
    const user = await authenticate(session);
    if (!user?.is_admin) return;
    await model.channels.delete(Number(id));
    session.respond({ success: true }, "json");
  });
  ctx.route("/api/channels/:id/models").methods("GET").action(async (session, _params, id) => {
    const user = await authenticate(session);
    if (!user?.is_admin) return;
    const rows = await db.select("model_configs", { channel_id: Number(id) });
    const models = await model.models.list();
    session.respond(rows.map((row: any) => ({
      ...row,
      model_name: models.find((item) => item.id === row.model_id)?.model_name ?? row.upstream_model_name,
      provider: models.find((item) => item.id === row.model_id)?.provider ?? "",
    })), "json");
  });
  ctx.route("/api/channels/:id/models").methods("POST").action(async (session, _params, id) => {
    const user = await authenticate(session);
    if (!user?.is_admin) return;
    const input = (await session.parseRequestBody()) as Record<string, unknown>;
    const now = new Date().toISOString();
    const row = await db.create("model_configs", {
      channel_id: Number(id),
      model_id: Number(input.model_id ?? 0),
      upstream_model_name: String(input.upstream_model_name ?? input.model_name ?? ""),
      input_price: String(input.input_price ?? "0"),
      output_price: String(input.output_price ?? "0"),
      enabled: input.enabled !== false,
      created_at: now,
      updated_at: now,
    });
    session.status = 201;
    session.respond(row, "json");
  });
  ctx.route("/api/channel-models/:id").methods("PUT").action(async (session, _params, id) => {
    const user = await authenticate(session);
    if (!user?.is_admin) return;
    const input = (await session.parseRequestBody()) as Record<string, unknown>;
    const updates = Object.fromEntries(
      ["upstream_model_name", "input_price", "output_price", "enabled"]
        .filter((key) => input[key] !== undefined)
        .map((key) => [key, input[key]]),
    );
    await db.update("model_configs", { id: Number(id) }, { ...updates, updated_at: new Date().toISOString() } as any);
    session.respond(await db.selectOne("model_configs", { id: Number(id) }), "json");
  });
  ctx.route("/api/channel-models/:id").methods("DELETE").action(async (session, _params, id) => {
    const user = await authenticate(session);
    if (!user?.is_admin) return;
    await db.remove("model_configs", { id: Number(id) });
    session.respond({ success: true }, "json");
  });
  ctx.route("/api/channel-usage").methods("GET").action(async (session) => {
    const user = await authenticate(session);
    if (!user?.is_admin) return;
    const channels = await model.channels.list();
    const logs = await db.select("token_logs", {} as any);
    const usage = channels.map((channel) => {
      const rows = logs.filter((row: any) => row.channel_id === channel.id);
      return {
        id: channel.id,
        name: channel.name,
        request_count: rows.length,
        input_tokens: rows.reduce((sum: number, row: any) => sum + Number(row.input_tokens || 0), 0),
        output_tokens: rows.reduce((sum: number, row: any) => sum + Number(row.output_tokens || 0), 0),
        total_tokens: rows.reduce((sum: number, row: any) => sum + Number(row.input_tokens || 0) + Number(row.output_tokens || 0), 0),
        total_cost: rows.reduce((sum: number, row: any) => sum + Number(row.cost || 0), 0).toString(),
      };
    });
    session.respond({ upstream_channels: usage }, "json");
  });
  ctx.route("/api/channels/:id/health").methods("POST").action(async (session, _params, id) => {
    const user = await authenticate(session);
    if (!user?.is_admin) return;
    const channel = await model.channels.findById(Number(id));
    if (!channel) {
      session.status = 404;
      session.respond({ error: "Channel not found" }, "json");
      return;
    }
    const checkedAt = new Date().toISOString();
    try {
      const response = await fetch(channel.base_url.replace(/\\/$/, ""), {
        method: "GET",
        headers: channel.api_key
          ? { Authorization: `Bearer ${channel.api_key}` }
          : {},
        signal: AbortSignal.timeout(10_000),
      });
      const status = response.ok ? "up" : "down";
      await model.channels.update(channel.id!, {
        last_health_checked_at: checkedAt,
        last_health_status: status,
        ...(response.ok
          ? { consecutive_failures: 0, last_failure_reason: "" }
          : {
              consecutive_failures: (channel.consecutive_failures ?? 0) + 1,
              last_failure_at: checkedAt,
              last_failure_reason: `health check returned HTTP ${response.status}`,
            }),
      });
      session.respond({ ok: response.ok, status: response.status, health_status: status }, "json");
    } catch (error) {
      await model.channels.update(channel.id!, {
        last_health_checked_at: checkedAt,
        last_health_status: "down",
        consecutive_failures: (channel.consecutive_failures ?? 0) + 1,
        last_failure_at: checkedAt,
        last_failure_reason: error instanceof Error ? error.message : String(error),
      });
      session.status = 502;
      session.respond({ error: "Health check failed", health_status: "down" }, "json");
    }
  });
  ctx.route("/api/models/sync/preview").methods("POST").action(async (session) => {
    const user = await authenticate(session);
    if (!user?.is_admin) return;
    const input = (await session.parseRequestBody()) as Record<string, unknown>;
    const channel = await model.channels.findById(Number(input.channel_id));
    if (!channel) {
      session.status = 404;
      session.respond({ error: "Channel not found" }, "json");
      return;
    }
    const syncPath = String(input.path ?? "/v1/models").trim() || "/v1/models";
    const response = await fetch(
      `${channel.base_url.replace(/\\/$/, "")}${syncPath.startsWith("/") ? syncPath : `/${syncPath}`}`,
      {
        headers: channel.api_key
          ? { Authorization: `Bearer ${channel.api_key}` }
          : {},
      },
    );
    const data = (await response.json().catch(() => ({}))) as any;
    const items = Array.isArray(data.data)
      ? data.data
      : Array.isArray(data.models)
        ? data.models
        : [];
    const existing = await model.models.list();
    session.respond(
      {
        channel_id: channel.id,
        channel_name: channel.name,
        source: "upstream",
        models: items.map((item: any) => {
          const modelName = String(item.id ?? item.name ?? "");
          return {
          model_name: modelName,
          provider: channel.type,
          exists: existing.some((entry) => entry.model_name === modelName),
          };
        }),
      },
      "json",
    );
  });
  ctx.route("/api/models/sync/preview/browser").methods("POST").action(async (session) => {
    const user = await authenticate(session);
    if (!user?.is_admin) return;
    const input = (await session.parseRequestBody()) as Record<string, unknown>;
    const payload = (input.payload ?? {}) as any;
    const items = Array.isArray(payload.data)
      ? payload.data
      : Array.isArray(payload.models)
        ? payload.models
        : Array.isArray(payload)
          ? payload
          : [];
    const channel = await model.channels.findById(Number(input.channel_id));
    session.respond({
      channel_id: channel?.id ?? Number(input.channel_id),
      channel_name: channel?.name ?? "",
      source: String(input.source ?? "browser"),
      models: items.map((item: any) => ({
        model_name: String(item.id ?? item.name ?? item.model_name ?? ""),
        provider: channel?.type ?? "",
        exists: false,
      })),
    }, "json");
  });
  ctx.route("/api/models/sync/apply").methods("POST").action(async (session) => {
    const user = await authenticate(session);
    if (!user?.is_admin) return;
    const input = (await session.parseRequestBody()) as Record<string, unknown>;
    const channelId = Number(input.channel_id);
    const selected = Array.isArray(input.models) ? input.models : [];
    let created = 0;
    let updated = 0;
    for (const value of selected as any[]) {
      const modelName = String(value.model_name ?? value.id ?? "").trim();
      if (!modelName) continue;
      let catalogModel = await model.models.findByName(modelName);
      if (!catalogModel) {
        catalogModel = await model.models.create({
          model_name: modelName,
          provider: String(value.provider ?? ""),
          provider_icon_url: String(value.provider_icon_url ?? ""),
          quota_type: 0,
          input_price: String(value.input_price ?? "0"),
          output_price: String(value.output_price ?? "0"),
          cached_input_price: "0",
          cache_write_input_price: "0",
          cache_write_1h_input_price: "0",
          image_input_price: "0",
          image_output_price: "0",
          audio_input_price: "0",
          audio_output_price: "0",
          input_price_tiers: "[]",
          output_price_tiers: "[]",
          cached_input_price_tiers: "[]",
          cache_write_input_price_tiers: "[]",
          cache_write_1h_input_price_tiers: "[]",
          image_input_price_tiers: "[]",
          image_output_price_tiers: "[]",
          audio_input_price_tiers: "[]",
          audio_output_price_tiers: "[]",
          video_billing_config: "{}",
          enabled: true,
        } as any);
        created++;
      }
      const existing = await db.selectOne("model_configs", {
        channel_id: channelId,
        model_id: catalogModel.id,
      });
      const data = {
        channel_id: channelId,
        model_id: catalogModel.id,
        upstream_model_name: String(value.upstream_model_name ?? modelName),
        input_price: String(value.input_price ?? catalogModel.input_price ?? "0"),
        output_price: String(value.output_price ?? catalogModel.output_price ?? "0"),
        enabled: value.enabled !== false,
        updated_at: new Date().toISOString(),
      } as any;
      if (existing) {
        await db.update("model_configs", { id: existing.id }, data);
        updated++;
      } else {
        await db.create("model_configs", {
          ...data,
          created_at: new Date().toISOString(),
        });
      }
    }
    session.respond({
      results: [{ channel_id: channelId, source: "upstream", created, updated }],
    }, "json");
  });
}
