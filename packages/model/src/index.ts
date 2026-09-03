import { randomBytes } from "node:crypto";
import { Context, Database } from "yumeri";

export interface User {
  id?: number;
  username: string;
  email: string;
  phone?: string | null;
  oidc_sub?: string | null;
  password_hash: string;
  email_verified: boolean;
  avatar_url: string;
  balance: string;
  group_id: number;
  referral_code?: string | null;
  referrer_id?: number | null;
  is_admin: boolean;
  created_at: string;
  updated_at: string;
}

export interface UserAvatar {
  user_id: number;
  mime_type: string;
  data: Uint8Array;
  updated_at: string;
}

export interface Group {
  id?: number;
  name: string;
  multiplier: string;
  created_at: string;
  updated_at: string;
}

export interface UserGroupMembership {
  id?: number;
  user_id: number;
  group_id: number;
  expires_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface CheckInRecord {
  id?: number;
  user_id: number;
  check_in_date: string;
  reward_amount: string;
  streak_days: number;
  reward_kind: string;
  created_at: string;
}

export interface PaymentOrder {
  id?: number;
  order_no: string;
  user_id: number;
  amount: string;
  rmb_amount: string;
  exchange_rate: string;
  payment_currency: string;
  gateway_amount: string;
  method: string;
  status: string;
  gateway_provider: string;
  gateway_channel: string;
  gateway_trade_no: string;
  notify_payload: string;
  paid_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface WalletTransaction {
  id?: number;
  user_id: number;
  source: string;
  idempotency_key: string;
  plugin_id: string;
  debit_amount: string;
  credit_amount: string;
  balance_before: string;
  balance_after: string;
  reference_type: string;
  reference_id: string;
  description: string;
  request_hash: string;
  metadata_json: string;
  created_at: string;
}

export interface WalletLimitUsage {
  id?: number;
  wallet_transaction_id: number;
  user_id: number;
  source: string;
  limit_key: string;
  created_at: string;
}

export interface EmailVerificationCode {
  id?: number;
  email: string;
  code_hash: string;
  purpose: string;
  hcaptcha_verified: boolean;
  expires_at: string;
  used_at?: string | null;
  created_at: string;
}

export interface PhoneVerificationCode {
  id?: number;
  phone: string;
  code_hash: string;
  purpose: string;
  hcaptcha_verified: boolean;
  expires_at: string;
  used_at?: string | null;
  created_at: string;
}

export interface OIDCBindRequest {
  state: string;
  user_id: number;
  expires_at: string;
  created_at: string;
}

export interface WebAuthnChallenge {
  id?: number;
  challenge: string;
  purpose: string;
  user_id?: number | null;
  rp_id: string;
  origin: string;
  expires_at: string;
  created_at: string;
}

export interface PasskeyCredential {
  id?: number;
  user_id: number;
  name: string;
  credential_id: string;
  public_key_cose: string;
  aaguid: string;
  sign_count: number;
  last_used_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserChannel {
  id?: number;
  name: string;
  description: string;
  multiplier: string;
  routing_algorithm: string;
  enabled: boolean;
  rate_limit_enabled: boolean;
  rate_limit_requests_per_minute: number;
  rate_limit_burst: number;
  created_at: string;
  updated_at: string;
}

export interface UserChannelGroupAccess {
  id?: number;
  user_channel_id: number;
  group_id: number;
  created_at: string;
  updated_at: string;
}

export interface UserChannelUserAccess {
  id?: number;
  user_channel_id: number;
  user_id: number;
  created_at: string;
  updated_at: string;
}

export interface Channel {
  id?: number;
  user_channel_id?: number | null;
  name: string;
  type: string;
  base_url: string;
  api_key: string;
  plugin_config: string;
  multiplier: string;
  priority: number;
  weight: number;
  enabled: boolean;
  price_sync_enabled: boolean;
  price_sync_cron: string;
  price_sync_last_at?: string | null;
  consecutive_failures: number;
  last_failure_at?: string | null;
  last_failure_reason: string;
  auto_disabled_at?: string | null;
  auto_disabled_reason: string;
  last_health_checked_at?: string | null;
  last_health_status: string;
  created_at: string;
  updated_at: string;
}

export interface ChannelGroupMultiplier {
  id?: number;
  channel_id: number;
  group_id: number;
  multiplier: string;
  created_at: string;
  updated_at: string;
}

export interface Model {
  id?: number;
  model_name: string;
  provider: string;
  provider_icon_url: string;
  quota_type: number;
  input_price: string;
  output_price: string;
  cached_input_price: string;
  cache_write_input_price: string;
  cache_write_1h_input_price: string;
  image_input_price: string;
  image_output_price: string;
  audio_input_price: string;
  audio_output_price: string;
  input_price_tiers: string;
  output_price_tiers: string;
  cached_input_price_tiers: string;
  cache_write_input_price_tiers: string;
  cache_write_1h_input_price_tiers: string;
  image_input_price_tiers: string;
  image_output_price_tiers: string;
  audio_input_price_tiers: string;
  audio_output_price_tiers: string;
  video_billing_config: string;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface ModelConfig {
  id?: number;
  channel_id: number;
  model_id: number;
  upstream_model_name: string;
  input_price: string;
  output_price: string;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface ModelGroupMultiplier {
  id?: number;
  model_config_id: number;
  group_id: number;
  multiplier: string;
  created_at: string;
  updated_at: string;
}

export interface ReferralCommissionLog {
  id?: number;
  referrer_id: number;
  referred_user_id: number;
  token_log_id: number;
  base_cost: string;
  rate: string;
  amount: string;
  created_at: string;
}

export interface StatusMonitor {
  id?: number;
  name: string;
  target_url: string;
  check_type: string;
  method: string;
  interval_seconds: number;
  retention_hours: number;
  enabled: boolean;
  last_status: string;
  last_latency_ms: number;
  last_status_code: number;
  last_message: string;
  last_checked_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface StatusCheck {
  id?: number;
  monitor_id: number;
  status: string;
  latency_ms: number;
  status_code: number;
  message: string;
  checked_at: string;
  created_at: string;
}

export interface ScheduledTaskRun {
  id?: number;
  task_name: string;
  status: string;
  trigger: string;
  node_name: string;
  message: string;
  duration_ms: number;
  started_at: string;
  created_at: string;
}

export interface Plugin {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  enabled: boolean;
  manifest_json: string;
  permissions_json: string;
  hooks_json: string;
  frontend_json: string;
  settings_json: string;
  global_config_json: string;
  path: string;
  wasm_path: string;
  last_error: string;
  created_at: string;
  updated_at: string;
}

export interface UserPluginState {
  id?: number;
  user_id: number;
  plugin_id: string;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface UserPluginConfig {
  id?: number;
  user_id: number;
  plugin_id: string;
  config_json: string;
  created_at: string;
  updated_at: string;
}

export interface PluginKV {
  id?: number;
  user_id: number;
  plugin_id: string;
  key: string;
  value_json: string;
  created_at: string;
  updated_at: string;
}

export interface PluginLog {
  id?: number;
  user_id?: number | null;
  plugin_id: string;
  level: string;
  event: string;
  message: string;
  metadata: string;
  created_at: string;
}

export interface VideoTask {
  id: string;
  user_id: number;
  api_key_id?: number | null;
  user_channel_id?: number | null;
  channel_id: number;
  model_config_id: number;
  model_name: string;
  billing_model_name: string;
  upstream_task_id: string;
  status: string;
  cost: string;
  request_payload: string;
  response_payload: string;
  last_status_payload: string;
  created_at: string;
  updated_at: string;
}

export interface TokenLog {
  id?: number;
  user_id: number;
  api_key_id?: number | null;
  user_channel_id?: number | null;
  channel_id: number;
  model_config_id: number;
  model_name: string;
  input_tokens: number;
  output_tokens: number;
  cached_input_tokens: number;
  cache_write_input_tokens: number;
  cache_write_1h_input_tokens: number;
  image_input_tokens: number;
  image_output_tokens: number;
  audio_input_tokens: number;
  audio_output_tokens: number;
  response_time_ms: number;
  first_response_time_ms: number;
  base_cost: string;
  group_multiplier: string;
  user_channel_multiplier: string;
  input_price: string;
  output_price: string;
  cached_input_price: string;
  cache_write_input_price: string;
  cache_write_1h_input_price: string;
  pricing_formula: string;
  cost: string;
  status: number;
  error_message: string;
  ip: string;
  user_agent: string;
  created_at: string;
}

export interface AuditLog {
  id?: number;
  log_type: string;
  action: string;
  resource: string;
  user_id?: number | null;
  api_key_id?: number | null;
  method: string;
  path: string;
  query: string;
  status_code: number;
  ip_address: string;
  user_agent: string;
  message: string;
  metadata: string;
  duration_ms: number;
  created_at: string;
}

export interface MessageChannelIntegration {
  id?: number;
  user_id: number;
  name: string;
  provider: string;
  bot_token: string;
  webhook_secret: string;
  enabled: boolean;
  default_device_id: string;
  default_workspace_path: string;
  default_workspace_unrestricted: boolean;
  default_connector_auto_approve: boolean;
  default_connector_command_prefixes: string;
  default_user_channel_id?: number | null;
  default_model: string;
  default_agent_id?: number | null;
  default_agent_key: string;
  default_agent_group_id: string;
  default_skill_ids: string;
  default_context_message_count: number;
  reply_mode: string;
  trigger_mode: string;
  system_prompt: string;
  group_configs: string;
  advanced_options: string;
  last_event_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface MessageChannelMessage {
  id?: number;
  integration_id: number;
  user_id: number;
  provider: string;
  external_chat_id: string;
  external_user_id: string;
  external_user_name: string;
  external_message_id: string;
  direction: string;
  status: string;
  content: string;
  payload: string;
  error: string;
  created_at: string;
}

export interface ModelService {
  users: {
    findById(id: number): Promise<User | undefined>;
    findByIdentifier(identifier: string): Promise<User | undefined>;
    findAdmin(): Promise<User | undefined>;
    create(user: Omit<User, "id" | "created_at" | "updated_at">): Promise<User>;
    update(id: number, data: Partial<User>): Promise<User | undefined>;
  };
  groups: {
    findByName(name: string): Promise<Group | undefined>;
    create(group: Omit<Group, "id" | "created_at" | "updated_at">): Promise<Group>;
    ensureDefault(): Promise<Group>;
  };
  userChannels: {
    findById(id: number): Promise<UserChannel | undefined>;
    ensureDefault(): Promise<UserChannel>;
  };
  models: {
    findByName(modelName: string): Promise<Model | undefined>;
    list(): Promise<Model[]>;
    create(data: Omit<Model, "id" | "created_at" | "updated_at">): Promise<Model>;
    update(id: number, data: Partial<Model>): Promise<Model | undefined>;
    delete(id: number): Promise<void>;
  };
  channels: {
    list(): Promise<Channel[]>;
    findById(id: number): Promise<Channel | undefined>;
    create(data: Omit<Channel, "id" | "created_at" | "updated_at">): Promise<Channel>;
    update(id: number, data: Partial<Channel>): Promise<Channel | undefined>;
    delete(id: number): Promise<void>;
  };
}

declare module "yumeri" {
  interface Tables {
    users: User;
    user_avatars: UserAvatar;
    groups: Group;
    user_group_memberships: UserGroupMembership;
    check_in_records: CheckInRecord;
    payment_orders: PaymentOrder;
    wallet_transactions: WalletTransaction;
    wallet_limit_usages: WalletLimitUsage;
    email_verification_codes: EmailVerificationCode;
    phone_verification_codes: PhoneVerificationCode;
    oidc_bind_requests: OIDCBindRequest;
    webauthn_challenges: WebAuthnChallenge;
    passkey_credentials: PasskeyCredential;
    user_channels: UserChannel;
    user_channel_group_accesses: UserChannelGroupAccess;
    user_channel_user_accesses: UserChannelUserAccess;
    channels: Channel;
    channel_group_multipliers: ChannelGroupMultiplier;
    models: Model;
    model_configs: ModelConfig;
    model_group_multipliers: ModelGroupMultiplier;
    referral_commission_logs: ReferralCommissionLog;
    status_monitors: StatusMonitor;
    status_checks: StatusCheck;
    scheduled_task_runs: ScheduledTaskRun;
    plugins: Plugin;
    user_plugin_states: UserPluginState;
    user_plugin_configs: UserPluginConfig;
    plugin_kv: PluginKV;
    plugin_logs: PluginLog;
    video_tasks: VideoTask;
    token_logs: TokenLog;
    audit_logs: AuditLog;
    message_channel_integrations: MessageChannelIntegration;
    message_channel_messages: MessageChannelMessage;
  }
  interface Components {
    model: ModelService;
  }
}

export const depend = ["velocelab-core", "database"];
export const provide = ["model"];

export async function apply(ctx: Context) {
  const db = ctx.component.database as Database;
  await db.extend(
    "users",
    {
      id: { type: "integer", autoIncrement: true },
      username: { type: "string", nullable: false },
      email: { type: "string", nullable: false },
      phone: "string",
      oidc_sub: "string",
      password_hash: { type: "string", nullable: false },
      email_verified: { type: "boolean", nullable: false },
      avatar_url: { type: "string", initial: "" },
      balance: { type: "decimal", initial: 0 },
      group_id: { type: "integer", initial: 0 },
      referral_code: "string",
      referrer_id: "integer",
      is_admin: { type: "boolean", nullable: false },
      created_at: "timestamp",
      updated_at: "timestamp",
    },
    { unique: ["username", "email", "phone", "oidc_sub", "referral_code"] },
  );

  await db.extend(
    "user_avatars",
    {
      user_id: { type: "integer", nullable: false },
      mime_type: { type: "string", nullable: false },
      data: { type: "text", nullable: false },
      updated_at: "timestamp",
    },
    { unique: ["user_id"] },
  );

  await db.extend(
    "groups",
    {
      id: { type: "integer", autoIncrement: true },
      name: { type: "string", nullable: false },
      multiplier: { type: "decimal", initial: 1 },
      created_at: "timestamp",
      updated_at: "timestamp",
    },
    { unique: ["name"] },
  );

  await db.extend(
    "user_group_memberships",
    {
      id: { type: "integer", autoIncrement: true },
      user_id: { type: "integer", nullable: false },
      group_id: { type: "integer", nullable: false },
      expires_at: "timestamp",
      created_at: "timestamp",
      updated_at: "timestamp",
    },
    { unique: [["user_id", "group_id"]] },
  );

  await db.extend(
    "check_in_records",
    {
      id: { type: "integer", autoIncrement: true },
      user_id: { type: "integer", nullable: false },
      check_in_date: { type: "string", nullable: false },
      reward_amount: { type: "decimal", nullable: false },
      streak_days: { type: "integer", initial: 1 },
      reward_kind: "string",
      created_at: "timestamp",
    },
    { unique: [["user_id", "check_in_date"]] },
  );

  await db.extend(
    "payment_orders",
    {
      id: { type: "integer", autoIncrement: true },
      order_no: { type: "string", nullable: false },
      user_id: { type: "integer", nullable: false },
      amount: { type: "decimal", nullable: false },
      rmb_amount: { type: "decimal", nullable: false },
      exchange_rate: { type: "decimal", nullable: false },
      payment_currency: "string",
      gateway_amount: "decimal",
      method: { type: "string", nullable: false },
      status: { type: "string", nullable: false },
      gateway_provider: "string",
      gateway_channel: "string",
      gateway_trade_no: "string",
      notify_payload: "text",
      paid_at: "timestamp",
      created_at: "timestamp",
      updated_at: "timestamp",
    },
    { unique: ["order_no"] },
  );

  await db.extend(
    "wallet_transactions",
    {
      id: { type: "integer", autoIncrement: true },
      user_id: { type: "integer", nullable: false },
      source: { type: "string", nullable: false },
      idempotency_key: { type: "string", nullable: false },
      plugin_id: "string",
      debit_amount: { type: "decimal", nullable: false, initial: 0 },
      credit_amount: { type: "decimal", nullable: false, initial: 0 },
      balance_before: { type: "decimal", nullable: false },
      balance_after: { type: "decimal", nullable: false },
      reference_type: "string",
      reference_id: "string",
      description: "string",
      request_hash: { type: "string", nullable: false },
      metadata_json: "text",
      created_at: "timestamp",
    },
    { unique: [["user_id", "source", "idempotency_key"]] },
  );

  await db.extend(
    "wallet_limit_usages",
    {
      id: { type: "integer", autoIncrement: true },
      wallet_transaction_id: { type: "integer", nullable: false },
      user_id: { type: "integer", nullable: false },
      source: { type: "string", nullable: false },
      limit_key: { type: "string", nullable: false },
      created_at: "timestamp",
    },
    { unique: [["wallet_transaction_id", "limit_key"]] },
  );

  await db.extend("email_verification_codes", {
    id: { type: "integer", autoIncrement: true },
    email: { type: "string", nullable: false },
    code_hash: { type: "string", nullable: false },
    purpose: { type: "string", nullable: false },
    hcaptcha_verified: { type: "boolean", initial: false },
    expires_at: "timestamp",
    used_at: "timestamp",
    created_at: "timestamp",
  });

  await db.extend("phone_verification_codes", {
    id: { type: "integer", autoIncrement: true },
    phone: { type: "string", nullable: false },
    code_hash: { type: "string", nullable: false },
    purpose: { type: "string", nullable: false },
    hcaptcha_verified: { type: "boolean", initial: false },
    expires_at: "timestamp",
    used_at: "timestamp",
    created_at: "timestamp",
  });

  await db.extend(
    "oidc_bind_requests",
    {
      state: { type: "string", nullable: false },
      user_id: { type: "integer", nullable: false },
      expires_at: "timestamp",
      created_at: "timestamp",
    },
    { unique: ["state"] },
  );

  await db.extend(
    "webauthn_challenges",
    {
      id: { type: "integer", autoIncrement: true },
      challenge: { type: "string", nullable: false },
      purpose: { type: "string", nullable: false },
      user_id: "integer",
      rp_id: { type: "string", nullable: false },
      origin: { type: "string", nullable: false },
      expires_at: "timestamp",
      created_at: "timestamp",
    },
    { unique: ["challenge"] },
  );

  await db.extend(
    "passkey_credentials",
    {
      id: { type: "integer", autoIncrement: true },
      user_id: { type: "integer", nullable: false },
      name: { type: "string", nullable: false },
      credential_id: { type: "text", nullable: false },
      public_key_cose: { type: "text", nullable: false },
      aaguid: "text",
      sign_count: "integer",
      last_used_at: "timestamp",
      created_at: "timestamp",
      updated_at: "timestamp",
    },
    { unique: ["credential_id"] },
  );

  await db.extend(
    "user_channels",
    {
      id: { type: "integer", autoIncrement: true },
      name: { type: "string", nullable: false },
      description: "string",
      multiplier: { type: "decimal", initial: 1 },
      routing_algorithm: { type: "string", initial: "priority" },
      enabled: { type: "boolean", initial: true },
      rate_limit_enabled: { type: "boolean", initial: false },
      rate_limit_requests_per_minute: { type: "integer", initial: 0 },
      rate_limit_burst: { type: "integer", initial: 0 },
      created_at: "timestamp",
      updated_at: "timestamp",
    },
    { unique: ["name"] },
  );

  await db.extend(
    "user_channel_group_accesses",
    {
      id: { type: "integer", autoIncrement: true },
      user_channel_id: { type: "integer", nullable: false },
      group_id: { type: "integer", nullable: false },
      created_at: "timestamp",
      updated_at: "timestamp",
    },
    { unique: [["user_channel_id", "group_id"]] },
  );

  await db.extend(
    "user_channel_user_accesses",
    {
      id: { type: "integer", autoIncrement: true },
      user_channel_id: { type: "integer", nullable: false },
      user_id: { type: "integer", nullable: false },
      created_at: "timestamp",
      updated_at: "timestamp",
    },
    { unique: [["user_channel_id", "user_id"]] },
  );

  await db.extend("channels", {
    id: { type: "integer", autoIncrement: true },
    user_channel_id: "integer",
    name: "string",
    type: "string",
    base_url: "string",
    api_key: "string",
    plugin_config: "text",
    multiplier: { type: "decimal", initial: 1 },
    priority: { type: "integer", initial: 1 },
    weight: { type: "integer", initial: 1 },
    enabled: { type: "boolean", initial: true },
    price_sync_enabled: "boolean",
    price_sync_cron: "string",
    price_sync_last_at: "timestamp",
    consecutive_failures: { type: "integer", initial: 0 },
    last_failure_at: "timestamp",
    last_failure_reason: "string",
    auto_disabled_at: "timestamp",
    auto_disabled_reason: "string",
    last_health_checked_at: "timestamp",
    last_health_status: "string",
    created_at: "timestamp",
    updated_at: "timestamp",
  });

  await db.extend(
    "channel_group_multipliers",
    {
      id: { type: "integer", autoIncrement: true },
      channel_id: { type: "integer", nullable: false },
      group_id: { type: "integer", nullable: false },
      multiplier: { type: "decimal", initial: 1 },
      created_at: "timestamp",
      updated_at: "timestamp",
    },
    { unique: [["channel_id", "group_id"]] },
  );

  await db.extend(
    "models",
    {
      id: { type: "integer", autoIncrement: true },
      model_name: { type: "string", nullable: false },
      provider: "string",
      provider_icon_url: "string",
      quota_type: { type: "integer", initial: 0 },
      input_price: { type: "decimal", initial: 0 },
      output_price: { type: "decimal", initial: 0 },
      cached_input_price: { type: "decimal", initial: 0 },
      cache_write_input_price: { type: "decimal", initial: 0 },
      cache_write_1h_input_price: { type: "decimal", initial: 0 },
      image_input_price: { type: "decimal", initial: 0 },
      image_output_price: { type: "decimal", initial: 0 },
      audio_input_price: { type: "decimal", initial: 0 },
      audio_output_price: { type: "decimal", initial: 0 },
      input_price_tiers: "text",
      output_price_tiers: "text",
      cached_input_price_tiers: "text",
      cache_write_input_price_tiers: "text",
      cache_write_1h_input_price_tiers: "text",
      image_input_price_tiers: "text",
      image_output_price_tiers: "text",
      audio_input_price_tiers: "text",
      audio_output_price_tiers: "text",
      video_billing_config: "text",
      enabled: { type: "boolean", initial: true },
      created_at: "timestamp",
      updated_at: "timestamp",
    },
    { unique: ["model_name"] },
  );

  await db.extend("model_configs", {
    id: { type: "integer", autoIncrement: true },
    channel_id: "integer",
    model_id: "integer",
    upstream_model_name: "string",
    input_price: { type: "decimal", initial: 0 },
    output_price: { type: "decimal", initial: 0 },
    enabled: { type: "boolean", initial: true },
    created_at: "timestamp",
    updated_at: "timestamp",
  });

  await db.extend(
    "model_group_multipliers",
    {
      id: { type: "integer", autoIncrement: true },
      model_config_id: { type: "integer", nullable: false },
      group_id: { type: "integer", nullable: false },
      multiplier: { type: "decimal", initial: 1 },
      created_at: "timestamp",
      updated_at: "timestamp",
    },
    { unique: [["model_config_id", "group_id"]] },
  );

  await db.extend(
    "referral_commission_logs",
    {
      id: { type: "integer", autoIncrement: true },
      referrer_id: { type: "integer", nullable: false },
      referred_user_id: { type: "integer", nullable: false },
      token_log_id: { type: "integer", nullable: false },
      base_cost: { type: "decimal", nullable: false },
      rate: { type: "decimal", nullable: false },
      amount: { type: "decimal", nullable: false },
      created_at: "timestamp",
    },
    { unique: ["token_log_id"] },
  );

  await db.extend("status_monitors", {
    id: { type: "integer", autoIncrement: true },
    name: { type: "string", nullable: false },
    target_url: { type: "string", nullable: false },
    check_type: { type: "string", initial: "http" },
    method: { type: "string", initial: "GET" },
    interval_seconds: { type: "integer", initial: 60 },
    retention_hours: { type: "integer", initial: 168 },
    enabled: { type: "boolean", initial: true },
    last_status: { type: "string", initial: "pending" },
    last_latency_ms: "integer",
    last_status_code: "integer",
    last_message: "string",
    last_checked_at: "timestamp",
    created_at: "timestamp",
    updated_at: "timestamp",
  });

  await db.extend("status_checks", {
    id: { type: "integer", autoIncrement: true },
    monitor_id: { type: "integer", nullable: false },
    status: { type: "string", nullable: false },
    latency_ms: "integer",
    status_code: "integer",
    message: "string",
    checked_at: "timestamp",
    created_at: "timestamp",
  });

  await db.extend("scheduled_task_runs", {
    id: { type: "integer", autoIncrement: true },
    task_name: "string",
    status: "string",
    trigger: "string",
    node_name: "string",
    message: "string",
    duration_ms: "bigint",
    started_at: "timestamp",
    created_at: "timestamp",
  });

  await db.extend(
    "plugins",
    {
      id: { type: "string", nullable: false },
      name: { type: "string", nullable: false },
      version: { type: "string", nullable: false },
      description: "text",
      author: "string",
      enabled: { type: "boolean", initial: false },
      manifest_json: { type: "text", nullable: false },
      permissions_json: "text",
      hooks_json: "text",
      frontend_json: "text",
      settings_json: "text",
      global_config_json: "text",
      path: { type: "string", nullable: false },
      wasm_path: "string",
      last_error: "text",
      created_at: "timestamp",
      updated_at: "timestamp",
    },
    { unique: ["id"] },
  );

  await db.extend(
    "user_plugin_states",
    {
      id: { type: "integer", autoIncrement: true },
      user_id: { type: "integer", nullable: false },
      plugin_id: { type: "string", nullable: false },
      enabled: { type: "boolean", initial: false },
      created_at: "timestamp",
      updated_at: "timestamp",
    },
    { unique: [["user_id", "plugin_id"]] },
  );

  await db.extend(
    "user_plugin_configs",
    {
      id: { type: "integer", autoIncrement: true },
      user_id: { type: "integer", nullable: false },
      plugin_id: { type: "string", nullable: false },
      config_json: "text",
      created_at: "timestamp",
      updated_at: "timestamp",
    },
    { unique: [["user_id", "plugin_id"]] },
  );

  await db.extend(
    "plugin_kv",
    {
      id: { type: "integer", autoIncrement: true },
      user_id: { type: "integer", nullable: false },
      plugin_id: { type: "string", nullable: false },
      key: { type: "string", nullable: false },
      value_json: "text",
      created_at: "timestamp",
      updated_at: "timestamp",
    },
    { unique: [["user_id", "plugin_id", "key"]] },
  );

  await db.extend("plugin_logs", {
    id: { type: "integer", autoIncrement: true },
    user_id: "integer",
    plugin_id: "string",
    level: { type: "string", nullable: false },
    event: { type: "string", nullable: false },
    message: "text",
    metadata: "text",
    created_at: "timestamp",
  });

  await db.extend(
    "video_tasks",
    {
      id: { type: "string", nullable: false },
      user_id: { type: "integer", nullable: false },
      api_key_id: "integer",
      user_channel_id: "integer",
      channel_id: { type: "integer", nullable: false },
      model_config_id: { type: "integer", nullable: false },
      model_name: { type: "string", nullable: false },
      billing_model_name: "string",
      upstream_task_id: "string",
      status: { type: "string", nullable: false },
      cost: { type: "decimal", initial: 0 },
      request_payload: "text",
      response_payload: "text",
      last_status_payload: "text",
      created_at: "timestamp",
      updated_at: "timestamp",
    },
    { unique: ["id"] },
  );

  await db.extend("token_logs", {
    id: { type: "integer", autoIncrement: true },
    user_id: "integer",
    api_key_id: "integer",
    user_channel_id: "integer",
    channel_id: "integer",
    model_config_id: "integer",
    model_name: "string",
    input_tokens: "integer",
    output_tokens: "integer",
    cached_input_tokens: { type: "integer", initial: 0 },
    cache_write_input_tokens: { type: "integer", initial: 0 },
    cache_write_1h_input_tokens: { type: "integer", initial: 0 },
    image_input_tokens: { type: "integer", initial: 0 },
    image_output_tokens: { type: "integer", initial: 0 },
    audio_input_tokens: { type: "integer", initial: 0 },
    audio_output_tokens: { type: "integer", initial: 0 },
    response_time_ms: { type: "bigint", initial: 0 },
    first_response_time_ms: { type: "bigint", initial: 0 },
    base_cost: { type: "decimal", initial: 0 },
    group_multiplier: { type: "decimal", initial: 1 },
    user_channel_multiplier: { type: "decimal", initial: 1 },
    input_price: { type: "decimal", initial: 0 },
    output_price: { type: "decimal", initial: 0 },
    cached_input_price: { type: "decimal", initial: 0 },
    cache_write_input_price: { type: "decimal", initial: 0 },
    cache_write_1h_input_price: { type: "decimal", initial: 0 },
    pricing_formula: "text",
    cost: "decimal",
    status: { type: "integer", initial: 0 },
    error_message: "string",
    ip: "string",
    user_agent: "text",
    created_at: "timestamp",
  });

  await db.extend("audit_logs", {
    id: { type: "integer", autoIncrement: true },
    log_type: { type: "string", nullable: false },
    action: { type: "string", nullable: false },
    resource: "string",
    user_id: "integer",
    api_key_id: "integer",
    method: "string",
    path: "string",
    query: "string",
    status_code: "integer",
    ip_address: "string",
    user_agent: "string",
    message: "string",
    metadata: "text",
    duration_ms: "bigint",
    created_at: "timestamp",
  });

  await db.extend(
    "message_channel_integrations",
    {
      id: { type: "integer", autoIncrement: true },
      user_id: { type: "integer", nullable: false },
      name: { type: "string", nullable: false },
      provider: { type: "string", nullable: false },
      bot_token: { type: "text", nullable: false },
      webhook_secret: { type: "string", nullable: false },
      enabled: { type: "boolean", initial: true },
      default_device_id: "string",
      default_workspace_path: "text",
      default_workspace_unrestricted: { type: "boolean", initial: false },
      default_connector_auto_approve: { type: "boolean", initial: false },
      default_connector_command_prefixes: { type: "text", initial: "[]" },
      default_user_channel_id: "integer",
      default_model: "string",
      default_agent_id: "integer",
      default_agent_key: "string",
      default_agent_group_id: "string",
      default_skill_ids: { type: "text", initial: "[]" },
      default_context_message_count: { type: "integer", initial: 12 },
      reply_mode: { type: "string", initial: "mention" },
      trigger_mode: { type: "string", initial: "mention" },
      system_prompt: { type: "text", initial: "" },
      group_configs: { type: "text", initial: "[]" },
      advanced_options: { type: "text", initial: "{}" },
      last_event_at: "timestamp",
      created_at: "timestamp",
      updated_at: "timestamp",
    },
    { unique: [["user_id", "name"], "webhook_secret"] },
  );

  await db.extend("message_channel_messages", {
    id: { type: "integer", autoIncrement: true },
    integration_id: { type: "integer", nullable: false },
    user_id: { type: "integer", nullable: false },
    provider: { type: "string", nullable: false },
    external_chat_id: "string",
    external_user_id: "string",
    external_user_name: "string",
    external_message_id: "string",
    direction: { type: "string", nullable: false },
    status: { type: "string", nullable: false },
    content: { type: "text", nullable: false },
    payload: { type: "text", nullable: false },
    error: { type: "text", initial: "" },
    created_at: "timestamp",
  });

  const users = {
    findById: (id: number) => {
      return db.selectOne("users", { id } as any);
    },
    findByIdentifier: (identifier: string) =>
      db.selectOne("users", {
        $or: [{ username: identifier }, { email: identifier.toLowerCase() }],
      } as any),
    findAdmin: () => {
      return db.selectOne("users", { is_admin: true } as any);
    },
    async create(data: Omit<User, "id" | "created_at" | "updated_at">) {
      const existingUsers = await db.select("users", {});
      if (existingUsers.length > 0) {
        throw Error("this installation supports exactly one user");
      }
      const now = new Date().toISOString();
      const user = await db.create("users", {
        ...data,
        created_at: now,
        updated_at: now,
      });
      await db.create("user_group_memberships", {
        user_id: user.id ?? 0,
        group_id: user.group_id,
        expires_at: null,
        created_at: now,
        updated_at: now,
      });
      return user;
    },
    async update(id: number, data: Partial<User>) {
      await db.update("users", { id } as any, { ...data, updated_at: new Date().toISOString() } as any);
      return db.selectOne("users", { id } as any);
    },
  };

  const groups = {
    findByName: (name: string) => db.selectOne("groups", { name }),
    async create(data: Omit<Group, "id" | "created_at" | "updated_at">) {
      const now = new Date().toISOString();
      return db.create("groups", { ...data, created_at: now, updated_at: now });
    },
    async ensureDefault() {
      const existing = await db.selectOne("groups", { name: "user" });
      if (existing) return existing;
      return this.create({ name: "user", multiplier: "1" });
    },
  };

  const userChannels = {
    findById: (id: number) => {
      return db.selectOne("user_channels", { id } as any);
    },
    async ensureDefault() {
      const existing = await db.selectOne("user_channels", { name: "default" } as any);
      if (existing) return existing;
      const now = new Date().toISOString();
      return db.create("user_channels", {
        name: "default",
        description: "Default user-facing channel",
        multiplier: "1",
        routing_algorithm: "priority",
        enabled: true,
        rate_limit_enabled: false,
        rate_limit_requests_per_minute: 0,
        rate_limit_burst: 0,
        created_at: now,
        updated_at: now,
      });
    },
  };

  const models = {
    findByName: (model_name: string) => {
      return db.selectOne("models", { model_name } as any);
    },
    async list() {
      const rows = await db.select("models", {});
      return rows.sort((left, right) => left.model_name.localeCompare(right.model_name));
    },
    async create(data: Omit<Model, "id" | "created_at" | "updated_at">) {
      const now = new Date().toISOString();
      return db.create("models", { ...data, created_at: now, updated_at: now });
    },
    async update(id: number, data: Partial<Model>) {
      await db.update("models", { id } as any, { ...data, updated_at: new Date().toISOString() } as any);
      return db.selectOne("models", { id } as any);
    },
    async delete(id: number) {
      await db.remove("models", { id } as any);
    },
  };

  const channels = {
    async list() {
      const rows = await db.select("channels", {});
      return rows.sort((left, right) => left.name.localeCompare(right.name));
    },
    findById: (id: number) => {
      return db.selectOne("channels", { id } as any);
    },
    async create(data: Omit<Channel, "id" | "created_at" | "updated_at">) {
      const now = new Date().toISOString();
      return db.create("channels", { ...data, created_at: now, updated_at: now });
    },
    async update(id: number, data: Partial<Channel>) {
      await db.update("channels", { id } as any, { ...data, updated_at: new Date().toISOString() } as any);
      return db.selectOne("channels", { id } as any);
    },
    async delete(id: number) {
      await db.remove("channels", { id } as any);
    },
  };

  const defaultGroup = await groups.ensureDefault();
  const usersWithoutGroup = await db.select("users", { group_id: 0 } as any);
  for (const user of usersWithoutGroup) {
    await db.update("users", { id: user.id }, { group_id: defaultGroup.id ?? 0 });
  }

  const existingUsers = await db.select("users", {});
  for (const user of existingUsers) {
    const groupId = user.group_id || defaultGroup.id || 0;
    const membership = await db.selectOne("user_group_memberships", {
      user_id: user.id,
      group_id: groupId,
    });
    if (membership) continue;
    const now = new Date().toISOString();
    await db.create("user_group_memberships", {
      user_id: user.id ?? 0,
      group_id: groupId,
      expires_at: null,
      created_at: now,
      updated_at: now,
    });
  }

  for (const user of existingUsers) {
    if (user.oidc_sub === "") {
      await db.update("users", { id: user.id } as any, { oidc_sub: null } as any);
    }
    if (!user.referral_code?.trim()) {
      let referralCode = "";
      for (let attempt = 0; attempt < 50; attempt += 1) {
        const candidate = randomBytes(8).toString("base64")
          .replaceAll("=", "")
          .replaceAll("+", "A")
          .replaceAll("/", "B")
          .slice(0, 13)
          .toUpperCase();
        if (!(await db.selectOne("users", { referral_code: candidate } as any))) {
          referralCode = candidate;
          break;
        }
      }
      if (!referralCode) throw Error("failed to create unique referral code");
      await db.update("users", { id: user.id } as any, { referral_code: referralCode } as any);
    }
  }

  const defaultUserChannel = await userChannels.ensureDefault();
  const unassignedChannels = await db.select("channels", { user_channel_id: null } as any);
  for (const channel of unassignedChannels) {
    await db.update("channels", { id: channel.id } as any, { user_channel_id: defaultUserChannel.id ?? 0 } as any);
  }

  ctx.registerComponent("model", { users, groups, userChannels, models, channels });
}
