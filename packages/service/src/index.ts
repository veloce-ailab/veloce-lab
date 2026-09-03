import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { Context, Schema } from "yumeri";
import bcrypt from "bcryptjs";
import type { ModelService, User } from "@velocelab/model";

export const depend = [
  "velocelab-core",
  "cache",
  "model",
  "adapters",
  "channel",
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
  createApiKey(userId: number, name: string): Promise<{ apiKey: string; record: import("@velocelab/model").APIKey }>;
  findUserByApiKey(raw: string): Promise<User | undefined>;
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

function generateApiKey() {
  return `sk-${randomBytes(32).toString("base64url")}`;
}

function hashApiKey(raw: string) {
  return createHash("sha256").update(raw).digest("hex");
}

function apiKeyPrefix(raw: string) {
  return raw.length <= 12 ? raw : `${raw.slice(0, 8)}...${raw.slice(-4)}`;
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
        api_key: generateApiKey(),
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
    async createApiKey(userId, name) {
      const user = await model.users.findById(userId);
      if (!user) throw Error("user not found");
      const apiKey = generateApiKey();
      const record = await model.apiKeys.create({
        user_id: userId,
        name: name.trim() || "API key",
        api_key: apiKey,
        key_hash: hashApiKey(apiKey),
        key_prefix: apiKeyPrefix(apiKey),
        allowed_models: "",
        allowed_user_channels: "",
        allowed_ips: "",
        quota_limit: "0",
        enabled: true,
        last_used_at: null,
        usage_reset_at: null,
      });
      return { apiKey, record };
    },
    async findUserByApiKey(raw) {
      const normalized = raw.trim();
      if (!normalized) return undefined;
      const record = await model.apiKeys.findByRaw(normalized) ?? await model.apiKeys.findByHash(hashApiKey(normalized));
      if (!record?.enabled) return undefined;
      await model.apiKeys.markUsed(record.id ?? 0);
      return model.users.findById(record.user_id);
    },
  };
  ctx.registerComponent("service", service);
}
