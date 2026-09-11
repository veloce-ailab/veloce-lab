import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { KeyRound } from "lucide-react"
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  api,
  passkeyCredentialToJSON,
  passkeySupported,
  preparePasskeyCreationOptions,
  useI18n,
  withPublicSettingsDefaults,
  type PublicSettings,
} from "@velocelab/dashboard/frontend"

interface CurrentUser {
  phone?: string | null
  oidc_sub?: string | null
  is_admin: boolean
}

interface PasswordMethod {
  method: "email_code" | "current_password"
  email: string
  password_set: boolean
}

interface PasskeyCredential {
  id: number
  name: string
  sign_count: number
  last_used_at?: string | null
  created_at: string
}

/**
 * Phone, OIDC, passkey and password management. Owned by the auth plugin: the
 * settings plugin only provides the shell around it.
 */
export default function SecuritySettings() {
  const { language, t } = useI18n()
  const copy = language === "zh" ? zhSecurityCopy : enSecurityCopy
  const queryClient = useQueryClient()
  const [bindStatus, setBindStatus] = useState("")
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [passwordEmailCode, setPasswordEmailCode] = useState("")
  const [passwordStatus, setPasswordStatus] = useState("")
  const [passkeyName, setPasskeyName] = useState("")
  const [passkeyStatus, setPasskeyStatus] = useState("")
  const [bindPhoneNumber, setBindPhoneNumber] = useState("")
  const [bindPhoneCode, setBindPhoneCode] = useState("")
  const [phoneStatus, setPhoneStatus] = useState("")

  const { data: user } = useQuery<CurrentUser>({
    queryKey: ["me"],
    queryFn: async () => (await api.get("/user/me")).data,
  })
  const { data: settings } = useQuery<PublicSettings>({
    queryKey: ["public-settings"],
    queryFn: async () => (await api.get("/public/settings")).data,
  })
  const publicSettings = withPublicSettingsDefaults(settings)
  const { data: passwordMethod, isLoading: isPasswordMethodLoading } = useQuery<PasswordMethod>({
    queryKey: ["password-method"],
    queryFn: async () => (await api.get("/user/password/method")).data,
  })
  const { data: passkeys = [] } = useQuery<PasskeyCredential[]>({
    queryKey: ["passkeys"],
    queryFn: async () => {
      const res = await api.get("/user/passkeys")
      return Array.isArray(res.data) ? res.data : []
    },
    enabled: publicSettings.passkey_enabled,
  })

  const bindOIDC = useMutation({
    mutationFn: async () => {
      const res = await api.post("/user/oidc/bind-url")
      return res.data as { auth_url: string }
    },
    onSuccess: (result) => {
      window.location.href = result.auth_url
    },
    onError: (error) => setBindStatus(error instanceof Error ? error.message : copy.oidcBindFailed),
  })

  const sendPasswordCode = useMutation({
    mutationFn: async () => (await api.post("/user/password/email-code")).data,
    onSuccess: () => setPasswordStatus(copy.passwordCodeSent),
    onError: (error) => setPasswordStatus(apiErrorMessage(error, copy.passwordCodeFailed)),
  })

  const changePassword = useMutation({
    mutationFn: async () => {
      if (newPassword !== confirmPassword) {
        throw new Error(copy.passwordMismatch)
      }
      const res = await api.post("/user/password/change", {
        current_password: currentPassword,
        new_password: newPassword,
        email_code: passwordEmailCode,
      })
      return res.data
    },
    onSuccess: () => {
      setPasswordStatus(copy.passwordUpdated)
      setCurrentPassword("")
      setNewPassword("")
      setConfirmPassword("")
      setPasswordEmailCode("")
      queryClient.invalidateQueries({ queryKey: ["password-method"] })
    },
    onError: (error) => setPasswordStatus(apiErrorMessage(error, copy.passwordUpdateFailed)),
  })

  const createPasskey = useMutation({
    mutationFn: async () => {
      if (!passkeySupported()) {
        throw new Error(copy.passkeyUnsupported)
      }
      const optionsRes = await api.post("/user/passkeys/register/options")
      const credential = await navigator.credentials.create({
        publicKey: preparePasskeyCreationOptions(optionsRes.data),
      })
      const payload = passkeyCredentialToJSON(credential)
      if (!payload) {
        throw new Error(copy.passkeyCreateFailed)
      }
      const res = await api.post("/user/passkeys/register", {
        name: passkeyName.trim() || copy.defaultPasskeyName,
        credential: payload,
      })
      return res.data
    },
    onSuccess: () => {
      setPasskeyStatus(copy.passkeyCreated)
      setPasskeyName("")
      queryClient.invalidateQueries({ queryKey: ["passkeys"] })
    },
    onError: (error) => setPasskeyStatus(apiErrorMessage(error, copy.passkeyCreateFailed)),
  })

  const deletePasskey = useMutation({
    mutationFn: async (id: number) => api.delete(`/user/passkeys/${id}`),
    onSuccess: () => {
      setPasskeyStatus(copy.passkeyDeleted)
      queryClient.invalidateQueries({ queryKey: ["passkeys"] })
    },
    onError: (error) => setPasskeyStatus(apiErrorMessage(error, copy.passkeyDeleteFailed)),
  })

  const sendPhoneBindCode = useMutation({
    mutationFn: async () => (await api.post("/user/phone/bind-code", { phone: bindPhoneNumber.trim() })).data,
    onSuccess: () => setPhoneStatus(copy.phoneCodeSent),
    onError: (error) => setPhoneStatus(apiErrorMessage(error, copy.phoneCodeFailed)),
  })

  const bindPhone = useMutation({
    mutationFn: async () => (await api.post("/user/phone/bind", {
      phone: bindPhoneNumber.trim(),
      phone_code: bindPhoneCode.trim(),
    })).data,
    onSuccess: () => {
      setPhoneStatus(copy.phoneBound)
      setBindPhoneNumber("")
      setBindPhoneCode("")
      queryClient.invalidateQueries({ queryKey: ["me"] })
    },
    onError: (error) => setPhoneStatus(apiErrorMessage(error, copy.phoneBindFailed)),
  })

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">{copy.securitySettings}</h1>

      <div className="grid gap-4 lg:grid-cols-2">
        {publicSettings.sms_enabled && (
          <Card>
            <CardHeader>
              <CardTitle>{copy.phoneBinding}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-sm text-muted-foreground">
                {user?.phone ? copy.phoneBoundDescription.replace("{phone}", user.phone) : copy.phoneBindDescription}
              </div>
              {publicSettings.sms_binding_required && !user?.phone && (
                <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-600 dark:text-amber-400">
                  {copy.phoneBindingRequiredHint}
                </div>
              )}
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  value={bindPhoneNumber}
                  placeholder={copy.phonePlaceholder}
                  onChange={(event) => setBindPhoneNumber(event.target.value)}
                />
                <Button
                  variant="outline"
                  className="shrink-0 gap-2"
                  disabled={!bindPhoneNumber.trim() || sendPhoneBindCode.isPending}
                  onClick={() => sendPhoneBindCode.mutate()}
                >
                  {copy.sendCode}
                </Button>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  value={bindPhoneCode}
                  placeholder={copy.phoneCodePlaceholder}
                  onChange={(event) => setBindPhoneCode(event.target.value)}
                />
                <Button
                  className="shrink-0 gap-2"
                  disabled={!bindPhoneNumber.trim() || !bindPhoneCode.trim() || bindPhone.isPending}
                  onClick={() => bindPhone.mutate()}
                >
                  {user?.phone ? copy.rebindPhone : copy.bindPhone}
                </Button>
              </div>
              {phoneStatus && <div className="text-sm text-muted-foreground">{phoneStatus}</div>}
            </CardContent>
          </Card>
        )}

        {publicSettings.oidc_enabled && (
          <Card>
            <CardHeader>
              <CardTitle>{copy.oidcBinding}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-sm text-muted-foreground">
                {user?.oidc_sub ? copy.oidcBoundDescription : copy.oidcBindDescription}
              </div>
              <Button className="gap-2" variant="outline" disabled={Boolean(user?.oidc_sub) || bindOIDC.isPending} onClick={() => bindOIDC.mutate()}>
                <KeyRound size={16} />
                {user?.oidc_sub ? copy.bound : copy.bindOIDC}
              </Button>
              {bindStatus && <div className="text-sm text-muted-foreground">{bindStatus}</div>}
            </CardContent>
          </Card>
        )}

        {publicSettings.passkey_enabled && (
          <Card>
            <CardHeader>
              <CardTitle>{copy.passkeys}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-sm text-muted-foreground">{copy.passkeyDescription}</div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input value={passkeyName} placeholder={copy.passkeyNamePlaceholder} onChange={(event) => setPasskeyName(event.target.value)} />
                <Button className="shrink-0 gap-2" disabled={createPasskey.isPending} onClick={() => createPasskey.mutate()}>
                  <KeyRound size={16} />
                  {copy.addPasskey}
                </Button>
              </div>
              <div className="space-y-2">
                {passkeys.length === 0 ? (
                  <div className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">{copy.noPasskeys}</div>
                ) : (
                  passkeys.map((passkey) => (
                    <div key={passkey.id} className="grid gap-2 rounded-md border p-3 sm:grid-cols-[1fr_auto] sm:items-center">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{passkey.name || copy.defaultPasskeyName}</div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {copy.passkeyMeta
                            .replace("{created}", formatDateTime(passkey.created_at))
                            .replace("{last}", passkey.last_used_at ? formatDateTime(passkey.last_used_at) : copy.never)}
                        </div>
                      </div>
                      <Button variant="outline" size="sm" disabled={deletePasskey.isPending} onClick={() => deletePasskey.mutate(passkey.id)}>
                        {t("common.delete")}
                      </Button>
                    </div>
                  ))
                )}
              </div>
              {passkeyStatus && <div className="text-sm text-muted-foreground">{passkeyStatus}</div>}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>{copy.changePassword}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {isPasswordMethodLoading ? (
              <div className="text-sm text-muted-foreground">{t("common.loading")}</div>
            ) : passwordMethod?.method === "email_code" ? (
              <div className="space-y-3">
                <Field label={t("common.email")} value={passwordMethod.email || "-"} />
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    value={passwordEmailCode}
                    placeholder={copy.emailCodePlaceholder}
                    onChange={(event) => setPasswordEmailCode(event.target.value)}
                  />
                  <Button
                    variant="outline"
                    className="shrink-0 gap-2"
                    disabled={sendPasswordCode.isPending}
                    onClick={() => sendPasswordCode.mutate()}
                  >
                    <KeyRound size={16} />
                    {copy.sendCode}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <Input
                  value={currentPassword}
                  type="password"
                  placeholder={copy.currentPasswordPlaceholder}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                />
                {passwordMethod && !passwordMethod.password_set && (
                  <div className="text-sm text-muted-foreground">{copy.noPasswordSet}</div>
                )}
              </div>
            )}

            <div className="space-y-3">
              <Input
                value={newPassword}
                type="password"
                placeholder={copy.newPasswordPlaceholder}
                onChange={(event) => setNewPassword(event.target.value)}
              />
              <Input
                value={confirmPassword}
                type="password"
                placeholder={copy.confirmPasswordPlaceholder}
                onChange={(event) => setConfirmPassword(event.target.value)}
              />
            </div>
            <Button
              className="w-full gap-2"
              disabled={!canChangePassword(passwordMethod, currentPassword, passwordEmailCode, newPassword, confirmPassword) || changePassword.isPending}
              onClick={() => changePassword.mutate()}
            >
              <KeyRound size={16} />
              {copy.savePassword}
            </Button>
            {passwordStatus && <div className="text-sm text-muted-foreground">{passwordStatus}</div>}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function canChangePassword(
  method: PasswordMethod | undefined,
  currentPassword: string,
  emailCode: string,
  newPassword: string,
  confirmPassword: string,
) {
  if (!method || newPassword.length < 8 || confirmPassword.length < 8) {
    return false
  }
  if (method.method === "email_code") {
    return Boolean(emailCode.trim())
  }
  return Boolean(currentPassword)
}

function apiErrorMessage(error: unknown, fallback: string) {
  if (typeof error === "object" && error && "response" in error) {
    const response = (error as { response?: { data?: { error?: string } } }).response
    if (response?.data?.error) {
      return response.data.error
    }
  }
  return error instanceof Error ? error.message : fallback
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b pb-3 last:border-b-0 last:pb-0">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="min-w-0 truncate text-sm font-medium">{value}</div>
    </div>
  )
}

function formatDateTime(value: string) {
  if (!value) {
    return "-"
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }
  return date.toLocaleString()
}

const zhSecurityCopy = {
  oidcBinding: "OIDC 绑定",
  oidcBindDescription: "绑定后可以使用 OIDC 登录当前账号。",
  oidcBoundDescription: "当前账号已经绑定 OIDC。",
  bindOIDC: "绑定 OIDC",
  oidcBindFailed: "OIDC 绑定失败",
  bound: "已绑定",
  notBound: "未绑定",
  phoneBinding: "手机号绑定",
  phoneBindDescription: "绑定手机号后可用于登录和账号验证。",
  phoneBoundDescription: "当前已绑定手机号 {phone}，重新绑定会替换原手机号。",
  phoneBindingRequiredHint: "管理员要求绑定手机号，请尽快完成绑定。",
  phonePlaceholder: "手机号",
  phoneCodePlaceholder: "短信验证码",
  bindPhone: "绑定手机号",
  rebindPhone: "更换手机号",
  phoneCodeSent: "短信验证码已发送",
  phoneCodeFailed: "短信验证码发送失败",
  phoneBound: "手机号绑定成功",
  phoneBindFailed: "手机号绑定失败",
  passkeys: "Passkeys",
  passkeyDescription: "为当前账号绑定设备 Passkey，之后可以免密码登录。",
  passkeyNamePlaceholder: "Passkey 名称，例如 MacBook",
  addPasskey: "添加 Passkey",
  defaultPasskeyName: "Passkey",
  noPasskeys: "暂无 Passkey",
  passkeyMeta: "创建 {created}，上次使用 {last}",
  never: "从未",
  passkeyUnsupported: "当前浏览器不支持 Passkey",
  passkeyCreated: "Passkey 已添加",
  passkeyCreateFailed: "添加 Passkey 失败",
  passkeyDeleted: "Passkey 已删除",
  passkeyDeleteFailed: "删除 Passkey 失败",
  changePassword: "修改密码",
  currentPasswordPlaceholder: "当前密码",
  newPasswordPlaceholder: "新密码，至少 8 位",
  confirmPasswordPlaceholder: "再次输入新密码",
  emailCodePlaceholder: "邮箱验证码",
  sendCode: "发送验证码",
  savePassword: "保存新密码",
  passwordCodeSent: "验证码已发送",
  passwordCodeFailed: "验证码发送失败",
  passwordUpdated: "密码已更新",
  passwordUpdateFailed: "密码更新失败",
  passwordMismatch: "两次输入的新密码不一致",
  noPasswordSet: "当前账号没有可校验的旧密码，需要管理员先配置 SMTP 后再通过邮箱验证码修改。",
  securitySettings: "安全设置",
}

const enSecurityCopy: typeof zhSecurityCopy = {
  oidcBinding: "OIDC binding",
  oidcBindDescription: "Bind OIDC to sign in to this account with OIDC.",
  oidcBoundDescription: "This account is already bound to OIDC.",
  bindOIDC: "Bind OIDC",
  oidcBindFailed: "Failed to bind OIDC",
  bound: "Bound",
  notBound: "Not bound",
  phoneBinding: "Phone binding",
  phoneBindDescription: "Bind a phone number to use it for sign-in and account verification.",
  phoneBoundDescription: "Currently bound to {phone}. Binding again replaces it.",
  phoneBindingRequiredHint: "The administrator requires a bound phone number. Please bind one soon.",
  phonePlaceholder: "Phone number",
  phoneCodePlaceholder: "SMS verification code",
  bindPhone: "Bind phone",
  rebindPhone: "Change phone",
  phoneCodeSent: "SMS verification code sent",
  phoneCodeFailed: "Failed to send SMS code",
  phoneBound: "Phone number bound",
  phoneBindFailed: "Failed to bind phone number",
  passkeys: "Passkeys",
  passkeyDescription: "Bind device passkeys to this account, then sign in without a password.",
  passkeyNamePlaceholder: "Passkey name, for example MacBook",
  addPasskey: "Add passkey",
  defaultPasskeyName: "Passkey",
  noPasskeys: "No passkeys yet",
  passkeyMeta: "Created {created}, last used {last}",
  never: "Never",
  passkeyUnsupported: "This browser does not support passkeys",
  passkeyCreated: "Passkey added",
  passkeyCreateFailed: "Failed to add passkey",
  passkeyDeleted: "Passkey deleted",
  passkeyDeleteFailed: "Failed to delete passkey",
  changePassword: "Change password",
  currentPasswordPlaceholder: "Current password",
  newPasswordPlaceholder: "New password, at least 8 characters",
  confirmPasswordPlaceholder: "Confirm new password",
  emailCodePlaceholder: "Email verification code",
  sendCode: "Send code",
  savePassword: "Save new password",
  passwordCodeSent: "Verification code sent",
  passwordCodeFailed: "Failed to send verification code",
  passwordUpdated: "Password updated",
  passwordUpdateFailed: "Failed to update password",
  passwordMismatch: "New passwords do not match",
  noPasswordSet: "This account has no current password to verify. Ask an administrator to configure SMTP, then change it with an email code.",
  securitySettings: "Security settings",
}
