import { useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { useToast } from "@/components/ui/toast"
import api, { apiURL, isDesktopTarget, setAuthToken } from "@/lib/api"
import { useI18n } from "@/lib/i18n"

interface SetupResponse {
  token: string
}

export default function Setup() {
  const { language } = useI18n()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const copy = language === "zh" ? zhCopy : enCopy
  const { error } = useToast()
  const [username, setUsername] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")

  const completeSetup = useMutation({
    mutationFn: async () => {
      const response = await fetch(apiURL("/api/setup"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username,
          email,
          password,
        }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(body.error || copy.failed)
      }
      return body as SetupResponse
    },
    onSuccess: async (result) => {
      setAuthToken(result.token)
      localStorage.removeItem("referral_code")
      if (isDesktopTarget()) {
        await api.put("/settings", { system_mode: "personal" }).catch(() => undefined)
      }
      queryClient.setQueryData(["setup-status"], { required: false })
      if (isDesktopTarget()) {
        navigate("/chat", { replace: true })
      } else {
        window.location.href = "/chat"
      }
    },
    onError: (err) => error(err instanceof Error ? err.message : copy.failed),
  })

  const canSubmit = Boolean(username.trim() && email.trim() && password.length >= 8)

  return (
    <div className="flex min-h-screen w-screen items-center justify-center bg-muted/50 p-4">
      <Card className="w-full max-w-[460px]">
        <CardHeader className="text-center">
          <CardTitle className="text-3xl font-bold">Veloce</CardTitle>
          <CardDescription>{copy.description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <Input
              value={username}
              maxLength={100}
              placeholder={copy.usernamePlaceholder}
              onChange={(event) => setUsername(event.target.value)}
            />
            <Input
              value={email}
              type="email"
              maxLength={100}
              placeholder={copy.emailPlaceholder}
              onChange={(event) => setEmail(event.target.value)}
            />
            <Input
              value={password}
              type="password"
              placeholder={copy.passwordPlaceholder}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>

          <Button className="w-full" disabled={!canSubmit || completeSetup.isPending} onClick={() => completeSetup.mutate()}>
            {completeSetup.isPending ? copy.creating : copy.submit}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

const zhCopy = {
  description: "配置首个管理员账号",
  usernamePlaceholder: "管理员用户名",
  emailPlaceholder: "管理员邮箱",
  passwordPlaceholder: "管理员密码，至少 8 位",
  submit: "完成初始化",
  creating: "正在初始化...",
  failed: "初始化失败",
}

const enCopy: typeof zhCopy = {
  description: "Create the first administrator account",
  usernamePlaceholder: "Admin username",
  emailPlaceholder: "Admin email",
  passwordPlaceholder: "Admin password, at least 8 characters",
  submit: "Complete setup",
  creating: "Setting up...",
  failed: "Setup failed",
}
