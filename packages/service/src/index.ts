import {
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { Context, Database, Schema } from "yumeri";
import bcrypt from "bcryptjs";
import { User } from "@velocelab/user";


export const depend = [
  "database",
  "user",
];
export const provide = ["service"];

export interface ServiceConfig {
  environment: string;
  dataPath: string;
  jwtSecret: string;
  nodeName: string;
  oidcIssuer: string;
  oidcClientId: string;
  oidcClientSecret: string;
  oidcRedirectUrl: string;
  authAgreementMode: string;
  passwordRegistrationEnabled: boolean;
  passwordHCaptchaEnabled: boolean;
}
export interface ServiceRegistry {
  names(): string[];
  initialSetupRequired(): Promise<boolean>;
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

function verifyPassword(password: string, encoded: string) {
  return bcrypt.compareSync(password, encoded);
}

function encodeJson(value: unknown) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function issueToken(user: User, secret: string) {
  if (user.id === undefined) throw Error("user is required");
  const header = encodeJson({ alg: "HS256", typ: "JWT" });
  const payload = encodeJson({
    id: user.id,
    is_admin: Boolean(user.is_admin),
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
    // The claim is a shape check, and the value it checks arrives in whichever
    // form the driver stores booleans in: SQLite hands back 0 and 1, so asking
    // for a boolean here would reject every token this service issues on it.
    if (!Number.isInteger(claims.id) || ![true, false, 0, 1].includes(claims.is_admin))
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
  const users = ctx.component.user;
  const db = ctx.component.database as Database;
  const jwtSecret = await resolveJwtSecret(cfg);
  const service: ServiceRegistry = {
    names: () => ["auth", "billing", "chat"],
    initialSetupRequired: async () => !(await users.findAdmin()),
    async loginWithPassword(identifier, password) {
      if (await service.initialSetupRequired())
        throw Error("initial setup is required");
      const user = await users.findByIdentifier(identifier.trim());
      if (!user || !verifyPassword(password, user.password_hash))
        throw Error("invalid username/email or password");
      return { user, token: issueToken(user, jwtSecret) };
    },
    async verifyToken(authToken) {
      const userId = verifyJwt(authToken, jwtSecret);
      return userId ? users.findById(userId) : undefined;
    },
    publicConfiguration: () => ({
      authAgreementMode: cfg.authAgreementMode,
      passwordRegistrationEnabled: cfg.passwordRegistrationEnabled,
      passwordHCaptchaEnabled: cfg.passwordHCaptchaEnabled,
    }),
  };
  ctx.registerComponent("service", service);

  // Model list sync is implemented in `@velocelab/channel-admin` (`/api/models/sync/*`),
  // next to the channel bindings it writes.
}
