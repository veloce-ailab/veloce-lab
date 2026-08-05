import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Activity,
  ArrowDown,
  Bot,
  ArrowUp,
  CalendarCheck,
  CreditCard,
  Download,
  FileText,
  Gift,
  Globe2,
  HandCoins,
  KeyRound,
  Layers,
  Mail,
  Palette,
  Pencil,
  Plus,
  RefreshCw,
  ShieldCheck,
  ToggleLeft,
  Trash2,
  Upload,
  Server,
  Network,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import type { AxiosError } from "axios"
import { useEffect, useState } from "react"
import type { ReactNode } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { DateTimePicker } from "@/components/ui/date-picker"
import { Textarea } from "@/components/ui/textarea"
import { PageInlineSlot, PageTitleSlot } from "@/components/layout/PageTitleSlot"
import { PageTab, PageTabs } from "@/components/layout/PageTabs"
import { TabTransition } from "@/components/layout/TabTransition"
import { useToast } from "@/components/ui/toast"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import api from "@/lib/api"
import AdvancedChatManagement from "./AdvancedChatManagement"
import { useI18n } from "@/lib/i18n"
import { defaultPublicSettings, parseTopNavItems } from "@/lib/public-settings"
import type { PublicSettings } from "@/lib/public-settings"
import { normalizeHexColor } from "@/lib/theme"
import { formatCurrency } from "@/lib/currency"

interface Group {
  id: number
  name: string
  multiplier: string | number
}

interface GroupDraft {
  id?: number
  name: string
  multiplier: string
}

interface RedeemCode {
  id: number
  code: string
  amount: string | number
  group_id?: number | null
  group?: Group | null
  group_duration_days: number
  subscription_plan_id?: number | null
  subscription_plan?: SubscriptionPlan | null
  subscription_duration_days: number
  allow_stacking: boolean
  max_uses: number
  used_count: number
  enabled: boolean
  expires_at?: string | null
  created_at: string
}

interface ClusterNode {
  id: number
  name: string
  role: string
  online: boolean
  is_current: boolean
  last_seen_at: string
  created_at: string
}

interface ClusterStatus {
  multi_node_enabled: boolean
  current_node_name: string
  node_name_missing: boolean
  node_address_mode: string
  node_addresses: string
  nodes: ClusterNode[]
}

interface ScheduledJobSnapshot {
  name: string
  description: string
  primary_only: boolean
  enabled: boolean
  running: boolean
  interval_seconds: number
  next_run_at?: string | null
  last_run_at?: string | null
  last_status: string
  last_message: string
  last_duration_ms: number
}

interface ScheduledJobsResponse {
  jobs: ScheduledJobSnapshot[]
  node: { name: string; primary: boolean }
}

interface ScheduledTaskRun {
  id: number
  task_name: string
  status: string
  trigger: string
  node_name: string
  message: string
  duration_ms: number
  started_at: string
}

interface ScheduledTaskRunPage {
  items: ScheduledTaskRun[]
  total: number
  page: number
  page_size: number
}

interface SubscriptionPlan {
  id: number
  name: string
  reset_amount: string | number
  reset_interval_days: number
  price: string | number
  duration_days: number
  purchasable: boolean
  enabled: boolean
  created_at: string
}

interface MetaModel {
  id: number
  name: string
  description: string
  dsl: string
  provider: string
  provider_name: string
  provider_icon_url: string
  expose_referenced_models: boolean
  billing_mode: string
  input_price: string | number
  output_price: string | number
  cached_input_price: string | number
  enabled: boolean
  created_at: string
}

interface SubscriptionPlanDraft {
  id?: number
  name: string
  reset_amount: string
  reset_interval_days: string
  price: string
  duration_days: string
  purchasable: boolean
  enabled: boolean
}

interface MetaModelDraft {
  id?: number
  name: string
  description: string
  dsl: string
  provider: string
  provider_name: string
  provider_icon_url: string
  expose_referenced_models: boolean
  billing_mode: string
  input_price: string
  output_price: string
  cached_input_price: string
  enabled: boolean
}

interface OAuthProviderConfig {
  key: string
  name: string
  enabled: boolean
  issuer: string
  client_id: string
  client_secret: string
  auth_url: string
  token_url: string
  userinfo_url: string
  scope: string
  redirect_url: string
  subject_key: string
  email_key: string
  name_key: string
  avatar_key: string
}

interface RedeemCodeDraft {
  code: string
  amount: string
  group_id: string
  group_duration_days: string
  subscription_plan_id: string
  subscription_duration_days: string
  allow_stacking: boolean
  max_uses: string
  enabled: boolean
  expires_at: string
}

interface ReferralCommissionLog {
  id: number
  amount: string | number
  base_cost: string | number
  rate: string | number
  referred_user?: { username?: string; email?: string }
  created_at: string
}

interface StatusCheck {
  id?: number
  status: string
  latency_ms: number
  status_code?: number
  message?: string
  checked_at: string
}

interface StatusMonitor {
  id: number
  name: string
  target_url: string
  check_type: string
  method: string
  interval_seconds: number
  retention_hours: number
  enabled: boolean
  last_status: string
  last_latency_ms: number
  last_status_code: number
  last_message: string
  last_checked_at?: string | null
  recent_checks: StatusCheck[]
}

interface StatusMonitorDraft {
  id?: number
  name: string
  target_url: string
  check_type: string
  method: string
  interval_seconds: string
  retention_hours: string
  enabled: boolean
}

interface Announcement {
  id: number
  title: string
  content: string
  enabled: boolean
  sort_order: number
  created_at: string
}

interface AnnouncementDraft {
  id?: number
  title: string
  content: string
  enabled: boolean
  sort_order: string
}

interface AutoUpdateStatus {
  enabled: boolean
  interval_hours: string
  current_version: string
  latest_version: string
  update_available: boolean
  platform: string
  supported: boolean
  last_checked_at: string
  last_error: string
  in_progress: boolean
  phase: string
  progress: number
  downloaded_bytes: number
  total_bytes: number
  message: string
}

type ConfigurationSection = "system_settings" | "channels" | "model_data" | "model_prices"

const configurationSections: Array<{ id: ConfigurationSection; label: "configurationSystemSettings" | "configurationChannels" | "configurationModels" | "configurationPrices" }> = [
  { id: "system_settings", label: "configurationSystemSettings" },
  { id: "channels", label: "configurationChannels" },
  { id: "model_data", label: "configurationModels" },
  { id: "model_prices", label: "configurationPrices" },
]

interface SystemSettings extends PublicSettings {

  token_api_enabled: boolean

  registration_email_suffixes: string
  registration_email_routing: string
  hcaptcha_secret: string
  smtp_host: string
  smtp_port: string
  smtp_username: string
  smtp_password: string
  smtp_from: string
  sms_provider: string
  sms_aliyun_access_key_id: string
  sms_aliyun_access_key_secret: string
  sms_aliyun_sign_name: string
  sms_aliyun_template_code: string
  sms_tencent_secret_id: string
  sms_tencent_secret_key: string
  sms_tencent_sdk_app_id: string
  sms_tencent_sign_name: string
  sms_tencent_template_id: string
  sms_tencent_region: string
  oidc_issuer: string
  oidc_client_id: string
  oidc_client_secret: string
  oidc_redirect_url: string
  oauth_providers: string
  rate_limit_enabled: boolean
  rate_limit_requests_per_minute: string
  rate_limit_burst: string
  sensitive_filter_enabled: boolean
  sensitive_words: string
  sensitive_filter_scope: string
  ssrf_protection_enabled: boolean
  ssrf_allow_private_networks: boolean
  ssrf_allowed_hosts: string
  checkin_timezone: string
  checkin_streak_enabled: boolean
  checkin_streak_cycle_days: string
  checkin_streak_rewards: string
  payment_gateway_provider: string
  payment_channels: string
  payment_yipay_gateway_url: string
  payment_yipay_pid: string
  payment_yipay_key: string
  payment_yipay_notify_url: string
  payment_yipay_return_url: string
  payment_openpayment_base_url: string
  payment_openpayment_config_url: string
  payment_openpayment_merchant_id: string
  payment_openpayment_key: string
  payment_openpayment_notify_url: string
  payment_openpayment_return_url: string
  payment_official_currency: string
  payment_wechat_mch_id: string
  payment_wechat_app_id: string
  payment_wechat_serial_no: string
  payment_wechat_private_key: string
  payment_wechat_platform_certificate: string
  payment_wechat_api_v3_key: string
  payment_alipay_app_id: string
  payment_alipay_private_key: string
  payment_alipay_public_key: string
  payment_alipay_gateway_url: string
  payment_paypal_client_id: string
  payment_paypal_client_secret: string
  payment_paypal_base_url: string
  payment_paypal_webhook_id: string
  payment_stripe_secret_key: string
  payment_stripe_webhook_secret: string
  auto_update_enabled: boolean
  auto_update_interval_hours: string
  log_storage_mode: string
  log_retention_days: string
  redis_enabled: boolean
  redis_address: string
  redis_username: string
  redis_password: string
  redis_password_set: boolean
  redis_password_clear: boolean
  redis_database: string
  redis_tls_enabled: boolean
  multi_node_enabled: boolean
  node_address_mode: string
  node_addresses: string
  current_node_name: string
}

type SystemTab =
  | "basic"
  | "theme"
  | "themeSettings"
  | "billing"
  | "payment"
  | "checkIn"
  | "security"
  | "redis"
  | "auth"
  | "email"
  | "content"
  | "topNavigation"
  | "navigation"
  | "scheduledTasks"
  | "statusMonitor"
  | "reliability"
  | "logCleanup"
  | "nodes"
  | "configuration"
  | "updates"
  | "groups"
  | "metaModels"
  | "advancedChatAssistant"
  | "advancedChatAttachments"
  | "advancedChatMCP"
  | "subscriptionPlans"
  | "redeemCodes"

type SystemSection = "general" | "theme" | "auth" | "content" | "operations" | "sysops" | "advancedChat" | "subscriptions" | "redeemCodes"

const systemSectionTabs: Record<SystemSection, SystemTab[]> = {
  general: ["basic", "billing", "checkIn", "security", "redis"],
  theme: ["theme", "themeSettings"],
  auth: ["auth", "email"],
  content: ["content", "topNavigation", "navigation"],
  operations: ["payment", "groups", "metaModels", "subscriptionPlans", "redeemCodes"],
  sysops: ["scheduledTasks", "nodes", "statusMonitor", "reliability", "logCleanup", "configuration", "updates"],
  advancedChat: ["advancedChatAssistant", "advancedChatAttachments", "advancedChatMCP"],
  subscriptions: ["subscriptionPlans"],
  redeemCodes: ["redeemCodes"],
}

interface NavRow {
  id: string
  label: string
  href: string
}

type ThemeColorFieldKey = Extract<keyof SystemSettings, `theme_light_${string}` | `theme_dark_${string}`>

interface ThemeColorField {
  key: ThemeColorFieldKey
  label: string
}

const defaultSystemSettings: SystemSettings = {
  ...defaultPublicSettings,
  token_api_enabled: true,
  registration_email_suffixes: "",
  registration_email_routing: "[]",
  hcaptcha_secret: "",
  smtp_host: "",
  smtp_port: "587",
  smtp_username: "",
  smtp_password: "",
  smtp_from: "",
  sms_provider: "aliyun",
  sms_aliyun_access_key_id: "",
  sms_aliyun_access_key_secret: "",
  sms_aliyun_sign_name: "",
  sms_aliyun_template_code: "",
  sms_tencent_secret_id: "",
  sms_tencent_secret_key: "",
  sms_tencent_sdk_app_id: "",
  sms_tencent_sign_name: "",
  sms_tencent_template_id: "",
  sms_tencent_region: "ap-guangzhou",
  oidc_issuer: "",
  oidc_client_id: "",
  oidc_client_secret: "",
  oidc_redirect_url: "",
  oauth_providers: "[]",
  rate_limit_enabled: true,
  rate_limit_requests_per_minute: "60",
  rate_limit_burst: "10",
  sensitive_filter_enabled: false,
  sensitive_words: "",
  sensitive_filter_scope: "request",
  ssrf_protection_enabled: true,
  ssrf_allow_private_networks: false,
  ssrf_allowed_hosts: "",
  checkin_timezone: "Asia/Shanghai",
  checkin_streak_enabled: false,
  checkin_streak_cycle_days: "7",
  checkin_streak_rewards: "{}",
  payment_gateway_provider: "yipay",
  payment_channels: "[]",
  payment_yipay_gateway_url: "",
  payment_yipay_pid: "",
  payment_yipay_key: "",
  payment_yipay_notify_url: "",
  payment_yipay_return_url: "",
  payment_openpayment_base_url: "",
  payment_openpayment_config_url: "",
  payment_openpayment_merchant_id: "",
  payment_openpayment_key: "",
  payment_openpayment_notify_url: "",
  payment_openpayment_return_url: "",
  payment_official_currency: "CNY",
  payment_wechat_mch_id: "",
  payment_wechat_app_id: "",
  payment_wechat_serial_no: "",
  payment_wechat_private_key: "",
  payment_wechat_platform_certificate: "",
  payment_wechat_api_v3_key: "",
  payment_alipay_app_id: "",
  payment_alipay_private_key: "",
  payment_alipay_public_key: "",
  payment_alipay_gateway_url: "https://openapi.alipay.com/gateway.do",
  payment_paypal_client_id: "",
  payment_paypal_client_secret: "",
  payment_paypal_base_url: "https://api-m.sandbox.paypal.com",
  payment_paypal_webhook_id: "",
  payment_stripe_secret_key: "",
  payment_stripe_webhook_secret: "",
  auto_update_enabled: false,
  auto_update_interval_hours: "24",
  log_storage_mode: "single",
  log_retention_days: "30",
  redis_enabled: false,
  redis_address: "127.0.0.1:6379",
  redis_username: "",
  redis_password: "",
  redis_password_set: false,
  redis_password_clear: false,
  redis_database: "0",
  redis_tls_enabled: false,
  multi_node_enabled: false,
  node_address_mode: "single",
  node_addresses: "",
  current_node_name: "",
}

const sensitiveSystemSettingsFields = [
  "hcaptcha_secret",
  "smtp_password",
  "sms_aliyun_access_key_secret",
  "sms_tencent_secret_key",
  "oidc_client_secret",
  "payment_yipay_key",
  "payment_openpayment_key",
  "payment_wechat_private_key",
  "payment_wechat_platform_certificate",
  "payment_wechat_api_v3_key",
  "payment_alipay_private_key",
  "payment_alipay_public_key",
  "payment_paypal_client_secret",
  "payment_stripe_secret_key",
  "payment_stripe_webhook_secret",
] as const satisfies readonly (keyof SystemSettings)[]

const defaultThemeColorValues = Object.fromEntries(
  Object.entries(defaultPublicSettings).filter(([key]) => /^theme_(light|dark)_/.test(key)),
) as Pick<SystemSettings, ThemeColorFieldKey>

const systemSettingsFieldsByTab: Partial<Record<SystemTab, readonly (keyof SystemSettings)[]>> = {
  basic: ["system_mode", "site_name", "base_url", "icon_url", "home_iframe_url", "footer_text", "community_enabled"],
  theme: Object.keys(defaultThemeColorValues) as ThemeColorFieldKey[],
  themeSettings: ["theme_background_image", "theme_custom_css"],
  billing: ["pricing_endpoint_enabled", "referral_enabled", "referral_commission_rate", "group_multiplier_mode"],
  payment: ["payment_channels", "payment_enabled", "payment_currency_display_name", "payment_usd_to_rmb_rate", "payment_min_recharge_amount", "payment_recharge_presets"],
  checkIn: ["checkin_enabled", "checkin_daily_reward", "checkin_timezone", "checkin_streak_enabled", "checkin_streak_cycle_days", "checkin_streak_rewards", "checkin_random_enabled", "checkin_random_min", "checkin_random_max"],
  security: ["rate_limit_enabled", "rate_limit_requests_per_minute", "rate_limit_burst", "sensitive_filter_enabled", "sensitive_filter_scope", "ssrf_protection_enabled", "ssrf_allow_private_networks", "sensitive_words", "ssrf_allowed_hosts"],
  redis: ["redis_enabled", "redis_tls_enabled", "redis_address", "redis_database", "redis_username", "redis_password", "redis_password_clear"],
  auth: ["oidc_enabled", "passkey_enabled", "password_login_enabled", "password_registration_enabled", "token_api_enabled", "email_verification_required", "password_hcaptcha_enabled", "registration_email_suffixes", "registration_email_routing", "auth_agreement_mode", "hcaptcha_site_key", "hcaptcha_secret", "oidc_issuer", "oidc_client_id", "oidc_client_secret", "oidc_redirect_url", "oauth_providers"],
  email: ["smtp_host", "smtp_port", "smtp_username", "smtp_password", "smtp_from", "sms_enabled", "sms_login_enabled", "sms_binding_required", "sms_provider", "sms_aliyun_access_key_id", "sms_aliyun_access_key_secret", "sms_aliyun_sign_name", "sms_aliyun_template_code", "sms_tencent_secret_id", "sms_tencent_secret_key", "sms_tencent_sdk_app_id", "sms_tencent_sign_name", "sms_tencent_template_id", "sms_tencent_region"],
  content: ["announcement", "about_html", "privacy_policy_url", "terms_url", "privacy_policy", "terms"],
  topNavigation: ["top_nav_enabled", "top_nav_items"],
  navigation: ["sidebar_dashboard_enabled", "sidebar_usage_enabled", "sidebar_data_board_enabled", "sidebar_api_keys_enabled", "sidebar_chat_enabled", "sidebar_system_enabled", "sidebar_admin_overview_enabled", "sidebar_channels_enabled", "sidebar_models_enabled", "sidebar_users_enabled"],
  statusMonitor: ["status_monitor_enabled"],
  reliability: ["reliability_auto_disable_enabled", "reliability_disable_after_failures", "reliability_auto_detect_upstream_enabled", "reliability_auto_detect_interval_seconds", "reliability_auto_detect_timeout_seconds", "reliability_auto_recover_enabled", "reliability_recovery_after_seconds"],
  logCleanup: ["log_storage_mode", "log_retention_days"],
  nodes: ["multi_node_enabled", "node_address_mode", "node_addresses"],
  updates: ["auto_update_enabled", "auto_update_interval_hours"],
}

function systemSettingsUpdatePayload(form: SystemSettings, activeTab: SystemTab, checkInStreakRewards: string, topNavItems: string) {
  const fields = systemSettingsFieldsByTab[activeTab] || []
  const payload: Record<string, unknown> = Object.fromEntries(fields.map((key) => [key, form[key]]))
  if (activeTab === "checkIn") {
    payload.checkin_streak_rewards = checkInStreakRewards
  }
  if (activeTab === "topNavigation") {
    payload.top_nav_items = topNavItems
  }
  for (const key of sensitiveSystemSettingsFields) {
    if (typeof payload[key] === "string" && !payload[key].trim()) {
      delete payload[key]
    }
  }
  if (activeTab === "redis" && !form.redis_password.trim() && !form.redis_password_clear) {
    delete payload.redis_password
  }
  return payload
}

const defaultRedeemDraft: RedeemCodeDraft = {
  code: "",
  amount: "",
  group_id: "",
  group_duration_days: "",
  subscription_plan_id: "",
  subscription_duration_days: "",
  allow_stacking: false,
  max_uses: "1",
  enabled: true,
  expires_at: "",
}

const defaultGroupDraft: GroupDraft = {
  name: "",
  multiplier: "1",
}

const defaultSubscriptionPlanDraft: SubscriptionPlanDraft = {
  name: "",
  reset_amount: "",
  reset_interval_days: "30",
  price: "",
  duration_days: "30",
  purchasable: false,
  enabled: true,
}

const defaultMetaModelDraft: MetaModelDraft = {
  name: "",
  description: "",
  dsl: "",
  provider: "meta",
  provider_name: "Meta Module",
  provider_icon_url: "",
  expose_referenced_models: true,
  billing_mode: "actual",
  input_price: "0",
  output_price: "0",
  cached_input_price: "0",
  enabled: true,
}

const defaultStatusMonitorDraft: StatusMonitorDraft = {
  name: "",
  target_url: "",
  check_type: "http",
  method: "GET",
  interval_seconds: "60",
  retention_hours: "168",
  enabled: true,
}

const defaultAnnouncementDraft: AnnouncementDraft = {
  title: "",
  content: "",
  enabled: true,
  sort_order: "0",
}

export default function SystemManagement({ section = "general", initialTab }: { section?: SystemSection; initialTab?: SystemTab }) {
  const { language, t } = useI18n()
  const copy = language === "zh" ? zhCopy : enCopy
  const queryClient = useQueryClient()
  const allowedTabs = systemSectionTabs[section] || systemSectionTabs.general
  const defaultTab = initialTab && allowedTabs.includes(initialTab) ? initialTab : allowedTabs[0]
  const [activeTab, setActiveTab] = useState<SystemTab>(defaultTab)
  const [form, setForm] = useState<SystemSettings>(defaultSystemSettings)
  const [navRows, setNavRows] = useState<NavRow[]>([])
  const [redeemDraft, setRedeemDraft] = useState<RedeemCodeDraft>(defaultRedeemDraft)
  const [isRedeemDialogOpen, setIsRedeemDialogOpen] = useState(false)
  const [redeemSearch, setRedeemSearch] = useState("")
  const [redeemStatusFilter, setRedeemStatusFilter] = useState("all")
  const [redeemGroupFilter, setRedeemGroupFilter] = useState("all")
  const [redeemSort, setRedeemSort] = useState("created_desc")
  const [selectedRedeemCodeIDs, setSelectedRedeemCodeIDs] = useState<number[]>([])
  const [subscriptionPlanDraft, setSubscriptionPlanDraft] = useState<SubscriptionPlanDraft>(defaultSubscriptionPlanDraft)
  const [isSubscriptionPlanDialogOpen, setIsSubscriptionPlanDialogOpen] = useState(false)
  const [metaModelDraft, setMetaModelDraft] = useState<MetaModelDraft>(defaultMetaModelDraft)
  const [isMetaModelDialogOpen, setIsMetaModelDialogOpen] = useState(false)
  const [groupDraft, setGroupDraft] = useState<GroupDraft>(defaultGroupDraft)
  const [isGroupDialogOpen, setIsGroupDialogOpen] = useState(false)
  const [statusMonitorDraft, setStatusMonitorDraft] = useState<StatusMonitorDraft>(defaultStatusMonitorDraft)
  const [isStatusMonitorDialogOpen, setIsStatusMonitorDialogOpen] = useState(false)
  const [announcementDraft, setAnnouncementDraft] = useState<AnnouncementDraft>(defaultAnnouncementDraft)
  const [isAnnouncementDialogOpen, setIsAnnouncementDialogOpen] = useState(false)
  const [selectedConfigurationSections, setSelectedConfigurationSections] = useState<ConfigurationSection[]>(configurationSections.map((section) => section.id))
  const [configurationImportFile, setConfigurationImportFile] = useState<File | null>(null)
  const [taskRunFilter, setTaskRunFilter] = useState("")
  const [taskRunPage, setTaskRunPage] = useState(1)
  const { success, error } = useToast()

  const { data: settings, isSuccess: hasLoadedSettings } = useQuery<SystemSettings>({
    queryKey: ["system-settings"],
    queryFn: async () => {
      const res = await api.get("/settings")
      return res.data
    },
  })
  const { data: groups = [] } = useQuery<Group[]>({
    queryKey: ["groups"],
    queryFn: async () => {
      const res = await api.get("/groups")
      return Array.isArray(res.data) ? res.data : []
    },
  })
  const { data: redeemCodes = [] } = useQuery<RedeemCode[]>({
    queryKey: ["redeem-codes"],
    queryFn: async () => {
      const res = await api.get("/redeem-codes")
      return Array.isArray(res.data) ? res.data : []
    },
  })
  const { data: subscriptionPlans = [] } = useQuery<SubscriptionPlan[]>({
    queryKey: ["subscription-plans"],
    queryFn: async () => {
      const res = await api.get("/subscription-plans")
      return Array.isArray(res.data) ? res.data : []
    },
  })
  const { data: metaModels = [] } = useQuery<MetaModel[]>({
    queryKey: ["meta-models"],
    queryFn: async () => {
      const res = await api.get("/meta-models")
      return Array.isArray(res.data) ? res.data : []
    },
  })
  const { data: referralLogs = [] } = useQuery<ReferralCommissionLog[]>({
    queryKey: ["referral-commissions"],
    queryFn: async () => {
      const res = await api.get("/referral-commissions")
      return Array.isArray(res.data) ? res.data : []
    },
  })
  const { data: statusMonitors = [] } = useQuery<StatusMonitor[]>({
    queryKey: ["status-monitors"],
    queryFn: async () => {
      const res = await api.get("/status-monitors")
      return Array.isArray(res.data) ? res.data : []
    },
  })
  const { data: announcements = [] } = useQuery<Announcement[]>({
    queryKey: ["announcements"],
    queryFn: async () => {
      const res = await api.get("/announcements")
      return Array.isArray(res.data) ? res.data : []
    },
  })
  const { data: autoUpdateStatus } = useQuery<AutoUpdateStatus>({
    queryKey: ["auto-update-status"],
    queryFn: async () => (await api.get("/updates")).data,
    refetchInterval: 1000,
  })
  const { data: clusterStatus } = useQuery<ClusterStatus>({
    queryKey: ["cluster-nodes"],
    queryFn: async () => (await api.get("/nodes")).data,
    refetchInterval: 15000,
  })
  const { data: scheduledJobs } = useQuery<ScheduledJobsResponse>({
    queryKey: ["scheduled-jobs"],
    queryFn: async () => (await api.get("/scheduled-jobs")).data,
    enabled: activeTab === "scheduledTasks",
    refetchInterval: activeTab === "scheduledTasks" ? 10000 : false,
  })
  const { data: scheduledTaskRuns } = useQuery<ScheduledTaskRunPage>({
    queryKey: ["scheduled-task-runs", taskRunFilter, taskRunPage],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(taskRunPage), page_size: "20" })
      if (taskRunFilter) {
        params.set("task", taskRunFilter)
      }
      return (await api.get(`/scheduled-jobs/runs?${params.toString()}`)).data
    },
    enabled: activeTab === "scheduledTasks",
    refetchInterval: activeTab === "scheduledTasks" ? 15000 : false,
  })

  const runScheduledJob = useMutation({
    mutationFn: async (name: string) => api.post(`/scheduled-jobs/${encodeURIComponent(name)}/run`, {}),
    onSuccess: () => {
      success(copy.taskRunQueued)
      queryClient.invalidateQueries({ queryKey: ["scheduled-jobs"] })
      queryClient.invalidateQueries({ queryKey: ["scheduled-task-runs"] })
    },
    onError: (err) => error(apiErrorMessage(err, copy.taskRunFailed)),
  })

  const promoteNode = useMutation({
    mutationFn: async (id: number) => api.post(`/nodes/${id}/promote`, {}),
    onSuccess: () => {
      success(t("admin.saved"))
      queryClient.invalidateQueries({ queryKey: ["cluster-nodes"] })
    },
    onError: (err) => error(apiErrorMessage(err, t("admin.saveFailed"))),
  })

  const removeNode = useMutation({
    mutationFn: async (id: number) => api.delete(`/nodes/${id}`),
    onSuccess: () => {
      success(t("admin.deleted"))
      queryClient.invalidateQueries({ queryKey: ["cluster-nodes"] })
    },
    onError: (err) => error(apiErrorMessage(err, t("admin.deleteFailed"))),
  })

  useEffect(() => {
    if (settings) {
      setForm({ ...defaultSystemSettings, ...settings })
      setNavRows(parseTopNavRows(settings.top_nav_items || ""))
    }
  }, [settings])

  useEffect(() => {
    if (!allowedTabs.includes(activeTab)) {
      setActiveTab(defaultTab)
    }
  }, [activeTab, allowedTabs, defaultTab])

  const saveSettings = useMutation({
    mutationFn: async ({ activeTab, checkInStreakRewards }: { activeTab: SystemTab; checkInStreakRewards: string }) => {
      const res = await api.put("/settings", systemSettingsUpdatePayload(form, activeTab, checkInStreakRewards, serializeTopNavRows(navRows)))
      return res.data
    },
    onSuccess: (savedSettings: SystemSettings) => {
      setForm({ ...defaultSystemSettings, ...savedSettings })
      setNavRows(parseTopNavRows(savedSettings.top_nav_items || ""))
      success(t("system.settingsSaved"))
      queryClient.invalidateQueries({ queryKey: ["system-settings"] })
      queryClient.invalidateQueries({ queryKey: ["public-settings"] })
    },
    onError: () => error(t("system.settingsSaveFailed")),
  })

  const checkForUpdate = useMutation({
    mutationFn: async () => (await api.post("/updates/check")).data as AutoUpdateStatus,
    onSuccess: (status) => {
      queryClient.setQueryData(["auto-update-status"], status)
      success(status.update_available ? copy.autoUpdateAvailable : copy.autoUpdateUpToDate)
    },
    onError: (err) => error(apiErrorMessage(err, copy.autoUpdateCheckFailed)),
  })

  const startAutoUpdate = useMutation({
    mutationFn: async () => (await api.post("/updates/apply")).data as AutoUpdateStatus,
    onSuccess: (status) => {
      queryClient.setQueryData(["auto-update-status"], status)
      success(copy.autoUpdateStarted)
    },
    onError: (err) => error(apiErrorMessage(err, copy.autoUpdateStartFailed)),
  })

  const deleteLogs = useMutation({
    mutationFn: async () => (await api.delete("/logs")).data as { deleted: number },
    onSuccess: (result) => success(copy.logsDeleted.replace("{count}", String(result.deleted))),
    onError: () => error(copy.logsDeleteFailed),
  })

  const exportConfiguration = useMutation({
    mutationFn: async (sections: ConfigurationSection[]) => {
      const response = await api.post("/settings/export", { sections }, { responseType: "blob" })
      const filename = exportFilename(response.headers["content-disposition"]) || `flai-configuration-${new Date().toISOString().slice(0, 10)}.json`
      downloadBlob(response.data as Blob, filename)
    },
    onSuccess: () => success(copy.configurationExported),
    onError: (err) => error(apiErrorMessage(err, copy.configurationExportFailed)),
  })

  const importConfiguration = useMutation({
    mutationFn: async (file: File) => {
      let payload: unknown
      try {
        payload = JSON.parse(await file.text())
      } catch {
        throw new Error(copy.configurationInvalidFile)
      }
      return (await api.post("/settings/import", payload)).data as { imported_sections: string[] }
    },
    onSuccess: () => {
      setConfigurationImportFile(null)
      success(copy.configurationImported)
      for (const key of ["system-settings", "public-settings", "channels", "models", "user-channels", "meta-models"]) {
        queryClient.invalidateQueries({ queryKey: [key] })
      }
    },
    onError: (err) => error(apiErrorMessage(err, copy.configurationImportFailed)),
  })

  const saveGroup = useMutation({
    mutationFn: async () => {
      const payload = groupPayload(groupDraft)
      if (groupDraft.id) {
        const res = await api.put(`/groups/${groupDraft.id}`, payload)
        return res.data
      }
      const res = await api.post("/groups", payload)
      return res.data
    },
    onSuccess: () => {
      setGroupDraft(defaultGroupDraft)
      setIsGroupDialogOpen(false)
      success(copy.groupSaved)
      queryClient.invalidateQueries({ queryKey: ["groups"] })
    },
    onError: () => error(copy.groupSaveFailed),
  })

  const deleteGroup = useMutation({
    mutationFn: async (id: number) => api.delete(`/groups/${id}`),
    onSuccess: () => {
      success(copy.groupDeleted)
      queryClient.invalidateQueries({ queryKey: ["groups"] })
    },
    onError: () => error(copy.groupDeleteFailed),
  })

  const saveStatusMonitor = useMutation({
    mutationFn: async () => {
      const payload = statusMonitorPayload(statusMonitorDraft)
      if (statusMonitorDraft.id) {
        const res = await api.put(`/status-monitors/${statusMonitorDraft.id}`, payload)
        return res.data
      }
      const res = await api.post("/status-monitors", payload)
      return res.data
    },
    onSuccess: () => {
      setStatusMonitorDraft(defaultStatusMonitorDraft)
      setIsStatusMonitorDialogOpen(false)
      success(copy.statusMonitorSaved)
      queryClient.invalidateQueries({ queryKey: ["status-monitors"] })
    },
    onError: () => error(copy.statusMonitorSaveFailed),
  })

  const deleteStatusMonitor = useMutation({
    mutationFn: async (id: number) => api.delete(`/status-monitors/${id}`),
    onSuccess: () => {
      success(copy.statusMonitorDeleted)
      queryClient.invalidateQueries({ queryKey: ["status-monitors"] })
    },
    onError: () => error(copy.statusMonitorDeleteFailed),
  })

  const checkStatusMonitor = useMutation({
    mutationFn: async (id: number) => api.post(`/status-monitors/${id}/check`),
    onSuccess: () => {
      success(copy.statusMonitorChecked)
      queryClient.invalidateQueries({ queryKey: ["status-monitors"] })
    },
    onError: () => error(copy.statusMonitorCheckFailed),
  })

  const saveAnnouncement = useMutation({
    mutationFn: async (draft?: AnnouncementDraft) => {
      const nextDraft = draft || announcementDraft
      const payload = announcementPayload(nextDraft)
      if (nextDraft.id) {
        const res = await api.put(`/announcements/${nextDraft.id}`, payload)
        return res.data
      }
      const res = await api.post("/announcements", payload)
      return res.data
    },
    onSuccess: () => {
      setAnnouncementDraft(defaultAnnouncementDraft)
      setIsAnnouncementDialogOpen(false)
      success(copy.announcementSaved)
      queryClient.invalidateQueries({ queryKey: ["announcements"] })
      queryClient.invalidateQueries({ queryKey: ["public-announcements"] })
    },
    onError: () => error(copy.announcementSaveFailed),
  })

  const deleteAnnouncement = useMutation({
    mutationFn: async (id: number) => api.delete(`/announcements/${id}`),
    onSuccess: () => {
      success(copy.announcementDeleted)
      queryClient.invalidateQueries({ queryKey: ["announcements"] })
      queryClient.invalidateQueries({ queryKey: ["public-announcements"] })
    },
    onError: () => error(copy.announcementDeleteFailed),
  })

  const saveSubscriptionPlan = useMutation({
    mutationFn: async () => {
      const payload = subscriptionPlanPayload(subscriptionPlanDraft)
      if (subscriptionPlanDraft.id) {
        const res = await api.put(`/subscription-plans/${subscriptionPlanDraft.id}`, payload)
        return res.data
      }
      const res = await api.post("/subscription-plans", payload)
      return res.data
    },
    onSuccess: () => {
      setSubscriptionPlanDraft(defaultSubscriptionPlanDraft)
      setIsSubscriptionPlanDialogOpen(false)
      success(copy.subscriptionPlanSaved)
      queryClient.invalidateQueries({ queryKey: ["subscription-plans"] })
    },
    onError: () => error(copy.subscriptionPlanSaveFailed),
  })

  const deleteSubscriptionPlan = useMutation({
    mutationFn: async (id: number) => api.delete(`/subscription-plans/${id}`),
    onSuccess: () => {
      success(copy.subscriptionPlanDeleted)
      queryClient.invalidateQueries({ queryKey: ["subscription-plans"] })
    },
    onError: () => error(copy.subscriptionPlanDeleteFailed),
  })

  const saveMetaModel = useMutation({
    mutationFn: async () => {
      const payload = metaModelPayload(metaModelDraft)
      if (metaModelDraft.id) {
        const res = await api.put(`/meta-models/${metaModelDraft.id}`, payload)
        return res.data
      }
      const res = await api.post("/meta-models", payload)
      return res.data
    },
    onSuccess: () => {
      setMetaModelDraft(defaultMetaModelDraft)
      setIsMetaModelDialogOpen(false)
      success(copy.metaModelSaved)
      queryClient.invalidateQueries({ queryKey: ["meta-models"] })
      queryClient.invalidateQueries({ queryKey: ["public-models"] })
    },
    onError: (err) => error(apiErrorMessage(err, copy.metaModelSaveFailed)),
  })

  const validateMetaModel = useMutation({
    mutationFn: async () => {
      const res = await api.post("/meta-models/validate", metaModelPayload(metaModelDraft))
      return res.data
    },
    onSuccess: () => success(copy.metaModelValid),
    onError: (err) => error(apiErrorMessage(err, copy.metaModelInvalid)),
  })

  const deleteMetaModel = useMutation({
    mutationFn: async (id: number) => api.delete(`/meta-models/${id}`),
    onSuccess: () => {
      success(copy.metaModelDeleted)
      queryClient.invalidateQueries({ queryKey: ["meta-models"] })
      queryClient.invalidateQueries({ queryKey: ["public-models"] })
    },
    onError: () => error(copy.metaModelDeleteFailed),
  })

  const createRedeemCode = useMutation({
    mutationFn: async () => {
      const res = await api.post("/redeem-codes", redeemCodePayload(redeemDraft))
      return res.data
    },
    onSuccess: (createdCode: RedeemCode) => {
      setRedeemDraft(defaultRedeemDraft)
      setIsRedeemDialogOpen(false)
      downloadRedeemCodesTxt([createdCode], copy, `redeem-code-${createdCode.code}.txt`)
      success(copy.redeemCodeCreated)
      queryClient.invalidateQueries({ queryKey: ["redeem-codes"] })
    },
    onError: () => error(copy.redeemCodeCreateFailed),
  })

  const updateRedeemCode = useMutation({
    mutationFn: async ({ code, enabled }: { code: RedeemCode; enabled: boolean }) => {
      const res = await api.put(`/redeem-codes/${code.id}`, {
        code: code.code,
        amount: code.amount,
        group_id: code.group_id || null,
        group_duration_days: code.group_duration_days || 0,
        subscription_plan_id: code.subscription_plan_id || null,
        subscription_duration_days: code.subscription_duration_days || 0,
        allow_stacking: Boolean(code.allow_stacking),
        max_uses: code.max_uses,
        enabled,
        expires_at: code.expires_at || "",
      })
      return res.data
    },
    onSuccess: () => {
      success(copy.redeemCodeUpdated)
      queryClient.invalidateQueries({ queryKey: ["redeem-codes"] })
    },
    onError: () => error(copy.redeemCodeUpdateFailed),
  })

  const deleteRedeemCode = useMutation({
    mutationFn: async (id: number) => api.delete(`/redeem-codes/${id}`),
    onSuccess: () => {
      success(copy.redeemCodeDeleted)
      queryClient.invalidateQueries({ queryKey: ["redeem-codes"] })
    },
    onError: () => error(copy.redeemCodeDeleteFailed),
  })

  const updateField = <K extends keyof SystemSettings>(key: K, value: SystemSettings[K]) => {
    setForm((current) => ({ ...current, [key]: value }))
  }

  const updateNavRow = (id: string, patch: Partial<NavRow>) => {
    setNavRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)))
  }

  const addNavRow = () => {
    setNavRows((current) => [...current, { id: navRowID(current.length), label: "", href: "" }])
  }

  const removeNavRow = (id: string) => {
    setNavRows((current) => current.filter((row) => row.id !== id))
  }

  const moveNavRow = (index: number, direction: -1 | 1) => {
    setNavRows((current) => {
      const nextIndex = index + direction
      if (nextIndex < 0 || nextIndex >= current.length) {
        return current
      }
      const next = [...current]
      const [row] = next.splice(index, 1)
      next.splice(nextIndex, 0, row)
      return next
    })
  }

  const shouldShowSave = Boolean(systemSettingsFieldsByTab[activeTab]?.length)
  const visibleTabs = systemTabs(copy).filter((tab) => allowedTabs.includes(tab.id))
  const canCreateRedeemCode = Number(redeemDraft.amount || 0) > 0 || Boolean(redeemDraft.group_id) || Boolean(redeemDraft.subscription_plan_id)
  const canSaveSubscriptionPlan = Boolean(subscriptionPlanDraft.name.trim()) && Number(subscriptionPlanDraft.reset_amount || 0) > 0 && Number(subscriptionPlanDraft.reset_interval_days || 0) > 0 && (!subscriptionPlanDraft.purchasable || Number(subscriptionPlanDraft.price || 0) > 0)
  const canSaveMetaModel = Boolean(metaModelDraft.name.trim() && metaModelDraft.dsl.trim())
  const canSaveStatusMonitor = Boolean(statusMonitorDraft.name.trim() && statusMonitorDraft.target_url.trim())
  const canSaveAnnouncement = Boolean(announcementDraft.title.trim() && announcementDraft.content.trim())
  const visibleRedeemCodes = filterAndSortRedeemCodes(redeemCodes, {
    search: redeemSearch,
    status: redeemStatusFilter,
    groupID: redeemGroupFilter,
    sort: redeemSort,
  })
  const selectedRedeemCodes = redeemCodes.filter((code) => selectedRedeemCodeIDs.includes(code.id))
  const allVisibleRedeemCodesSelected = visibleRedeemCodes.length > 0 && visibleRedeemCodes.every((code) => selectedRedeemCodeIDs.includes(code.id))

  const handleSaveSettings = () => {
    if (!hasLoadedSettings) {
      return
    }
    let checkInStreakRewards = form.checkin_streak_rewards
    if (activeTab === "checkIn") {
      const streakRewards = validateCheckInStreakRewards(form.checkin_streak_rewards, copy)
      if (!streakRewards.valid) {
        error(streakRewards.error)
        return
      }
      checkInStreakRewards = streakRewards.value
    }
    saveSettings.mutate({ activeTab, checkInStreakRewards })
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">{t("system.title")}</h1>
          <div className="mt-2 text-sm text-muted-foreground">{copy.systemSubtitle}</div>
        </div>
        {shouldShowSave && (
          <Button onClick={handleSaveSettings} disabled={!hasLoadedSettings || saveSettings.isPending}>
            {t("admin.save")}
          </Button>
        )}
      </div>

      <PageTitleSlot />
      <PageTabs aria-label={t("system.title")}>
        {visibleTabs.map((tab) => (
          <PageTab
            key={tab.id}
            active={activeTab === tab.id}
            className="inline-flex items-center gap-2"
            onClick={() => setActiveTab(tab.id)}
          >
            <tab.icon size={16} />
            {tab.label}
          </PageTab>
        ))}
      </PageTabs>

      <PageInlineSlot slotKey="primary" />
      <TabTransition activeKey={activeTab} order={visibleTabs.map((tab) => tab.id)}>
      {activeTab === "basic" && (
        <SettingsPanel title={copy.basic}>
          <div className="grid gap-4 lg:grid-cols-2">
            <label className="grid gap-2 text-sm lg:col-span-2">
              <span className="font-medium">{copy.systemMode}</span>
              <Select value={String((form.system_mode || "operation") || "__shadcn_empty__")} onValueChange={(value) => updateField("system_mode", (value === "__shadcn_empty__" ? "" : value))}><SelectTrigger className="h-10 rounded-2xl border border-border bg-background px-3 text-sm"><SelectValue /></SelectTrigger><SelectContent>
                <SelectItem value="operation">{copy.systemModeOperation}</SelectItem>
                <SelectItem value="personal">{copy.systemModePersonal}</SelectItem>
				<SelectItem value="enterprise">{copy.systemModeEnterprise}</SelectItem>
              </SelectContent></Select>
              <span className="text-xs text-muted-foreground">{copy.systemModeHint}</span>
            </label>
            <TextField label={copy.siteName} value={form.site_name} placeholder={copy.siteNamePlaceholder} onChange={(value) => updateField("site_name", value)} />
            <TextField label={copy.baseURL} value={form.base_url} placeholder={copy.baseURLPlaceholder} onChange={(value) => updateField("base_url", value)} />
            <TextField label={copy.iconURL} value={form.icon_url} placeholder={copy.iconURLPlaceholder} onChange={(value) => updateField("icon_url", value)} />
            <TextField label={copy.homeIframeURL} value={form.home_iframe_url} placeholder={copy.homeIframeURLPlaceholder} onChange={(value) => updateField("home_iframe_url", value)} />
            <TextField label={copy.footerText} value={form.footer_text} placeholder={copy.footerTextPlaceholder} onChange={(value) => updateField("footer_text", value)} />
            <div className="lg:col-span-2">
              <ToggleField label={copy.communityEnabled} checked={form.community_enabled} onChange={(checked) => updateField("community_enabled", checked)} />
              <p className="mt-1 text-xs text-muted-foreground">{copy.communityEnabledHint}</p>
            </div>
          </div>
        </SettingsPanel>
      )}

      {activeTab === "theme" && (
        <SettingsPanel title={copy.theme}>
          <div className="space-y-8">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <SectionTitle title={copy.theme} description={copy.themeSettingsDescription} />
              <Button type="button" variant="outline" onClick={() => setForm((current) => ({ ...current, ...defaultThemeColorValues }))}>
                {copy.restoreThemeDefaults}
              </Button>
            </div>
            <div className="grid gap-6 xl:grid-cols-2">
              <ThemeColorGroup
                title={copy.themeLightMode}
                fields={themeColorFields("light", copy)}
                form={form}
                onChange={(key, value) => updateField(key, value)}
              />
              <ThemeColorGroup
                title={copy.themeDarkMode}
                fields={themeColorFields("dark", copy)}
                form={form}
                onChange={(key, value) => updateField(key, value)}
              />
            </div>
            <ThemePreview form={form} copy={copy} />
          </div>
        </SettingsPanel>
      )}

      {activeTab === "themeSettings" && (
        <SettingsPanel title={copy.themeSettings}>
          <div className="space-y-8">
            <SectionTitle title={copy.themeSettings} description={copy.themeCustomizationDescription} />
            <div className="grid gap-6">
              <TextField
                label={copy.backgroundImage}
                value={form.theme_background_image}
                placeholder={copy.backgroundImagePlaceholder}
                onChange={(value) => updateField("theme_background_image", value)}
              />
              <TextareaField
                label={copy.customCSS}
                value={form.theme_custom_css}
                placeholder={copy.customCSSPlaceholder}
                help={copy.customCSSHint}
                onChange={(value) => updateField("theme_custom_css", value)}
              />
            </div>
          </div>
        </SettingsPanel>
      )}

      {activeTab === "billing" && (
        <SettingsPanel title={copy.billing}>
          <div className="space-y-8">
            <div className="space-y-4">
              <SectionTitle title={copy.pricingAndReferral} description={copy.pricingAndReferralDescription} />
              <div className="grid gap-4 lg:grid-cols-2">
                <ToggleField label={copy.pricingEndpointEnabled} checked={form.pricing_endpoint_enabled} onChange={(checked) => updateField("pricing_endpoint_enabled", checked)} />
                <ToggleField label={copy.referralEnabled} checked={form.referral_enabled} onChange={(checked) => updateField("referral_enabled", checked)} />
                <TextField
                  label={copy.referralRate}
                  value={form.referral_commission_rate}
                  placeholder={copy.referralRatePlaceholder}
                  onChange={(value) => updateField("referral_commission_rate", value)}
                />
                <label className="block space-y-2 text-sm">
                  <span className="font-medium">{copy.groupMultiplierMode}</span>
                  <Select value={String((form.group_multiplier_mode || "min") || "__shadcn_empty__")} onValueChange={(value) => updateField("group_multiplier_mode", (value === "__shadcn_empty__" ? "" : value))}><SelectTrigger className="h-10 w-full rounded-2xl border border-border bg-background px-3 text-sm"><SelectValue /></SelectTrigger><SelectContent>
                    <SelectItem value="min">{copy.groupModeMin}</SelectItem>
                    <SelectItem value="max">{copy.groupModeMax}</SelectItem>
                  </SelectContent></Select>
                </label>
              </div>
              <div className="overflow-x-auto rounded-md border">
                <div className="min-w-[720px]">
                  <div className="grid grid-cols-[1fr_120px_120px_120px_180px] border-b bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground">
                    <div>{copy.referredUser}</div>
                    <div>{copy.baseCost}</div>
                    <div>{copy.referralRateShort}</div>
                    <div>{copy.commission}</div>
                    <div>{copy.createdAt}</div>
                  </div>
                  {referralLogs.length === 0 ? (
                    <div className="px-3 py-8 text-center text-sm text-muted-foreground">{copy.noReferralLogs}</div>
                  ) : (
                    referralLogs.slice(0, 20).map((log) => (
                      <div key={log.id} className="grid grid-cols-[1fr_120px_120px_120px_180px] items-center border-b px-3 py-3 text-sm last:border-b-0">
                        <div className="truncate">{log.referred_user?.username || log.referred_user?.email || "-"}</div>
                        <div>{form.payment_currency_display_name}{log.base_cost}</div>
                        <div>{formatRate(log.rate)}</div>
                        <div>{form.payment_currency_display_name}{log.amount}</div>
                        <div>{formatDateTime(log.created_at)}</div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </SettingsPanel>
      )}

      {activeTab === "payment" && (
        <SettingsPanel title={copy.paymentInterface}>
          <div className="space-y-4">
            <SectionTitle title={copy.paymentSettings} description={copy.paymentSettingsDescription} />
            <PaymentChannelsEditor value={form.payment_channels} legacyChannel={legacyPaymentChannel(form)} copy={copy} onChange={(value) => updateField("payment_channels", value)} />
            <div className="grid gap-4 lg:grid-cols-2">
              <ToggleField label={copy.paymentEnabled} checked={form.payment_enabled} onChange={(checked) => updateField("payment_enabled", checked)} />
              <TextField label={copy.currencyDisplayName} value={form.payment_currency_display_name} placeholder="$" onChange={(value) => updateField("payment_currency_display_name", value)} />
              <TextField label={copy.usdToRMBRate} value={form.payment_usd_to_rmb_rate} placeholder="7.20" type="number" onChange={(value) => updateField("payment_usd_to_rmb_rate", value)} />
              <TextField label={copy.minRechargeAmount} value={form.payment_min_recharge_amount} placeholder="1" type="number" onChange={(value) => updateField("payment_min_recharge_amount", value)} />
              <TextField label={copy.rechargePresets} value={jsonListToCSV(form.payment_recharge_presets)} placeholder="5,10,20,50,100" onChange={(value) => updateField("payment_recharge_presets", csvToJSONString(value))} />
            </div>
          </div>
        </SettingsPanel>
      )}

      {activeTab === "checkIn" && (
        <SettingsPanel title={copy.checkInSettings}>
          <div className="space-y-4">
            <SectionTitle title={copy.checkInSettings} description={copy.checkInSettingsDescription} />
            <div className="grid gap-4 lg:grid-cols-2">
              <ToggleField label={copy.checkInEnabled} checked={form.checkin_enabled} onChange={(checked) => updateField("checkin_enabled", checked)} />
              <TextField label={copy.checkInDailyReward} value={form.checkin_daily_reward} placeholder="1" type="number" onChange={(value) => updateField("checkin_daily_reward", value)} />
              <TextField label={copy.checkInTimezone} value={form.checkin_timezone} placeholder="Asia/Shanghai" onChange={(value) => updateField("checkin_timezone", value)} />
              <ToggleField label={copy.checkInStreakEnabled} checked={form.checkin_streak_enabled} onChange={(checked) => updateField("checkin_streak_enabled", checked)} />
              <TextField label={copy.checkInStreakCycleDays} value={form.checkin_streak_cycle_days} placeholder="7" type="number" onChange={(value) => updateField("checkin_streak_cycle_days", value)} />
              <ToggleField label={copy.checkInRandomEnabled} checked={form.checkin_random_enabled} onChange={(checked) => updateField("checkin_random_enabled", checked)} />
              <TextField label={copy.checkInRandomMin} value={form.checkin_random_min} placeholder="0" type="number" onChange={(value) => updateField("checkin_random_min", value)} />
              <TextField label={copy.checkInRandomMax} value={form.checkin_random_max} placeholder="1" type="number" onChange={(value) => updateField("checkin_random_max", value)} />
            </div>
            <TextareaField label={copy.checkInStreakRewards} value={form.checkin_streak_rewards} placeholder={copy.checkInStreakRewardsPlaceholder} help={copy.checkInStreakRewardsHelp} onChange={(value) => updateField("checkin_streak_rewards", value)} />
          </div>
        </SettingsPanel>
      )}

      {activeTab === "security" && (
        <SettingsPanel title={copy.security}>
          <div className="grid gap-5">
            <div className="grid gap-4 lg:grid-cols-2">
              <ToggleField label={copy.rateLimitEnabled} checked={form.rate_limit_enabled} onChange={(checked) => updateField("rate_limit_enabled", checked)} />
              <TextField label={copy.rateLimitRPM} value={form.rate_limit_requests_per_minute} placeholder="60" type="number" onChange={(value) => updateField("rate_limit_requests_per_minute", value)} />
              <TextField label={copy.rateLimitBurst} value={form.rate_limit_burst} placeholder="10" type="number" onChange={(value) => updateField("rate_limit_burst", value)} />
              <ToggleField label={copy.sensitiveFilterEnabled} checked={form.sensitive_filter_enabled} onChange={(checked) => updateField("sensitive_filter_enabled", checked)} />
              <label className="block space-y-2 text-sm">
                <span className="font-medium">{copy.sensitiveFilterScope}</span>
                <Select value={String((form.sensitive_filter_scope || "request") || "__shadcn_empty__")} onValueChange={(value) => updateField("sensitive_filter_scope", (value === "__shadcn_empty__" ? "" : value))}><SelectTrigger className="h-10 w-full rounded-2xl border border-border bg-background px-3 text-sm"><SelectValue /></SelectTrigger><SelectContent>
                  <SelectItem value="request">{copy.filterScopeRequest}</SelectItem>
                  <SelectItem value="request_response">{copy.filterScopeRequestResponse}</SelectItem>
                </SelectContent></Select>
              </label>
              <ToggleField label={copy.ssrfProtectionEnabled} checked={form.ssrf_protection_enabled} onChange={(checked) => updateField("ssrf_protection_enabled", checked)} />
              <ToggleField label={copy.ssrfAllowPrivateNetworks} checked={form.ssrf_allow_private_networks} onChange={(checked) => updateField("ssrf_allow_private_networks", checked)} />
            </div>
            <TextareaField label={copy.sensitiveWords} value={form.sensitive_words} placeholder={copy.sensitiveWordsPlaceholder} onChange={(value) => updateField("sensitive_words", value)} />
            <TextareaField label={copy.ssrfAllowedHosts} value={form.ssrf_allowed_hosts} placeholder={copy.ssrfAllowedHostsPlaceholder} onChange={(value) => updateField("ssrf_allowed_hosts", value)} />
          </div>
        </SettingsPanel>
      )}

      {activeTab === "redis" && (
        <SettingsPanel title={copy.redis}>
          <div className="space-y-5">
            <SectionTitle title={copy.redis} description={copy.redisDescription} />
            <div className="grid gap-4 lg:grid-cols-2">
              <ToggleField label={copy.redisEnabled} checked={form.redis_enabled} onChange={(checked) => updateField("redis_enabled", checked)} />
              <ToggleField label={copy.redisTLSEnabled} checked={form.redis_tls_enabled} onChange={(checked) => updateField("redis_tls_enabled", checked)} />
              <TextField label={copy.redisAddress} value={form.redis_address} placeholder="127.0.0.1:6379" onChange={(value) => updateField("redis_address", value)} />
              <TextField label={copy.redisDatabase} value={form.redis_database} placeholder="0" type="number" onChange={(value) => updateField("redis_database", value)} />
              <TextField label={copy.redisUsername} value={form.redis_username} placeholder={copy.redisUsernamePlaceholder} onChange={(value) => updateField("redis_username", value)} />
              <TextField
                label={copy.redisPassword}
                value={form.redis_password}
                placeholder={form.redis_password_set ? copy.redisPasswordReplacePlaceholder : copy.redisPasswordPlaceholder}
                type="password"
                onChange={(value) => {
                  updateField("redis_password", value)
                  if (value) updateField("redis_password_clear", false)
                }}
              />
              {form.redis_password_set && <ToggleField label={copy.redisPasswordClear} checked={form.redis_password_clear} onChange={(checked) => updateField("redis_password_clear", checked)} />}
            </div>
            <p className="text-xs leading-5 text-muted-foreground">{copy.redisHint}</p>
          </div>
        </SettingsPanel>
      )}

      {activeTab === "auth" && (
        <SettingsPanel title={copy.auth}>
          <div className="grid gap-4 lg:grid-cols-2">
            <ToggleField label={copy.oidcEnabled} checked={form.oidc_enabled} onChange={(checked) => updateField("oidc_enabled", checked)} />
            <ToggleField label={copy.passkeyEnabled} checked={form.passkey_enabled} onChange={(checked) => updateField("passkey_enabled", checked)} />
            <ToggleField label={copy.passwordLoginEnabled} checked={form.password_login_enabled} onChange={(checked) => updateField("password_login_enabled", checked)} />
            <ToggleField label={copy.passwordRegistrationEnabled} checked={form.password_registration_enabled} onChange={(checked) => updateField("password_registration_enabled", checked)} />
            <div className="space-y-1"><ToggleField label="启用令牌 API 调用" checked={form.token_api_enabled} onChange={(checked) => updateField("token_api_enabled", checked)} /><p className="text-xs text-muted-foreground">关闭后，所有 /v1 与兼容 AI 调用接口将拒绝请求；网页在线使用不受影响。</p></div>
            <ToggleField label={copy.emailVerificationRequired} checked={form.email_verification_required} onChange={(checked) => updateField("email_verification_required", checked)} />
            <ToggleField label={copy.passwordHCaptchaEnabled} checked={form.password_hcaptcha_enabled} onChange={(checked) => updateField("password_hcaptcha_enabled", checked)} />

            <TextareaField label="允许注册的邮箱后缀" value={form.registration_email_suffixes} placeholder="example.com, company.cn（留空表示不限制）" onChange={(value) => updateField("registration_email_suffixes", value)} />
            <EmailSuffixRoutingEditor value={form.registration_email_routing} groups={groups} onChange={(value) => updateField("registration_email_routing", value)} />
            <label className="block space-y-2 text-sm">
              <span className="font-medium">{copy.authAgreementMode}</span>
              <Select value={String((form.auth_agreement_mode || "notice") || "__shadcn_empty__")} onValueChange={(value) => updateField("auth_agreement_mode", (value === "__shadcn_empty__" ? "" : value))}><SelectTrigger className="h-10 w-full rounded-2xl border border-border bg-background px-3 text-sm"><SelectValue /></SelectTrigger><SelectContent>
                <SelectItem value="notice">{copy.authAgreementModeNotice}</SelectItem>
                <SelectItem value="checkbox">{copy.authAgreementModeCheckbox}</SelectItem>
              </SelectContent></Select>
            </label>
            <TextField label={copy.hcaptchaSiteKey} value={form.hcaptcha_site_key} placeholder={copy.hcaptchaSiteKeyPlaceholder} onChange={(value) => updateField("hcaptcha_site_key", value)} />
            <TextField label={copy.hcaptchaSecret} value={form.hcaptcha_secret} placeholder={copy.sensitiveValuePlaceholder} type="password" onChange={(value) => updateField("hcaptcha_secret", value)} />
            <TextField label={copy.oidcIssuer} value={form.oidc_issuer} placeholder={copy.oidcIssuerPlaceholder} onChange={(value) => updateField("oidc_issuer", value)} />
            <TextField label={copy.oidcClientID} value={form.oidc_client_id} placeholder={copy.oidcClientIDPlaceholder} onChange={(value) => updateField("oidc_client_id", value)} />
            <TextField label={copy.oidcClientSecret} value={form.oidc_client_secret} placeholder={copy.sensitiveValuePlaceholder} type="password" onChange={(value) => updateField("oidc_client_secret", value)} />
            <TextField label={copy.oidcRedirectURL} value={form.oidc_redirect_url} placeholder={copy.oidcRedirectURLPlaceholder} onChange={(value) => updateField("oidc_redirect_url", value)} />
          </div>
          <OAuthProvidersEditor
            value={form.oauth_providers}
            baseURL={form.base_url}
            onChange={(value) => updateField("oauth_providers", value)}
          />
        </SettingsPanel>
      )}

      {activeTab === "email" && (
        <SettingsPanel title={copy.email}>
          <div className="grid gap-4 lg:grid-cols-2">
            <TextField label={copy.smtpHost} value={form.smtp_host} placeholder={copy.smtpHostPlaceholder} onChange={(value) => updateField("smtp_host", value)} />
            <TextField label={copy.smtpPort} value={form.smtp_port} placeholder={copy.smtpPortPlaceholder} type="number" onChange={(value) => updateField("smtp_port", value)} />
            <TextField label={copy.smtpUsername} value={form.smtp_username} placeholder={copy.smtpUsernamePlaceholder} onChange={(value) => updateField("smtp_username", value)} />
            <TextField label={copy.smtpPassword} value={form.smtp_password} placeholder={copy.sensitiveValuePlaceholder} type="password" onChange={(value) => updateField("smtp_password", value)} />
            <TextField label={copy.smtpFrom} value={form.smtp_from} placeholder={copy.smtpFromPlaceholder} onChange={(value) => updateField("smtp_from", value)} />
          </div>
          <div className="space-y-3 border-t pt-4">
            <SectionTitle title={copy.smsSection} description={copy.smsSectionDescription} />
            <div className="grid gap-4 lg:grid-cols-2">
              <ToggleField label={copy.smsEnabled} checked={form.sms_enabled} onChange={(checked) => updateField("sms_enabled", checked)} />
              <ToggleField label={copy.smsLoginEnabled} checked={form.sms_login_enabled} onChange={(checked) => updateField("sms_login_enabled", checked)} />
              <ToggleField label={copy.smsBindingRequired} checked={form.sms_binding_required} onChange={(checked) => updateField("sms_binding_required", checked)} />
              <label className="block space-y-2 text-sm">
                <span className="font-medium">{copy.smsProvider}</span>
                <Select value={form.sms_provider || "aliyun"} onValueChange={(value) => updateField("sms_provider", value)}><SelectTrigger className="h-10 w-full rounded-2xl border border-border bg-background px-3 text-sm"><SelectValue /></SelectTrigger><SelectContent>
                  <SelectItem value="aliyun">{copy.smsProviderAliyun}</SelectItem>
                  <SelectItem value="tencent">{copy.smsProviderTencent}</SelectItem>
                </SelectContent></Select>
              </label>
              {form.sms_provider !== "tencent" && (
                <>
                  <TextField label={copy.smsAliyunAccessKeyID} value={form.sms_aliyun_access_key_id} placeholder="AccessKey ID" onChange={(value) => updateField("sms_aliyun_access_key_id", value)} />
                  <TextField label={copy.smsAliyunAccessKeySecret} value={form.sms_aliyun_access_key_secret} placeholder={copy.sensitiveValuePlaceholder} type="password" onChange={(value) => updateField("sms_aliyun_access_key_secret", value)} />
                  <TextField label={copy.smsSignName} value={form.sms_aliyun_sign_name} placeholder={copy.smsSignNamePlaceholder} onChange={(value) => updateField("sms_aliyun_sign_name", value)} />
                  <TextField label={copy.smsAliyunTemplateCode} value={form.sms_aliyun_template_code} placeholder="SMS_123456789" onChange={(value) => updateField("sms_aliyun_template_code", value)} />
                </>
              )}
              {form.sms_provider === "tencent" && (
                <>
                  <TextField label={copy.smsTencentSecretID} value={form.sms_tencent_secret_id} placeholder="SecretId" onChange={(value) => updateField("sms_tencent_secret_id", value)} />
                  <TextField label={copy.smsTencentSecretKey} value={form.sms_tencent_secret_key} placeholder={copy.sensitiveValuePlaceholder} type="password" onChange={(value) => updateField("sms_tencent_secret_key", value)} />
                  <TextField label={copy.smsTencentSDKAppID} value={form.sms_tencent_sdk_app_id} placeholder="1400000000" onChange={(value) => updateField("sms_tencent_sdk_app_id", value)} />
                  <TextField label={copy.smsSignName} value={form.sms_tencent_sign_name} placeholder={copy.smsSignNamePlaceholder} onChange={(value) => updateField("sms_tencent_sign_name", value)} />
                  <TextField label={copy.smsTencentTemplateID} value={form.sms_tencent_template_id} placeholder="1234567" onChange={(value) => updateField("sms_tencent_template_id", value)} />
                  <TextField label={copy.smsTencentRegion} value={form.sms_tencent_region} placeholder="ap-guangzhou" onChange={(value) => updateField("sms_tencent_region", value)} />
                </>
              )}
            </div>
            <p className="text-xs leading-5 text-muted-foreground">{copy.smsHint}</p>
          </div>
        </SettingsPanel>
      )}

      {activeTab === "content" && (
        <SettingsPanel title={copy.content}>
          <div className="grid gap-6">
            <div className="space-y-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <SectionTitle title={copy.announcements} description={copy.announcementsDescription} />
                <Button
                  className="gap-2"
                  onClick={() => {
                    setAnnouncementDraft(defaultAnnouncementDraft)
                    setIsAnnouncementDialogOpen(true)
                  }}
                >
                  <Plus size={16} />
                  {copy.createAnnouncement}
                </Button>
              </div>
              <div className="overflow-x-auto rounded-md border">
                <div className="min-w-[760px]">
                  <div className="grid grid-cols-[1.2fr_90px_110px_150px_190px] border-b bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground">
                    <div>{copy.announcementTitle}</div>
                    <div>{copy.sortOrder}</div>
                    <div>{copy.status}</div>
                    <div>{copy.createdAt}</div>
                    <div className="text-right">{t("common.actions")}</div>
                  </div>
                  {announcements.length === 0 ? (
                    <div className="px-3 py-8 text-center text-sm text-muted-foreground">{copy.noAnnouncements}</div>
                  ) : (
                    announcements.map((announcement) => (
                      <div key={announcement.id} className="grid grid-cols-[1.2fr_90px_110px_150px_190px] items-center border-b px-3 py-3 text-sm last:border-b-0">
                        <div className="min-w-0">
                          <div className="truncate font-medium">{announcement.title}</div>
                          <div className="truncate text-xs text-muted-foreground">{announcement.content}</div>
                        </div>
                        <div>{announcement.sort_order}</div>
                        <div>{announcement.enabled ? t("common.enabled") : t("common.disabled")}</div>
                        <div>{formatDateTime(announcement.created_at)}</div>
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="outline"
                            size="icon"
                            aria-label={t("common.edit")}
                            title={t("common.edit")}
                            onClick={() => {
                              setAnnouncementDraft({
                                id: announcement.id,
                                title: announcement.title,
                                content: announcement.content,
                                enabled: announcement.enabled,
                                sort_order: String(announcement.sort_order || 0),
                              })
                              setIsAnnouncementDialogOpen(true)
                            }}
                          >
                            <Pencil size={16} />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => saveAnnouncement.mutate({
                              id: announcement.id,
                              title: announcement.title,
                              content: announcement.content,
                              enabled: !announcement.enabled,
                              sort_order: String(announcement.sort_order || 0),
                            })}
                          >
                            {announcement.enabled ? t("settings.disable") : t("settings.enable")}
                          </Button>
                          <Button variant="outline" size="icon" className="text-red-500 hover:text-red-600" aria-label={t("common.delete")} title={t("common.delete")} onClick={() => deleteAnnouncement.mutate(announcement.id)}>
                            <Trash2 size={16} />
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
              <AnnouncementDialog
                open={isAnnouncementDialogOpen}
                copy={copy}
                draft={announcementDraft}
                canSave={canSaveAnnouncement}
                isSaving={saveAnnouncement.isPending}
                onDraftChange={setAnnouncementDraft}
                onClose={() => {
                  setIsAnnouncementDialogOpen(false)
                  setAnnouncementDraft(defaultAnnouncementDraft)
                }}
                onSave={() => saveAnnouncement.mutate(undefined)}
              />
            </div>
            <TextareaField label={copy.announcement} value={form.announcement} placeholder={copy.announcementPlaceholder} onChange={(value) => updateField("announcement", value)} />
            <TextareaField label={copy.aboutHTML} value={form.about_html} placeholder={copy.aboutHTMLPlaceholder} onChange={(value) => updateField("about_html", value)} />
            <div className="grid gap-4 lg:grid-cols-2">
              <TextField label={copy.privacyPolicyURL} value={form.privacy_policy_url} placeholder={copy.privacyPolicyURLPlaceholder} onChange={(value) => updateField("privacy_policy_url", value)} />
              <TextField label={copy.termsURL} value={form.terms_url} placeholder={copy.termsURLPlaceholder} onChange={(value) => updateField("terms_url", value)} />
            </div>
            <TextareaField label={copy.privacyPolicy} value={form.privacy_policy} placeholder={copy.privacyPolicyPlaceholder} onChange={(value) => updateField("privacy_policy", value)} />
            <TextareaField label={copy.terms} value={form.terms} placeholder={copy.termsPlaceholder} onChange={(value) => updateField("terms", value)} />
          </div>
        </SettingsPanel>
      )}

      {activeTab === "topNavigation" && (
        <SettingsPanel title={copy.topNavigation}>
          <div className="grid gap-3">
            <ToggleField label={copy.topNav} checked={form.top_nav_enabled} onChange={(checked) => updateField("top_nav_enabled", checked)} />
            <div>
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="text-sm font-medium">{copy.topNavItems}</div>
                <Button variant="outline" className="gap-2" onClick={addNavRow}>
                  <Plus size={16} />
                  {copy.addTopNavItem}
                </Button>
              </div>
              <div className="space-y-3">
                {navRows.length === 0 && <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">{copy.noTopNavItems}</div>}
                {navRows.map((row, index) => (
                  <div key={row.id} className="grid gap-3 rounded-md border p-3 lg:grid-cols-[48px_1fr_1.4fr_auto]">
                    <div className="flex h-10 items-center text-sm text-muted-foreground">#{index + 1}</div>
                    <Input value={row.label} placeholder={copy.topNavLabelPlaceholder} onChange={(event) => updateNavRow(row.id, { label: event.target.value })} />
                    <Input value={row.href} placeholder={copy.topNavHrefPlaceholder} onChange={(event) => updateNavRow(row.id, { href: event.target.value })} />
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" size="icon" onClick={() => moveNavRow(index, -1)} disabled={index === 0} aria-label={copy.moveUp} title={copy.moveUp}>
                        <ArrowUp size={16} />
                      </Button>
                      <Button variant="outline" size="icon" onClick={() => moveNavRow(index, 1)} disabled={index === navRows.length - 1} aria-label={copy.moveDown} title={copy.moveDown}>
                        <ArrowDown size={16} />
                      </Button>
                      <Button variant="outline" size="icon" onClick={() => removeNavRow(row.id)} aria-label={copy.deleteTopNavItem} title={copy.deleteTopNavItem}>
                        <Trash2 size={16} />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </SettingsPanel>
      )}

      {activeTab === "navigation" && (
        <SettingsPanel title={copy.navigation}>
          <div className="space-y-5">
            <div className="grid gap-3 lg:grid-cols-2">
              <ToggleField label={copy.sidebarDashboard} checked={form.sidebar_dashboard_enabled} onChange={(checked) => updateField("sidebar_dashboard_enabled", checked)} />
              <ToggleField label={copy.sidebarUsage} checked={form.sidebar_usage_enabled} onChange={(checked) => updateField("sidebar_usage_enabled", checked)} />
              <ToggleField label={copy.sidebarDataBoard} checked={form.sidebar_data_board_enabled} onChange={(checked) => updateField("sidebar_data_board_enabled", checked)} />
              <ToggleField label={copy.sidebarAPIKeys} checked={form.sidebar_api_keys_enabled} onChange={(checked) => updateField("sidebar_api_keys_enabled", checked)} />
              <ToggleField label={copy.sidebarChat} checked={form.sidebar_chat_enabled} onChange={(checked) => updateField("sidebar_chat_enabled", checked)} />
              <ToggleField label={copy.sidebarSystem} checked={form.sidebar_system_enabled} onChange={(checked) => updateField("sidebar_system_enabled", checked)} />
              <ToggleField label={copy.sidebarAdminOverview} checked={form.sidebar_admin_overview_enabled} onChange={(checked) => updateField("sidebar_admin_overview_enabled", checked)} />
              <ToggleField label={copy.sidebarChannels} checked={form.sidebar_channels_enabled} onChange={(checked) => updateField("sidebar_channels_enabled", checked)} />
              <ToggleField label={copy.sidebarModels} checked={form.sidebar_models_enabled} onChange={(checked) => updateField("sidebar_models_enabled", checked)} />
              <ToggleField label={copy.sidebarUsers} checked={form.sidebar_users_enabled} onChange={(checked) => updateField("sidebar_users_enabled", checked)} />
            </div>
          </div>
        </SettingsPanel>
      )}

      {activeTab === "scheduledTasks" && (
        <SettingsPanel title={copy.scheduledTasks}>
          <div className="space-y-5">
            <SectionTitle title={copy.scheduledTasksTitle} description={copy.scheduledTasksDescription} />
            {scheduledJobs?.node && !scheduledJobs.node.primary && (
              <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300">
                {copy.scheduledTasksReplicaHint}
              </div>
            )}
            <div className="overflow-x-auto rounded-md border">
              <div className="min-w-[1080px]">
                <div className="grid grid-cols-[1.6fr_90px_110px_1.1fr_1.4fr_1.1fr_110px] border-b bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground">
                  <div>{copy.taskName}</div>
                  <div>{copy.taskInterval}</div>
                  <div>{copy.status}</div>
                  <div>{copy.taskLastRun}</div>
                  <div>{copy.taskLastResult}</div>
                  <div>{copy.taskNextRun}</div>
                  <div className="text-right">{t("common.actions")}</div>
                </div>
                {(scheduledJobs?.jobs || []).length === 0 ? (
                  <div className="px-3 py-8 text-center text-sm text-muted-foreground">{copy.taskListEmpty}</div>
                ) : (
                  (scheduledJobs?.jobs || []).map((job) => (
                    <div key={job.name} className="grid grid-cols-[1.6fr_90px_110px_1.1fr_1.4fr_1.1fr_110px] items-center border-b px-3 py-3 text-sm last:border-b-0">
                      <div className="min-w-0 pr-2">
                        <div className="font-medium">{scheduledJobLabel(copy, job)}</div>
                        <div className="truncate text-xs text-muted-foreground" title={job.description}>
                          {job.name}
                          {job.primary_only && <span className="ml-1">· {copy.taskPrimaryOnly}</span>}
                        </div>
                      </div>
                      <div>{formatSeconds(job.interval_seconds)}</div>
                      <div>
                        {job.running ? (
                          <span className="text-sky-600 dark:text-sky-400">{copy.taskRunning}</span>
                        ) : job.enabled ? (
                          <span className="text-emerald-600 dark:text-emerald-400">{copy.taskEnabled}</span>
                        ) : (
                          <span className="text-muted-foreground">{copy.taskDisabled}</span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {job.last_run_at ? formatNodeTimestamp(job.last_run_at) : copy.taskNever}
                      </div>
                      <div className="min-w-0 pr-2 text-xs">
                        {job.last_status ? (
                          <>
                            <span className={job.last_status === "success" ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}>
                              {job.last_status === "success" ? copy.taskStatusSuccess : copy.taskStatusFailed}
                            </span>
                            {job.last_duration_ms > 0 && <span className="ml-1 text-muted-foreground">{formatLatency(job.last_duration_ms)}</span>}
                            {job.last_message && (
                              <div className="truncate text-muted-foreground" title={job.last_message}>{job.last_message}</div>
                            )}
                          </>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {job.next_run_at ? formatNodeTimestamp(job.next_run_at) : "-"}
                      </div>
                      <div className="flex justify-end">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={job.running || runScheduledJob.isPending || (job.primary_only && scheduledJobs?.node && !scheduledJobs.node.primary)}
                          onClick={() => runScheduledJob.mutate(job.name)}
                        >
                          {copy.taskRunNow}
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <SectionTitle title={copy.taskRunHistory} description={copy.taskRunHistoryDescription} />
            <div className="flex flex-wrap items-center gap-3">
              <Select
                value={taskRunFilter || "all"}
                onValueChange={(value) => {
                  setTaskRunFilter(value === "all" ? "" : value)
                  setTaskRunPage(1)
                }}
              >
                <SelectTrigger className="h-9 w-[240px] rounded-2xl border border-border bg-background px-3 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{copy.taskAllTasks}</SelectItem>
                  {(scheduledJobs?.jobs || []).map((job) => (
                    <SelectItem key={job.name} value={job.name}>{scheduledJobLabel(copy, job)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="text-xs text-muted-foreground">
                {copy.taskRunTotal.replace("{count}", String(scheduledTaskRuns?.total ?? 0))}
              </span>
            </div>
            <div className="overflow-x-auto rounded-md border">
              <div className="min-w-[960px]">
                <div className="grid grid-cols-[1.1fr_1.3fr_90px_100px_90px_110px_1.6fr] border-b bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground">
                  <div>{copy.taskRunTime}</div>
                  <div>{copy.taskName}</div>
                  <div>{copy.status}</div>
                  <div>{copy.taskTrigger}</div>
                  <div>{copy.taskDuration}</div>
                  <div>{copy.taskNode}</div>
                  <div>{copy.taskMessage}</div>
                </div>
                {(scheduledTaskRuns?.items || []).length === 0 ? (
                  <div className="px-3 py-8 text-center text-sm text-muted-foreground">{copy.taskNoRuns}</div>
                ) : (
                  (scheduledTaskRuns?.items || []).map((run) => (
                    <div key={run.id} className="grid grid-cols-[1.1fr_1.3fr_90px_100px_90px_110px_1.6fr] items-center border-b px-3 py-2.5 text-xs last:border-b-0">
                      <div className="text-muted-foreground">{formatNodeTimestamp(run.started_at)}</div>
                      <div>{scheduledJobRunLabel(copy, run.task_name, scheduledJobs?.jobs)}</div>
                      <div className={run.status === "success" ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}>
                        {run.status === "success" ? copy.taskStatusSuccess : copy.taskStatusFailed}
                      </div>
                      <div>{run.trigger === "manual" ? copy.taskTriggerManual : copy.taskTriggerSchedule}</div>
                      <div className="text-muted-foreground">{formatLatency(run.duration_ms)}</div>
                      <div className="truncate text-muted-foreground" title={run.node_name}>{run.node_name || "-"}</div>
                      <div className="truncate" title={run.message}>{run.message || "-"}</div>
                    </div>
                  ))
                )}
              </div>
            </div>
            <div className="flex items-center justify-end gap-2">
              <Button variant="outline" size="sm" disabled={taskRunPage <= 1} onClick={() => setTaskRunPage((page) => Math.max(1, page - 1))}>
                {copy.taskPrevPage}
              </Button>
              <span className="text-xs text-muted-foreground">{taskRunPage}</span>
              <Button
                variant="outline"
                size="sm"
                disabled={(scheduledTaskRuns?.items || []).length < 20}
                onClick={() => setTaskRunPage((page) => page + 1)}
              >
                {copy.taskNextPage}
              </Button>
            </div>
          </div>
        </SettingsPanel>
      )}

      {activeTab === "statusMonitor" && (
        <SettingsPanel title={copy.statusMonitor}>
          <div className="space-y-5">
            <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-center">
              <ToggleField label={copy.statusMonitorEnabled} checked={form.status_monitor_enabled} onChange={(checked) => updateField("status_monitor_enabled", checked)} />
              <Button
                className="gap-2"
                onClick={() => {
                  setStatusMonitorDraft(defaultStatusMonitorDraft)
                  setIsStatusMonitorDialogOpen(true)
                }}
              >
                <Plus size={16} />
                {copy.createStatusMonitor}
              </Button>
            </div>
            <div className="overflow-x-auto rounded-md border">
              <div className="min-w-[1080px]">
                <div className="grid grid-cols-[1fr_1.6fr_110px_130px_130px_130px_1fr_220px] border-b bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground">
                  <div>{copy.monitorName}</div>
                  <div>{copy.monitorTarget}</div>
                  <div>{copy.checkType}</div>
                  <div>{copy.checkInterval}</div>
                  <div>{copy.retention}</div>
                  <div>{copy.status}</div>
                  <div>{copy.lastResult}</div>
                  <div className="text-right">{t("common.actions")}</div>
                </div>
                {statusMonitors.length === 0 ? (
                  <div className="px-3 py-8 text-center text-sm text-muted-foreground">{copy.noStatusMonitors}</div>
                ) : (
                  statusMonitors.map((monitor) => (
                    <div key={monitor.id} className="grid grid-cols-[1fr_1.6fr_110px_130px_130px_130px_1fr_220px] items-center border-b px-3 py-3 text-sm last:border-b-0">
                      <div className="min-w-0">
                        <div className="truncate font-medium">{monitor.name}</div>
                        <div className="text-xs text-muted-foreground">{monitor.enabled ? t("common.enabled") : t("common.disabled")}</div>
                      </div>
                      <div className="truncate font-mono text-xs text-muted-foreground">{monitor.target_url}</div>
                      <div>{monitor.check_type.toUpperCase()}</div>
                      <div>{formatSeconds(monitor.interval_seconds)}</div>
                      <div>{formatHours(monitor.retention_hours)}</div>
                      <div>
                        <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${statusBadgeClass(monitor.last_status)}`}>
                          {statusLabel(monitor.last_status, copy)}
                        </span>
                      </div>
                      <div className="min-w-0 text-xs text-muted-foreground">
                        <div>{formatLatency(monitor.last_latency_ms)} · {monitor.last_status_code || "-"}</div>
                        <div className="truncate">{monitor.last_message || "-"}</div>
                      </div>
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" size="icon" disabled={checkStatusMonitor.isPending} onClick={() => checkStatusMonitor.mutate(monitor.id)} aria-label={copy.checkNow} title={copy.checkNow}>
                          <RefreshCw size={16} />
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => {
                            setStatusMonitorDraft(statusMonitorToDraft(monitor))
                            setIsStatusMonitorDialogOpen(true)
                          }}
                          aria-label={t("common.edit")}
                          title={t("common.edit")}
                        >
                          <Pencil size={16} />
                        </Button>
                        <Button variant="outline" size="icon" className="text-red-500 hover:text-red-600" onClick={() => deleteStatusMonitor.mutate(monitor.id)} aria-label={t("common.delete")} title={t("common.delete")}>
                          <Trash2 size={16} />
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
            <StatusMonitorDialog
              open={isStatusMonitorDialogOpen}
              copy={copy}
              draft={statusMonitorDraft}
              canSave={canSaveStatusMonitor}
              isSaving={saveStatusMonitor.isPending}
              onDraftChange={setStatusMonitorDraft}
              onClose={() => setIsStatusMonitorDialogOpen(false)}
              onSave={() => saveStatusMonitor.mutate()}
            />
          </div>
        </SettingsPanel>
      )}

      {activeTab === "reliability" && (
        <SettingsPanel title={copy.reliability}>
          <div className="space-y-5">
            <SectionTitle title={copy.reliabilityUpstreamTitle} description={copy.reliabilityUpstreamDescription} />
            <div className="grid gap-3 lg:grid-cols-2">
              <ToggleField label={copy.reliabilityAutoDisableEnabled} checked={form.reliability_auto_disable_enabled} onChange={(checked) => updateField("reliability_auto_disable_enabled", checked)} />
              <TextField
                label={copy.reliabilityDisableAfterFailures}
                value={form.reliability_disable_after_failures}
                placeholder="3"
                type="number"
                onChange={(value) => updateField("reliability_disable_after_failures", value)}
              />
            </div>
            <div className="grid gap-3 lg:grid-cols-3">
              <ToggleField label={copy.reliabilityAutoDetectUpstreamEnabled} checked={form.reliability_auto_detect_upstream_enabled} onChange={(checked) => updateField("reliability_auto_detect_upstream_enabled", checked)} />
              <TextField
                label={copy.reliabilityAutoDetectIntervalSeconds}
                value={form.reliability_auto_detect_interval_seconds}
                placeholder="300"
                type="number"
                onChange={(value) => updateField("reliability_auto_detect_interval_seconds", value)}
              />
              <TextField
                label={copy.reliabilityAutoDetectTimeoutSeconds}
                value={form.reliability_auto_detect_timeout_seconds}
                placeholder="10"
                type="number"
                onChange={(value) => updateField("reliability_auto_detect_timeout_seconds", value)}
              />
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
              <ToggleField label={copy.reliabilityAutoRecoverEnabled} checked={form.reliability_auto_recover_enabled} onChange={(checked) => updateField("reliability_auto_recover_enabled", checked)} />
              <TextField
                label={copy.reliabilityRecoveryAfterSeconds}
                value={form.reliability_recovery_after_seconds}
                placeholder="1800"
                type="number"
                onChange={(value) => updateField("reliability_recovery_after_seconds", value)}
              />
            </div>
            <p className="text-xs leading-5 text-muted-foreground">{copy.reliabilityHint}</p>
          </div>
        </SettingsPanel>
      )}

      {activeTab === "logCleanup" && (
        <SettingsPanel title={copy.logCleanup}>
          <div className="space-y-5">
            <SectionTitle title={copy.logCleanupTitle} description={copy.logCleanupDescription} />
            <div className="grid gap-3 lg:grid-cols-2">
              <label className="grid gap-2 text-sm">
                <span className="font-medium">{copy.logStorageMode}</span>
                <Select value={form.log_storage_mode} onValueChange={(value) => updateField("log_storage_mode", value)}><SelectTrigger className="h-10 rounded-2xl border border-border bg-background px-3 text-sm"><SelectValue /></SelectTrigger><SelectContent>
                  <SelectItem value="single">{copy.logStorageSingle}</SelectItem>
                  <SelectItem value="daily">{copy.logStorageDaily}</SelectItem>
                </SelectContent></Select>
              </label>
              <TextField label={copy.logRetentionDays} value={form.log_retention_days} placeholder="30" type="number" onChange={(value) => updateField("log_retention_days", value)} />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="destructive" disabled={deleteLogs.isPending} onClick={() => {
                if (window.confirm(copy.logsDeleteConfirm)) deleteLogs.mutate()
              }}>{copy.logsDeleteAll}</Button>
            </div>
            <p className="text-xs leading-5 text-muted-foreground">{copy.logCleanupHint}</p>
          </div>
        </SettingsPanel>
      )}

      {activeTab === "nodes" && (
        <SettingsPanel title={copy.nodes}>
          <div className="space-y-5">
            <SectionTitle title={copy.nodesTitle} description={copy.nodesDescription} />
            <div className="grid gap-4 lg:grid-cols-2">
              <ToggleField label={copy.multiNodeEnabled} checked={form.multi_node_enabled} onChange={(checked) => updateField("multi_node_enabled", checked)} />
              <label className="grid gap-2 text-sm">
                <span className="font-medium">{copy.nodeAddressMode}</span>
                <Select value={form.node_address_mode || "single"} onValueChange={(value) => updateField("node_address_mode", value)}><SelectTrigger className="h-10 rounded-2xl border border-border bg-background px-3 text-sm"><SelectValue /></SelectTrigger><SelectContent>
                  <SelectItem value="single">{copy.nodeAddressSingle}</SelectItem>
                  <SelectItem value="multiple">{copy.nodeAddressMultiple}</SelectItem>
                </SelectContent></Select>
              </label>
            </div>
            <TextareaField
              label={form.node_address_mode === "multiple" ? copy.nodeAddresses : copy.nodeAddress}
              value={form.node_addresses}
              placeholder={copy.nodeAddressesPlaceholder}
              onChange={(value) => updateField("node_addresses", value)}
            />
            <div className="rounded-md border bg-muted/30 p-3 text-xs leading-5 text-muted-foreground">
              {copy.nodeEnvHint}
              <div className="mt-1 font-mono text-foreground">NODE_NAME={clusterStatus?.current_node_name || "your-node-name"}</div>
            </div>
            {clusterStatus?.node_name_missing && (
              <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300">
                {copy.nodeNameMissing}
              </div>
            )}

            <div className="overflow-x-auto rounded-md border">
              <div className="min-w-[720px]">
                <div className="grid grid-cols-[1.2fr_110px_110px_1fr_170px] border-b bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground">
                  <div>{copy.nodeName}</div>
                  <div>{copy.nodeRole}</div>
                  <div>{copy.status}</div>
                  <div>{copy.nodeLastSeen}</div>
                  <div className="text-right">{t("common.actions")}</div>
                </div>
                {(clusterStatus?.nodes || []).length === 0 ? (
                  <div className="px-3 py-8 text-center text-sm text-muted-foreground">{copy.noNodes}</div>
                ) : (
                  (clusterStatus?.nodes || []).map((node) => (
                    <div key={node.id} className="grid grid-cols-[1.2fr_110px_110px_1fr_170px] items-center border-b px-3 py-3 text-sm last:border-b-0">
                      <div className="font-medium">
                        {node.name}
                        {node.is_current && <span className="ml-2 text-xs text-muted-foreground">{copy.nodeCurrent}</span>}
                      </div>
                      <div>{node.role === "primary" ? copy.nodePrimary : copy.nodeReplica}</div>
                      <div className={node.online ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}>
                        {node.online ? copy.nodeOnline : copy.nodeOffline}
                      </div>
                      <div className="text-xs text-muted-foreground">{formatNodeTimestamp(node.last_seen_at)}</div>
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={node.role === "primary" || promoteNode.isPending}
                          onClick={() => promoteNode.mutate(node.id)}
                        >
                          {copy.nodePromote}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-red-500 hover:text-red-600"
                          disabled={node.online || node.is_current || removeNode.isPending}
                          onClick={() => removeNode.mutate(node.id)}
                        >
                          {t("common.delete")}
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
            <p className="text-xs leading-5 text-muted-foreground">{copy.nodesFooterHint}</p>
          </div>
        </SettingsPanel>
      )}

      {activeTab === "configuration" && (
        <SettingsPanel title={copy.configurationBackup}>
          <div className="space-y-5">
            <SectionTitle title={copy.configurationBackup} description={copy.configurationBackupDescription} />
            <div className="grid gap-3 sm:grid-cols-2">
              {configurationSections.map((section) => (
                <label key={section.id} className="flex items-center gap-3 rounded-md border p-3 text-sm">
                  <input
                    type="checkbox"
                    checked={selectedConfigurationSections.includes(section.id)}
                    onChange={(event) => setSelectedConfigurationSections((current) => event.target.checked ? [...current, section.id] : current.filter((value) => value !== section.id))}
                  />
                  <span>{copy[section.label]}</span>
                </label>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button className="gap-2" disabled={selectedConfigurationSections.length === 0 || exportConfiguration.isPending} onClick={() => exportConfiguration.mutate(selectedConfigurationSections)}>
                <Download size={16} />
                {copy.configurationExport}
              </Button>
            </div>
            <div className="rounded-md border p-4">
              <p className="text-sm font-medium">{copy.configurationImport}</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{copy.configurationImportDescription}</p>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <Input className="max-w-sm" type="file" accept="application/json,.json" onChange={(event) => setConfigurationImportFile(event.target.files?.[0] || null)} />
                <Button variant="destructive" className="gap-2" disabled={!configurationImportFile || importConfiguration.isPending} onClick={() => {
                  if (configurationImportFile && window.confirm(copy.configurationImportConfirm)) importConfiguration.mutate(configurationImportFile)
                }}>
                  <Upload size={16} />
                  {copy.configurationImport}
                </Button>
              </div>
            </div>
            <p className="text-xs leading-5 text-muted-foreground">{copy.configurationBackupHint}</p>
          </div>
        </SettingsPanel>
      )}

      {activeTab === "updates" && (
        <SettingsPanel title={copy.autoUpdate}>
          <div className="space-y-5">
            <SectionTitle title={copy.autoUpdate} description={copy.autoUpdateDescription} />
            <div className="grid gap-3 lg:grid-cols-2">
              <ToggleField label={copy.autoUpdateEnabled} checked={form.auto_update_enabled} onChange={(checked) => updateField("auto_update_enabled", checked)} />
              <TextField label={copy.autoUpdateIntervalHours} value={form.auto_update_interval_hours} placeholder="24" type="number" onChange={(value) => updateField("auto_update_interval_hours", value)} />
            </div>
            <div className="rounded-md border bg-muted/30 p-4 text-sm">
              <div className="grid gap-2 sm:grid-cols-2">
                <div>{copy.autoUpdateCurrentVersion}: <span className="font-mono">{autoUpdateStatus?.current_version || "-"}</span></div>
                <div>{copy.autoUpdateLatestVersion}: <span className="font-mono">{autoUpdateStatus?.latest_version || "-"}</span></div>
                <div>{copy.autoUpdatePlatform}: <span className="font-mono">{autoUpdateStatus?.platform || "-"}</span></div>
                <div>{copy.autoUpdateLastChecked}: {formatAutoUpdateTime(autoUpdateStatus?.last_checked_at)}</div>
              </div>
              {!autoUpdateStatus?.supported && <p className="mt-3 text-xs text-muted-foreground">{copy.autoUpdateUnsupported}</p>}
              {autoUpdateStatus?.last_error && <p className="mt-3 text-xs text-destructive">{copy.autoUpdateLastError}: {autoUpdateStatus.last_error}</p>}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="outline" className="gap-2" disabled={checkForUpdate.isPending} onClick={() => checkForUpdate.mutate()}>
                <RefreshCw size={16} className={checkForUpdate.isPending ? "animate-spin" : ""} />
                {copy.autoUpdateCheckNow}
              </Button>
              <Button className="gap-2" disabled={!autoUpdateStatus?.supported || !autoUpdateStatus?.update_available || autoUpdateStatus.in_progress || startAutoUpdate.isPending} onClick={() => startAutoUpdate.mutate()}>
                <Download size={16} />
                {copy.autoUpdateInstallNow}
              </Button>
              {autoUpdateStatus?.update_available && <span className="text-sm font-medium text-emerald-600 dark:text-emerald-400">{copy.autoUpdateAvailable}</span>}
            </div>
            {autoUpdateStatus?.in_progress && (
              <div className="rounded-md border p-4">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span>{autoUpdateStatus.message || copy.autoUpdateInProgress}</span>
                  {autoUpdateStatus.total_bytes > 0 && <span className="font-mono text-xs text-muted-foreground">{Math.min(100, Math.max(0, autoUpdateStatus.progress))}%</span>}
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                  <div className={`h-full bg-primary transition-[width] ${autoUpdateStatus.total_bytes > 0 ? "" : "w-full animate-pulse"}`} style={autoUpdateStatus.total_bytes > 0 ? { width: `${Math.min(100, Math.max(0, autoUpdateStatus.progress))}%` } : undefined} />
                </div>
                {autoUpdateStatus.total_bytes > 0 && <div className="mt-2 text-xs text-muted-foreground">{formatAutoUpdateBytes(autoUpdateStatus.downloaded_bytes)} / {formatAutoUpdateBytes(autoUpdateStatus.total_bytes)}</div>}
              </div>
            )}
            <p className="text-xs leading-5 text-muted-foreground">{copy.autoUpdateHint}</p>
          </div>
        </SettingsPanel>
      )}

      {activeTab === "groups" && (
        <SettingsPanel title={copy.groups}>
          <div className="space-y-5">
            <div className="flex justify-end">
              <Button
                className="gap-2"
                onClick={() => {
                  setGroupDraft(defaultGroupDraft)
                  setIsGroupDialogOpen(true)
                }}
              >
                <Plus size={16} />
                {copy.createGroup}
              </Button>
            </div>
            <div className="overflow-x-auto rounded-md border">
              <div className="min-w-[560px]">
                <div className="grid grid-cols-[1fr_160px_180px] border-b bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground">
                  <div>{copy.groupName}</div>
                  <div>{copy.groupMultiplier}</div>
                  <div className="text-right">{t("common.actions")}</div>
                </div>
                {groups.length === 0 ? (
                  <div className="px-3 py-8 text-center text-sm text-muted-foreground">{copy.noGroups}</div>
                ) : (
                  groups.map((group) => (
                    <div key={group.id} className="grid grid-cols-[1fr_160px_180px] items-center border-b px-3 py-3 text-sm last:border-b-0">
                      <div className="font-medium">{group.name}</div>
                      <div>{group.multiplier}</div>
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setGroupDraft({ id: group.id, name: group.name, multiplier: String(group.multiplier ?? 1) })
                            setIsGroupDialogOpen(true)
                          }}
                        >
                          {t("common.edit")}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-red-500 hover:text-red-600"
                          disabled={group.name === "user"}
                          onClick={() => deleteGroup.mutate(group.id)}
                        >
                          {t("common.delete")}
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
            <GroupDialog
              open={isGroupDialogOpen}
              copy={copy}
              draft={groupDraft}
              isSaving={saveGroup.isPending}
              onDraftChange={setGroupDraft}
              onClose={() => {
                setIsGroupDialogOpen(false)
                setGroupDraft(defaultGroupDraft)
              }}
              onSave={() => saveGroup.mutate()}
            />
          </div>
        </SettingsPanel>
      )}

      {activeTab === "advancedChatAssistant" && (
        <AdvancedChatManagement mode="assistant" />
      )}

      {activeTab === "advancedChatAttachments" && (
        <AdvancedChatManagement mode="attachments" />
      )}

      {activeTab === "advancedChatMCP" && (
        <AdvancedChatManagement mode="mcp" />
      )}

      {activeTab === "subscriptionPlans" && (
        <SettingsPanel title={copy.subscriptionPlans}>
          <div className="space-y-5">
            <div className="flex flex-col gap-3 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-sm font-medium">{copy.subscriptionPlans}</div>
                <div className="text-xs text-muted-foreground">{copy.subscriptionPlansDescription}</div>
              </div>
              <Button
                className="gap-2"
                onClick={() => {
                  setSubscriptionPlanDraft(defaultSubscriptionPlanDraft)
                  setIsSubscriptionPlanDialogOpen(true)
                }}
              >
                <Plus size={16} />
                {copy.createSubscriptionPlan}
              </Button>
            </div>

            <div className="overflow-x-auto rounded-md border">
              <div className="min-w-[720px]">
                <div className="grid grid-cols-[1fr_120px_120px_120px_110px_100px_160px] border-b bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground">
                  <div>{copy.planName}</div>
                  <div>{copy.resetAmount}</div>
                  <div>{copy.resetInterval}</div>
                  <div>{copy.planPrice}</div>
                  <div>{copy.planDuration}</div>
                  <div>{copy.status}</div>
                  <div className="text-right">{t("common.actions")}</div>
                </div>
                {subscriptionPlans.length === 0 ? (
                  <div className="px-3 py-8 text-center text-sm text-muted-foreground">{copy.noSubscriptionPlans}</div>
                ) : (
                  subscriptionPlans.map((plan) => (
                    <div key={plan.id} className="grid grid-cols-[1fr_120px_120px_120px_110px_100px_160px] items-center border-b px-3 py-3 text-sm last:border-b-0">
                      <div className="font-medium">{plan.name}</div>
                      <div>{formatCurrency(plan.reset_amount, form.payment_currency_display_name)}</div>
                      <div>{formatDuration(plan.reset_interval_days, copy)}</div>
                      <div>{plan.purchasable ? formatCurrency(plan.price, form.payment_currency_display_name) : copy.notPurchasable}</div>
                      <div>{plan.duration_days > 0 ? formatDuration(plan.duration_days, copy) : copy.planPermanent}</div>
                      <div>{plan.enabled ? copy.enabled : copy.disabled}</div>
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSubscriptionPlanDraft({
                              id: plan.id,
                              name: plan.name,
                              reset_amount: String(plan.reset_amount ?? ""),
                              reset_interval_days: String(plan.reset_interval_days ?? 30),
                              price: String(plan.price ?? ""),
                              duration_days: String(plan.duration_days ?? 0),
                              purchasable: Boolean(plan.purchasable),
                              enabled: plan.enabled,
                            })
                            setIsSubscriptionPlanDialogOpen(true)
                          }}
                        >
                          {t("common.edit")}
                        </Button>
                        <Button variant="outline" size="sm" className="text-red-500 hover:text-red-600" onClick={() => deleteSubscriptionPlan.mutate(plan.id)}>
                          {t("common.delete")}
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
            <SubscriptionPlanDialog
              open={isSubscriptionPlanDialogOpen}
              copy={copy}
              draft={subscriptionPlanDraft}
              canSave={canSaveSubscriptionPlan}
              isSaving={saveSubscriptionPlan.isPending}
              onDraftChange={setSubscriptionPlanDraft}
              onClose={() => {
                setIsSubscriptionPlanDialogOpen(false)
                setSubscriptionPlanDraft(defaultSubscriptionPlanDraft)
              }}
              onSave={() => saveSubscriptionPlan.mutate()}
            />
          </div>
        </SettingsPanel>
      )}

      {activeTab === "metaModels" && (
        <SettingsPanel title={copy.metaModels}>
          <div className="space-y-5">
            <div className="flex flex-col gap-3 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-sm font-medium">{copy.metaModels}</div>
                <div className="text-xs text-muted-foreground">{copy.metaModelsDescription}</div>
              </div>
              <Button
                className="gap-2"
                onClick={() => {
                  setMetaModelDraft(defaultMetaModelDraft)
                  setIsMetaModelDialogOpen(true)
                }}
              >
                <Plus size={16} />
                {copy.createMetaModel}
              </Button>
            </div>

            <div className="overflow-x-auto rounded-md border">
              <div className="min-w-[1120px]">
                <div className="grid grid-cols-[1fr_170px_120px_120px_130px_130px_130px_120px_190px] border-b bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground">
                  <div>{copy.metaModelName}</div>
                  <div>{copy.metaModelProvider}</div>
                  <div>{copy.metaModelReferencedVisibility}</div>
                  <div>{copy.billingMode}</div>
                  <div>{copy.inputPrice}</div>
                  <div>{copy.outputPrice}</div>
                  <div>{copy.cachedInputPrice}</div>
                  <div>{copy.status}</div>
                  <div className="text-right">{t("common.actions")}</div>
                </div>
                {metaModels.length === 0 ? (
                  <div className="px-3 py-8 text-center text-sm text-muted-foreground">{copy.noMetaModels}</div>
                ) : (
                  metaModels.map((item) => (
                    <div key={item.id} className="grid grid-cols-[1fr_170px_120px_120px_130px_130px_130px_120px_190px] items-center border-b px-3 py-3 text-sm last:border-b-0">
                      <div className="min-w-0">
                        <div className="truncate font-mono text-xs font-medium">{item.name}</div>
                        <div className="truncate text-xs text-muted-foreground">{item.description || "-"}</div>
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-xs font-medium">{item.provider_name || "Meta Module"}</div>
                        <div className="truncate font-mono text-xs text-muted-foreground">{item.provider || "meta"}</div>
                      </div>
                      <div>{item.expose_referenced_models ? copy.visible : copy.hidden}</div>
                      <div>{metaBillingModeLabel(item.billing_mode, copy)}</div>
                      <div>{formatMetaPriceValue(item, "input_price", form.payment_currency_display_name)}</div>
                      <div>{formatMetaPriceValue(item, "output_price", form.payment_currency_display_name)}</div>
                      <div>{formatMetaPriceValue(item, "cached_input_price", form.payment_currency_display_name)}</div>
                      <div>{item.enabled ? copy.enabled : copy.disabled}</div>
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setMetaModelDraft(metaModelToDraft(item))
                            setIsMetaModelDialogOpen(true)
                          }}
                        >
                          {t("common.edit")}
                        </Button>
                        <Button variant="outline" size="sm" className="text-red-500 hover:text-red-600" onClick={() => deleteMetaModel.mutate(item.id)}>
                          {t("common.delete")}
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
            <MetaModelDialog
              open={isMetaModelDialogOpen}
              copy={copy}
              draft={metaModelDraft}
              canSave={canSaveMetaModel}
              isSaving={saveMetaModel.isPending}
              isValidating={validateMetaModel.isPending}
              onDraftChange={setMetaModelDraft}
              onClose={() => {
                setIsMetaModelDialogOpen(false)
                setMetaModelDraft(defaultMetaModelDraft)
              }}
              onValidate={() => validateMetaModel.mutate()}
              onSave={() => saveMetaModel.mutate()}
            />
          </div>
        </SettingsPanel>
      )}

      {activeTab === "redeemCodes" && (
        <SettingsPanel title={copy.redeemCodes}>
          <div className="space-y-5">
            <div className="flex flex-col gap-3 rounded-md border p-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap gap-2">
                  <Button
                    className="gap-2"
                    onClick={() => {
                      setRedeemDraft(defaultRedeemDraft)
                      setIsRedeemDialogOpen(true)
                    }}
                  >
                    <Plus size={16} />
                    {copy.createRedeemCode}
                  </Button>
                  <Button
                    variant="outline"
                    className="gap-2"
                    disabled={selectedRedeemCodes.length === 0}
                    onClick={() => downloadRedeemCodesTxt(selectedRedeemCodes, copy, "redeem-codes.txt")}
                  >
                    <Download size={16} />
                    {copy.downloadSelected}
                  </Button>
                </div>
                <div className="text-sm text-muted-foreground">{copy.selectedCount.replace("{count}", String(selectedRedeemCodes.length))}</div>
              </div>
              <div className="grid gap-3 lg:grid-cols-[1.5fr_160px_180px_180px]">
                <Input value={redeemSearch} placeholder={copy.redeemSearchPlaceholder} onChange={(event) => setRedeemSearch(event.target.value)} />
                <Select value={String((redeemStatusFilter) || "__shadcn_empty__")} onValueChange={(value) => setRedeemStatusFilter((value === "__shadcn_empty__" ? "" : value))}><SelectTrigger className="h-10 rounded-2xl border border-border bg-background px-3 text-sm"><SelectValue /></SelectTrigger><SelectContent>
                  <SelectItem value="all">{copy.filterAllStatus}</SelectItem>
                  <SelectItem value="enabled">{copy.filterEnabled}</SelectItem>
                  <SelectItem value="disabled">{copy.filterDisabled}</SelectItem>
                  <SelectItem value="expired">{copy.filterExpired}</SelectItem>
                  <SelectItem value="used_up">{copy.filterUsedUp}</SelectItem>
                </SelectContent></Select>
                <Select value={String((redeemGroupFilter) || "__shadcn_empty__")} onValueChange={(value) => setRedeemGroupFilter((value === "__shadcn_empty__" ? "" : value))}><SelectTrigger className="h-10 rounded-2xl border border-border bg-background px-3 text-sm"><SelectValue /></SelectTrigger><SelectContent>
                  <SelectItem value="all">{copy.filterAllGroups}</SelectItem>
                  <SelectItem value="none">{copy.noGroupGrant}</SelectItem>
                  {groups.map((group) => (
                    <SelectItem key={group.id} value={String(group.id)}>{group.name}</SelectItem>
                  ))}
                </SelectContent></Select>
                <Select value={String((redeemSort) || "__shadcn_empty__")} onValueChange={(value) => setRedeemSort((value === "__shadcn_empty__" ? "" : value))}><SelectTrigger className="h-10 rounded-2xl border border-border bg-background px-3 text-sm"><SelectValue /></SelectTrigger><SelectContent>
                  <SelectItem value="created_desc">{copy.sortCreatedDesc}</SelectItem>
                  <SelectItem value="created_asc">{copy.sortCreatedAsc}</SelectItem>
                  <SelectItem value="code_asc">{copy.sortCodeAsc}</SelectItem>
                  <SelectItem value="amount_desc">{copy.sortAmountDesc}</SelectItem>
                  <SelectItem value="used_desc">{copy.sortUsedDesc}</SelectItem>
                  <SelectItem value="expires_asc">{copy.sortExpiresAsc}</SelectItem>
                </SelectContent></Select>
              </div>
            </div>

            <div className="overflow-x-auto rounded-md border">
              <div className="min-w-[1200px]">
                <div className="grid grid-cols-[42px_1.3fr_100px_140px_110px_150px_110px_120px_160px_110px_150px] border-b bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground">
                  <label className="flex items-center">
                    <Switch
                      checked={allVisibleRedeemCodesSelected}
                      onCheckedChange={(checked) => {
                        const visibleIDs = visibleRedeemCodes.map((code) => code.id)
                        setSelectedRedeemCodeIDs((current) => (
                          checked
                            ? Array.from(new Set([...current, ...visibleIDs]))
                            : current.filter((id) => !visibleIDs.includes(id))
                        ))
                      }}
                    />
                  </label>
                  <div>{copy.redeemCode}</div>
                  <div>{copy.amount}</div>
                  <div>{copy.groupGrant}</div>
                  <div>{copy.groupDuration}</div>
                  <div>{copy.subscriptionPlan}</div>
                  <div>{copy.subscriptionDuration}</div>
                  <div>{copy.usage}</div>
                  <div>{copy.expiresAt}</div>
                  <div>{copy.status}</div>
                  <div className="text-right">{t("common.actions")}</div>
                </div>
                {visibleRedeemCodes.length === 0 ? (
                  <div className="px-3 py-8 text-center text-sm text-muted-foreground">{copy.noRedeemCodes}</div>
                ) : (
                  visibleRedeemCodes.map((code) => (
                    <div key={code.id} className="grid grid-cols-[42px_1.3fr_100px_140px_110px_150px_110px_120px_160px_110px_150px] items-center border-b px-3 py-3 text-sm last:border-b-0">
                      <label className="flex items-center">
                        <Switch
                          checked={selectedRedeemCodeIDs.includes(code.id)}
                          onCheckedChange={(checked) => {
                            setSelectedRedeemCodeIDs((current) => (
                              checked ? [...current, code.id] : current.filter((id) => id !== code.id)
                            ))
                          }}
                        />
                      </label>
                      <div className="font-mono text-xs">{code.code}</div>
                      <div>{formatCurrency(code.amount, form.payment_currency_display_name)}</div>
                      <div>{code.group?.name || "-"}</div>
                      <div>{code.group_id ? formatDuration(code.group_duration_days, copy) : "-"}</div>
                      <div>{code.subscription_plan?.name || "-"}</div>
                      <div>{code.subscription_plan_id ? formatDuration(code.subscription_duration_days, copy) : "-"}</div>
                      <div>{code.used_count}/{code.max_uses}</div>
                      <div>{formatDateTime(code.expires_at)}</div>
                      <div>{redeemCodeStatusLabel(code, copy, t)}</div>
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" onClick={() => updateRedeemCode.mutate({ code, enabled: !code.enabled })}>
                          {code.enabled ? t("settings.disable") : t("settings.enable")}
                        </Button>
                        <Button variant="outline" size="sm" className="text-red-500 hover:text-red-600" onClick={() => deleteRedeemCode.mutate(code.id)}>
                          {t("common.delete")}
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
            <RedeemCodeDialog
              open={isRedeemDialogOpen}
              copy={copy}
              draft={redeemDraft}
              groups={groups}
              subscriptionPlans={subscriptionPlans}
              canSave={canCreateRedeemCode}
              isSaving={createRedeemCode.isPending}
              onDraftChange={setRedeemDraft}
              onClose={() => {
                setIsRedeemDialogOpen(false)
                setRedeemDraft(defaultRedeemDraft)
              }}
              onSave={() => createRedeemCode.mutate()}
            />
          </div>
        </SettingsPanel>
      )}
      </TabTransition>
      <PageInlineSlot slotKey="secondary" />
    </div>
  )
}

function systemTabs(copy: SystemCopy): Array<{ id: SystemTab; label: string; icon: LucideIcon }> {
  return [
    { id: "basic", label: copy.basic, icon: Globe2 },
    { id: "theme", label: copy.theme, icon: Palette },
    { id: "themeSettings", label: copy.themeSettings, icon: Pencil },
    { id: "billing", label: copy.billing, icon: HandCoins },
    { id: "payment", label: copy.paymentInterface, icon: CreditCard },
    { id: "checkIn", label: copy.checkInSettings, icon: CalendarCheck },
    { id: "security", label: copy.security, icon: ShieldCheck },
    { id: "redis", label: copy.redis, icon: Server },
    { id: "auth", label: copy.auth, icon: KeyRound },
    { id: "email", label: copy.email, icon: Mail },
    { id: "content", label: copy.content, icon: FileText },
    { id: "topNavigation", label: copy.topNavigation, icon: ToggleLeft },
    { id: "navigation", label: copy.navigation, icon: ToggleLeft },
    { id: "scheduledTasks", label: copy.scheduledTasks, icon: CalendarCheck },
    { id: "statusMonitor", label: copy.statusMonitor, icon: Activity },
    { id: "reliability", label: copy.reliability, icon: RefreshCw },
    { id: "logCleanup", label: copy.logCleanup, icon: Trash2 },
    { id: "nodes", label: copy.nodes, icon: Network },
    { id: "configuration", label: copy.configurationBackup, icon: Download },
    { id: "updates", label: copy.autoUpdate, icon: RefreshCw },
    { id: "groups", label: copy.groups, icon: Layers },
    { id: "metaModels", label: copy.metaModels, icon: Layers },
    { id: "advancedChatAssistant", label: copy.advancedChatAssistant, icon: Bot },
    { id: "advancedChatAttachments", label: copy.advancedChatAttachments, icon: Bot },
    { id: "advancedChatMCP", label: copy.advancedChatMCP, icon: Bot },
    { id: "subscriptionPlans", label: copy.subscriptionPlans, icon: HandCoins },
    { id: "redeemCodes", label: copy.redeemCodes, icon: Gift },
  ]
}

const zhOAuthProviderCopy = {
  title: "自定义 OAuth2 服务商",
  description: "可添加多个服务商；每个服务商都有独立登录入口和回调地址，并可配置端点与用户信息字段映射。",
  addProvider: "新增服务商",
  empty: "暂无自定义 OAuth2 服务商。",
  provider: "服务商",
  status: "状态",
  callbackURL: "回调地址",
  actions: "操作",
  enabled: "启用",
  disabled: "停用",
  callbackFallback: "设置系统 Base URL 或填写回调地址覆盖",
  edit: "编辑",
  delete: "删除",
  addTitle: "新增 OAuth2 服务商",
  editTitle: "编辑 OAuth2 服务商",
  enabledField: "启用",
  providerName: "服务商名称",
  providerKey: "服务商 Key",
  callbackOverride: "回调地址覆盖",
  issuer: "Issuer（OIDC 可选）",
  authEndpoint: "授权端点",
  tokenEndpoint: "Token 端点",
  userInfoEndpoint: "用户信息端点",
  subjectKey: "用户 ID 字段",
  emailKey: "邮箱字段",
  nameKey: "昵称字段",
  avatarKey: "头像字段",
  sensitiveValuePlaceholder: "已保存的值不会显示；留空保持不变",
  cancel: "取消",
  saveProvider: "保存服务商",
}

type OAuthProviderCopy = typeof zhOAuthProviderCopy

const enOAuthProviderCopy: OAuthProviderCopy = {
  title: "Custom OAuth2 Providers",
  description: "Add multiple providers with separate login and callback URLs, endpoints, and user profile field mappings.",
  addProvider: "Add provider",
  empty: "No custom OAuth2 providers.",
  provider: "Provider",
  status: "Status",
  callbackURL: "Callback URL",
  actions: "Actions",
  enabled: "Enabled",
  disabled: "Disabled",
  callbackFallback: "Set Base URL or override callback URL",
  edit: "Edit",
  delete: "Delete",
  addTitle: "Add OAuth2 Provider",
  editTitle: "Edit OAuth2 Provider",
  enabledField: "Enabled",
  providerName: "Provider name",
  providerKey: "Provider key",
  callbackOverride: "Callback URL override",
  issuer: "Issuer (OIDC optional)",
  authEndpoint: "Authorization endpoint",
  tokenEndpoint: "Token endpoint",
  userInfoEndpoint: "User info endpoint",
  subjectKey: "User ID key",
  emailKey: "Email key",
  nameKey: "Name key",
  avatarKey: "Avatar key",
  sensitiveValuePlaceholder: "Saved value is not shown. Leave empty to keep it.",
  cancel: "Cancel",
  saveProvider: "Save provider",
}

function OAuthProvidersEditor({ value, baseURL, onChange }: { value: string; baseURL: string; onChange: (value: string) => void }) {
  const { language } = useI18n()
  const oauthCopy = language === "zh" ? zhOAuthProviderCopy : enOAuthProviderCopy
  const providers = parseOAuthProviderConfigs(value)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [draft, setDraft] = useState<OAuthProviderConfig>(emptyOAuthProviderConfig)

  const openCreate = () => {
    setEditingIndex(null)
    setDraft({
      ...emptyOAuthProviderConfig(),
      key: uniqueOAuthProviderKey(providers),
      name: "OAuth",
    })
    setDialogOpen(true)
  }
  const openEdit = (index: number) => {
    setEditingIndex(index)
    setDraft({ ...providers[index] })
    setDialogOpen(true)
  }
  const saveDraft = () => {
    const normalizedDraft = {
      ...draft,
      key: normalizeOAuthProviderKey(draft.key),
      name: draft.name.trim() || draft.key.trim() || "OAuth",
    }
    const next = editingIndex === null
      ? [...providers, normalizedDraft]
      : providers.map((provider, index) => index === editingIndex ? normalizedDraft : provider)
    onChange(stringifyOAuthProviderConfigs(next))
    setDialogOpen(false)
  }
  const removeProvider = (index: number) => {
    onChange(stringifyOAuthProviderConfigs(providers.filter((_, providerIndex) => providerIndex !== index)))
  }

  return (
    <div className="mt-6 space-y-4 border-t pt-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SectionTitle title={oauthCopy.title} description={oauthCopy.description} />
        <Button type="button" className="gap-2" onClick={openCreate}>
          <Plus size={16} />
          {oauthCopy.addProvider}
        </Button>
      </div>
      {providers.length === 0 ? (
        <div className="rounded-md border bg-muted/30 p-4 text-sm text-muted-foreground">{oauthCopy.empty}</div>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <div className="min-w-[760px]">
            <div className="grid grid-cols-[1fr_140px_90px_1.4fr_170px] border-b bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground">
              <div>{oauthCopy.provider}</div>
              <div>Key</div>
              <div>{oauthCopy.status}</div>
              <div>{oauthCopy.callbackURL}</div>
              <div className="text-right">{oauthCopy.actions}</div>
            </div>
            {providers.map((provider, index) => {
              const callbackURL = oauthProviderCallbackURL(provider, baseURL)
              return (
                <div key={`${provider.key}-${index}`} className="grid grid-cols-[1fr_140px_90px_1.4fr_170px] items-center gap-3 border-b px-3 py-3 text-sm last:border-b-0">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{provider.name || provider.key || "OAuth"}</div>
                    <div className="truncate text-xs text-muted-foreground">{provider.auth_url || provider.issuer || "-"}</div>
                  </div>
                  <div className="font-mono text-xs">{provider.key || "-"}</div>
                  <div>{provider.enabled ? oauthCopy.enabled : oauthCopy.disabled}</div>
                  <div className="break-all font-mono text-xs text-muted-foreground">{callbackURL || oauthCopy.callbackFallback}</div>
                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => openEdit(index)}>
                      <Pencil size={15} />
                      {oauthCopy.edit}
                    </Button>
                    <Button type="button" variant="outline" size="sm" className="gap-2 text-destructive hover:text-destructive" onClick={() => removeProvider(index)}>
                      <Trash2 size={15} />
                      {oauthCopy.delete}
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
      <OAuthProviderDialog
        open={dialogOpen}
        baseURL={baseURL}
        draft={draft}
        title={editingIndex === null ? oauthCopy.addTitle : oauthCopy.editTitle}
        copy={oauthCopy}
        onDraftChange={setDraft}
        onClose={() => setDialogOpen(false)}
        onSave={saveDraft}
      />
    </div>
  )
}

function OAuthProviderDialog({
  open,
  title,
  draft,
  baseURL,
  copy,
  onDraftChange,
  onClose,
  onSave,
}: {
  open: boolean
  title: string
  draft: OAuthProviderConfig
  baseURL: string
  copy: OAuthProviderCopy
  onDraftChange: (draft: OAuthProviderConfig) => void
  onClose: () => void
  onSave: () => void
}) {
  const callbackURL = oauthProviderCallbackURL(draft, baseURL)
  const updateDraft = (patch: Partial<OAuthProviderConfig>) => onDraftChange({ ...draft, ...patch })

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-5">
          <div className="rounded-md border bg-muted/30 p-3">
            <div className="text-xs font-medium text-muted-foreground">{copy.callbackURL}</div>
            <div className="mt-1 break-all font-mono text-xs">{callbackURL || copy.callbackFallback}</div>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <ToggleField label={copy.enabledField} checked={draft.enabled} onChange={(checked) => updateDraft({ enabled: checked })} />
            <TextField label={copy.providerName} value={draft.name} placeholder="GitHub" onChange={(value) => updateDraft({ name: value })} />
            <TextField label={copy.providerKey} value={draft.key} placeholder="github" onChange={(value) => updateDraft({ key: normalizeOAuthProviderKey(value) })} />
            <TextField label={copy.callbackOverride} value={draft.redirect_url} placeholder={callbackURLFromBaseURL(baseURL, `/auth/oauth/${draft.key || "github"}/callback`)} onChange={(value) => updateDraft({ redirect_url: value })} />
            <TextField label="Client ID" value={draft.client_id} placeholder="client id" onChange={(value) => updateDraft({ client_id: value })} />
            <TextField label="Client Secret" value={draft.client_secret} placeholder={copy.sensitiveValuePlaceholder} type="password" onChange={(value) => updateDraft({ client_secret: value })} />
            <TextField label={copy.issuer} value={draft.issuer} placeholder="https://accounts.example.com" onChange={(value) => updateDraft({ issuer: value })} />
            <TextField label="Scope" value={draft.scope} placeholder="openid profile email" onChange={(value) => updateDraft({ scope: value })} />
            <TextField label={copy.authEndpoint} value={draft.auth_url} placeholder="https://provider.example.com/oauth/authorize" onChange={(value) => updateDraft({ auth_url: value })} />
            <TextField label={copy.tokenEndpoint} value={draft.token_url} placeholder="https://provider.example.com/oauth/token" onChange={(value) => updateDraft({ token_url: value })} />
            <TextField label={copy.userInfoEndpoint} value={draft.userinfo_url} placeholder="https://provider.example.com/userinfo" onChange={(value) => updateDraft({ userinfo_url: value })} />
            <TextField label={copy.subjectKey} value={draft.subject_key} placeholder="sub / id / data.id" onChange={(value) => updateDraft({ subject_key: value })} />
            <TextField label={copy.emailKey} value={draft.email_key} placeholder="email / data.email" onChange={(value) => updateDraft({ email_key: value })} />
            <TextField label={copy.nameKey} value={draft.name_key} placeholder="name / login / username" onChange={(value) => updateDraft({ name_key: value })} />
            <TextField label={copy.avatarKey} value={draft.avatar_key} placeholder="picture / avatar_url" onChange={(value) => updateDraft({ avatar_key: value })} />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>{copy.cancel}</Button>
          <Button type="button" onClick={onSave}>{copy.saveProvider}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function SettingsPanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

function SectionTitle({ title, description }: { title: string; description: string }) {
  return (
    <div>
      <h3 className="text-base font-semibold">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
    </div>
  )
}

function ThemeColorGroup({
  title,
  fields,
  form,
  onChange,
}: {
  title: string
  fields: ThemeColorField[]
  form: SystemSettings
  onChange: (key: ThemeColorFieldKey, value: string) => void
}) {
  return (
    <div className="rounded-md border p-4">
      <h3 className="text-base font-semibold">{title}</h3>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {fields.map((field) => (
          <ColorField
            key={field.key}
            label={field.label}
            value={form[field.key]}
            onChange={(value) => onChange(field.key, value)}
          />
        ))}
      </div>
    </div>
  )
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  const normalized = normalizeHexColor(value) || "#000000"
  return (
    <label className="block space-y-2 text-sm">
      <span className="font-medium">{label}</span>
      <div className="flex gap-2">
        <Input
          type="color"
          value={normalized}
          className="h-10 w-12 shrink-0 p-1"
          onChange={(event) => onChange(event.target.value)}
        />
        <Input
          value={value}
          placeholder="#000000"
          onChange={(event) => onChange(event.target.value)}
          onBlur={(event) => {
            const nextValue = normalizeHexColor(event.target.value)
            if (nextValue) {
              onChange(nextValue)
            }
          }}
        />
      </div>
    </label>
  )
}

function ThemePreview({ form, copy }: { form: SystemSettings; copy: SystemCopy }) {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <ThemePreviewCard
        title={copy.themeLightMode}
        background={form.theme_light_background}
        foreground={form.theme_light_foreground}
        card={form.theme_light_card}
        cardForeground={form.theme_light_card_foreground}
        primary={form.theme_light_primary}
        primaryForeground={form.theme_light_primary_foreground}
        secondary={form.theme_light_secondary}
        secondaryForeground={form.theme_light_secondary_foreground}
        accent={form.theme_light_accent}
        accentForeground={form.theme_light_accent_foreground}
        muted={form.theme_light_muted}
        mutedForeground={form.theme_light_muted_foreground}
        border={form.theme_light_border}
        copy={copy}
      />
      <ThemePreviewCard
        title={copy.themeDarkMode}
        background={form.theme_dark_background}
        foreground={form.theme_dark_foreground}
        card={form.theme_dark_card}
        cardForeground={form.theme_dark_card_foreground}
        primary={form.theme_dark_primary}
        primaryForeground={form.theme_dark_primary_foreground}
        secondary={form.theme_dark_secondary}
        secondaryForeground={form.theme_dark_secondary_foreground}
        accent={form.theme_dark_accent}
        accentForeground={form.theme_dark_accent_foreground}
        muted={form.theme_dark_muted}
        mutedForeground={form.theme_dark_muted_foreground}
        border={form.theme_dark_border}
        copy={copy}
      />
    </div>
  )
}

function ThemePreviewCard({
  title,
  background,
  foreground,
  card,
  cardForeground,
  primary,
  primaryForeground,
  secondary,
  secondaryForeground,
  accent,
  accentForeground,
  muted,
  mutedForeground,
  border,
  copy,
}: {
  title: string
  background: string
  foreground: string
  card: string
  cardForeground: string
  primary: string
  primaryForeground: string
  secondary: string
  secondaryForeground: string
  accent: string
  accentForeground: string
  muted: string
  mutedForeground: string
  border: string
  copy: SystemCopy
}) {
  const colors = {
    background: previewColor(background, "#ffffff"),
    foreground: previewColor(foreground, "#020817"),
    card: previewColor(card, "#ffffff"),
    cardForeground: previewColor(cardForeground, "#020817"),
    primary: previewColor(primary, "#0f172a"),
    primaryForeground: previewColor(primaryForeground, "#f8fafc"),
    secondary: previewColor(secondary, "#f1f5f9"),
    secondaryForeground: previewColor(secondaryForeground, "#0f172a"),
    accent: previewColor(accent, "#f1f5f9"),
    accentForeground: previewColor(accentForeground, "#0f172a"),
    muted: previewColor(muted, "#f1f5f9"),
    mutedForeground: previewColor(mutedForeground, "#64748b"),
    border: previewColor(border, "#e2e8f0"),
  }

  return (
    <div className="rounded-md border p-4" style={{ background: colors.background, color: colors.foreground, borderColor: colors.border }}>
      <div className="mb-3 text-sm font-semibold">{copy.themePreview}: {title}</div>
      <div className="rounded-md border p-4" style={{ background: colors.card, color: colors.cardForeground, borderColor: colors.border }}>
        <div className="text-base font-semibold">{copy.themePreviewTitle}</div>
        <p className="mt-2 text-sm" style={{ color: colors.mutedForeground }}>{copy.themePreviewText}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <span className="rounded-md px-3 py-2 text-sm font-medium" style={{ background: colors.primary, color: colors.primaryForeground }}>
            {copy.themePreviewAction}
          </span>
          <span className="rounded-md px-3 py-2 text-sm font-medium" style={{ background: colors.secondary, color: colors.secondaryForeground }}>
            {copy.themePreviewSecondaryAction}
          </span>
          <span className="rounded-md px-3 py-2 text-sm font-medium" style={{ background: colors.accent, color: colors.accentForeground }}>
            {copy.themePreviewAccent}
          </span>
        </div>
        <div className="mt-4 rounded-md px-3 py-2 text-sm" style={{ background: colors.muted, color: colors.mutedForeground }}>
          {copy.themePreviewMuted}
        </div>
      </div>
    </div>
  )
}

function previewColor(value: string, fallback: string) {
  return normalizeHexColor(value) || fallback
}

function themeColorFields(mode: "light" | "dark", copy: SystemCopy): ThemeColorField[] {
  const prefix = mode === "light" ? "theme_light" : "theme_dark"
  return [
    { key: `${prefix}_background` as ThemeColorFieldKey, label: copy.themeBackground },
    { key: `${prefix}_foreground` as ThemeColorFieldKey, label: copy.themeForeground },
    { key: `${prefix}_card` as ThemeColorFieldKey, label: copy.themeCard },
    { key: `${prefix}_card_foreground` as ThemeColorFieldKey, label: copy.themeCardForeground },
    { key: `${prefix}_primary` as ThemeColorFieldKey, label: copy.themePrimary },
    { key: `${prefix}_primary_foreground` as ThemeColorFieldKey, label: copy.themePrimaryForeground },
    { key: `${prefix}_secondary` as ThemeColorFieldKey, label: copy.themeSecondary },
    { key: `${prefix}_secondary_foreground` as ThemeColorFieldKey, label: copy.themeSecondaryForeground },
    { key: `${prefix}_accent` as ThemeColorFieldKey, label: copy.themeAccent },
    { key: `${prefix}_accent_foreground` as ThemeColorFieldKey, label: copy.themeAccentForeground },
    { key: `${prefix}_muted` as ThemeColorFieldKey, label: copy.themeMuted },
    { key: `${prefix}_muted_foreground` as ThemeColorFieldKey, label: copy.themeMutedForeground },
    { key: `${prefix}_border` as ThemeColorFieldKey, label: copy.themeBorder },
  ]
}

type EditablePaymentChannel = {
  id: string
  name: string
  provider: "yipay" | "openpayment" | "wechatpay" | "alipay" | "paypal" | "stripe"
  enabled: boolean
  methods: string[]
  currency?: string
  config: Record<string, string>
}

const paymentChannelConfigFields: Record<EditablePaymentChannel["provider"], Array<{ key: string; label: string; secret?: boolean; multiline?: boolean }>> = {
  yipay: [
    { key: "gateway_url", label: "提交地址" }, { key: "pid", label: "商户 PID" }, { key: "key", label: "商户密钥", secret: true }, { key: "notify_url", label: "通知地址（可选）" }, { key: "return_url", label: "回跳地址（可选）" },
  ],
  openpayment: [
    { key: "openpayment_base_url", label: "Base URL" }, { key: "openpayment_config_url", label: "发现配置地址" }, { key: "openpayment_merchant_id", label: "商户号" }, { key: "openpayment_key", label: "商户密钥", secret: true },
  ],
  wechatpay: [
    { key: "wechat_mch_id", label: "商户号" }, { key: "wechat_app_id", label: "AppID" }, { key: "wechat_serial_no", label: "商户证书序列号" }, { key: "wechat_api_v3_key", label: "API v3 密钥", secret: true }, { key: "wechat_private_key", label: "商户私钥 PEM", secret: true, multiline: true }, { key: "wechat_platform_certificate", label: "平台证书 / 公钥 PEM", secret: true, multiline: true },
  ],
  alipay: [
    { key: "alipay_app_id", label: "AppID" }, { key: "alipay_gateway_url", label: "网关地址" }, { key: "alipay_private_key", label: "应用私钥 PEM", secret: true, multiline: true }, { key: "alipay_public_key", label: "支付宝公钥 PEM", secret: true, multiline: true },
  ],
  paypal: [
    { key: "paypal_client_id", label: "Client ID" }, { key: "paypal_client_secret", label: "Client Secret", secret: true }, { key: "paypal_base_url", label: "API Base URL" }, { key: "paypal_webhook_id", label: "Webhook ID" },
  ],
  stripe: [
    { key: "stripe_secret_key", label: "Secret Key", secret: true }, { key: "stripe_webhook_secret", label: "Webhook Signing Secret", secret: true },
  ],
}

function PaymentChannelsEditor({ value, legacyChannel, copy, onChange }: { value: string; legacyChannel: EditablePaymentChannel; copy: SystemCopy; onChange: (value: string) => void }) {
  const channels = parsePaymentChannels(value)
  const update = (next: EditablePaymentChannel[]) => onChange(JSON.stringify(next))
  const [draft, setDraft] = useState<EditablePaymentChannel | null>(null)
  const editingIndex = draft ? channels.findIndex((channel) => channel.id === draft.id) : -1
  const openCreate = () => setDraft({ id: `channel-${Date.now()}`, name: "新支付通道", provider: "yipay", enabled: true, methods: ["alipay", "wxpay"], currency: "CNY", config: {} })
  const saveDraft = () => {
    if (!draft || !draft.id.trim() || !draft.name.trim()) return
    const nextChannel = { ...draft, methods: paymentChannelMethods(draft) }
    update(editingIndex >= 0 ? channels.map((channel, index) => index === editingIndex ? nextChannel : channel) : [...channels, nextChannel])
    setDraft(null)
  }
  const updateDraft = (patch: Partial<EditablePaymentChannel>) => setDraft((current) => current ? { ...current, ...patch } : current)
  const updateDraftConfig = (key: string, nextValue: string) => setDraft((current) => current ? { ...current, config: { ...current.config, [key]: nextValue } } : current)

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><div className="font-medium">支付渠道</div><div className="text-sm text-muted-foreground">可添加多个渠道；用户会先选择支付方式，再从支持该方式的渠道中选择。</div></div>
        <div className="flex gap-2"><Button type="button" size="sm" variant="outline" disabled={channels.length > 0} onClick={() => update([legacyChannel])}>迁移旧配置</Button><Button type="button" size="sm" onClick={openCreate}>添加渠道</Button></div>
      </div>
      {channels.length === 0 && <div className="text-sm text-muted-foreground">尚未添加渠道。可迁移现有默认配置，或直接添加新渠道；迁移后请保存系统设置。</div>}
      {channels.map((channel, index) => (
        <div key={channel.id || index} className="flex items-center justify-between gap-3 rounded-md border bg-muted/20 p-3">
          <div><div className="font-medium">{channel.name || `通道 ${index + 1}`}</div><div className="text-sm text-muted-foreground">{channel.provider} · {paymentChannelMethods(channel).join(", ") || "未设置支付方式"} · {channel.enabled ? "已启用" : "已停用"}</div></div>
          <div className="flex gap-2"><Button type="button" size="sm" variant="outline" onClick={() => setDraft({ ...channel, config: { ...channel.config }, methods: [...channel.methods] })}>编辑</Button><Button type="button" size="sm" variant="outline" onClick={() => update(channels.filter((_, current) => current !== index))}>删除</Button></div>
        </div>
      ))}
      <Dialog open={Boolean(draft)} onOpenChange={(open) => !open && setDraft(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl"><DialogHeader><DialogTitle>{editingIndex >= 0 ? "编辑支付渠道" : "添加支付渠道"}</DialogTitle></DialogHeader>
          {draft && <div className="grid gap-4 py-2 md:grid-cols-2">
            <TextField label="通道名称" value={draft.name} placeholder="如：支付宝官方" onChange={(nextValue) => updateDraft({ name: nextValue })} />
            <TextField label="通道 ID" value={draft.id} placeholder="alipay-official" onChange={(nextValue) => updateDraft({ id: nextValue })} />
            {usesCustomPaymentMethods(draft.provider) ? <TextField label="支持的支付方式" value={draft.methods.join(",")} placeholder="alipay,wxpay" onChange={(nextValue) => updateDraft({ methods: nextValue.split(",").map((item) => item.trim()).filter(Boolean) })} /> : <div className="grid gap-2 text-sm"><span className="font-medium">支付方式</span><div className="flex h-10 items-center rounded-md border bg-muted/40 px-3">{paymentChannelMethods(draft).join(", ")}</div></div>}
            <TextField label="结算币种" value={draft.currency || ""} placeholder="CNY / USD" onChange={(nextValue) => updateDraft({ currency: nextValue.toUpperCase() })} />
            <label className="grid gap-2 text-sm"><span className="font-medium">渠道类型</span><Select value={draft.provider} onValueChange={(nextValue) => updateDraft({ provider: nextValue as EditablePaymentChannel["provider"] })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="yipay">易支付 / EPay</SelectItem><SelectItem value="openpayment">OpenPayment</SelectItem><SelectItem value="wechatpay">微信支付官方</SelectItem><SelectItem value="alipay">支付宝官方</SelectItem><SelectItem value="paypal">PayPal</SelectItem><SelectItem value="stripe">Stripe</SelectItem></SelectContent></Select></label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.enabled} onChange={(event) => updateDraft({ enabled: event.target.checked })} /> 启用此通道</label>
            <div className="md:col-span-2 grid gap-3 md:grid-cols-2">{paymentChannelConfigFields[draft.provider].map((field) => field.multiline ? <TextareaField key={field.key} label={field.label} value={draft.config[field.key] || ""} placeholder={field.secret ? copy.sensitiveValuePlaceholder : ""} onChange={(nextValue) => updateDraftConfig(field.key, nextValue)} /> : <TextField key={field.key} label={field.label} value={draft.config[field.key] || ""} placeholder={field.secret ? copy.sensitiveValuePlaceholder : ""} type={field.secret ? "password" : "text"} onChange={(nextValue) => updateDraftConfig(field.key, nextValue)} />)}</div>
          </div>}
          <DialogFooter><Button type="button" variant="outline" onClick={() => setDraft(null)}>取消</Button><Button type="button" onClick={saveDraft} disabled={!draft?.id.trim() || !draft?.name.trim()}>保存渠道</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function parsePaymentChannels(raw: string): EditablePaymentChannel[] {
  try {
    const parsed = JSON.parse(raw || "[]")
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is EditablePaymentChannel => item && typeof item === "object").map((item) => {
      const provider = isPaymentChannelProvider(item.provider) ? item.provider : "yipay"
      const channel: EditablePaymentChannel = { id: String(item.id || ""), name: String(item.name || ""), provider, enabled: item.enabled !== false, methods: Array.isArray(item.methods) ? item.methods.map(String).filter(Boolean) : [], currency: typeof item.currency === "string" ? item.currency : undefined, config: item.config && typeof item.config === "object" ? Object.fromEntries(Object.entries(item.config).map(([key, fieldValue]) => [key, String(fieldValue)])) : {} }
      return { ...channel, methods: paymentChannelMethods(channel) }
    })
  } catch { return [] }
}

function legacyPaymentChannel(settings: SystemSettings): EditablePaymentChannel {
  const provider = isPaymentChannelProvider(settings.payment_gateway_provider) ? settings.payment_gateway_provider : "yipay"
  return {
    id: `legacy-${provider}`,
    name: `已迁移的${provider === "yipay" ? "易支付" : provider}渠道`,
    provider,
    enabled: true,
    methods: parseLegacyPaymentMethods(settings.payment_methods),
    currency: settings.payment_official_currency,
    config: {
      gateway_url: settings.payment_yipay_gateway_url,
      pid: settings.payment_yipay_pid,
      key: settings.payment_yipay_key,
      notify_url: settings.payment_yipay_notify_url,
      return_url: settings.payment_yipay_return_url,
      openpayment_base_url: settings.payment_openpayment_base_url,
      openpayment_config_url: settings.payment_openpayment_config_url,
      openpayment_merchant_id: settings.payment_openpayment_merchant_id,
      openpayment_key: settings.payment_openpayment_key,
      wechat_mch_id: settings.payment_wechat_mch_id,
      wechat_app_id: settings.payment_wechat_app_id,
      wechat_serial_no: settings.payment_wechat_serial_no,
      wechat_private_key: settings.payment_wechat_private_key,
      wechat_platform_certificate: settings.payment_wechat_platform_certificate,
      wechat_api_v3_key: settings.payment_wechat_api_v3_key,
      alipay_app_id: settings.payment_alipay_app_id,
      alipay_private_key: settings.payment_alipay_private_key,
      alipay_public_key: settings.payment_alipay_public_key,
      alipay_gateway_url: settings.payment_alipay_gateway_url,
      paypal_client_id: settings.payment_paypal_client_id,
      paypal_client_secret: settings.payment_paypal_client_secret,
      paypal_base_url: settings.payment_paypal_base_url,
      paypal_webhook_id: settings.payment_paypal_webhook_id,
      stripe_secret_key: settings.payment_stripe_secret_key,
      stripe_webhook_secret: settings.payment_stripe_webhook_secret,
    },
  }
}

function parseLegacyPaymentMethods(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw || "[]")
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : []
  } catch {
    return raw.split(",").map((item) => item.trim()).filter(Boolean)
  }
}

function usesCustomPaymentMethods(provider: EditablePaymentChannel["provider"]) {
  return provider === "yipay" || provider === "openpayment"
}

function paymentChannelMethods(channel: EditablePaymentChannel): string[] {
  return usesCustomPaymentMethods(channel.provider) ? channel.methods : [channel.provider]
}

function isPaymentChannelProvider(value: unknown): value is EditablePaymentChannel["provider"] {
  return value === "yipay" || value === "openpayment" || value === "wechatpay" || value === "alipay" || value === "paypal" || value === "stripe"
}

function TextField({
  label,
  value,
  placeholder,
  type = "text",
  onChange,
}: {
  label: string
  value: string
  placeholder?: string
  type?: string
  onChange: (value: string) => void
}) {
  return (
    <label className="block space-y-2 text-sm">
      <span className="font-medium">{label}</span>
      <Input type={type} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
    </label>
  )
}

function TextareaField({
  label,
  value,
  placeholder,
  help,
  onChange,
}: {
  label: string
  value: string
  placeholder: string
  help?: string
  onChange: (value: string) => void
}) {
  return (
    <label className="block space-y-2 text-sm">
      <span className="font-medium">{label}</span>
      <Textarea
        value={value}
        placeholder={placeholder}
        className="min-h-32 font-mono"
        onChange={(event) => onChange(event.target.value)}
      />
      {help && <p className="text-xs leading-5 text-muted-foreground">{help}</p>}
    </label>
  )
}

function ToggleField({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <label className="flex items-center justify-between gap-4 rounded-md border p-3 text-sm">
      <span className="font-medium">{label}</span>
      <Switch checked={checked} className="h-4 w-4 border-input" onCheckedChange={(checked) => onChange(checked)} />
    </label>
  )
}

function AnnouncementDialog({
  open,
  copy,
  draft,
  canSave,
  isSaving,
  onDraftChange,
  onClose,
  onSave,
}: {
  open: boolean
  copy: SystemCopy
  draft: AnnouncementDraft
  canSave: boolean
  isSaving: boolean
  onDraftChange: (draft: AnnouncementDraft) => void
  onClose: () => void
  onSave: () => void
}) {
  const { t } = useI18n()
  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{draft.id ? copy.updateAnnouncement : copy.createAnnouncement}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <TextField
            label={copy.announcementTitle}
            value={draft.title}
            placeholder={copy.announcementTitlePlaceholder}
            onChange={(value) => onDraftChange({ ...draft, title: value })}
          />
          <TextareaField
            label={copy.announcementContent}
            value={draft.content}
            placeholder={copy.announcementContentPlaceholder}
            onChange={(value) => onDraftChange({ ...draft, content: value })}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField
              label={copy.sortOrder}
              value={draft.sort_order}
              placeholder="0"
              type="number"
              onChange={(value) => onDraftChange({ ...draft, sort_order: value })}
            />
            <label className="flex h-10 items-center gap-2 self-end text-sm">
              <Switch checked={draft.enabled} onCheckedChange={(checked) => onDraftChange({ ...draft, enabled: checked })} />
              {copy.enabled}
            </label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
          <Button disabled={!canSave || isSaving} onClick={onSave}>
            {draft.id ? copy.updateAnnouncement : copy.createAnnouncement}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function StatusMonitorDialog({
  open,
  copy,
  draft,
  canSave,
  isSaving,
  onDraftChange,
  onClose,
  onSave,
}: {
  open: boolean
  copy: SystemCopy
  draft: StatusMonitorDraft
  canSave: boolean
  isSaving: boolean
  onDraftChange: (draft: StatusMonitorDraft) => void
  onClose: () => void
  onSave: () => void
}) {
  const { t } = useI18n()
  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{draft.id ? copy.updateStatusMonitor : copy.createStatusMonitor}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 md:grid-cols-2">
          <TextField
            label={copy.monitorName}
            value={draft.name}
            placeholder={copy.monitorNamePlaceholder}
            onChange={(value) => onDraftChange({ ...draft, name: value })}
          />
          <TextField
            label={copy.monitorTarget}
            value={draft.target_url}
            placeholder={copy.monitorTargetPlaceholder}
            onChange={(value) => onDraftChange({ ...draft, target_url: value })}
          />
          <label className="block space-y-2 text-sm">
            <span className="font-medium">{copy.checkType}</span>
            <Select value={String((draft.check_type) || "__shadcn_empty__")} onValueChange={(value) => onDraftChange({ ...draft, check_type: (value === "__shadcn_empty__" ? "" : value) })}><SelectTrigger className="h-10 w-full rounded-2xl border border-border bg-background px-3 text-sm"><SelectValue /></SelectTrigger><SelectContent>
              <SelectItem value="http">{copy.checkTypeHTTP}</SelectItem>
              <SelectItem value="tcp">{copy.checkTypeTCP}</SelectItem>
            </SelectContent></Select>
          </label>
          <label className="block space-y-2 text-sm">
            <span className="font-medium">{copy.httpMethod}</span>
            <Select value={String((draft.method) || "__shadcn_empty__")} onValueChange={(value) => onDraftChange({ ...draft, method: (value === "__shadcn_empty__" ? "" : value) })}><SelectTrigger className="h-10 w-full rounded-2xl border border-border bg-background px-3 text-sm"><SelectValue /></SelectTrigger><SelectContent>
              <SelectItem value="GET">GET</SelectItem>
              <SelectItem value="HEAD">HEAD</SelectItem>
            </SelectContent></Select>
          </label>
          <TextField
            label={copy.checkInterval}
            value={draft.interval_seconds}
            placeholder={copy.checkIntervalPlaceholder}
            type="number"
            onChange={(value) => onDraftChange({ ...draft, interval_seconds: value })}
          />
          <TextField
            label={copy.retention}
            value={draft.retention_hours}
            placeholder={copy.retentionPlaceholder}
            type="number"
            onChange={(value) => onDraftChange({ ...draft, retention_hours: value })}
          />
          <label className="flex h-10 items-center gap-2 text-sm">
            <Switch checked={draft.enabled} onCheckedChange={(checked) => onDraftChange({ ...draft, enabled: checked })} />
            {copy.enabled}
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
          <Button disabled={!canSave || isSaving} onClick={onSave}>
            {draft.id ? copy.updateStatusMonitor : copy.createStatusMonitor}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function GroupDialog({
  open,
  copy,
  draft,
  isSaving,
  onDraftChange,
  onClose,
  onSave,
}: {
  open: boolean
  copy: SystemCopy
  draft: GroupDraft
  isSaving: boolean
  onDraftChange: (draft: GroupDraft) => void
  onClose: () => void
  onSave: () => void
}) {
  const { t } = useI18n()
  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{draft.id ? copy.updateGroup : copy.createGroup}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <TextField
            label={copy.groupName}
            value={draft.name}
            placeholder={copy.groupNamePlaceholder}
            onChange={(value) => onDraftChange({ ...draft, name: value })}
          />
          <TextField
            label={copy.groupMultiplier}
            value={draft.multiplier}
            placeholder={copy.groupMultiplierPlaceholder}
            type="number"
            onChange={(value) => onDraftChange({ ...draft, multiplier: value })}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
          <Button disabled={!draft.name.trim() || isSaving} onClick={onSave}>
            {draft.id ? copy.updateGroup : copy.createGroup}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function RedeemCodeDialog({
  open,
  copy,
  draft,
  groups,
  subscriptionPlans,
  canSave,
  isSaving,
  onDraftChange,
  onClose,
  onSave,
}: {
  open: boolean
  copy: SystemCopy
  draft: RedeemCodeDraft
  groups: Group[]
  subscriptionPlans: SubscriptionPlan[]
  canSave: boolean
  isSaving: boolean
  onDraftChange: (draft: RedeemCodeDraft) => void
  onClose: () => void
  onSave: () => void
}) {
  const { t } = useI18n()
  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{copy.createRedeemCode}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 md:grid-cols-2">
          <TextField
            label={copy.redeemCode}
            value={draft.code}
            placeholder={copy.redeemCodePlaceholder}
            onChange={(value) => onDraftChange({ ...draft, code: value })}
          />
          <TextField
            label={copy.amount}
            value={draft.amount}
            placeholder={copy.redeemAmountPlaceholder}
            type="number"
            onChange={(value) => onDraftChange({ ...draft, amount: value })}
          />
          <TextField
            label={copy.usage}
            value={draft.max_uses}
            placeholder={copy.redeemMaxUsesPlaceholder}
            type="number"
            onChange={(value) => onDraftChange({ ...draft, max_uses: value })}
          />
          <label className="block space-y-2 text-sm">
            <span className="font-medium">{copy.expiresAt}</span>
            <DateTimePicker value={draft.expires_at} onValueChange={(value) => onDraftChange({ ...draft, expires_at: value })} />
          </label>
          <label className="block space-y-2 text-sm">
            <span className="font-medium">{copy.groupGrant}</span>
            <Select value={String((draft.group_id) || "__shadcn_empty__")} onValueChange={(value) => onDraftChange({ ...draft, group_id: (value === "__shadcn_empty__" ? "" : value) })}><SelectTrigger className="h-10 w-full rounded-2xl border border-border bg-background px-3 text-sm"><SelectValue /></SelectTrigger><SelectContent>
              <SelectItem value="__shadcn_empty__">{copy.noGroupGrant}</SelectItem>
              {groups.map((group) => (
                <SelectItem key={group.id} value={String(group.id)}>{group.name}</SelectItem>
              ))}
            </SelectContent></Select>
          </label>
          <TextField
            label={copy.groupDuration}
            value={draft.group_duration_days}
            placeholder={copy.groupDurationPlaceholder}
            type="number"
            onChange={(value) => onDraftChange({ ...draft, group_duration_days: value })}
          />
          <label className="block space-y-2 text-sm">
            <span className="font-medium">{copy.subscriptionPlan}</span>
            <Select value={String((draft.subscription_plan_id) || "__shadcn_empty__")} onValueChange={(value) => onDraftChange({ ...draft, subscription_plan_id: (value === "__shadcn_empty__" ? "" : value) })}><SelectTrigger className="h-10 w-full rounded-2xl border border-border bg-background px-3 text-sm"><SelectValue /></SelectTrigger><SelectContent>
              <SelectItem value="__shadcn_empty__">{copy.noSubscriptionPlan}</SelectItem>
              {subscriptionPlans.filter((plan) => plan.enabled).map((plan) => (
                <SelectItem key={plan.id} value={String(plan.id)}>{plan.name}</SelectItem>
              ))}
            </SelectContent></Select>
          </label>
          <TextField
            label={copy.subscriptionDuration}
            value={draft.subscription_duration_days}
            placeholder={copy.subscriptionDurationPlaceholder}
            type="number"
            onChange={(value) => onDraftChange({ ...draft, subscription_duration_days: value })}
          />
          <label className="flex h-10 items-center gap-2 text-sm">
            <Switch checked={draft.allow_stacking} onCheckedChange={(checked) => onDraftChange({ ...draft, allow_stacking: checked })} />
            {copy.allowStacking}
          </label>
          <label className="flex h-10 items-center gap-2 text-sm">
            <Switch checked={draft.enabled} onCheckedChange={(checked) => onDraftChange({ ...draft, enabled: checked })} />
            {copy.enabled}
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
          <Button disabled={!canSave || isSaving} onClick={onSave}>{copy.createRedeemCode}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function SubscriptionPlanDialog({
  open,
  copy,
  draft,
  canSave,
  isSaving,
  onDraftChange,
  onClose,
  onSave,
}: {
  open: boolean
  copy: SystemCopy
  draft: SubscriptionPlanDraft
  canSave: boolean
  isSaving: boolean
  onDraftChange: (draft: SubscriptionPlanDraft) => void
  onClose: () => void
  onSave: () => void
}) {
  const { t } = useI18n()
  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{draft.id ? copy.updateSubscriptionPlan : copy.createSubscriptionPlan}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <TextField
            label={copy.planName}
            value={draft.name}
            placeholder={copy.planNamePlaceholder}
            onChange={(value) => onDraftChange({ ...draft, name: value })}
          />
          <TextField
            label={copy.resetAmount}
            value={draft.reset_amount}
            placeholder={copy.resetAmountPlaceholder}
            type="number"
            onChange={(value) => onDraftChange({ ...draft, reset_amount: value })}
          />
          <TextField
            label={copy.resetInterval}
            value={draft.reset_interval_days}
            placeholder={copy.resetIntervalPlaceholder}
            type="number"
            onChange={(value) => onDraftChange({ ...draft, reset_interval_days: value })}
          />
          <label className="flex h-10 items-center gap-2 text-sm">
            <Switch checked={draft.purchasable} onCheckedChange={(checked) => onDraftChange({ ...draft, purchasable: checked })} />
            {copy.planPurchasable}
          </label>
          {draft.purchasable && (
            <>
              <TextField
                label={copy.planPrice}
                value={draft.price}
                placeholder={copy.planPricePlaceholder}
                type="number"
                onChange={(value) => onDraftChange({ ...draft, price: value })}
              />
              <TextField
                label={copy.planDuration}
                value={draft.duration_days}
                placeholder={copy.planDurationPlaceholder}
                type="number"
                onChange={(value) => onDraftChange({ ...draft, duration_days: value })}
              />
            </>
          )}
          <label className="flex h-10 items-center gap-2 text-sm">
            <Switch checked={draft.enabled} onCheckedChange={(checked) => onDraftChange({ ...draft, enabled: checked })} />
            {copy.enabled}
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
          <Button disabled={!canSave || isSaving} onClick={onSave}>{draft.id ? copy.updateSubscriptionPlan : copy.createSubscriptionPlan}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function MetaModelDialog({
  open,
  copy,
  draft,
  canSave,
  isSaving,
  isValidating,
  onDraftChange,
  onClose,
  onValidate,
  onSave,
}: {
  open: boolean
  copy: SystemCopy
  draft: MetaModelDraft
  canSave: boolean
  isSaving: boolean
  isValidating: boolean
  onDraftChange: (draft: MetaModelDraft) => void
  onClose: () => void
  onValidate: () => void
  onSave: () => void
}) {
  const { language, t } = useI18n()
  const templates = metaModelLanguageTemplates(language)
  const reference = metaModelLanguageReference(language)
  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{draft.id ? copy.updateMetaModel : copy.createMetaModel}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-3 md:grid-cols-2">
            <TextField label={copy.metaModelName} value={draft.name} placeholder={copy.metaModelNamePlaceholder} onChange={(value) => onDraftChange({ ...draft, name: value })} />
            <label className="block space-y-2 text-sm">
              <span className="font-medium">{copy.billingMode}</span>
              <Select value={String((draft.billing_mode) || "__shadcn_empty__")} onValueChange={(value) => {
                  const billingMode = (value === "__shadcn_empty__" ? "" : value)
                  onDraftChange({
                    ...draft,
                    billing_mode: billingMode,
                    input_price: billingMode === "meta" ? draft.input_price : "0",
                    output_price: billingMode === "meta" ? draft.output_price : "0",
                    cached_input_price: billingMode === "meta" ? draft.cached_input_price : "0",
                  })
                }}><SelectTrigger className="h-10 w-full rounded-2xl border border-border bg-background px-3 text-sm"><SelectValue /></SelectTrigger><SelectContent>
                <SelectItem value="actual">{copy.billingModeActual}</SelectItem>
                <SelectItem value="meta">{copy.billingModeMeta}</SelectItem>
              </SelectContent></Select>
            </label>
          </div>
          <TextField label={copy.description} value={draft.description} placeholder={copy.metaModelDescriptionPlaceholder} onChange={(value) => onDraftChange({ ...draft, description: value })} />
          <div className="space-y-3 rounded-md border bg-muted/30 p-3">
            <div>
              <div className="text-sm font-medium">{copy.metaModelPublicDisplay}</div>
              <div className="text-xs text-muted-foreground">{copy.metaModelPublicDisplayHelp}</div>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <TextField label={copy.metaModelProviderID} value={draft.provider} placeholder="openai" onChange={(value) => onDraftChange({ ...draft, provider: value })} />
              <TextField label={copy.metaModelProviderName} value={draft.provider_name} placeholder="OpenAI" onChange={(value) => onDraftChange({ ...draft, provider_name: value })} />
              <TextField label={copy.metaModelProviderIconURL} value={draft.provider_icon_url} placeholder="https://example.com/icon.png" onChange={(value) => onDraftChange({ ...draft, provider_icon_url: value })} />
            </div>
            <label className="flex items-start gap-2 text-sm">
              <Switch
                className="mt-1"
                checked={draft.expose_referenced_models}
                onCheckedChange={(checked) => onDraftChange({ ...draft, expose_referenced_models: checked })}
              />
              <span>
                <span className="block font-medium">{copy.metaModelExposeReferencedModels}</span>
                <span className="block text-xs leading-5 text-muted-foreground">{copy.metaModelExposeReferencedModelsHelp}</span>
              </span>
            </label>
          </div>
          {draft.billing_mode === "meta" && (
            <div className="grid gap-3 md:grid-cols-3">
              <TextField label={copy.inputPrice} value={draft.input_price} placeholder="0" type="number" onChange={(value) => onDraftChange({ ...draft, input_price: value })} />
              <TextField label={copy.outputPrice} value={draft.output_price} placeholder="0" type="number" onChange={(value) => onDraftChange({ ...draft, output_price: value })} />
              <TextField label={copy.cachedInputPrice} value={draft.cached_input_price} placeholder="0" type="number" onChange={(value) => onDraftChange({ ...draft, cached_input_price: value })} />
            </div>
          )}
          <div className="rounded-md border bg-muted/30 p-3">
            <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm font-medium">{language === "zh" ? "语言模板" : "Language templates"}</div>
              <div className="text-xs text-muted-foreground">{language === "zh" ? "点按会替换当前 DSL 内容" : "Clicking replaces the current DSL content"}</div>
            </div>
            <div className="flex flex-wrap gap-2">
              {templates.map((template) => (
                <Button
                  key={template.label}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => onDraftChange({ ...draft, dsl: template.dsl })}
                >
                  {template.label}
                </Button>
              ))}
            </div>
          </div>
          <TextareaField label={copy.metaModelDSL} value={draft.dsl} placeholder={copy.metaModelDSLPlaceholder} help={copy.metaModelDSLHelp} onChange={(value) => onDraftChange({ ...draft, dsl: value })} />
          <div className="grid gap-3 rounded-md border bg-muted/30 p-3 text-xs leading-5 text-muted-foreground md:grid-cols-3">
            {reference.map((section) => (
              <div key={section.title}>
                <div className="mb-1 font-medium text-foreground">{section.title}</div>
                <div className="whitespace-pre-wrap font-mono">{section.body}</div>
              </div>
            ))}
          </div>
          <label className="flex h-10 items-center gap-2 text-sm">
            <Switch checked={draft.enabled} onCheckedChange={(checked) => onDraftChange({ ...draft, enabled: checked })} />
            {copy.enabled}
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
          <Button variant="outline" disabled={!canSave || isValidating} onClick={onValidate}>{copy.validateMetaModel}</Button>
          <Button disabled={!canSave || isSaving} onClick={onSave}>{draft.id ? copy.updateMetaModel : copy.createMetaModel}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function metaModelLanguageTemplates(language: string) {
  const zh = language === "zh"
  return [
    {
      label: zh ? "按上下文长度" : "By context length",
      dsl: `route {
  when request.input_tokens <= 2000 => call "your-small-model"
  when request.input_tokens <= 16000 => call "your-balanced-model"
  otherwise => call "your-large-context-model"
}`,
    },
    {
      label: zh ? "按内容类型" : "By content type",
      dsl: `route {
  when request.has_image == true => call "your-vision-model"
  when request.has_audio == true => call "your-audio-model"
  when request.has_tools == true => call "your-tool-model"
  otherwise => call "your-chat-model"
}`,
    },
    {
      label: zh ? "按文本关键词" : "By text keyword",
      dsl: `route {
  when request.last_user_message matches "(?i)(code|debug|error)" => call "your-coding-model"
  when request.text contains "translate" => call "your-fast-model"
  otherwise => call "your-default-model"
}`,
    },
    {
      label: zh ? "按用户额度" : "By user quota",
      dsl: `route {
  when api_key.quota_remaining > 0 => call "your-premium-model"
  when user.balance < 1 => call "your-economy-model"
  otherwise => call "your-balanced-model"
}`,
    },
    {
      label: zh ? "概率切换" : "Probabilistic switch",
      dsl: `switch {
  weight 80 => call "your-fast-model"
  weight 20 => call "your-strong-model"
}`,
    },
  ]
}

function metaModelLanguageReference(language: string) {
  if (language === "zh") {
    return [
      {
        title: "动作",
        body: `call "model"
route { when 条件 => 动作 otherwise => 动作 }
switch { weight 80 => 动作 weight 20 => 动作 }`,
      },
      {
        title: "操作符",
        body: `== != < <= > >=
contains not_contains
starts_with ends_with
matches`,
      },
      {
        title: "常用变量",
        body: `request.input_tokens
request.text
request.last_user_message
request.has_image / has_audio / has_tools
request.stream / temperature
user.balance / user.group
api_key.quota_remaining`,
      },
    ]
  }
  return [
    {
      title: "Actions",
      body: `call "model"
route { when condition => action otherwise => action }
switch { weight 80 => action weight 20 => action }`,
    },
    {
      title: "Operators",
      body: `== != < <= > >=
contains not_contains
starts_with ends_with
matches`,
    },
    {
      title: "Variables",
      body: `request.input_tokens
request.text
request.last_user_message
request.has_image / has_audio / has_tools
request.stream / temperature
user.balance / user.group
api_key.quota_remaining`,
    },
  ]
}

function parseTopNavRows(raw: string): NavRow[] {
  return parseTopNavItems(raw).map((item, index) => ({
    id: navRowID(index),
    label: item.label,
    href: item.href,
  }))
}

function serializeTopNavRows(rows: NavRow[]) {
  return rows
    .map((row) => ({ label: row.label.trim(), href: row.href.trim() }))
    .filter((row) => row.label && row.href)
    .map((row) => `${row.label}|${row.href}`)
    .join("\n")
}

function navRowID(index: number) {
  return `${Date.now().toString(36)}-${index}-${Math.random().toString(36).slice(2, 8)}`
}

function EmailSuffixRoutingEditor({ value, groups, onChange }: { value: string; groups: Group[]; onChange: (value: string) => void }) {
  const rules = (() => { try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed.filter((item): item is { suffix: string; group_id: number } => Boolean(item && typeof item.suffix === "string" && Number(item.group_id) > 0)) : [] } catch { return [] } })()
  // Preserve incomplete rows while the administrator is editing. The backend
  // safely ignores incomplete mappings at registration time.
  const setRules = (next: Array<{ suffix: string; group_id: number }>) => onChange(JSON.stringify(next))
  return <div className="space-y-2 rounded-md border p-3 lg:col-span-2"><div><div className="font-medium text-sm">邮箱后缀自动分组</div><p className="mt-1 text-xs text-muted-foreground">用户注册时，匹配的邮箱后缀会自动加入对应用户分组。</p></div>{rules.map((rule, index) => <div key={`${rule.suffix}-${index}`} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"><Input value={rule.suffix} placeholder="company.cn" onChange={(event) => setRules(rules.map((item, itemIndex) => itemIndex === index ? { ...item, suffix: event.target.value.replace(/^@/, "") } : item))} /><Select value={String((rule.group_id) || "__shadcn_empty__")} onValueChange={(value) => setRules(rules.map((item, itemIndex) => itemIndex === index ? { ...item, group_id: Number((value === "__shadcn_empty__" ? "" : value)) } : item))}><SelectTrigger className="h-10 rounded-2xl border border-border bg-background px-3 text-sm"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="0">选择分组</SelectItem>{groups.map((group) => <SelectItem key={group.id} value={String(group.id)}>{group.name}</SelectItem>)}</SelectContent></Select><Button type="button" variant="outline" onClick={() => setRules(rules.filter((_, itemIndex) => itemIndex !== index))}>删除</Button></div>)}<Button type="button" size="sm" variant="outline" disabled={!groups.length} onClick={() => setRules([...rules, { suffix: "", group_id: groups[0]?.id || 0 }])}>添加映射</Button>{!groups.length && <p className="text-xs text-muted-foreground">请先在“用户分组”中创建分组。</p>}</div>
}

function groupPayload(draft: GroupDraft) {
  return {
    name: draft.name.trim(),
    multiplier: Number(draft.multiplier || 1),
  }
}

function statusMonitorPayload(draft: StatusMonitorDraft) {
  return {
    name: draft.name.trim(),
    target_url: draft.target_url.trim(),
    check_type: draft.check_type,
    method: draft.method,
    interval_seconds: Number(draft.interval_seconds || 60),
    retention_hours: Number(draft.retention_hours || 168),
    enabled: draft.enabled,
  }
}

function statusMonitorToDraft(monitor: StatusMonitor): StatusMonitorDraft {
  return {
    id: monitor.id,
    name: monitor.name,
    target_url: monitor.target_url,
    check_type: monitor.check_type || "http",
    method: monitor.method || "GET",
    interval_seconds: String(monitor.interval_seconds || 60),
    retention_hours: String(monitor.retention_hours || 168),
    enabled: monitor.enabled,
  }
}

function redeemCodePayload(draft: RedeemCodeDraft) {
  return {
    code: draft.code.trim(),
    amount: Number(draft.amount || 0),
    group_id: Number(draft.group_id || 0) || null,
    group_duration_days: Number(draft.group_duration_days || 0),
    subscription_plan_id: Number(draft.subscription_plan_id || 0) || null,
    subscription_duration_days: Number(draft.subscription_duration_days || 0),
    allow_stacking: draft.allow_stacking,
    max_uses: Number(draft.max_uses || 1),
    enabled: draft.enabled,
    expires_at: draft.expires_at,
  }
}

function announcementPayload(draft: AnnouncementDraft) {
  return {
    title: draft.title.trim(),
    content: draft.content.trim(),
    enabled: draft.enabled,
    sort_order: Number(draft.sort_order || 0),
  }
}

function formatNodeTimestamp(value: string) {
  if (!value) {
    return "-"
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }
  return date.toLocaleString()
}

function subscriptionPlanPayload(draft: SubscriptionPlanDraft) {
  return {
    name: draft.name.trim(),
    reset_amount: Number(draft.reset_amount || 0),
    reset_interval_days: Number(draft.reset_interval_days || 0),
    price: Number(draft.price || 0),
    duration_days: Number(draft.duration_days || 0),
    purchasable: draft.purchasable,
    enabled: draft.enabled,
  }
}

function metaModelPayload(draft: MetaModelDraft) {
  const isMetaBilling = draft.billing_mode === "meta"
  return {
    name: draft.name.trim(),
    description: draft.description.trim(),
    dsl: draft.dsl.trim(),
    provider: draft.provider.trim() || "meta",
    provider_name: draft.provider_name.trim() || "Meta Module",
    provider_icon_url: draft.provider_icon_url.trim(),
    expose_referenced_models: draft.expose_referenced_models,
    billing_mode: draft.billing_mode,
    input_price: isMetaBilling ? Number(draft.input_price || 0) : 0,
    output_price: isMetaBilling ? Number(draft.output_price || 0) : 0,
    cached_input_price: isMetaBilling ? Number(draft.cached_input_price || 0) : 0,
    enabled: draft.enabled,
  }
}

function metaModelToDraft(item: MetaModel): MetaModelDraft {
  return {
    id: item.id,
    name: item.name,
    description: item.description || "",
    dsl: item.dsl || "",
    provider: item.provider || "meta",
    provider_name: item.provider_name || "Meta Module",
    provider_icon_url: item.provider_icon_url || "",
    expose_referenced_models: item.expose_referenced_models ?? true,
    billing_mode: item.billing_mode || "actual",
    input_price: String(item.input_price ?? 0),
    output_price: String(item.output_price ?? 0),
    cached_input_price: String(item.cached_input_price ?? 0),
    enabled: item.enabled,
  }
}

function metaBillingModeLabel(value: string, copy: SystemCopy) {
  return value === "meta" ? copy.billingModeMetaShort : copy.billingModeActualShort
}

function formatMetaPriceValue(item: MetaModel, key: "input_price" | "output_price" | "cached_input_price", currency: string) {
  if (item.billing_mode !== "meta") {
    return "-"
  }
  return formatPriceValue(item[key], currency)
}

function formatPriceValue(value: string | number, currency: string) {
  const parsed = Number(value || 0)
  return formatCurrency((Number.isFinite(parsed) ? parsed : 0).toFixed(6), currency)
}

function apiErrorMessage(error: unknown, fallback: string) {
  const axiosError = error as AxiosError<{ error?: string; message?: string }>
  return axiosError.response?.data?.error || axiosError.response?.data?.message || (error instanceof Error ? error.message : fallback)
}

function statusBadgeClass(status: string) {
  switch ((status || "").toLowerCase()) {
    case "up":
      return "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
    case "down":
      return "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300"
    default:
      return "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"
  }
}

function statusLabel(status: string, copy: SystemCopy) {
  switch ((status || "").toLowerCase()) {
    case "up":
      return copy.statusUp
    case "down":
      return copy.statusDown
    default:
      return copy.statusPending
  }
}

function formatLatency(value: number) {
  if (!value || value <= 0) {
    return "-"
  }
  return `${value}ms`
}

function scheduledJobLabel(copy: SystemCopy, job: Pick<ScheduledJobSnapshot, "name" | "description">) {
  return (copy.taskLabels as Record<string, string>)[job.name] || job.description || job.name
}

function scheduledJobRunLabel(copy: SystemCopy, taskName: string, jobs?: ScheduledJobSnapshot[]) {
  const job = (jobs || []).find((item) => item.name === taskName)
  if (job) {
    return scheduledJobLabel(copy, job)
  }
  return (copy.taskLabels as Record<string, string>)[taskName] || taskName
}

function formatSeconds(value: number) {
  if (!value) {
    return "-"
  }
  if (value % 3600 === 0) {
    return `${value / 3600}h`
  }
  if (value % 60 === 0) {
    return `${value / 60}m`
  }
  return `${value}s`
}

function formatHours(value: number) {
  if (!value) {
    return "-"
  }
  if (value % 24 === 0) {
    return `${value / 24}d`
  }
  return `${value}h`
}

function formatAutoUpdateTime(value?: string) {
  if (!value) return "-"
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString()
}

function formatAutoUpdateBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0 B"
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / 1024 / 1024).toFixed(1)} MB`
}

function filterAndSortRedeemCodes(
  codes: RedeemCode[],
  filters: { search: string; status: string; groupID: string; sort: string }
) {
  const search = filters.search.trim().toLowerCase()
  return [...codes]
    .filter((code) => {
      if (search && !code.code.toLowerCase().includes(search)) {
        return false
      }
      if (filters.status !== "all" && redeemCodeStatus(code) !== filters.status) {
        return false
      }
      if (filters.groupID === "none" && code.group_id) {
        return false
      }
      if (filters.groupID !== "all" && filters.groupID !== "none" && String(code.group_id || "") !== filters.groupID) {
        return false
      }
      return true
    })
    .sort((a, b) => compareRedeemCodes(a, b, filters.sort))
}

function compareRedeemCodes(a: RedeemCode, b: RedeemCode, sort: string) {
  switch (sort) {
    case "created_asc":
      return dateTimeValue(a.created_at) - dateTimeValue(b.created_at)
    case "code_asc":
      return a.code.localeCompare(b.code)
    case "amount_desc":
      return Number(b.amount || 0) - Number(a.amount || 0)
    case "used_desc":
      return b.used_count - a.used_count
    case "expires_asc":
      return dateTimeValue(a.expires_at, Number.MAX_SAFE_INTEGER) - dateTimeValue(b.expires_at, Number.MAX_SAFE_INTEGER)
    case "created_desc":
    default:
      return dateTimeValue(b.created_at) - dateTimeValue(a.created_at)
  }
}

function redeemCodeStatus(code: RedeemCode) {
  if (!code.enabled) {
    return "disabled"
  }
  if (code.expires_at && dateTimeValue(code.expires_at) < Date.now()) {
    return "expired"
  }
  if (code.max_uses > 0 && code.used_count >= code.max_uses) {
    return "used_up"
  }
  return "enabled"
}

function redeemCodeStatusLabel(code: RedeemCode, copy: SystemCopy, t: ReturnType<typeof useI18n>["t"]) {
  switch (redeemCodeStatus(code)) {
    case "disabled":
      return t("common.disabled")
    case "expired":
      return copy.filterExpired
    case "used_up":
      return copy.filterUsedUp
    default:
      return t("common.enabled")
  }
}

function dateTimeValue(value?: string | null, fallback = 0) {
  if (!value) {
    return fallback
  }
  const time = new Date(value).getTime()
  return Number.isNaN(time) ? fallback : time
}

function downloadRedeemCodesTxt(codes: RedeemCode[], copy: SystemCopy, filename: string) {
  if (codes.length === 0) {
    return
  }
  const body = codes.map((code) => redeemCodeText(code, copy)).join("\n\n")
  const blob = new Blob([body], { type: "text/plain;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

function exportFilename(contentDisposition: string | undefined): string | null {
  const match = /filename="?([^";]+)"?/i.exec(contentDisposition || "")
  return match?.[1] || null
}

function redeemCodeText(code: RedeemCode, copy: SystemCopy) {
  return [
    `${copy.redeemCode}: ${code.code}`,
    `${copy.amount}: ${code.amount}`,
    `${copy.groupGrant}: ${code.group?.name || "-"}`,
    `${copy.groupDuration}: ${code.group_id ? formatDuration(code.group_duration_days, copy) : "-"}`,
    `${copy.subscriptionPlan}: ${code.subscription_plan?.name || "-"}`,
    `${copy.subscriptionDuration}: ${code.subscription_plan_id ? formatDuration(code.subscription_duration_days, copy) : "-"}`,
    `${copy.usage}: ${code.used_count}/${code.max_uses}`,
    `${copy.expiresAt}: ${formatDateTime(code.expires_at)}`,
  ].join("\n")
}

function formatDateTime(value?: string | null) {
  if (!value) {
    return "-"
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }
  return date.toLocaleString()
}

function formatDuration(days: number, copy: SystemCopy) {
  if (!days || days <= 0) {
    return copy.permanent
  }
  return `${days}${copy.days}`
}

function formatRate(value: string | number) {
  const rate = Number(value)
  if (!Number.isFinite(rate)) {
    return String(value)
  }
  return `${(rate * 100).toFixed(2)}%`
}

function jsonListToCSV(value: string) {
  try {
    const parsed = JSON.parse(value || "[]")
    if (Array.isArray(parsed)) {
      return parsed.join(",")
    }
  } catch {
    // Keep malformed values editable instead of replacing them silently.
  }
  return value || ""
}

function csvToJSONString(value: string) {
  return JSON.stringify(value.split(",").map((item) => item.trim()).filter(Boolean))
}

function callbackURLFromBaseURL(baseURL: string, path: string) {
  const trimmed = baseURL.trim().replace(/\/+$/, "")
  return trimmed ? `${trimmed}${path}` : ""
}

function oauthProviderCallbackURL(provider: OAuthProviderConfig, baseURL: string) {
  return provider.redirect_url.trim() || callbackURLFromBaseURL(baseURL, `/auth/oauth/${provider.key || "{key}"}/callback`)
}

function emptyOAuthProviderConfig(): OAuthProviderConfig {
  return {
    key: "",
    name: "",
    enabled: true,
    issuer: "",
    client_id: "",
    client_secret: "",
    auth_url: "",
    token_url: "",
    userinfo_url: "",
    scope: "openid profile email",
    redirect_url: "",
    subject_key: "sub",
    email_key: "email",
    name_key: "name",
    avatar_key: "picture",
  }
}

function parseOAuthProviderConfigs(raw: string): OAuthProviderConfig[] {
  try {
    const parsed = JSON.parse(raw || "[]")
    if (!Array.isArray(parsed)) {
      return []
    }
    return parsed.map((item) => ({
      ...emptyOAuthProviderConfig(),
      key: typeof item?.key === "string" ? item.key : "",
      name: typeof item?.name === "string" ? item.name : "",
      enabled: item?.enabled !== false,
      issuer: typeof item?.issuer === "string" ? item.issuer : "",
      client_id: typeof item?.client_id === "string" ? item.client_id : "",
      client_secret: typeof item?.client_secret === "string" ? item.client_secret : "",
      auth_url: typeof item?.auth_url === "string" ? item.auth_url : "",
      token_url: typeof item?.token_url === "string" ? item.token_url : "",
      userinfo_url: typeof item?.userinfo_url === "string" ? item.userinfo_url : "",
      scope: typeof item?.scope === "string" ? item.scope : "openid profile email",
      redirect_url: typeof item?.redirect_url === "string" ? item.redirect_url : "",
      subject_key: typeof item?.subject_key === "string" ? item.subject_key : "sub",
      email_key: typeof item?.email_key === "string" ? item.email_key : "email",
      name_key: typeof item?.name_key === "string" ? item.name_key : "name",
      avatar_key: typeof item?.avatar_key === "string" ? item.avatar_key : "picture",
    }))
  } catch {
    return []
  }
}

function stringifyOAuthProviderConfigs(providers: OAuthProviderConfig[]) {
  return JSON.stringify(providers.map((provider) => ({
    ...provider,
    key: normalizeOAuthProviderKey(provider.key),
    name: provider.name.trim(),
    issuer: provider.issuer.trim(),
    client_id: provider.client_id.trim(),
    client_secret: provider.client_secret.trim(),
    auth_url: provider.auth_url.trim(),
    token_url: provider.token_url.trim(),
    userinfo_url: provider.userinfo_url.trim(),
    scope: provider.scope.trim(),
    redirect_url: provider.redirect_url.trim(),
    subject_key: provider.subject_key.trim() || "sub",
    email_key: provider.email_key.trim() || "email",
    name_key: provider.name_key.trim() || "name",
    avatar_key: provider.avatar_key.trim() || "picture",
  })), null, 2)
}

function normalizeOAuthProviderKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

function uniqueOAuthProviderKey(providers: OAuthProviderConfig[]) {
  const used = new Set(providers.map((provider) => provider.key))
  for (let index = 1; index < 1000; index += 1) {
    const key = index === 1 ? "oauth" : `oauth-${index}`
    if (!used.has(key)) {
      return key
    }
  }
  return "oauth"
}

function validateCheckInStreakRewards(raw: string, copy: SystemCopy): { valid: true; value: string } | { valid: false; error: string } {
  const text = raw.trim() || "{}"
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return { valid: false, error: copy.checkInStreakRewardsInvalidJSON }
  }
  if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
    return { valid: false, error: copy.checkInStreakRewardsInvalidObject }
  }

  const normalized: Record<string, string> = {}
  for (const [day, amount] of Object.entries(parsed)) {
    const normalizedDay = day.trim()
    if (!/^[1-9]\d*$/.test(normalizedDay)) {
      return { valid: false, error: copy.checkInStreakRewardsInvalidDay.replace("{day}", day) }
    }
    const normalizedAmount = typeof amount === "number" ? String(amount) : typeof amount === "string" ? amount.trim() : ""
    const parsedAmount = Number(normalizedAmount)
    if (!normalizedAmount || !Number.isFinite(parsedAmount) || parsedAmount < 0) {
      return { valid: false, error: copy.checkInStreakRewardsInvalidAmount.replace("{day}", day) }
    }
    normalized[normalizedDay] = normalizedAmount
  }

  return { valid: true, value: JSON.stringify(normalized) }
}

type SystemCopy = typeof zhCopy

const zhCopy = {
  overview: "概览",
  systemSubtitle: "配置站点、认证、页面内容、导航、分组和兑换码",
  basic: "基础设置",
  systemMode: "运行模式",
  systemModeOperation: "运营模式",
  systemModePersonal: "自用模式",
  systemModeEnterprise: "企业模式",
  systemModeHint: "运营模式面向公开运营；自用模式关闭余额扣费和支付等运营能力；企业模式用于单企业私有部署，并启用企业成员、Workspace、RBAC 和治理能力。切换模式不会删除历史数据。",
  theme: "颜色自定义",
  themeSettings: "主题设置",
  themeSettingsDescription: "配置全站浅色和深色模式下的主题颜色、强调色、背景、文字和边框。",
  themeCustomizationDescription: "配置全站自定义背景图，并使用 CSS 覆盖细节样式。",
  restoreThemeDefaults: "恢复默认",
  backgroundImage: "自定义背景图",
  backgroundImagePlaceholder: "https://example.com/background.jpg",
  customCSS: "自定义 CSS 覆盖",
  customCSSPlaceholder: "/* 在此输入覆盖全站样式的 CSS */",
  customCSSHint: "CSS 会应用到全站。请仅粘贴可信样式，并在保存后检查各页面效果。",
  themeLightMode: "浅色模式",
  themeDarkMode: "深色模式",
  themeBackground: "背景色",
  themeForeground: "文字色",
  themeCard: "卡片色",
  themeCardForeground: "卡片文字色",
  themePrimary: "主题色",
  themePrimaryForeground: "主题文字色",
  themeSecondary: "次级色",
  themeSecondaryForeground: "次级文字色",
  themeAccent: "强调色",
  themeAccentForeground: "强调文字色",
  themeMuted: "弱化背景色",
  themeMutedForeground: "弱化文字色",
  themeBorder: "边框色",
  themePreview: "预览",
  themePreviewTitle: "仪表盘模块",
  themePreviewText: "这里展示主题色、强调色和弱化文本在界面中的组合效果。",
  themePreviewAction: "主要操作",
  themePreviewSecondaryAction: "次级操作",
  themePreviewAccent: "强调状态",
  themePreviewMuted: "弱化信息区域",
  billing: "计费与推广",
  pricingAndReferral: "价格与推广",
  pricingAndReferralDescription: "配置公开价格接口、推广返佣和多分组计价规则。",
  checkInSettings: "签到奖励",
  checkInSettingsDescription: "配置每日签到、连续签到奖励和随机积分奖励。",
  checkInEnabled: "启用签到",
  checkInDailyReward: "每次签到奖励",
  checkInTimezone: "签到时区",
  checkInStreakEnabled: "启用连续签到奖励",
  checkInStreakCycleDays: "连续签到循环天数",
  checkInStreakRewards: "连续签到奖励 JSON",
  checkInStreakRewardsPlaceholder: "例如 {\"3\":\"1\",\"7\":\"3\"}，表示第 3 天额外 1，第 7 天额外 3",
  checkInStreakRewardsHelp: "写法：JSON 对象，key 是连续签到第几天，value 是额外奖励金额，例如 {\"3\":\"1\",\"7\":\"3\"}。开启 7 天循环时，第 10 天会按第 3 天计算。",
  checkInStreakRewardsInvalidJSON: "连续签到奖励 JSON 格式不正确",
  checkInStreakRewardsInvalidObject: "连续签到奖励必须是 JSON 对象，例如 {\"3\":\"1\",\"7\":\"3\"}",
  checkInStreakRewardsInvalidDay: "连续签到奖励的天数必须是正整数：{day}",
  checkInStreakRewardsInvalidAmount: "连续签到奖励的金额必须是非负数字，出错天数：{day}",
  checkInRandomEnabled: "启用随机奖励",
  checkInRandomMin: "随机奖励最小值",
  checkInRandomMax: "随机奖励最大值",
  paymentInterface: "支付接口",
  paymentSettings: "支付充值",
  paymentSettingsDescription: "配置用户余额充值、人民币结算汇率、易支付或 OPS 网关。",
  paymentEnabled: "启用支付充值",
  currencyDisplayName: "余额显示符号/名称",
  usdToRMBRate: "USD 到 RMB 汇率",
  minRechargeAmount: "最低充值金额",
  rechargePresets: "预设充值金额",
  paymentMethods: "启用支付方式",
  paymentGatewayProvider: "支付网关",
  paymentProviderYipay: "易支付 / EPay",
  paymentProviderOpenPayment: "Open Payment Specification",
  yipayGatewayURL: "易支付提交地址",
  yipayPID: "易支付商户 PID",
  yipayKey: "易支付商户密钥",
  yipayKeyPlaceholder: "用于 MD5 签名的商户密钥",
  yipayNotifyURL: "异步通知地址（可选）",
  yipayReturnURL: "同步跳转地址（可选）",
  yipayGatewayHint: "易支付不同部署的提交路径可能不同，请填写实际提交端点，例如 https://pay.example.com/submit.php。通知和跳转地址留空时会根据 Base URL 自动生成。",
  openPaymentBaseURL: "OPS 平台 Base URL",
  openPaymentConfigURL: "OPS 发现配置地址",
  openPaymentMerchantID: "OPS 商户号",
  openPaymentKey: "OPS 商户密钥",
  openPaymentKeyPlaceholder: "用于 OPS MD5 或 HMAC-SHA256 签名的商户密钥",
  openPaymentNotifyURL: "OPS 异步通知地址",
  openPaymentReturnURL: "OPS 同步跳转地址",
  openPaymentGatewayHint: "OPS 模式会读取 /.well-known/openpayment-configuation（规范中的 configuation 拼写是固定路径），并按发现配置中的端点、字段别名、支付方式和签名规则发起支付。发现配置地址留空时会根据 Base URL 自动生成。",
  generatedFromBaseURL: "由 Base URL 自动生成",
  security: "安全策略",
  redis: "Redis",
  redisDescription: "配置可选的 Redis 缓存连接。",
  redisEnabled: "启用 Redis",
  redisAddress: "Redis 地址",
  redisUsername: "Redis 用户名",
  redisUsernamePlaceholder: "留空表示不使用用户名",
  redisPassword: "Redis 密码",
  redisPasswordPlaceholder: "留空表示不使用密码",
  redisPasswordReplacePlaceholder: "留空保留已保存的密码",
  redisPasswordClear: "清除已保存的 Redis 密码",
  redisDatabase: "Redis 数据库编号",
  redisTLSEnabled: "启用 TLS",
  redisHint: "保存后将在服务下次启动时生效。REDIS_URL 或 REDIS_* 环境变量会覆盖这里的连接配置。",
  rateLimitEnabled: "启用网关速率限制",
  rateLimitRPM: "每分钟请求数",
  rateLimitBurst: "突发额度",
  sensitiveFilterEnabled: "启用敏感词过滤",
  sensitiveWords: "敏感词列表",
  sensitiveWordsPlaceholder: "每行或用逗号分隔，例如：违规词\nsecret-key",
  sensitiveWordsReplacePlaceholder: "已保存的规则不会显示；留空保持不变，填写将覆盖当前规则",
  sensitiveValuePlaceholder: "已保存的值不会显示；留空保持不变",
  sensitiveFilterScope: "过滤范围",
  filterScopeRequest: "仅请求内容",
  filterScopeRequestResponse: "请求和响应内容",
  ssrfProtectionEnabled: "启用 SSRF 保护",
  ssrfAllowPrivateNetworks: "允许访问私有网络",
  ssrfAllowedHosts: "SSRF 允许主机",
  ssrfAllowedHostsPlaceholder: "每行或用逗号分隔，例如：internal-api.example.com\n192.168.1.10",
  premiumRequiredTitle: "功能已可用",
  premiumRequiredDescription: "该功能已集成到当前版本。",
  premiumRequiredAction: "知道了",
  auth: "登录认证",
  email: "邮件配置",
  content: "页面内容",
  topNavigation: "顶部导航",
  navigation: "侧边栏模块",
  statusMonitor: "状态监测",
  reliability: "可靠性",
  scheduledTasks: "定时任务",
  scheduledTasksTitle: "定时任务统一调度",
  scheduledTasksDescription: "所有后台任务由统一调度器管理，集群级任务仅在主节点执行；可手动触发并查看执行历史。",
  scheduledTasksReplicaHint: "当前节点是从节点，集群级任务由主节点执行，手动触发请在主节点操作。",
  taskName: "任务",
  taskInterval: "周期",
  taskEnabled: "已启用",
  taskDisabled: "已停用",
  taskRunning: "执行中",
  taskPrimaryOnly: "仅主节点",
  taskLastRun: "上次执行",
  taskLastResult: "上次结果",
  taskNextRun: "下次执行",
  taskNever: "从未执行",
  taskListEmpty: "暂无注册的定时任务",
  taskRunNow: "立即执行",
  taskRunQueued: "已触发执行",
  taskRunFailed: "触发失败",
  taskStatusSuccess: "成功",
  taskStatusFailed: "失败",
  taskRunHistory: "执行日志",
  taskRunHistoryDescription: "记录每次实际执行（空扫描不记录），保留期限与日志清理设置一致。",
  taskAllTasks: "全部任务",
  taskNoRuns: "暂无执行记录",
  taskRunTotal: "共 {count} 条记录",
  taskRunTime: "时间",
  taskTrigger: "触发方式",
  taskTriggerSchedule: "计划",
  taskTriggerManual: "手动",
  taskDuration: "耗时",
  taskNode: "节点",
  taskMessage: "消息",
  taskPrevPage: "上一页",
  taskNextPage: "下一页",
  taskLabels: {
    price_sync: "价格同步",
    status_monitor: "状态监测",
    reliability: "可靠性探测",
    log_cleanup: "日志清理",
    auto_update: "自动更新",
    node_heartbeat: "节点心跳",
    advanced_chat_scheduled_tasks: "AI 计划任务调度",
    personal_company_scheduler: "Studio 工作调度",
    plugin_credential_refresh: "插件凭证刷新",
  },
  nodes: "多节点",
  nodesTitle: "主从节点",
  nodesDescription: "多个实例共用同一数据库时，只有主节点执行定时任务（价格同步、状态监控、可靠性探测、日志清理、定时任务调度），从节点只处理请求。",
  multiNodeEnabled: "启用多节点",
  nodeAddressMode: "地址形态",
  nodeAddressSingle: "单个地址",
  nodeAddressMultiple: "多个地址",
  nodeAddress: "反代地址",
  nodeAddresses: "反代地址列表",
  nodeAddressesPlaceholder: "每行一个地址，例如 https://node-a.example.com",
  nodeEnvHint: "开启多节点后，每个实例都必须在 env 中设置节点名称：",
  nodeNameMissing: "当前实例没有设置 NODE_NAME，多节点模式下会启动失败。请先在该实例的 env 中补上节点名称。",
  nodeName: "节点名称",
  nodeRole: "角色",
  nodeLastSeen: "最后心跳",
  nodePrimary: "主节点",
  nodeReplica: "从节点",
  nodeOnline: "在线",
  nodeOffline: "离线",
  nodeCurrent: "（当前实例）",
  nodePromote: "设为主节点",
  noNodes: "暂无节点记录（开启多节点并重启实例后自动注册）",
  nodesFooterHint: "首个注册的节点成为主节点，之后加入的节点默认为从节点；节点重启后保留原角色。地址配置仅作记录，反代用单地址还是多地址对后端没有区别。",
  logCleanup: "日志清理",
  groups: "用户分组",
  advancedChat: "助理聊天",
  advancedChatAssistant: "助理设置",
  advancedChatAttachments: "附件设置",
  advancedChatMCP: "MCP 服务器",
  siteName: "站点名称",
  siteNamePlaceholder: "例如 WindyPear API",
  baseURL: "Base URL",
  baseURLPlaceholder: "例如 https://api.example.com",
  iconURL: "图标 URL",
  iconURLPlaceholder: "例如 https://example.com/icon.png",
  footerText: "页脚文本",
  communityEnabled: "启用社区功能",
  communityEnabledHint: "关闭后聊天页的社区入口与社区浏览/导入接口均不可用。",
  footerTextPlaceholder: "例如 © 2026 WindyPear",
  homeIframeURL: "首页 iframe 地址",
  homeIframeURLPlaceholder: "例如 https://status.example.com",
  pricingEndpointEnabled: "公开 /api/pricing 价格接口",
  referralEnabled: "启用推广返佣",
  referralRate: "返佣比例",
  referralRatePlaceholder: "例如 0.1 表示 10%",
  referralRateShort: "比例",
  groupMultiplierMode: "多个分组倍率取值",
  groupModeMin: "取较小倍率",
  groupModeMax: "取较大倍率",
  statusMonitorEnabled: "启用公开状态监测页",
  createStatusMonitor: "添加监测节点",
  updateStatusMonitor: "更新监测节点",
  monitorName: "节点名称",
  monitorNamePlaceholder: "例如 主站 API",
  monitorTarget: "检测地址",
  monitorTargetPlaceholder: "HTTP 填 https://api.example.com/health，TCP 填 host:port",
  checkType: "检测方式",
  checkTypeHTTP: "HTTP / HTTPS",
  checkTypeTCP: "TCP 端口",
  httpMethod: "HTTP 方法",
  checkInterval: "检测间隔",
  checkIntervalPlaceholder: "秒，最小 10，例如 60",
  retention: "保留时间",
  retentionPlaceholder: "小时，例如 168",
  lastResult: "最近结果",
  noStatusMonitors: "暂无监测节点",
  checkNow: "立即检测",
  statusMonitorSaved: "监测节点已保存",
  statusMonitorSaveFailed: "监测节点保存失败",
  statusMonitorDeleted: "监测节点已删除",
  statusMonitorDeleteFailed: "监测节点删除失败",
  statusMonitorChecked: "检测已完成",
  statusMonitorCheckFailed: "检测失败",
  reliabilityUpstreamTitle: "上游渠道可靠性",
  reliabilityUpstreamDescription: "配置上游渠道失败统计、自动禁用、自动检测和自动恢复策略。",
  reliabilityAutoDisableEnabled: "连续失败后自动禁用上游渠道",
  reliabilityDisableAfterFailures: "连续失败阈值",
  reliabilityAutoDetectUpstreamEnabled: "自动检测上游渠道",
  reliabilityAutoDetectIntervalSeconds: "检测间隔（秒）",
  reliabilityAutoDetectTimeoutSeconds: "检测超时（秒）",
  reliabilityAutoRecoverEnabled: "自动恢复被禁用渠道",
  reliabilityRecoveryAfterSeconds: "恢复等待时间（秒）",
  reliabilityHint: "网络错误、401/403、408/429 和 5xx 会累计失败；普通 400 请求错误不会自动禁用渠道。",
  logCleanupTitle: "日志自动清理",
  logCleanupDescription: "所有审计、调用、插件与状态检查日志都会保存到独立的 log 数据库，不影响业务主库。",
  logRetentionAPIDays: "API 调用日志保留天数",
  logRetentionLoginDays: "登录日志保留天数",
  logRetentionAdminDays: "管理修改日志保留天数",
  logRetentionSystemDays: "系统日志保留天数",
  logRetentionTokenDays: "计费调用日志保留天数",
  logRetentionCleanupIntervalHours: "清理间隔（小时）",
  logCleanupHint: "单文件模式使用 log/flai-log.db；按日模式会在 log/ 下每天创建一个数据库文件。保存后立即生效，保留期清理由后台任务执行。",
  logStorageMode: "日志数据库模式",
  logStorageSingle: "单个日志数据库文件",
  logStorageDaily: "每天一个日志数据库文件",
  logRetentionDays: "日志保留天数（1–3650）",
  logsDeleteAll: "一键删除全部日志",
  logsDeleteConfirm: "确定删除所有日志吗？此操作不可恢复。",
  logsDeleted: "已删除 {count} 条日志",
  logsDeleteFailed: "删除日志失败",
  configurationBackup: "配置备份与恢复",
  configurationBackupDescription: "将当前系统配置导出为 JSON，或导入此前导出的配置文件。",
  configurationSystemSettings: "全部系统设置",
  configurationChannels: "渠道信息（含渠道密钥）",
  configurationModels: "模型数据",
  configurationPrices: "模型价格与渠道模型映射",
  configurationExport: "导出 JSON",
  configurationExported: "配置已导出",
  configurationExportFailed: "导出配置失败",
  configurationImport: "导入配置",
  configurationImportDescription: "导入会覆盖同名的设置、渠道和模型配置；不会删除未包含的数据。",
  configurationImportConfirm: "确定导入此配置文件吗？同名配置会被覆盖。",
  configurationImported: "配置已导入",
  configurationImportFailed: "导入配置失败",
  configurationInvalidFile: "请选择有效的 JSON 配置文件",
  configurationBackupHint: "此功能只处理系统设置、渠道、模型和价格数据；不会导入用户、API Key、余额、订单、日志或其他业务数据。渠道信息可能包含密钥，请妥善保管导出的文件。",
  autoUpdate: "自动更新",
  autoUpdateDescription: "从 veloce-ailab/veloce 的最新正式 Release 检查并安装与当前系统和架构完全匹配的社区版程序包。",
  autoUpdateEnabled: "启用自动更新",
  autoUpdateIntervalHours: "检查间隔（小时，1–168）",
  autoUpdateCurrentVersion: "当前版本",
  autoUpdateLatestVersion: "最新版本",
  autoUpdatePlatform: "当前平台",
  autoUpdateLastChecked: "上次检查",
  autoUpdateLastError: "最近错误",
  autoUpdateCheckNow: "立即检查",
  autoUpdateInstallNow: "立即更新",
  autoUpdateStarted: "更新已开始下载，完成后服务会自动重启。",
  autoUpdateStartFailed: "启动更新失败",
  autoUpdateInProgress: "正在更新",
  autoUpdateAvailable: "发现可用更新；可立即更新，或在启用自动更新后按下次计划检查时安装并重启。",
  autoUpdateUpToDate: "当前已是最新版本。",
  autoUpdateCheckFailed: "检查更新失败",
  autoUpdateUnsupported: "当前不是带发布版本号的官方二进制，不能自动更新。请安装官方 Release 包。",
  autoUpdateHint: "下载前会校验 GitHub Release 提供的 SHA-256；归档包必须只包含一个根目录二进制文件。更新成功后服务会短暂重启，原二进制保留为 .previous 备份。",
  statusUp: "正常",
  statusDown: "故障",
  statusPending: "等待",
  oidcEnabled: "启用 OIDC 登录",
  passkeyEnabled: "启用 Passkey 登录",
  passwordLoginEnabled: "允许账号密码登录",
  passwordRegistrationEnabled: "允许账号密码注册",
  emailVerificationRequired: "注册必须验证邮箱",
  passwordHCaptchaEnabled: "账号密码登录启用 hCaptcha",
  authAgreementMode: "协议确认方式",
  authAgreementModeNotice: "提示点击确认即同意",
  authAgreementModeCheckbox: "要求用户手动勾选",
  hcaptchaSiteKey: "hCaptcha Site Key",
  hcaptchaSiteKeyPlaceholder: "前端显示用 site key",
  hcaptchaSecret: "hCaptcha Secret",
  hcaptchaSecretPlaceholder: "服务端校验用 secret",
  smtpHost: "SMTP Host",
  smtpHostPlaceholder: "例如 smtp.example.com",
  smtpPort: "SMTP Port",
  smtpPortPlaceholder: "例如 587",
  smtpUsername: "SMTP 用户名",
  smtpUsernamePlaceholder: "例如 no-reply@example.com",
  smtpPassword: "SMTP 密码",
  smtpPasswordPlaceholder: "SMTP 密码或授权码",
  smtpFrom: "发件人",
  smtpFromPlaceholder: "例如 WindyPear <no-reply@example.com>",
  smsSection: "短信认证",
  smsSectionDescription: "配置短信服务后，可开启手机号注册与绑定手机号。",
  smsEnabled: "启用手机号认证（注册/绑定）",
  smsLoginEnabled: "启用短信验证码登录",
  smsBindingRequired: "强制用户绑定手机号",
  smsProvider: "短信服务商",
  smsProviderAliyun: "阿里云短信",
  smsProviderTencent: "腾讯云短信",
  smsAliyunAccessKeyID: "阿里云 AccessKey ID",
  smsAliyunAccessKeySecret: "阿里云 AccessKey Secret",
  smsAliyunTemplateCode: "阿里云模板 Code",
  smsTencentSecretID: "腾讯云 SecretId",
  smsTencentSecretKey: "腾讯云 SecretKey",
  smsTencentSDKAppID: "腾讯云 SDK AppId",
  smsTencentTemplateID: "腾讯云模板 ID",
  smsTencentRegion: "腾讯云地域",
  smsSignName: "短信签名",
  smsSignNamePlaceholder: "已审核通过的签名名称",
  smsHint: "验证码模板需包含一个验证码变量：阿里云为 ${code}，腾讯云为 {1}。目前支持中国大陆手机号。",
  referredUser: "被推广用户",
  baseCost: "消费",
  commission: "返佣",
  createdAt: "时间",
  noReferralLogs: "暂无返佣记录",
  oidcIssuer: "OIDC Issuer",
  oidcIssuerPlaceholder: "留空使用环境变量 OIDC_ISSUER",
  oidcClientID: "OIDC Client ID",
  oidcClientIDPlaceholder: "留空使用环境变量 OIDC_CLIENT_ID",
  oidcClientSecret: "OIDC Client Secret",
  oidcClientSecretPlaceholder: "留空使用环境变量 OIDC_CLIENT_SECRET",
  oidcRedirectURL: "OIDC Redirect URL",
  oidcRedirectURLPlaceholder: "留空使用环境变量 OIDC_REDIRECT_URL",
  announcement: "系统公告",
  announcementPlaceholder: "显示在用户页面顶部的公告",
  announcements: "公告列表",
  announcementsDescription: "管理显示在用户首页下方的多条公告。",
  createAnnouncement: "添加公告",
  updateAnnouncement: "更新公告",
  announcementTitle: "公告标题",
  announcementTitlePlaceholder: "例如 维护通知",
  announcementContent: "公告内容",
  announcementContentPlaceholder: "填写公告正文",
  noAnnouncements: "暂无公告",
  sortOrder: "排序",
  announcementSaved: "公告已保存",
  announcementSaveFailed: "公告保存失败",
  announcementDeleted: "公告已删除",
  announcementDeleteFailed: "公告删除失败",
  aboutHTML: "关于页面 HTML",
  aboutHTMLPlaceholder: "<h2>关于我们</h2><p>...</p>",
  privacyPolicyURL: "隐私政策地址",
  privacyPolicyURLPlaceholder: "例如 https://example.com/privacy",
  termsURL: "用户协议地址",
  termsURLPlaceholder: "例如 https://example.com/terms",
  privacyPolicy: "隐私政策",
  privacyPolicyPlaceholder: "<h2>隐私政策</h2><p>...</p>",
  terms: "用户协议",
  termsPlaceholder: "<h2>用户协议</h2><p>...</p>",
  topNav: "顶部导航",
  topNavItems: "顶部导航项",
  addTopNavItem: "添加导航项",
  noTopNavItems: "暂无导航项",
  topNavLabelPlaceholder: "显示名称，例如 控制台",
  topNavHrefPlaceholder: "地址，例如 /dashboard 或 https://example.com",
  moveUp: "上移",
  moveDown: "下移",
  deleteTopNavItem: "删除",
  sidebarDashboard: "侧边栏：概览",
  sidebarUsage: "侧边栏：调用记录",
  sidebarWallet: "侧边栏：钱包",
  sidebarDataBoard: "侧边栏：数据看板",
  sidebarAPIKeys: "侧边栏：令牌",
  sidebarChat: "侧边栏：聊天",
  chatPageMode: "聊天页面",
  chatPageModeBasic: "基础聊天（控制台内）",
  chatPageModeAdvanced: "助理聊天（独立页面）",
  chatPageModeHint: "助理聊天会打开独立 /chat 页面。",
  messageChannelEnabled: "启用消息通道",
  sidebarImages: "侧边栏：AI 绘画",
  sidebarSettings: "侧边栏：设置",
  sidebarSystem: "侧边栏：系统管理",
  sidebarAdminOverview: "侧边栏：管理员概览",
  sidebarChannels: "侧边栏：渠道",
  sidebarModels: "侧边栏：模型配置",
  sidebarUsers: "侧边栏：用户",
  groupName: "分组名称",
  groupMultiplier: "分组倍率",
  groupNamePlaceholder: "例如 vip",
  groupMultiplierPlaceholder: "倍率，例如 0.8",
  createGroup: "创建分组",
  updateGroup: "更新分组",
  cancelEdit: "取消编辑",
  groupSaved: "分组已保存",
  groupSaveFailed: "分组保存失败",
  groupDeleted: "分组已删除",
  groupDeleteFailed: "分组删除失败，可能仍在使用中",
  noGroups: "暂无分组",
  redeemCodes: "兑换码",
  redeemCode: "兑换码",
  redeemCodePlaceholder: "留空自动生成",
  redeemAmountPlaceholder: "到账余额",
  redeemMaxUsesPlaceholder: "次数",
  groupGrant: "授予分组",
  noGroupGrant: "不授予分组",
  groupDuration: "分组时长",
  groupDurationPlaceholder: "分组天数，0 为永久",
  metaModels: "元模型",
  metaModelsDescription: "使用 Meta Module Language 创建动态路由模型",
  createMetaModel: "创建元模型",
  updateMetaModel: "更新元模型",
  metaModelSaved: "元模型已保存",
  metaModelSaveFailed: "元模型保存失败",
  metaModelDeleted: "元模型已删除",
  metaModelDeleteFailed: "元模型删除失败",
  metaModelValid: "元模型 DSL 校验通过",
  metaModelInvalid: "元模型 DSL 校验失败",
  noMetaModels: "暂无元模型",
  metaModelName: "元模型名称",
  metaModelNamePlaceholder: "例如 meta-smart",
  description: "描述",
  metaModelDescriptionPlaceholder: "说明这个元模型的用途",
  metaModelProvider: "公开供应商",
  metaModelReferencedVisibility: "底层模型",
  metaModelPublicDisplay: "公开展示",
  metaModelPublicDisplayHelp: "控制模型广场和公开模型目录里的展示信息，不影响元模型运行。",
  metaModelProviderID: "供应商标识",
  metaModelProviderName: "供应商名称",
  metaModelProviderIconURL: "供应商图标 URL",
  metaModelExposeReferencedModels: "展示底层模型列表",
  metaModelExposeReferencedModelsHelp: "关闭后 /api/public/models 不会返回 referenced_models，模型广场也不会显示元模型背后的真实模型列表。",
  billingMode: "计费模式",
  billingModeActual: "按实际调用模型计费",
  billingModeMeta: "按元模型独立价格计费",
  billingModeActualShort: "实际调用",
  billingModeMetaShort: "元模型",
  inputPrice: "输入价格",
  outputPrice: "输出价格",
  cachedInputPrice: "缓存输入价格",
  metaModelDSL: "Meta Module Language",
  metaModelDSLPlaceholder: "route {\n  when request.input_tokens <= 2000 => call \"your-real-model-a\"\n  otherwise => call \"your-real-model-b\"\n}",
  metaModelDSLHelp: "call 中的模型名必须是已存在的真实模型。当前执行支持 call、route 和 switch。条件支持数字、布尔和字符串匹配。",
  validateMetaModel: "校验 DSL",
  subscriptionPlans: "订阅套餐",
  subscriptionPlansDescription: "创建可通过兑换码授予的周期额度套餐",
  createSubscriptionPlan: "创建套餐",
  updateSubscriptionPlan: "更新套餐",
  subscriptionPlanSaved: "套餐已保存",
  subscriptionPlanSaveFailed: "套餐保存失败",
  subscriptionPlanDeleted: "套餐已删除",
  subscriptionPlanDeleteFailed: "套餐删除失败，可能仍在使用中",
  noSubscriptionPlans: "暂无套餐",
  planName: "套餐名称",
  planNamePlaceholder: "例如 Pro 月度",
  resetAmount: "重置额度",
  resetAmountPlaceholder: "每周期额度",
  resetInterval: "重置周期",
  resetIntervalPlaceholder: "天数，例如 30",
  planPrice: "购买价格",
  planPricePlaceholder: "例如 10",
  planDuration: "购买时长",
  planDurationPlaceholder: "天数，0 表示永久",
  planPurchasable: "允许用户直接购买",
  planPermanent: "永久",
  notPurchasable: "不可购买",
  subscriptionPlan: "订阅套餐",
  noSubscriptionPlan: "不授予套餐",
  subscriptionDuration: "订阅时长",
  subscriptionDurationPlaceholder: "订阅天数，0 为永久",
  allowStacking: "允许叠加时长",
  permanent: "永久",
  days: "天",
  createRedeemCode: "创建兑换码",
  downloadSelected: "下载选中",
  selectedCount: "已选 {count} 个",
  redeemSearchPlaceholder: "搜索兑换码",
  filterAllStatus: "全部状态",
  filterEnabled: "可用",
  filterDisabled: "已禁用",
  filterExpired: "已过期",
  filterUsedUp: "已用完",
  filterAllGroups: "全部分组",
  sortCreatedDesc: "创建时间从新到旧",
  sortCreatedAsc: "创建时间从旧到新",
  sortCodeAsc: "兑换码 A-Z",
  sortAmountDesc: "金额从高到低",
  sortUsedDesc: "使用次数从高到低",
  sortExpiresAsc: "过期时间从近到远",
  redeemCodeCreated: "兑换码已创建",
  redeemCodeCreateFailed: "兑换码创建失败",
  redeemCodeUpdated: "兑换码已更新",
  redeemCodeUpdateFailed: "兑换码更新失败",
  redeemCodeDeleted: "兑换码已删除",
  redeemCodeDeleteFailed: "兑换码删除失败",
  noRedeemCodes: "暂无兑换码",
  amount: "金额",
  usage: "使用次数",
  expiresAt: "过期时间",
  status: "状态",
  visible: "显示",
  hidden: "隐藏",
  enabled: "启用",
  disabled: "禁用",
}

const enCopy: SystemCopy = {
  overview: "Overview",
  systemSubtitle: "Configure site, auth, content, navigation, groups, and redeem codes",
  basic: "Basic",
  systemMode: "Run mode",
  systemModeOperation: "Operation mode",
  systemModePersonal: "Personal mode",
  systemModeEnterprise: "Enterprise mode",
  systemModeHint: "Operation mode is for public services; personal mode disables charging and payment features; enterprise mode enables single-enterprise members, workspaces, RBAC, and governance. Switching modes preserves existing data.",
  theme: "Color customization",
  themeSettings: "Theme settings",
  themeSettingsDescription: "Configure site theme colors, accents, backgrounds, text, and borders for light and dark modes.",
  themeCustomizationDescription: "Set a site-wide custom background image and CSS overrides.",
  restoreThemeDefaults: "Restore defaults",
  backgroundImage: "Custom background image",
  backgroundImagePlaceholder: "https://example.com/background.jpg",
  customCSS: "Custom CSS overrides",
  customCSSPlaceholder: "/* Add CSS that overrides site-wide styles here */",
  customCSSHint: "CSS is applied across the entire site. Only use trusted styles and verify each page after saving.",
  themeLightMode: "Light mode",
  themeDarkMode: "Dark mode",
  themeBackground: "Background",
  themeForeground: "Text",
  themeCard: "Card",
  themeCardForeground: "Card text",
  themePrimary: "Theme color",
  themePrimaryForeground: "Theme text",
  themeSecondary: "Secondary",
  themeSecondaryForeground: "Secondary text",
  themeAccent: "Accent",
  themeAccentForeground: "Accent text",
  themeMuted: "Muted background",
  themeMutedForeground: "Muted text",
  themeBorder: "Border",
  themePreview: "Preview",
  themePreviewTitle: "Dashboard module",
  themePreviewText: "This shows how theme, accent, and muted colors combine in the interface.",
  themePreviewAction: "Primary action",
  themePreviewSecondaryAction: "Secondary action",
  themePreviewAccent: "Accent state",
  themePreviewMuted: "Muted information area",
  billing: "Billing & Referral",
  pricingAndReferral: "Pricing & Referral",
  pricingAndReferralDescription: "Configure the public pricing endpoint, referral commission, and multi-group billing rule.",
  checkInSettings: "Check-in Rewards",
  checkInSettingsDescription: "Configure daily check-in, streak rewards, and random reward bonuses.",
  checkInEnabled: "Enable check-in",
  checkInDailyReward: "Reward per check-in",
  checkInTimezone: "Check-in timezone",
  checkInStreakEnabled: "Enable streak rewards",
  checkInStreakCycleDays: "Streak cycle days",
  checkInStreakRewards: "Streak rewards JSON",
  checkInStreakRewardsPlaceholder: "For example {\"3\":\"1\",\"7\":\"3\"}; day 3 grants +1 and day 7 grants +3",
  checkInStreakRewardsHelp: "Format: a JSON object. The key is the streak day and the value is the extra reward amount, for example {\"3\":\"1\",\"7\":\"3\"}. With a 7-day cycle, day 10 uses the day 3 rule.",
  checkInStreakRewardsInvalidJSON: "Streak rewards JSON is invalid",
  checkInStreakRewardsInvalidObject: "Streak rewards must be a JSON object, for example {\"3\":\"1\",\"7\":\"3\"}",
  checkInStreakRewardsInvalidDay: "Streak reward day must be a positive integer: {day}",
  checkInStreakRewardsInvalidAmount: "Streak reward amount must be a non-negative number. Invalid day: {day}",
  checkInRandomEnabled: "Enable random reward",
  checkInRandomMin: "Random reward minimum",
  checkInRandomMax: "Random reward maximum",
  paymentInterface: "Payment Gateway",
  paymentSettings: "Payment Recharge",
  paymentSettingsDescription: "Configure user balance recharge, RMB settlement rate, and the Yipay or OPS gateway.",
  paymentEnabled: "Enable payment recharge",
  currencyDisplayName: "Balance display symbol/name",
  usdToRMBRate: "USD to RMB rate",
  minRechargeAmount: "Minimum recharge amount",
  rechargePresets: "Preset recharge amounts",
  paymentMethods: "Enabled payment methods",
  paymentGatewayProvider: "Payment gateway",
  paymentProviderYipay: "Yipay / EPay",
  paymentProviderOpenPayment: "Open Payment Specification",
  yipayGatewayURL: "Yipay submit URL",
  yipayPID: "Yipay merchant PID",
  yipayKey: "Yipay merchant key",
  yipayKeyPlaceholder: "Merchant key used for MD5 signing",
  yipayNotifyURL: "Notify URL override (optional)",
  yipayReturnURL: "Return URL override (optional)",
  yipayGatewayHint: "Yipay deployments may use different submit paths. Enter the actual submit endpoint, such as https://pay.example.com/submit.php. Notify and return URLs are generated from Base URL when left empty.",
  openPaymentBaseURL: "OPS platform base URL",
  openPaymentConfigURL: "OPS discovery URL",
  openPaymentMerchantID: "OPS merchant ID",
  openPaymentKey: "OPS merchant key",
  openPaymentKeyPlaceholder: "Merchant key used for OPS MD5 or HMAC-SHA256 signing",
  openPaymentNotifyURL: "OPS notify URL",
  openPaymentReturnURL: "OPS return URL",
  openPaymentGatewayHint: "OPS mode reads /.well-known/openpayment-configuation. The configuation spelling is part of the spec. Leave discovery URL empty to generate it from the platform base URL.",
  generatedFromBaseURL: "Generated from Base URL",
  security: "Security Policy",
  redis: "Redis",
  redisDescription: "Configure the optional Redis cache connection.",
  redisEnabled: "Enable Redis",
  redisAddress: "Redis address",
  redisUsername: "Redis username",
  redisUsernamePlaceholder: "Leave empty to omit the username",
  redisPassword: "Redis password",
  redisPasswordPlaceholder: "Leave empty to omit the password",
  redisPasswordReplacePlaceholder: "Leave empty to keep the saved password",
  redisPasswordClear: "Clear the saved Redis password",
  redisDatabase: "Redis database number",
  redisTLSEnabled: "Enable TLS",
  redisHint: "Saved settings apply on the next service start. REDIS_URL or REDIS_* environment variables override this connection configuration.",
  rateLimitEnabled: "Enable gateway rate limiting",
  rateLimitRPM: "Requests per minute",
  rateLimitBurst: "Burst allowance",
  sensitiveFilterEnabled: "Enable sensitive-word filtering",
  sensitiveWords: "Sensitive words",
  sensitiveWordsPlaceholder: "One per line or comma-separated, e.g. blocked word\nsecret-key",
  sensitiveWordsReplacePlaceholder: "Saved rules are not shown. Leave empty to keep them, or enter a replacement.",
  sensitiveValuePlaceholder: "Saved value is not shown. Leave empty to keep it.",
  sensitiveFilterScope: "Filter scope",
  filterScopeRequest: "Request content only",
  filterScopeRequestResponse: "Request and response content",
  ssrfProtectionEnabled: "Enable SSRF protection",
  ssrfAllowPrivateNetworks: "Allow private networks",
  ssrfAllowedHosts: "SSRF allowed hosts",
  ssrfAllowedHostsPlaceholder: "One per line or comma-separated, e.g. internal-api.example.com\n192.168.1.10",
  premiumRequiredTitle: "Feature available",
  premiumRequiredDescription: "This feature is integrated into the current edition.",
  premiumRequiredAction: "Got it",
  auth: "Authentication",
  email: "Email",
  content: "Content",
  topNavigation: "Top Navigation",
  navigation: "Sidebar Modules",
  statusMonitor: "Status Monitor",
  reliability: "Reliability",
  scheduledTasks: "Scheduled Tasks",
  scheduledTasksTitle: "Unified task scheduling",
  scheduledTasksDescription: "All background jobs are managed by the unified scheduler; cluster-level jobs run only on the primary node. Trigger jobs manually and inspect run history here.",
  scheduledTasksReplicaHint: "This node is a replica. Cluster-level jobs run on the primary node; trigger them there.",
  taskName: "Task",
  taskInterval: "Interval",
  taskEnabled: "Enabled",
  taskDisabled: "Disabled",
  taskRunning: "Running",
  taskPrimaryOnly: "primary only",
  taskLastRun: "Last run",
  taskLastResult: "Last result",
  taskNextRun: "Next run",
  taskNever: "Never",
  taskListEmpty: "No scheduled jobs registered",
  taskRunNow: "Run now",
  taskRunQueued: "Run queued",
  taskRunFailed: "Failed to trigger",
  taskStatusSuccess: "Success",
  taskStatusFailed: "Failed",
  taskRunHistory: "Run history",
  taskRunHistoryDescription: "Each actual execution is recorded (idle scans are not); retention follows the log cleanup settings.",
  taskAllTasks: "All tasks",
  taskNoRuns: "No runs recorded yet",
  taskRunTotal: "{count} records",
  taskRunTime: "Time",
  taskTrigger: "Trigger",
  taskTriggerSchedule: "Schedule",
  taskTriggerManual: "Manual",
  taskDuration: "Duration",
  taskNode: "Node",
  taskMessage: "Message",
  taskPrevPage: "Previous",
  taskNextPage: "Next",
  taskLabels: {
    price_sync: "Price sync",
    status_monitor: "Status monitor",
    reliability: "Reliability probe",
    log_cleanup: "Log cleanup",
    auto_update: "Auto update",
    node_heartbeat: "Node heartbeat",
    advanced_chat_scheduled_tasks: "AI scheduled tasks",
    personal_company_scheduler: "Studio scheduler",
    plugin_credential_refresh: "Plugin credential refresh",
  },
  nodes: "Nodes",
  nodesTitle: "Primary and replicas",
  nodesDescription: "When several instances share one database, only the primary runs scheduled work (price sync, status monitoring, reliability probing, log cleanup, task dispatch). Replicas only serve requests.",
  multiNodeEnabled: "Enable multi-node",
  nodeAddressMode: "Address form",
  nodeAddressSingle: "Single address",
  nodeAddressMultiple: "Multiple addresses",
  nodeAddress: "Proxy address",
  nodeAddresses: "Proxy addresses",
  nodeAddressesPlaceholder: "One per line, for example https://node-a.example.com",
  nodeEnvHint: "With multi-node enabled, every instance must set its node name in the environment:",
  nodeNameMissing: "This instance has no NODE_NAME, so it will fail to start in multi-node mode. Set the node name in its environment first.",
  nodeName: "Node",
  nodeRole: "Role",
  nodeLastSeen: "Last heartbeat",
  nodePrimary: "Primary",
  nodeReplica: "Replica",
  nodeOnline: "Online",
  nodeOffline: "Offline",
  nodeCurrent: "(this instance)",
  nodePromote: "Make primary",
  noNodes: "No nodes registered yet (they register on restart once multi-node is on)",
  nodesFooterHint: "The first node to register becomes the primary and later nodes join as replicas; a restart keeps the existing role. The address fields are records only — a single address or several behind the proxy makes no difference to the backend.",
  logCleanup: "Log Cleanup",
  groups: "User Groups",
  advancedChat: "agent chat",
  advancedChatAssistant: "Assistant",
  advancedChatAttachments: "Attachments",
  advancedChatMCP: "MCP Servers",
  siteName: "Site name",
  siteNamePlaceholder: "For example, WindyPear API",
  baseURL: "Base URL",
  baseURLPlaceholder: "For example, https://api.example.com",
  iconURL: "Icon URL",
  iconURLPlaceholder: "For example, https://example.com/icon.png",
  footerText: "Footer text",
  communityEnabled: "Enable community",
  communityEnabledHint: "When disabled, the community entry in chat and the community browse/import APIs are unavailable.",
  footerTextPlaceholder: "For example, © 2026 WindyPear",
  homeIframeURL: "Home iframe URL",
  homeIframeURLPlaceholder: "For example, https://status.example.com",
  pricingEndpointEnabled: "Expose /api/pricing price endpoint",
  referralEnabled: "Enable referral commission",
  referralRate: "Commission rate",
  referralRatePlaceholder: "For example, 0.1 means 10%",
  referralRateShort: "Rate",
  groupMultiplierMode: "Multiple group multiplier mode",
  groupModeMin: "Use lower multiplier",
  groupModeMax: "Use higher multiplier",
  statusMonitorEnabled: "Enable public status page",
  createStatusMonitor: "Add monitor",
  updateStatusMonitor: "Update monitor",
  monitorName: "Node name",
  monitorNamePlaceholder: "For example, Primary API",
  monitorTarget: "Target",
  monitorTargetPlaceholder: "HTTP uses https://api.example.com/health, TCP uses host:port",
  checkType: "Check type",
  checkTypeHTTP: "HTTP / HTTPS",
  checkTypeTCP: "TCP port",
  httpMethod: "HTTP method",
  checkInterval: "Check interval",
  checkIntervalPlaceholder: "Seconds, minimum 10, for example 60",
  retention: "Retention",
  retentionPlaceholder: "Hours, for example 168",
  lastResult: "Last result",
  noStatusMonitors: "No monitors",
  checkNow: "Check now",
  statusMonitorSaved: "Monitor saved",
  statusMonitorSaveFailed: "Failed to save monitor",
  statusMonitorDeleted: "Monitor deleted",
  statusMonitorDeleteFailed: "Failed to delete monitor",
  statusMonitorChecked: "Check finished",
  statusMonitorCheckFailed: "Check failed",
  reliabilityUpstreamTitle: "Upstream channel reliability",
  reliabilityUpstreamDescription: "Configure upstream failure tracking, automatic disabling, health detection, and recovery.",
  reliabilityAutoDisableEnabled: "Disable upstream channels after consecutive failures",
  reliabilityDisableAfterFailures: "Consecutive failure threshold",
  reliabilityAutoDetectUpstreamEnabled: "Automatically detect upstream channels",
  reliabilityAutoDetectIntervalSeconds: "Detection interval (seconds)",
  reliabilityAutoDetectTimeoutSeconds: "Detection timeout (seconds)",
  reliabilityAutoRecoverEnabled: "Automatically recover disabled channels",
  reliabilityRecoveryAfterSeconds: "Recovery wait time (seconds)",
  reliabilityHint: "Network errors, 401/403, 408/429, and 5xx responses count as failures. Normal 400 request errors do not disable channels.",
  logCleanupTitle: "Automatic log cleanup",
  logCleanupDescription: "Audit, usage, plugin, and status-check records are stored in an independent log database outside the business database.",
  logRetentionAPIDays: "API access log retention days",
  logRetentionLoginDays: "Login log retention days",
  logRetentionAdminDays: "Admin change log retention days",
  logRetentionSystemDays: "System log retention days",
  logRetentionTokenDays: "Billing call log retention days",
  logRetentionCleanupIntervalHours: "Cleanup interval (hours)",
  logCleanupHint: "Single-file mode uses log/flai-log.db. Daily mode creates one database file per day under log/. Saved settings take effect immediately; the background task removes expired records.",
  logStorageMode: "Log database mode",
  logStorageSingle: "Single log database file",
  logStorageDaily: "One log database per day",
  logRetentionDays: "Log retention days (1–3650)",
  logsDeleteAll: "Delete all logs",
  logsDeleteConfirm: "Delete all logs? This cannot be undone.",
  logsDeleted: "Deleted {count} log records",
  logsDeleteFailed: "Failed to delete logs",
  configurationBackup: "Configuration Backup & Restore",
  configurationBackupDescription: "Export the current system configuration as JSON or restore a previously exported file.",
  configurationSystemSettings: "All system settings",
  configurationChannels: "Channel information (including API keys)",
  configurationModels: "Model data",
  configurationPrices: "Model pricing and channel mappings",
  configurationExport: "Export JSON",
  configurationExported: "Configuration exported",
  configurationExportFailed: "Failed to export configuration",
  configurationImport: "Import configuration",
  configurationImportDescription: "Importing overwrites matching settings, channels, and models; records not in the file are retained.",
  configurationImportConfirm: "Import this configuration file? Matching configuration will be overwritten.",
  configurationImported: "Configuration imported",
  configurationImportFailed: "Failed to import configuration",
  configurationInvalidFile: "Choose a valid JSON configuration file",
  configurationBackupHint: "Only system settings, channels, models, and pricing are included. Users, API keys, balances, orders, logs, and other business data are never imported. Channel exports can contain secrets; store the file safely.",
  autoUpdate: "Automatic Updates",
  autoUpdateDescription: "Check and install the current OS/architecture community package from the latest stable veloce-ailab/veloce release.",
  autoUpdateEnabled: "Enable automatic updates",
  autoUpdateIntervalHours: "Check interval (hours, 1–168)",
  autoUpdateCurrentVersion: "Current version",
  autoUpdateLatestVersion: "Latest version",
  autoUpdatePlatform: "Platform",
  autoUpdateLastChecked: "Last checked",
  autoUpdateLastError: "Last error",
  autoUpdateCheckNow: "Check now",
  autoUpdateInstallNow: "Update now",
  autoUpdateStarted: "Update download started. The service will restart when it finishes.",
  autoUpdateStartFailed: "Failed to start update",
  autoUpdateInProgress: "Updating",
  autoUpdateAvailable: "An update is available. Update now, or enable automatic updates to install it on the next scheduled check.",
  autoUpdateUpToDate: "You are up to date.",
  autoUpdateCheckFailed: "Failed to check for updates",
  autoUpdateUnsupported: "This is not an official release binary with a version, so it cannot update itself. Install an official release package.",
  autoUpdateHint: "The download is verified against the SHA-256 digest from the GitHub release. The archive must contain exactly one root binary. On success, the service briefly restarts and keeps the prior binary as a .previous backup.",
  statusUp: "Up",
  statusDown: "Down",
  statusPending: "Pending",
  oidcEnabled: "Enable OIDC login",
  passkeyEnabled: "Enable passkey login",
  passwordLoginEnabled: "Allow password login",
  passwordRegistrationEnabled: "Allow password registration",
  emailVerificationRequired: "Require email verification on registration",
  passwordHCaptchaEnabled: "Enable hCaptcha for password auth",
  authAgreementMode: "Agreement confirmation",
  authAgreementModeNotice: "Notice: click to agree",
  authAgreementModeCheckbox: "Require manual checkbox",
  hcaptchaSiteKey: "hCaptcha Site Key",
  hcaptchaSiteKeyPlaceholder: "Site key used by the frontend",
  hcaptchaSecret: "hCaptcha Secret",
  hcaptchaSecretPlaceholder: "Secret used by the backend",
  smtpHost: "SMTP Host",
  smtpHostPlaceholder: "For example, smtp.example.com",
  smtpPort: "SMTP Port",
  smtpPortPlaceholder: "For example, 587",
  smtpUsername: "SMTP username",
  smtpUsernamePlaceholder: "For example, no-reply@example.com",
  smtpPassword: "SMTP password",
  smtpPasswordPlaceholder: "SMTP password or app password",
  smtpFrom: "From",
  smtpFromPlaceholder: "For example, WindyPear <no-reply@example.com>",
  smsSection: "SMS verification",
  smsSectionDescription: "Configure an SMS provider to enable phone number registration and binding.",
  smsEnabled: "Enable phone authentication (register/bind)",
  smsLoginEnabled: "Enable SMS code login",
  smsBindingRequired: "Require users to bind a phone number",
  smsProvider: "SMS provider",
  smsProviderAliyun: "Aliyun SMS",
  smsProviderTencent: "Tencent Cloud SMS",
  smsAliyunAccessKeyID: "Aliyun AccessKey ID",
  smsAliyunAccessKeySecret: "Aliyun AccessKey Secret",
  smsAliyunTemplateCode: "Aliyun template code",
  smsTencentSecretID: "Tencent Cloud SecretId",
  smsTencentSecretKey: "Tencent Cloud SecretKey",
  smsTencentSDKAppID: "Tencent Cloud SDK AppId",
  smsTencentTemplateID: "Tencent Cloud template ID",
  smsTencentRegion: "Tencent Cloud region",
  smsSignName: "SMS sign name",
  smsSignNamePlaceholder: "Approved SMS signature",
  smsHint: "The template must contain one verification-code variable: ${code} for Aliyun, {1} for Tencent Cloud. Mainland China phone numbers are supported.",
  referredUser: "Referred user",
  baseCost: "Cost",
  commission: "Commission",
  createdAt: "Time",
  noReferralLogs: "No referral commission logs",
  oidcIssuer: "OIDC Issuer",
  oidcIssuerPlaceholder: "Empty uses OIDC_ISSUER",
  oidcClientID: "OIDC Client ID",
  oidcClientIDPlaceholder: "Empty uses OIDC_CLIENT_ID",
  oidcClientSecret: "OIDC Client Secret",
  oidcClientSecretPlaceholder: "Empty uses OIDC_CLIENT_SECRET",
  oidcRedirectURL: "OIDC Redirect URL",
  oidcRedirectURLPlaceholder: "Empty uses OIDC_REDIRECT_URL",
  announcement: "System announcement",
  announcementPlaceholder: "Announcement shown at the top of user pages",
  announcements: "Announcements",
  announcementsDescription: "Manage the announcement list shown on the user dashboard.",
  createAnnouncement: "Add announcement",
  updateAnnouncement: "Update announcement",
  announcementTitle: "Announcement title",
  announcementTitlePlaceholder: "For example, Maintenance notice",
  announcementContent: "Announcement content",
  announcementContentPlaceholder: "Enter announcement body",
  noAnnouncements: "No announcements",
  sortOrder: "Sort order",
  announcementSaved: "Announcement saved",
  announcementSaveFailed: "Failed to save announcement",
  announcementDeleted: "Announcement deleted",
  announcementDeleteFailed: "Failed to delete announcement",
  aboutHTML: "About page HTML",
  aboutHTMLPlaceholder: "<h2>About</h2><p>...</p>",
  privacyPolicyURL: "Privacy policy URL",
  privacyPolicyURLPlaceholder: "For example, https://example.com/privacy",
  termsURL: "Terms URL",
  termsURLPlaceholder: "For example, https://example.com/terms",
  privacyPolicy: "Privacy policy",
  privacyPolicyPlaceholder: "<h2>Privacy policy</h2><p>...</p>",
  terms: "Terms",
  termsPlaceholder: "<h2>Terms</h2><p>...</p>",
  topNav: "Top navigation",
  topNavItems: "Top navigation items",
  addTopNavItem: "Add item",
  noTopNavItems: "No navigation items",
  topNavLabelPlaceholder: "Label, for example Dashboard",
  topNavHrefPlaceholder: "URL, for example /dashboard or https://example.com",
  moveUp: "Move up",
  moveDown: "Move down",
  deleteTopNavItem: "Delete",
  sidebarDashboard: "Sidebar: Dashboard",
  sidebarUsage: "Sidebar: Call Records",
  sidebarWallet: "Sidebar: Wallet",
  sidebarDataBoard: "Sidebar: Data Board",
  sidebarAPIKeys: "Sidebar: API Keys",
  sidebarChat: "Sidebar: Chat",
  chatPageMode: "Chat page",
  chatPageModeBasic: "Basic chat (inside dashboard)",
  chatPageModeAdvanced: "agent chat (standalone page)",
  chatPageModeHint: "agent chat opens the standalone /chat page.",
  messageChannelEnabled: "Enable Message Channels",
  sidebarImages: "Sidebar: AI Images",
  sidebarSettings: "Sidebar: Settings",
  sidebarSystem: "Sidebar: System",
  sidebarAdminOverview: "Sidebar: Admin Overview",
  sidebarChannels: "Sidebar: Channels",
  sidebarModels: "Sidebar: Model Config",
  sidebarUsers: "Sidebar: Users",
  groupName: "Group name",
  groupMultiplier: "Group multiplier",
  groupNamePlaceholder: "For example, vip",
  groupMultiplierPlaceholder: "Multiplier, for example 0.8",
  createGroup: "Create group",
  updateGroup: "Update group",
  cancelEdit: "Cancel edit",
  groupSaved: "Group saved",
  groupSaveFailed: "Failed to save group",
  groupDeleted: "Group deleted",
  groupDeleteFailed: "Failed to delete group, it may still be in use",
  noGroups: "No groups",
  redeemCodes: "Redeem Codes",
  redeemCode: "Redeem code",
  redeemCodePlaceholder: "Empty to auto-generate",
  redeemAmountPlaceholder: "Balance amount",
  redeemMaxUsesPlaceholder: "Uses",
  groupGrant: "Group grant",
  noGroupGrant: "No group grant",
  groupDuration: "Group duration",
  groupDurationPlaceholder: "Days, 0 means permanent",
  metaModels: "Meta Models",
  metaModelsDescription: "Create dynamic routing models with Meta Module Language.",
  createMetaModel: "Create meta model",
  updateMetaModel: "Update meta model",
  metaModelSaved: "Meta model saved",
  metaModelSaveFailed: "Failed to save meta model",
  metaModelDeleted: "Meta model deleted",
  metaModelDeleteFailed: "Failed to delete meta model",
  metaModelValid: "Meta model Language is valid",
  metaModelInvalid: "Meta model Language is invalid",
  noMetaModels: "No meta models",
  metaModelName: "Meta model name",
  metaModelNamePlaceholder: "For example, meta-smart",
  description: "Description",
  metaModelDescriptionPlaceholder: "Describe what this meta model is for",
  metaModelProvider: "Public provider",
  metaModelReferencedVisibility: "Base models",
  metaModelPublicDisplay: "Public display",
  metaModelPublicDisplayHelp: "Controls how the model appears in the public catalog and model marketplace. It does not change runtime routing.",
  metaModelProviderID: "Provider ID",
  metaModelProviderName: "Provider name",
  metaModelProviderIconURL: "Provider icon URL",
  metaModelExposeReferencedModels: "Show base model list",
  metaModelExposeReferencedModelsHelp: "When disabled, /api/public/models will not return referenced_models and the model marketplace will not show the real models behind this meta model.",
  billingMode: "Billing mode",
  billingModeActual: "Bill actual called model",
  billingModeMeta: "Bill meta model prices",
  billingModeActualShort: "Actual",
  billingModeMetaShort: "Meta",
  inputPrice: "Input price",
  outputPrice: "Output price",
  cachedInputPrice: "Cached input price",
  metaModelDSL: "Meta Module Language",
  metaModelDSLPlaceholder: "route {\n  when request.input_tokens <= 2000 => call \"your-real-model-a\"\n  otherwise => call \"your-real-model-b\"\n}",
  metaModelDSLHelp: "Model names in call must reference existing real models. Current execution supports call, route, and switch. Conditions support number, boolean, and string matching.",
  validateMetaModel: "Validate Language",
  subscriptionPlans: "Subscription Plans",
  subscriptionPlansDescription: "Create recurring quota plans that can be granted by redeem codes.",
  createSubscriptionPlan: "Create plan",
  updateSubscriptionPlan: "Update plan",
  subscriptionPlanSaved: "Subscription plan saved",
  subscriptionPlanSaveFailed: "Failed to save subscription plan",
  subscriptionPlanDeleted: "Subscription plan deleted",
  subscriptionPlanDeleteFailed: "Failed to delete subscription plan, it may still be in use",
  noSubscriptionPlans: "No subscription plans",
  planName: "Plan name",
  planNamePlaceholder: "For example, Pro monthly",
  resetAmount: "Reset amount",
  resetAmountPlaceholder: "Quota per period",
  resetInterval: "Reset interval",
  resetIntervalPlaceholder: "Days, for example 30",
  planPrice: "Price",
  planPricePlaceholder: "For example 10",
  planDuration: "Duration",
  planDurationPlaceholder: "Days; 0 means permanent",
  planPurchasable: "Allow direct purchase",
  planPermanent: "Permanent",
  notPurchasable: "Not purchasable",
  subscriptionPlan: "Subscription plan",
  noSubscriptionPlan: "No subscription plan",
  subscriptionDuration: "Subscription duration",
  subscriptionDurationPlaceholder: "Days, 0 means permanent",
  allowStacking: "Allow duration stacking",
  permanent: "Permanent",
  days: " days",
  createRedeemCode: "Create code",
  downloadSelected: "Download selected",
  selectedCount: "{count} selected",
  redeemSearchPlaceholder: "Search redeem codes",
  filterAllStatus: "All statuses",
  filterEnabled: "Enabled",
  filterDisabled: "Disabled",
  filterExpired: "Expired",
  filterUsedUp: "Used up",
  filterAllGroups: "All groups",
  sortCreatedDesc: "Newest first",
  sortCreatedAsc: "Oldest first",
  sortCodeAsc: "Code A-Z",
  sortAmountDesc: "Amount high to low",
  sortUsedDesc: "Most used first",
  sortExpiresAsc: "Expires soonest",
  redeemCodeCreated: "Redeem code created",
  redeemCodeCreateFailed: "Failed to create redeem code",
  redeemCodeUpdated: "Redeem code updated",
  redeemCodeUpdateFailed: "Failed to update redeem code",
  redeemCodeDeleted: "Redeem code deleted",
  redeemCodeDeleteFailed: "Failed to delete redeem code",
  noRedeemCodes: "No redeem codes",
  amount: "Amount",
  usage: "Usage",
  expiresAt: "Expires",
  status: "Status",
  visible: "Visible",
  hidden: "Hidden",
  enabled: "Enabled",
  disabled: "Disabled",
}
