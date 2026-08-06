import { useEffect, useRef, useState } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import api, { getAuthToken } from "@/lib/api"
import { useI18n } from "@/lib/i18n"
import { clearDesktopAuthorizeStash, isValidDesktopAuthState, isValidDesktopCodeChallenge, saveDesktopAuthorizeStash } from "@/lib/desktop-authorize"

export default function DesktopAuthorize() {
  const { language } = useI18n()
  const location = useLocation()
  const navigate = useNavigate()
  const [errorMessage, setErrorMessage] = useState("")
  const startedRef = useRef(false)
  const params = new URLSearchParams(location.search)
  const state = params.get("state") || ""
  const codeChallenge = params.get("code_challenge") || ""
  const validRequest = isValidDesktopAuthState(state) && isValidDesktopCodeChallenge(codeChallenge)
  const copy = language === "zh"
    ? { title: "桌面端授权", description: "正在确认桌面端登录授权。", loading: "正在准备授权...", success: "授权完成，请返回桌面端。", invalid: "授权请求无效或已过期。", failed: "授权失败，请返回桌面端重试。" }
    : { title: "Desktop authorization", description: "Confirming the desktop sign-in request.", loading: "Preparing authorization...", success: "Authorization complete. Return to the desktop app.", invalid: "This authorization request is invalid or expired.", failed: "Authorization failed. Return to the desktop app and try again." }

  useEffect(() => {
    if (!validRequest || startedRef.current) {
      return
    }
    startedRef.current = true
    saveDesktopAuthorizeStash(state, codeChallenge)

    if (!getAuthToken()) {
      const returnTo = `${location.pathname}${location.search}`
      navigate(`/login?return_to=${encodeURIComponent(returnTo)}`, { replace: true })
      return
    }

    void api.post("/user/desktop/authorize", { code_challenge: codeChallenge })
      .then((response) => {
        const code = typeof response.data?.code === "string" ? response.data.code : ""
        if (!code) {
          throw new Error("Missing authorization code")
        }
        clearDesktopAuthorizeStash()
        const callback = new URLSearchParams({ code, state })
        window.location.href = `veloce://desktop-auth/callback?${callback.toString()}`
      })
      .catch(() => {
        setErrorMessage(copy.failed)
        startedRef.current = false
      })
  }, [codeChallenge, copy.failed, location.pathname, location.search, navigate, state, validRequest])

  const message = !validRequest ? copy.invalid : errorMessage || (getAuthToken() ? copy.loading : copy.description)

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-muted/50 p-4">
      <Card className="w-full max-w-[440px]">
        <CardHeader className="text-center">
          <CardTitle>{copy.title}</CardTitle>
          <CardDescription>{copy.description}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className={errorMessage || !validRequest ? "text-center text-sm text-destructive" : "text-center text-sm text-muted-foreground"}>
            {errorMessage || message}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
