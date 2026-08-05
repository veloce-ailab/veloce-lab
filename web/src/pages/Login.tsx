import { useMutation, useQuery } from "@tanstack/react-query"
import { useEffect, useRef, useState } from "react"
import { Link } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { HCaptcha } from "@/components/HCaptcha"
import { Input } from "@/components/ui/input"
import { useToast } from "@/components/ui/toast"
import api, { apiURL, getOAuthLoginURL, isDesktopTarget, setAuthToken } from "@/lib/api"
import { resolvePostLoginPath } from "@/lib/desktop-authorize"
import { useI18n } from "@/lib/i18n"
import type { OAuthProviderSummary as OAuthProvider, PublicSettings } from "@/lib/public-settings"
import { parseOAuthProviders, withPublicSettingsDefaults } from "@/lib/public-settings"
import { passkeyCredentialToJSON, passkeySupported, preparePasskeyRequestOptions } from "@/lib/passkey"
import DesktopLogin from "@/desktop/DesktopLogin"

type Mode = "login" | "register"

export default function Login() {
  // The desktop app never renders the in-app form: sign-in happens inside an
  // embedded authorization window served by the site itself (hCaptcha cannot
  // run on file:// pages, and OIDC needs a real browser origin).
  if (isDesktopTarget()) {
    return <DesktopLogin />
  }
  return <WebLogin />
}

function WebLogin() {
  const { language, t } = useI18n()
  const { success, error } = useToast()
  const copy = language === "zh" ? zhCopy : enCopy
  const oauthCopy = language === "zh" ? zhOAuthLoginCopy : enOAuthLoginCopy
  const { data: settings, isLoading: isSettingsLoading } = useQuery<PublicSettings>({
    queryKey: ["public-settings"],
    queryFn: async () => {
      const res = await api.get("/public/settings")
      return res.data
    },
  })
  const publicSettings = withPublicSettingsDefaults(settings)
  const oauthProviders = parseOAuthProviders(publicSettings.oauth_providers)
  const initialMode: Mode = "login"
  const [mode, setMode] = useState<Mode>(initialMode)
  const [loginMethod, setLoginMethod] = useState<"password" | "sms">("password")
  const [phone, setPhone] = useState("")
  const [phoneCode, setPhoneCode] = useState("")
  const [identifier, setIdentifier] = useState("")
  const [username, setUsername] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [emailCode, setEmailCode] = useState("")
  const [captchaToken, setCaptchaToken] = useState("")
  const [captchaVerifiedEmail, setCaptchaVerifiedEmail] = useState("")
  const [captchaResetKey, setCaptchaResetKey] = useState(0)
  const [agreementAccepted, setAgreementAccepted] = useState(false)
  const labels = language === "zh"
    ? { about: "关于", privacy: "隐私政策", terms: "用户协议" }
    : { about: "About", privacy: "Privacy", terms: "Terms" }

  useEffect(() => {
    const referralCode = new URLSearchParams(window.location.search).get("ref")
    if (referralCode) {
      localStorage.setItem("referral_code", referralCode)
    }
  }, [])

  useEffect(() => {
    if (mode === "register" && !publicSettings.password_registration_enabled && publicSettings.password_login_enabled) {
      setMode("login")
    }
  }, [mode, publicSettings.password_login_enabled, publicSettings.password_registration_enabled])

  const submitPassword = useMutation({
    mutationFn: async () => {
      if (!agreementReady) {
        throw new Error(copy.agreementRequired)
      }
      const endpoint = mode === "login" ? "/auth/password/login" : "/auth/password/register"
      const payload = mode === "login"
        ? { identifier, password, captcha_token: captchaToken, agreement_accepted: true }
        : {
            username,
            email,
            password,
            email_code: emailCode,
            captcha_token: captchaToken,
            referral_code: localStorage.getItem("referral_code") || "",
            agreement_accepted: true,
          }
      const response = await fetch(apiURL(endpoint), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(body.error || copy.authFailed)
      }
      return body as { token: string }
    },
    onSuccess: (result) => {
      setAuthToken(result.token)
      localStorage.removeItem("referral_code")
      window.location.href = isDesktopTarget() ? "#/chat" : resolvePostLoginPath()
    },
    onError: (err) => error(err instanceof Error ? err.message : copy.authFailed),
  })

  const signInWithPasskey = useMutation({
    mutationFn: async () => {
      if (!agreementReady) {
        throw new Error(copy.agreementRequired)
      }
      if (!passkeySupported()) {
        throw new Error(copy.passkeyUnsupported)
      }
      const optionsResponse = await fetch(apiURL("/auth/passkey/login/options"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier, agreement_accepted: true }),
      })
      const options = await optionsResponse.json().catch(() => ({}))
      if (!optionsResponse.ok) {
        throw new Error(options.error || copy.passkeyFailed)
      }
      const credential = await navigator.credentials.get({
        publicKey: preparePasskeyRequestOptions(options),
      })
      const payload = passkeyCredentialToJSON(credential)
      if (!payload) {
        throw new Error(copy.passkeyFailed)
      }
      const response = await fetch(apiURL("/auth/passkey/login"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(body.error || copy.passkeyFailed)
      }
      return body as { token: string }
    },
    onSuccess: (result) => {
      setAuthToken(result.token)
      localStorage.removeItem("referral_code")
      window.location.href = isDesktopTarget() ? "#/chat" : resolvePostLoginPath()
    },
    onError: (err) => error(err instanceof Error ? err.message : copy.passkeyFailed),
  })

  const submitPhoneLogin = useMutation({
    mutationFn: async () => {
      if (!agreementReady) {
        throw new Error(copy.agreementRequired)
      }
      const response = await fetch(apiURL("/auth/phone/login"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, phone_code: phoneCode, agreement_accepted: true }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(body.error || copy.authFailed)
      }
      return body as { token: string }
    },
    onSuccess: (result) => {
      setAuthToken(result.token)
      localStorage.removeItem("referral_code")
      window.location.href = isDesktopTarget() ? "#/chat" : resolvePostLoginPath()
    },
    onError: (err) => error(err instanceof Error ? err.message : copy.authFailed),
  })

  const sendPhoneLoginCode = useMutation({
    mutationFn: async () => {
      const response = await fetch(apiURL("/auth/phone/login-code"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, captcha_token: captchaToken }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(body.error || copy.sendCodeFailed)
      }
      return body
    },
    onSuccess: () => {
      setCaptchaToken("")
      setCaptchaResetKey((value) => value + 1)
      success(copy.codeSent)
    },
    onError: (err) => error(err instanceof Error ? err.message : copy.sendCodeFailed),
  })

  const sendCode = useMutation({
    mutationFn: async () => {
      const response = await fetch(apiURL("/auth/password/email-code"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, captcha_token: captchaToken }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(body.error || copy.sendCodeFailed)
      }
      return body
    },
    onSuccess: () => {
      setCaptchaVerifiedEmail(email.trim().toLowerCase())
      setCaptchaToken("")
      setCaptchaResetKey((value) => value + 1)
      success(copy.codeSent)
    },
    onError: (err) => error(err instanceof Error ? err.message : copy.sendCodeFailed),
  })

  const handleOAuthLogin = (provider: OAuthProvider) => {
    if (!agreementReady) {
      error(copy.agreementRequired)
      return
    }
    window.location.href = getOAuthLoginURL(provider.login_url || `/auth/oauth/${provider.key}/login`, new URLSearchParams(window.location.search).get("ref"), true)
  }

  // The desktop authorize flow can deep-link straight to an OAuth provider
  // (?provider=key). Auto-trigger it unless the agreement checkbox must be
  // ticked first.
  const autoOAuthTriggered = useRef(false)
  useEffect(() => {
    if (autoOAuthTriggered.current || !settings) {
      return
    }
    const providerKey = new URLSearchParams(window.location.search).get("provider")
    if (!providerKey || requiresAgreementCheckbox) {
      return
    }
    const provider = oauthProviders.find((item) => item.key === providerKey)
    if (!provider || !publicSettings.oidc_enabled) {
      return
    }
    autoOAuthTriggered.current = true
    handleOAuthLogin(provider)
  })

  const passwordAuthEnabled = publicSettings.password_login_enabled || publicSettings.password_registration_enabled
  const captchaEnabled = passwordAuthEnabled && publicSettings.password_hcaptcha_enabled && Boolean(publicSettings.hcaptcha_site_key)
  const captchaSatisfiedByEmailCode = mode === "register" && publicSettings.email_verification_required && captchaVerifiedEmail === email.trim().toLowerCase()
  const oauthEnabled = publicSettings.oidc_enabled && oauthProviders.length > 0
  const oidcOnly = oauthEnabled && !passwordAuthEnabled && !publicSettings.passkey_enabled
  const privacyHref = legalHref("privacy", publicSettings)
  const termsHref = legalHref("terms", publicSettings)
  const hasAgreement = Boolean(privacyHref || termsHref)
  const agreementMode = String(publicSettings.auth_agreement_mode || "notice").trim().toLowerCase()
  const requiresAgreementCheckbox = hasAgreement && agreementMode === "checkbox"
  const agreementReady = !requiresAgreementCheckbox || agreementAccepted
  const smsLoginAvailable = publicSettings.sms_login_enabled
  const usingSMSLogin = mode === "login" && smsLoginAvailable && loginMethod === "sms"
  const canSubmit = (mode === "login"
    ? (usingSMSLogin ? Boolean(phone.trim() && phoneCode.trim()) : Boolean(identifier.trim() && password))
    : Boolean(username.trim() && email.trim() && password && (!publicSettings.email_verification_required || emailCode.trim()))) && agreementReady
  const noLoginMethod = !passwordAuthEnabled && !oauthEnabled && !publicSettings.passkey_enabled

  if (isSettingsLoading && !settings) {
    return (
      <div className="flex min-h-screen w-screen items-center justify-center bg-muted/50 p-4 text-sm text-muted-foreground">
        {t("common.loading")}
      </div>
    )
  }

  return (
    <div className="flex min-h-screen w-screen items-center justify-center bg-muted/50 p-4">
      <Card className="w-full max-w-[440px]">
        <CardHeader className="text-center">
          <Link to="/" className="mx-auto block">
            {publicSettings.icon_url && (
              <img src={publicSettings.icon_url} alt="" className="mx-auto h-12 w-12 rounded object-cover" />
            )}
            <CardTitle className="mt-2 text-3xl font-bold">{publicSettings.site_name}</CardTitle>
          </Link>
          <CardDescription>{t("login.description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {noLoginMethod ? (
            <div className="rounded-md border p-4 text-center text-sm text-muted-foreground">{copy.noLoginMethod}</div>
          ) : (
            <>
              {passwordAuthEnabled && (
                <div className="flex rounded-md border p-1">
                  {publicSettings.password_login_enabled && (
                    <Button variant={mode === "login" ? "default" : "ghost"} className="flex-1" onClick={() => setMode("login")}>
                      {copy.login}
                    </Button>
                  )}
                </div>
              )}

              {mode === "login" && publicSettings.password_login_enabled && !usingSMSLogin && (
                <div className="space-y-3">
                  <Input value={identifier} placeholder={copy.identifierPlaceholder} onChange={(event) => setIdentifier(event.target.value)} />
                  <Input value={password} type="password" placeholder={copy.passwordPlaceholder} onChange={(event) => setPassword(event.target.value)} />
                </div>
              )}

              {usingSMSLogin && (
                <div className="space-y-3">
                  <Input value={phone} placeholder={copy.phonePlaceholder} onChange={(event) => setPhone(event.target.value)} />
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Input value={phoneCode} placeholder={copy.phoneCodePlaceholder} onChange={(event) => setPhoneCode(event.target.value)} />
                    <Button variant="outline" className="shrink-0" disabled={!phone.trim() || (captchaEnabled && !captchaToken) || sendPhoneLoginCode.isPending} onClick={() => sendPhoneLoginCode.mutate()}>
                      {copy.sendCode}
                    </Button>
                  </div>
                </div>
              )}

              {mode === "login" && smsLoginAvailable && (
                <button
                  type="button"
                  className="w-full text-center text-xs text-muted-foreground underline-offset-4 hover:underline"
                  onClick={() => setLoginMethod(loginMethod === "sms" ? "password" : "sms")}
                >
                  {loginMethod === "sms" ? copy.usePasswordLogin : copy.useSMSLogin}
                </button>
              )}

              {mode === "register" && publicSettings.password_registration_enabled && (
                <div className="space-y-3">
                  <Input value={username} placeholder={copy.usernamePlaceholder} onChange={(event) => setUsername(event.target.value)} />
                  <Input value={email} type="email" placeholder={copy.emailPlaceholder} onChange={(event) => { setEmail(event.target.value); if (event.target.value.trim().toLowerCase() !== captchaVerifiedEmail) setCaptchaVerifiedEmail("") }} />
                  <Input value={password} type="password" placeholder={copy.passwordPlaceholder} onChange={(event) => setPassword(event.target.value)} />
                  {publicSettings.email_verification_required && (
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Input value={emailCode} placeholder={copy.emailCodePlaceholder} onChange={(event) => setEmailCode(event.target.value)} />
                      <Button variant="outline" className="shrink-0" disabled={!email.trim() || (captchaEnabled && !captchaToken) || sendCode.isPending} onClick={() => sendCode.mutate()}>
                        {copy.sendCode}
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {publicSettings.passkey_enabled && !publicSettings.password_login_enabled && !oidcOnly && (
                <Input value={identifier} placeholder={copy.passkeyIdentifierPlaceholder} onChange={(event) => setIdentifier(event.target.value)} />
              )}

              {captchaEnabled && !captchaSatisfiedByEmailCode && (
                <HCaptcha siteKey={publicSettings.hcaptcha_site_key} onToken={setCaptchaToken} resetKey={captchaResetKey} />
              )}

              {hasAgreement && (
                <AgreementControl
                  copy={copy}
                  labels={labels}
                  mode={requiresAgreementCheckbox ? "checkbox" : "notice"}
                  checked={agreementAccepted}
                  privacyHref={privacyHref}
                  termsHref={termsHref}
                  onCheckedChange={setAgreementAccepted}
                />
              )}

              {passwordAuthEnabled && (
                <Button
                  className="w-full"
                  disabled={!canSubmit || submitPassword.isPending || submitPhoneLogin.isPending}
                  onClick={() => (usingSMSLogin ? submitPhoneLogin.mutate() : submitPassword.mutate())}
                >
                  {mode === "login" ? copy.login : copy.register}
                </Button>
              )}

              {oauthEnabled && oauthProviders.map((provider) => (
                <Button key={provider.key} variant="outline" className="w-full" disabled={!agreementReady} onClick={() => handleOAuthLogin(provider)}>
                  {oauthCopy.loginWith.replace("{name}", provider.name || provider.key)}
                </Button>
              ))}

              {publicSettings.passkey_enabled && (
                <Button variant="outline" className="w-full" disabled={!agreementReady || signInWithPasskey.isPending} onClick={() => signInWithPasskey.mutate()}>
                  {copy.passkeyLogin}
                </Button>
              )}
            </>
          )}

          {(publicSettings.about_html || privacyHref || termsHref) && (
            <div className="flex flex-wrap justify-center gap-3 text-xs text-muted-foreground">
              {publicSettings.about_html && <Link to="/about">{labels.about}</Link>}
              {privacyHref && <LegalLink href={privacyHref} label={labels.privacy} />}
              {termsHref && <LegalLink href={termsHref} label={labels.terms} />}
            </div>
          )}
          {publicSettings.footer_text && (
            <div className="text-center text-xs text-muted-foreground">{publicSettings.footer_text}</div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

type LegalKind = "privacy" | "terms"
type LegalLabels = { privacy: string; terms: string }
type AgreementMode = "notice" | "checkbox"
type AgreementCopy = {
  agreementCheckboxPrefix: string
  agreementNoticePrefix: string
  agreementAnd: string
}

function AgreementControl({
  copy,
  labels,
  mode,
  checked,
  privacyHref,
  termsHref,
  onCheckedChange,
}: {
  copy: AgreementCopy
  labels: LegalLabels
  mode: AgreementMode
  checked: boolean
  privacyHref: string
  termsHref: string
  onCheckedChange: (checked: boolean) => void
}) {
  const content = (
    <>
      {mode === "checkbox" ? copy.agreementCheckboxPrefix : copy.agreementNoticePrefix}
      <AgreementLinks copy={copy} labels={labels} privacyHref={privacyHref} termsHref={termsHref} />
    </>
  )

  if (mode === "checkbox") {
    return (
      <label className="flex items-start gap-2 rounded-md border p-3 text-xs leading-5 text-muted-foreground">
        <Checkbox
          checked={checked}
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-input"
          onCheckedChange={(next) => onCheckedChange(next === true)}
        />
        <span>{content}</span>
      </label>
    )
  }

  return (
    <div className="rounded-md border bg-muted/40 p-3 text-xs leading-5 text-muted-foreground">
      {content}
    </div>
  )
}

function AgreementLinks({
  copy,
  labels,
  privacyHref,
  termsHref,
}: {
  copy: AgreementCopy
  labels: LegalLabels
  privacyHref: string
  termsHref: string
}) {
  const privacyLink = privacyHref ? <LegalLink href={privacyHref} label={labels.privacy} className="mx-1 font-medium text-foreground" /> : null
  const termsLink = termsHref ? <LegalLink href={termsHref} label={labels.terms} className="mx-1 font-medium text-foreground" /> : null

  if (privacyLink && termsLink) {
    return (
      <>
        {privacyLink}
        {copy.agreementAnd}
        {termsLink}
      </>
    )
  }
  return privacyLink || termsLink
}

function LegalLink({ href, label, className = "" }: { href: string; label: string; className?: string }) {
  const external = /^https?:\/\//i.test(href)
  const linkClassName = `${className} underline-offset-4 hover:underline`.trim()
  if (href.startsWith("/") && !external) {
    return <Link to={href} className={linkClassName}>{label}</Link>
  }
  return (
    <a href={href} className={linkClassName} target={external ? "_blank" : undefined} rel={external ? "noreferrer" : undefined}>
      {label}
    </a>
  )
}

function legalHref(kind: LegalKind, settings: PublicSettings) {
  const configuredURL = kind === "privacy" ? settings.privacy_policy_url : settings.terms_url
  const inlineContent = kind === "privacy" ? settings.privacy_policy : settings.terms
  const trimmedURL = configuredURL.trim()
  if (trimmedURL) {
    return trimmedURL
  }
  return inlineContent.trim() ? `/${kind}` : ""
}

const zhCopy = {
  login: "登录",
  register: "注册",
  identifierPlaceholder: "用户名或邮箱",
  usernamePlaceholder: "用户名",
  emailPlaceholder: "邮箱",
  passwordPlaceholder: "密码，至少 8 位",
  emailCodePlaceholder: "邮箱验证码",
  phonePlaceholder: "手机号",
  phoneCodePlaceholder: "短信验证码",
  useSMSLogin: "使用短信验证码登录",
  usePasswordLogin: "使用密码登录",
  sendCode: "发送验证码",
  codeSent: "验证码已发送",
  sendCodeFailed: "验证码发送失败",
  authFailed: "认证失败",
  passkeyLogin: "Passkey 登录",
  passkeyIdentifierPlaceholder: "用户名或邮箱（可选）",
  passkeyUnsupported: "当前浏览器不支持 Passkey",
  passkeyFailed: "Passkey 登录失败",
  noLoginMethod: "当前没有启用可用的登录方式",
  agreementCheckboxPrefix: "我已阅读并同意",
  agreementNoticePrefix: "点击继续即表示你已阅读并同意",
  agreementAnd: "和",
  agreementRequired: "请先阅读并同意相关协议",
}

const enCopy: typeof zhCopy = {
  login: "Sign in",
  register: "Sign up",
  identifierPlaceholder: "Username or email",
  usernamePlaceholder: "Username",
  emailPlaceholder: "Email",
  passwordPlaceholder: "Password, at least 8 characters",
  emailCodePlaceholder: "Email code",
  phonePlaceholder: "Phone number",
  phoneCodePlaceholder: "SMS code",
  useSMSLogin: "Sign in with SMS code",
  usePasswordLogin: "Sign in with password",
  sendCode: "Send code",
  codeSent: "Verification code sent",
  sendCodeFailed: "Failed to send code",
  authFailed: "Authentication failed",
  passkeyLogin: "Sign in with passkey",
  passkeyIdentifierPlaceholder: "Username or email (optional)",
  passkeyUnsupported: "This browser does not support passkeys",
  passkeyFailed: "Passkey sign-in failed",
  noLoginMethod: "No login method is enabled",
  agreementCheckboxPrefix: "I have read and agree to",
  agreementNoticePrefix: "By continuing, you agree to",
  agreementAnd: "and",
  agreementRequired: "Please read and agree to the agreements first",
}

const zhOAuthLoginCopy = {
  loginWith: "用 {name} 登录",
}

const enOAuthLoginCopy: typeof zhOAuthLoginCopy = {
  loginWith: "Sign in with {name}",
}
