import { Context } from "yumeri";
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
export interface HarnessAgent {
    id?: number;
    user_id: number;
    stable_id?: string | null;
    name: string;
    prompt: string;
    default_model: string;
    user_channel_id?: number | null;
    stream: boolean;
    skill_ids: string;
    mcp_server_ids: string;
    knowledge_base_ids: string;
    preset_messages: string;
    created_at: string;
    updated_at: string;
}
export interface HarnessConnectorDevice {
    id: string;
    user_id: number;
    token_hash: string;
    name: string;
    remark: string;
    hostname: string;
    os: string;
    arch: string;
    version: string;
    kind: string;
    desktop_instance_id: string;
    mode: string;
    status: string;
    last_seen_at?: string | null;
    created_at: string;
    updated_at: string;
}
export interface HarnessConnectorTask {
    id: string;
    user_id: number;
    device_id: string;
    run_id: string;
    action: string;
    workspace_path: string;
    payload: string;
    status: string;
    result: string;
    error_message: string;
    started_at?: string | null;
    finished_at?: string | null;
    created_at: string;
    updated_at: string;
}
export interface HarnessSession {
    id: string;
    user_id: number;
    folder_id: string;
    title: string;
    run_mode: string;
    agent_id: string;
    agent_group_id: string;
    skill_ids: string;
    mcp_server_ids: string;
    knowledge_base_ids: string;
    connector_device_id: string;
    connector_workspace_path: string;
    connector_auto_approve: boolean;
    connector_approval_mode: string;
    connector_command_prefixes: string;
    model_name: string;
    user_channel_id?: number | null;
    max_tokens: number;
    temperature?: number | null;
    reasoning_effort: string;
    auto_compress_context: boolean;
    disabled_tool_groups: string;
    created_at: string;
    updated_at: string;
}
export interface HarnessMessage {
    id: string;
    session_id: string;
    user_id: number;
    role: string;
    content: string;
    content_parts: string;
    tool_calls: string;
    input_tokens: number;
    output_tokens: number;
    sort_order: number;
    created_at: string;
    updated_at: string;
}
export interface HarnessRun {
    id: string;
    session_id: string;
    user_id: number;
    status: string;
    assistant_message_id: string;
    mode: string;
    status_message: string;
    current_round: number;
    error_message: string;
    cost: string;
    tool_calls: number;
    tool_call_details: string;
    started_at?: string | null;
    created_at: string;
    finished_at?: string | null;
    updated_at: string;
}
export interface HarnessUserSettings {
    user_id: number;
    file_storage_enabled: boolean;
    assistant_mode_enabled: boolean;
    custom_mcp_servers: string;
    title_model_name: string;
    title_user_channel_id?: number | null;
    title_generation_scope?: string;
    connector_approval_agent_id?: string;
    updated_at: string;
}
export interface HarnessMCPServer {
    id: string;
    user_id: number;
    name: string;
    transport: string;
    command: string;
    args: string;
    env: string;
    url: string;
    enabled: boolean;
    created_at: string;
    updated_at: string;
}
export interface AdvancedChatFile {
    id: string;
    user_id: number;
    name: string;
    mime_type: string;
    size: number;
    data: string;
    storage_path: string;
    text_extract: string;
    hash: string;
    source: string;
    source_key: string;
    created_at: string;
    updated_at: string;
}
export interface AdvancedChatKnowledgeBase {
    id: string;
    user_id: number;
    name: string;
    description: string;
    embedding_model_name: string;
    embedding_user_channel_id: number;
    created_at: string;
    updated_at: string;
}
export interface AdvancedChatMemoryDocument {
    id: string;
    user_id: number;
    scope: string;
    agent_id: string;
    group_id: string;
    kind: string;
    title: string;
    storage_path: string;
    size: number;
    hash: string;
    enabled: boolean;
    updated_by: string;
    created_at: string;
    updated_at: string;
}
export interface AdvancedChatKnowledgeDocument {
    id: string;
    knowledge_base_id: string;
    user_id: number;
    file_id: string;
    name: string;
    mime_type: string;
    size: number;
    text_available: boolean;
    embedding_status: string;
    embedding_error: string;
    embedding_model: string;
    embedding_dim: number;
    chunk_count: number;
    embedded_at?: string | null;
    created_at: string;
    updated_at: string;
}
export interface AdvancedChatConnectorCredential {
    id: string;
    user_id: number;
    name: string;
    type: string;
    key: string;
    value: string;
    created_at: string;
    updated_at: string;
}
export interface AdvancedChatConnectorCredentialBinding {
    id: string;
    user_id: number;
    device_id: string;
    credential_id: string;
    created_at: string;
}
export interface AdvancedChatSkillPackage {
    id: string;
    user_id: number;
    name: string;
    source_name: string;
    storage_path: string;
    size: number;
    file_count: number;
    hash: string;
    status: string;
    error_text: string;
    created_at: string;
    updated_at: string;
}
export interface AdvancedChatPackagedSkill {
    id: string;
    user_id: number;
    package_id: string;
    name: string;
    description: string;
    source: string;
    skill_path: string;
    root_path: string;
    metadata_json: string;
    allowed_tools: string;
    compatibility: string;
    enabled: boolean;
    size: number;
    hash: string;
    created_at: string;
    updated_at: string;
}
export interface AdvancedChatKnowledgeChunk {
    id: string;
    knowledge_base_id: string;
    document_id: string;
    user_id: number;
    ordinal: number;
    content: string;
    content_hash: string;
    embedding: string;
    embedding_model: string;
    embedding_dim: number;
    created_at: string;
    updated_at: string;
}
export interface AdvancedChatRunEvent {
    id?: number;
    run_id: string;
    session_id: string;
    user_id: number;
    seq: number;
    event: string;
    payload: string;
    created_at: string;
}
export interface AdvancedChatChatGroup {
    id: string;
    user_id: number;
    name: string;
    description: string;
    connector_device_id: string;
    connector_workspace_path: string;
    created_at: string;
    updated_at: string;
}
export interface AdvancedChatChatGroupMember {
    id: string;
    group_id: string;
    user_id: number;
    agent_id: string;
    agent_name: string;
    model_name: string;
    user_channel_id: number;
    connector_device_id: string;
    session_id: string;
    run_id: string;
    status: string;
    work_depth: number;
    created_at: string;
    updated_at: string;
}
export interface AdvancedChatChatGroupMessage {
    id: string;
    group_id: string;
    user_id: number;
    sender_type: string;
    sender_id: string;
    sender_name: string;
    content: string;
    mention_member_ids: string;
    depth: number;
    source_run_id: string;
    created_at: string;
}
export interface AdvancedChatPrivateConversation {
    id: string;
    group_id: string;
    user_id: number;
    member_a_id: string;
    member_b_id: string;
    member_a_name: string;
    member_b_name: string;
    last_message_at: string;
    created_at: string;
    updated_at: string;
}
export interface AdvancedChatPrivateMessage {
    id: string;
    conversation_id: string;
    group_id: string;
    user_id: number;
    sender_member_id: string;
    sender_name: string;
    recipient_member_id: string;
    content: string;
    source_run_id: string;
    delivered_at?: string | null;
    created_at: string;
}
export interface AdvancedChatScheduledTask {
    id: string;
    user_id: number;
    name: string;
    description: string;
    agent_id: string;
    schedule_type: string;
    run_at?: string | null;
    interval_seconds: number;
    session_mode: string;
    session_id: string;
    auto_delete_session: boolean;
    message: string;
    timeout_seconds: number;
    delivery_id: string;
    model_name: string;
    user_channel_id: number;
    max_tokens: number;
    temperature?: number | null;
    reasoning_effort: string;
    enabled: boolean;
    last_run_at?: string | null;
    next_run_at?: string | null;
    last_run_id: string;
    last_status: string;
    last_error: string;
    created_at: string;
    updated_at: string;
}
export interface AdvancedChatDelivery {
    id: string;
    user_id: number;
    name: string;
    description: string;
    method: string;
    webhook_url: string;
    webhook_headers: string;
    email_to: string;
    smtp_host: string;
    smtp_port: string;
    smtp_username: string;
    smtp_password: string;
    smtp_from: string;
    enabled: boolean;
    created_at: string;
    updated_at: string;
}
export interface AdvancedChatWorkspace {
    id: string;
    user_id: number;
    name: string;
    location: string;
    device_id: string;
    path: string;
    model: string;
    agent: string;
    created_at: string;
    updated_at: string;
}
export interface AdvancedChatWorkspaceFile {
    id: string;
    workspace_id: string;
    user_id: number;
    name: string;
    content: string;
    storage_path: string;
    created_at: string;
    updated_at: string;
}
export interface AdvancedChatSessionTask {
    id: string;
    user_id: number;
    session_id: string;
    position: number;
    title: string;
    description: string;
    status: string;
    note: string;
    created_at: string;
    updated_at: string;
}
export interface AdvancedChatSessionFolder {
    id: string;
    user_id: number;
    name: string;
    created_at: string;
    updated_at: string;
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
        advanced_chat_agents: HarnessAgent;
        advanced_chat_connector_devices: HarnessConnectorDevice;
        advanced_chat_connector_tasks: HarnessConnectorTask;
        advanced_chat_sessions: HarnessSession;
        advanced_chat_messages: HarnessMessage;
        advanced_chat_runs: HarnessRun;
        advanced_chat_user_settings: HarnessUserSettings;
        advanced_chat_mcp_servers: HarnessMCPServer;
        advanced_chat_files: AdvancedChatFile;
        advanced_chat_knowledge_bases: AdvancedChatKnowledgeBase;
        advanced_chat_memory_documents: AdvancedChatMemoryDocument;
        advanced_chat_knowledge_documents: AdvancedChatKnowledgeDocument;
        advanced_chat_connector_credentials: AdvancedChatConnectorCredential;
        advanced_chat_connector_credential_bindings: AdvancedChatConnectorCredentialBinding;
        advanced_chat_skill_packages: AdvancedChatSkillPackage;
        advanced_chat_packaged_skills: AdvancedChatPackagedSkill;
        advanced_chat_knowledge_chunks: AdvancedChatKnowledgeChunk;
        advanced_chat_run_events: AdvancedChatRunEvent;
        advanced_chat_chat_groups: AdvancedChatChatGroup;
        advanced_chat_chat_group_members: AdvancedChatChatGroupMember;
        advanced_chat_chat_group_messages: AdvancedChatChatGroupMessage;
        advanced_chat_private_conversations: AdvancedChatPrivateConversation;
        advanced_chat_private_messages: AdvancedChatPrivateMessage;
        advanced_chat_scheduled_tasks: AdvancedChatScheduledTask;
        advanced_chat_deliveries: AdvancedChatDelivery;
        advanced_chat_workspaces: AdvancedChatWorkspace;
        advanced_chat_workspace_files: AdvancedChatWorkspaceFile;
        advanced_chat_session_tasks: AdvancedChatSessionTask;
        advanced_chat_session_folders: AdvancedChatSessionFolder;
    }
    interface Components {
        model: ModelService;
    }
}
export declare const depend: string[];
export declare const provide: string[];
export declare function apply(ctx: Context): Promise<void>;
