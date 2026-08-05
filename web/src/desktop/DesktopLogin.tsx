import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import api, { getDesktopServerURL, setAuthToken } from "@/lib/api"
import { useI18n } from "@/lib/i18n"
import type { PublicSettings } from "@/lib/public-settings"
import { parseOAuthProviders, withPublicSettingsDefaults } from "@/lib/public-settings"

// Desktop sign-in screen: no in-app credential forms. Every button opens an
// embedded authorization window (via the Electron bridge) that loads the
// server's own web login/consent flow, then comes back with a token through
// the PKCE code exchange.
export default function DesktopLogin() {
  const { language, t } = useI18n()
  const copy = language === "zh" ? zhCopy : enCopy
  const serverURL = getDesktopServerURL()
  const [pendingHint, setPendingHint] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState("")

  const { data: settings, isLoading: isSettingsLoading } = useQuery<PublicSettings>({
    queryKey: ["public-settings"],
    queryFn: async () => {
      const res = await api.get("/public/settings")
      return res.data
    },
  })
  const publicSettings = withPublicSettingsDefaults(settings)
  const oauthProviders = publicSettings.oidc_enabled ? parseOAuthProviders(publicSettings.oauth_providers) : []
  const registrationAvailable = publicSettings.password_registration_enabled || publicSettings.sms_enabled
  const bridgeAvailable = Boolean(window.veloceDesktop?.desktopAuthLogin)

  const startAuthorization = async (hint: string) => {
    const bridge = window.veloceDesktop
    if (!bridge?.desktopAuthLogin) {
      setErrorMessage(copy.bridgeMissing)
      return
    }
    setErrorMessage("")
    setPendingHint(hint)
    try {
      const result = await bridge.desktopAuthLogin({ serverURL: getDesktopServerURL(), hint })
      if (result?.ok && result.token) {
        setAuthToken(result.token)
        localStorage.removeItem("referral_code")
        window.location.href = "#/chat"
        return
      }
      if (result && !result.cancelled) {
        setErrorMessage(result.message || copy.authFailed)
      }
    } catch {
      setErrorMessage(copy.authFailed)
    } finally {
      setPendingHint(null)
    }
  }

  const busy = pendingHint !== null

  return (
    <div className="flex min-h-full w-full items-center justify-center bg-muted/50 p-4">
      <Card className="w-full max-w-[440px]">
        <CardHeader className="text-center">
          {publicSettings.icon_url && (
            <img src={publicSettings.icon_url} alt="" className="mx-auto h-12 w-12 rounded object-cover" />
          )}
          <CardTitle className="mt-2 text-3xl font-bold">{publicSettings.site_name}</CardTitle>
          <CardDescription>{t("login.description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isSettingsLoading && !settings ? (
            <div className="rounded-md border p-4 text-center text-sm text-muted-foreground">{t("common.loading")}</div>
          ) : (
            <>
              <Button className="w-full" disabled={busy || !bridgeAvailable} onClick={() => void startAuthorization("")}>
                {pendingHint === "" ? copy.waiting : copy.login}
              </Button>

              {registrationAvailable && (
                <Button
                  variant="outline"
                  className="w-full"
                  disabled={busy || !bridgeAvailable}
                  onClick={() => void startAuthorization("register")}
                >
                  {pendingHint === "register" ? copy.waiting : copy.register}
                </Button>
              )}

              {oauthProviders.map((provider) => (
                <Button
                  key={provider.key}
                  variant="outline"
                  className="w-full"
                  disabled={busy || !bridgeAvailable}
                  onClick={() => void startAuthorization(`oauth:${provider.key}`)}
                >
                  {pendingHint === `oauth:${provider.key}`
                    ? copy.waiting
                    : copy.loginWith.replace("{name}", provider.name || provider.key)}
                </Button>
              ))}

              {busy && <div className="text-center text-xs text-muted-foreground">{copy.windowHint}</div>}
              {!bridgeAvailable && (
                <div className="rounded-md border p-3 text-center text-xs text-muted-foreground">{copy.bridgeMissing}</div>
              )}
              {errorMessage && <div className="text-center text-sm text-destructive">{errorMessage}</div>}
            </>
          )}

          <div className="truncate text-center text-xs text-muted-foreground" title={serverURL}>
            {copy.serverPrefix}
            {serverURL}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

const zhCopy = {
  login: "登录",
  register: "注册新账号",
  loginWith: "用 {name} 登录",
  waiting: "等待授权……",
  windowHint: "请在弹出的授权窗口中完成登录",
  authFailed: "登录失败，请重试",
  bridgeMissing: "桌面登录组件不可用，请更新桌面客户端",
  serverPrefix: "服务器：",
}

const enCopy: typeof zhCopy = {
  login: "Sign in",
  register: "Create account",
  loginWith: "Sign in with {name}",
  waiting: "Waiting for authorization…",
  windowHint: "Complete the sign-in in the authorization window",
  authFailed: "Sign-in failed, please try again",
  bridgeMissing: "Desktop sign-in bridge is unavailable. Please update the desktop app.",
  serverPrefix: "Server: ",
}
