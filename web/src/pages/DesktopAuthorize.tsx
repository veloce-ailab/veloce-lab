import { useEffect, useMemo, useRef, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import api, { clearAuthToken, getAuthToken } from "@/lib/api"
import {
  clearDesktopAuthorizeStash,
  desktopAuthCallbackURL,
  desktopAuthorizePath,
  isValidDesktopAuthState,
  isValidDesktopCodeChallenge,
  saveDesktopAuthorizeStash,
} from "@/lib/desktop-authorize"
import { useI18n } from "@/lib/i18n"
import type { PublicSettings } from "@/lib/public-settings"
import { withPublicSettingsDefaults } from "@/lib/public-settings"

interface CurrentUser {
  username?: string
  email?: string
  avatar_url?: string
}

// Authorization page for the Veloce Desktop client. The desktop app opens this
// page in an embedded window with a PKCE state + code challenge; once the user
// is signed in and approves, we mint a one-time code and hand it back through
// the veloce:// callback the desktop window intercepts.
export default function DesktopAuthorize() {
  const { language } = useI18n()
  const copy = language === "zh" ? zhCopy : enCopy
  const params = useMemo(() => new URLSearchParams(window.location.search), [])
  const state = params.get("state") || ""
  const codeChallenge = params.get("code_challenge") || ""
  const hint = params.get("hint") || ""
  const paramsValid = isValidDesktopAuthState(state) && isValidDesktopCodeChallenge(codeChallenge)
  const isAuthenticated = Boolean(getAuthToken())
  const [submitError, setSubmitError] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const redirectedToLogin = useRef(false)

  const loginPath = useMemo(() => {
    const loginParams = new URLSearchParams({ return_to: desktopAuthorizePath({ state, code_challenge: codeChallenge }) })
    if (hint === "register") {
      loginParams.set("mode", "register")
    }
    if (hint.startsWith("oauth:")) {
      loginParams.set("provider", hint.slice("oauth:".length))
    }
    return `/login?${loginParams.toString()}`
  }, [state, codeChallenge, hint])

  useEffect(() => {
    if (!paramsValid || redirectedToLogin.current) {
      return
    }
    saveDesktopAuthorizeStash(state, codeChallenge)
    if (!isAuthenticated) {
      redirectedToLogin.current = true
      window.location.replace(loginPath)
    }
  }, [paramsValid, isAuthenticated, state, codeChallenge, loginPath])

  const { data: settings } = useQuery<PublicSettings>({
    queryKey: ["public-settings"],
    queryFn: async () => (await api.get("/public/settings")).data,
    enabled: paramsValid,
  })
  const publicSettings = withPublicSettingsDefaults(settings)

  const { data: user, isLoading: isUserLoading } = useQuery<CurrentUser>({
    queryKey: ["me"],
    queryFn: async () => (await api.get("/user/me")).data,
    enabled: paramsValid && isAuthenticated,
    retry: false,
  })

  const finishWithCallback = (query: URLSearchParams) => {
    clearDesktopAuthorizeStash()
    window.location.replace(`${desktopAuthCallbackURL}?${query.toString()}`)
  }

  const approve = async () => {
    setSubmitError("")
    setIsSubmitting(true)
    try {
      const response = await api.post("/user/desktop/authorize", { code_challenge: codeChallenge })
      const code = typeof response.data?.code === "string" ? response.data.code : ""
      if (!code) {
        throw new Error(copy.authorizeFailed)
      }
      finishWithCallback(new URLSearchParams({ code, state }))
    } catch (err) {
      const message = err && typeof err === "object" && "response" in err
        ? String((err as { response?: { data?: { error?: string } } }).response?.data?.error || copy.authorizeFailed)
        : copy.authorizeFailed
      setSubmitError(message)
      setIsSubmitting(false)
    }
  }

  const deny = () => {
    finishWithCallback(new URLSearchParams({ error: "access_denied", state }))
  }

  const switchAccount = () => {
    clearAuthToken()
    window.location.replace(loginPath)
  }

  if (!paramsValid) {
    return (
      <div className="flex min-h-screen w-screen items-center justify-center bg-muted/50 p-4">
        <Card className="w-full max-w-[440px]">
          <CardHeader className="text-center">
            <CardTitle>{copy.invalidTitle}</CardTitle>
            <CardDescription>{copy.invalidDescription}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  if (!isAuthenticated) {
    return (
      <div className="flex min-h-screen w-screen items-center justify-center bg-muted/50 p-4 text-sm text-muted-foreground">
        {copy.redirectingToLogin}
      </div>
    )
  }

  return (
    <div className="flex min-h-screen w-screen items-center justify-center bg-muted/50 p-4">
      <Card className="w-full max-w-[440px]">
        <CardHeader className="text-center">
          {publicSettings.icon_url && (
            <img src={publicSettings.icon_url} alt="" className="mx-auto h-12 w-12 rounded object-cover" />
          )}
          <CardTitle className="mt-2 text-2xl font-bold">{publicSettings.site_name}</CardTitle>
          <CardDescription>{copy.description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-md border bg-muted/40 p-3 text-sm">
            {isUserLoading ? (
              <span className="text-muted-foreground">{copy.loadingUser}</span>
            ) : (
              <div className="flex items-center gap-3">
                {user?.avatar_url && <img src={user.avatar_url} alt="" className="h-9 w-9 rounded-full object-cover" />}
                <div className="min-w-0">
                  <div className="truncate font-medium">{user?.username || copy.currentAccount}</div>
                  {user?.email && <div className="truncate text-xs text-muted-foreground">{user.email}</div>}
                </div>
              </div>
            )}
          </div>

          <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
            <li>{copy.scopeLogin}</li>
            <li>{copy.scopeRevoke}</li>
          </ul>

          {submitError && <div className="text-center text-sm text-destructive">{submitError}</div>}

          <Button className="w-full" disabled={isSubmitting} onClick={() => void approve()}>
            {isSubmitting ? copy.authorizing : copy.approve}
          </Button>
          <Button variant="outline" className="w-full" disabled={isSubmitting} onClick={switchAccount}>
            {copy.switchAccount}
          </Button>
          <Button variant="ghost" className="w-full" disabled={isSubmitting} onClick={deny}>
            {copy.deny}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

const zhCopy = {
  invalidTitle: "授权请求无效",
  invalidDescription: "缺少必要的授权参数，请回到桌面客户端重新发起登录。",
  redirectingToLogin: "正在跳转到登录页……",
  description: "Veloce Desktop 请求登录你的账号",
  loadingUser: "正在加载账号信息……",
  currentAccount: "当前账号",
  scopeLogin: "桌面客户端将以你的身份访问此站点",
  scopeRevoke: "你可以随时在桌面客户端退出登录",
  approve: "授权登录",
  authorizing: "授权中……",
  switchAccount: "使用其他账号",
  deny: "取消",
  authorizeFailed: "授权失败，请重试",
}

const enCopy: typeof zhCopy = {
  invalidTitle: "Invalid authorization request",
  invalidDescription: "Required authorization parameters are missing. Please start the sign-in again from the desktop app.",
  redirectingToLogin: "Redirecting to sign-in…",
  description: "Veloce Desktop wants to sign in to your account",
  loadingUser: "Loading account…",
  currentAccount: "Current account",
  scopeLogin: "The desktop app will access this site as you",
  scopeRevoke: "You can sign out from the desktop app at any time",
  approve: "Authorize",
  authorizing: "Authorizing…",
  switchAccount: "Use another account",
  deny: "Cancel",
  authorizeFailed: "Authorization failed, please try again",
}
