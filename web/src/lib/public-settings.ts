export interface PublicSettings {
  edition: "community" | "premium" | string
  system_mode: "operation" | "personal" | "enterprise" | string
  chat_page_mode: "basic" | "advanced" | string
  site_name: string
  base_url: string
  icon_url: string
  footer_text: string
  about_html: string
  home_iframe_url: string
  privacy_policy: string
  terms: string
  privacy_policy_url: string
  terms_url: string
  auth_agreement_mode: "notice" | "checkbox" | string
  top_nav_enabled: boolean
  top_nav_items: string
  page_layouts: string
  theme_light_background: string
  theme_light_foreground: string
  theme_light_card: string
  theme_light_card_foreground: string
  theme_light_primary: string
  theme_light_primary_foreground: string
  theme_light_secondary: string
  theme_light_secondary_foreground: string
  theme_light_accent: string
  theme_light_accent_foreground: string
  theme_light_muted: string
  theme_light_muted_foreground: string
  theme_light_border: string
  theme_dark_background: string
  theme_dark_foreground: string
  theme_dark_card: string
  theme_dark_card_foreground: string
  theme_dark_primary: string
  theme_dark_primary_foreground: string
  theme_dark_secondary: string
  theme_dark_secondary_foreground: string
  theme_dark_accent: string
  theme_dark_accent_foreground: string
  theme_dark_muted: string
  theme_dark_muted_foreground: string
  theme_dark_border: string
  theme_background_image: string
  theme_custom_css: string
  sidebar_dashboard_enabled: boolean
  sidebar_usage_enabled: boolean
  sidebar_wallet_enabled: boolean
  sidebar_data_board_enabled: boolean
  sidebar_chat_enabled: boolean
  sidebar_images_enabled: boolean
  sidebar_settings_enabled: boolean
  sidebar_system_enabled: boolean
  sidebar_admin_overview_enabled: boolean
  sidebar_channels_enabled: boolean
  sidebar_models_enabled: boolean
  sidebar_users_enabled: boolean
  message_channel_enabled: boolean
  referral_enabled: boolean
  referral_commission_rate: string
  group_multiplier_mode: string
  pricing_endpoint_enabled: boolean
  community_enabled: boolean
  status_monitor_enabled: boolean
  reliability_auto_disable_enabled: boolean
  reliability_disable_after_failures: string
  reliability_auto_detect_upstream_enabled: boolean
  reliability_auto_detect_interval_seconds: string
  reliability_auto_detect_timeout_seconds: string
  reliability_auto_recover_enabled: boolean
  reliability_recovery_after_seconds: string
  log_retention_api_days: string
  log_retention_login_days: string
  log_retention_admin_days: string
  log_retention_system_days: string
  log_retention_token_days: string
  log_retention_cleanup_interval_hours: string
  checkin_enabled: boolean
  checkin_daily_reward: string
  checkin_random_enabled: boolean
  checkin_random_min: string
  checkin_random_max: string
  payment_enabled: boolean
  payment_currency_display_name: string
  payment_usd_to_rmb_rate: string
  payment_min_recharge_amount: string
  payment_recharge_presets: string
  payment_methods: string
  oidc_enabled: boolean
  oauth_providers: string
  passkey_enabled: boolean
  password_login_enabled: boolean
  password_registration_enabled: boolean
  password_hcaptcha_enabled: boolean
  hcaptcha_site_key: string
  email_verification_required: boolean
  sms_enabled: boolean
  sms_login_enabled: boolean
  sms_binding_required: boolean
}

export const defaultPublicSettings: PublicSettings = {
  edition: "community",
  system_mode: "operation",
  chat_page_mode: "basic",
  site_name: "Veloce",
  base_url: "",
  icon_url: "",
  footer_text: "",
  about_html: "",
  home_iframe_url: "",
  privacy_policy: "",
  terms: "",
  privacy_policy_url: "",
  terms_url: "",
  auth_agreement_mode: "notice",
  top_nav_enabled: false,
  top_nav_items: "",
  page_layouts: "{}",
  theme_light_background: "#ffffff",
  theme_light_foreground: "#020817",
  theme_light_card: "#ffffff",
  theme_light_card_foreground: "#020817",
  theme_light_primary: "#0f172a",
  theme_light_primary_foreground: "#f8fafc",
  theme_light_secondary: "#f1f5f9",
  theme_light_secondary_foreground: "#0f172a",
  theme_light_accent: "#f1f5f9",
  theme_light_accent_foreground: "#0f172a",
  theme_light_muted: "#f1f5f9",
  theme_light_muted_foreground: "#64748b",
  theme_light_border: "#e2e8f0",
  theme_dark_background: "#020817",
  theme_dark_foreground: "#f8fafc",
  theme_dark_card: "#020817",
  theme_dark_card_foreground: "#f8fafc",
  theme_dark_primary: "#f8fafc",
  theme_dark_primary_foreground: "#0f172a",
  theme_dark_secondary: "#1e293b",
  theme_dark_secondary_foreground: "#f8fafc",
  theme_dark_accent: "#1e293b",
  theme_dark_accent_foreground: "#f8fafc",
  theme_dark_muted: "#1e293b",
  theme_dark_muted_foreground: "#94a3b8",
  theme_dark_border: "#1e293b",
  theme_background_image: "",
  theme_custom_css: "",
  sidebar_dashboard_enabled: true,
  sidebar_usage_enabled: true,
  sidebar_wallet_enabled: true,
  sidebar_data_board_enabled: true,
  sidebar_chat_enabled: true,
  sidebar_images_enabled: true,
  sidebar_settings_enabled: true,
  sidebar_system_enabled: true,
  sidebar_admin_overview_enabled: true,
  sidebar_channels_enabled: true,
  sidebar_models_enabled: true,
  sidebar_users_enabled: true,
  message_channel_enabled: true,
  referral_enabled: false,
  referral_commission_rate: "0",
  group_multiplier_mode: "min",
  pricing_endpoint_enabled: false,
  community_enabled: true,
  status_monitor_enabled: false,
  reliability_auto_disable_enabled: false,
  reliability_disable_after_failures: "3",
  reliability_auto_detect_upstream_enabled: false,
  reliability_auto_detect_interval_seconds: "300",
  reliability_auto_detect_timeout_seconds: "10",
  reliability_auto_recover_enabled: false,
  reliability_recovery_after_seconds: "1800",
  log_retention_api_days: "0",
  log_retention_login_days: "0",
  log_retention_admin_days: "0",
  log_retention_system_days: "0",
  log_retention_token_days: "0",
  log_retention_cleanup_interval_hours: "24",
  checkin_enabled: false,
  checkin_daily_reward: "0",
  checkin_random_enabled: false,
  checkin_random_min: "0",
  checkin_random_max: "0",
  payment_enabled: false,
  payment_currency_display_name: "$",
  payment_usd_to_rmb_rate: "7.20",
  payment_min_recharge_amount: "1",
  payment_recharge_presets: "[\"5\",\"10\",\"20\",\"50\",\"100\"]",
  payment_methods: "[\"alipay\",\"wxpay\"]",
  oidc_enabled: false,
  oauth_providers: "[]",
  passkey_enabled: false,
  password_login_enabled: true,
  password_registration_enabled: true,
  password_hcaptcha_enabled: false,
  hcaptcha_site_key: "",
  email_verification_required: false,
  sms_enabled: false,
  sms_login_enabled: false,
  sms_binding_required: false,
}

export function withPublicSettingsDefaults(settings?: Partial<PublicSettings>): PublicSettings {
  return { ...defaultPublicSettings, ...(settings || {}) }
}

export interface OAuthProviderSummary {
  key: string
  name: string
  login_url: string
  callback_url: string
}

export function parseOAuthProviders(raw: string): OAuthProviderSummary[] {
  try {
    const parsed = JSON.parse(raw || "[]")
    if (!Array.isArray(parsed)) {
      return []
    }
    return parsed
      .map((item) => ({
        key: typeof item?.key === "string" ? item.key : "",
        name: typeof item?.name === "string" ? item.name : "",
        login_url: typeof item?.login_url === "string" ? item.login_url : "",
        callback_url: typeof item?.callback_url === "string" ? item.callback_url : "",
      }))
      .filter((item) => item.key && item.name)
  } catch {
    return []
  }
}

export function isPersonalMode(settings?: Partial<Pick<PublicSettings, "system_mode">>) {
  return String(settings?.system_mode ?? defaultPublicSettings.system_mode).trim().toLowerCase() === "personal"
}

export function isAdvancedChatEnabled(settings?: Partial<PublicSettings>) {
  const publicSettings = withPublicSettingsDefaults(settings)
  return String(publicSettings.chat_page_mode).trim().toLowerCase() !== "basic"
}

export function chatPathForSettings() {
  return "/chat"
}

export function imagePathForSettings() {
  return "/chat/images"
}

export function videoPathForSettings() {
  return "/chat/videos"
}

export interface TopNavItem {
  label: string
  href: string
  external: boolean
}

export function parseTopNavItems(raw: string): TopNavItem[] {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [label, href] = line.split("|").map((part) => part.trim())
      if (!label || !href) {
        return null
      }
      return { label, href, external: /^https?:\/\//i.test(href) }
    })
    .filter((item): item is TopNavItem => Boolean(item))
}
