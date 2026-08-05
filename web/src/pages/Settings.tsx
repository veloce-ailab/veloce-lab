import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Camera, KeyRound, UserCircle } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { LanguageSwitcher } from "@/components/LanguageSwitcher"
import api, { apiURL } from "@/lib/api"
import { useI18n } from "@/lib/i18n"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { PageInlineSlot, PageTitleSlot } from "@/components/layout/PageTitleSlot"
import type { PublicSettings } from "@/lib/public-settings"
import { withPublicSettingsDefaults } from "@/lib/public-settings"
import { passkeyCredentialToJSON, passkeySupported, preparePasskeyCreationOptions } from "@/lib/passkey"
import { resetOnboardingGuide } from "@/components/onboarding/SetupGuides"

interface Group {
  id: number
  name: string
  multiplier: string | number
}

interface CurrentUser {
  id: number
  username: string
  email: string
  phone?: string | null
  oidc_sub?: string | null
  avatar_url?: string
  balance: string | number
  group?: Group
  groups?: Array<{ group?: Group; expires_at?: string | null }>
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

interface UserChannelCatalog {
  id: number
  name: string
  models: string[]
}

interface AdvancedChatUserSettings {
  title_model_name: string
  title_user_channel_id?: number
  title_generation_scope: "all" | "recent"
  connector_approval_agent_id: string
}

interface AdvancedChatAgentOption {
  id: string
  name: string
}

export type SettingsSection = "profile" | "assistant" | "security"

export default function Settings({ section = "profile" }: { section?: SettingsSection }) {
  const { language, t } = useI18n()
  const copy = language === "zh" ? zhSettingsCopy : enSettingsCopy
  const sectionTitle = section === "assistant" ? copy.assistantSettings : section === "security" ? copy.securitySettings : t("settings.title")
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
  const [titleModelName, setTitleModelName] = useState("")
  const [titleUserChannelID, setTitleUserChannelID] = useState(0)
  const [titleGenerationScope, setTitleGenerationScope] = useState<"all" | "recent">("recent")
  const [connectorApprovalAgentID, setConnectorApprovalAgentID] = useState("")
  const [avatarPreview, setAvatarPreview] = useState("")
  const [avatarStatus, setAvatarStatus] = useState("")
  const avatarInputRef = useRef<HTMLInputElement>(null)

  const { data: user, isLoading } = useQuery<CurrentUser>({
    queryKey: ["me"],
    queryFn: async () => {
      const res = await api.get("/user/me")
      return res.data
    },
  })

  const { data: settings } = useQuery<PublicSettings>({
    queryKey: ["public-settings"],
    queryFn: async () => {
      const res = await api.get("/public/settings")
      return res.data
    },
  })
  const publicSettings = withPublicSettingsDefaults(settings)
  const { data: passwordMethod, isLoading: isPasswordMethodLoading } = useQuery<PasswordMethod>({
    queryKey: ["password-method"],
    queryFn: async () => {
      const res = await api.get("/user/password/method")
      return res.data
    },
  })
  const { data: passkeys = [] } = useQuery<PasskeyCredential[]>({
    queryKey: ["passkeys"],
    queryFn: async () => {
      const res = await api.get("/user/passkeys")
      return Array.isArray(res.data) ? res.data : []
    },
    enabled: publicSettings.passkey_enabled,
  })
  const { data: catalog = [] } = useQuery<UserChannelCatalog[]>({
    queryKey: ["catalog"],
    queryFn: async () => {
      const res = await api.get("/user/catalog")
      return Array.isArray(res.data) ? res.data.map(normalizeCatalogItem) : []
    },
  })
  const { data: advancedChatSettings } = useQuery<AdvancedChatUserSettings>({
    queryKey: ["advanced-chat-user-settings"],
    queryFn: async () => {
      const res = await api.get("/user/advanced-chat/settings")
      return normalizeAdvancedChatUserSettings(res.data)
    },
  })
  const { data: advancedChatAgents = [] } = useQuery<AdvancedChatAgentOption[]>({
    queryKey: ["advanced-chat-agents"],
    queryFn: async () => {
      const res = await api.get("/user/advanced-chat/agents")
      return Array.isArray(res.data) ? res.data.map(normalizeAdvancedChatAgentOption).filter((item): item is AdvancedChatAgentOption => Boolean(item)) : []
    },
  })
  const titleModelOptions = useMemo(() => modelsForChannel(catalog, titleUserChannelID), [catalog, titleUserChannelID])
  const titleSelectOptions = useMemo(
    () => titleModelName && !titleModelOptions.includes(titleModelName) ? [titleModelName, ...titleModelOptions] : titleModelOptions,
    [titleModelName, titleModelOptions]
  )

  useEffect(() => {
    if (!advancedChatSettings) {
      return
    }
    setTitleModelName(advancedChatSettings.title_model_name || "")
    setTitleUserChannelID(advancedChatSettings.title_user_channel_id || 0)
    setTitleGenerationScope(advancedChatSettings.title_generation_scope || "recent")
    setConnectorApprovalAgentID(advancedChatSettings.connector_approval_agent_id || "")
  }, [advancedChatSettings])

  useEffect(() => {
    return () => {
      if (avatarPreview.startsWith("blob:")) {
        URL.revokeObjectURL(avatarPreview)
      }
    }
  }, [avatarPreview])

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
    mutationFn: async () => {
      const res = await api.post("/user/password/email-code")
      return res.data
    },
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
    mutationFn: async () => {
      const res = await api.post("/user/phone/bind-code", { phone: bindPhoneNumber.trim() })
      return res.data
    },
    onSuccess: () => setPhoneStatus(copy.phoneCodeSent),
    onError: (error) => setPhoneStatus(apiErrorMessage(error, copy.phoneCodeFailed)),
  })

  const bindPhone = useMutation({
    mutationFn: async () => {
      const res = await api.post("/user/phone/bind", {
        phone: bindPhoneNumber.trim(),
        phone_code: bindPhoneCode.trim(),
      })
      return res.data
    },
    onSuccess: () => {
      setPhoneStatus(copy.phoneBound)
      setBindPhoneNumber("")
      setBindPhoneCode("")
      queryClient.invalidateQueries({ queryKey: ["me"] })
    },
    onError: (error) => setPhoneStatus(apiErrorMessage(error, copy.phoneBindFailed)),
  })

  const uploadAvatar = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData()
      formData.append("file", file)
      const res = await api.post("/user/avatar", formData)
      return res.data as CurrentUser
    },
    onSuccess: (updatedUser) => {
      setAvatarPreview("")
      setAvatarStatus(copy.avatarUpdated)
      queryClient.setQueryData(["me"], updatedUser)
      queryClient.invalidateQueries({ queryKey: ["me"] })
    },
    onError: (error) => {
      setAvatarPreview("")
      setAvatarStatus(apiErrorMessage(error, copy.avatarUploadFailed))
    },
  })

  const selectAvatar = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file) {
      return
    }
    if (!/image\/(jpeg|png|gif|webp)/.test(file.type) || file.size > 2 * 1024 * 1024) {
      setAvatarStatus(copy.avatarInvalid)
      return
    }
    setAvatarPreview(URL.createObjectURL(file))
    setAvatarStatus(copy.avatarUploading)
    uploadAvatar.mutate(file)
  }

  const saveTitleSettings = useMutation({
    mutationFn: async () => {
      const res = await api.put("/user/advanced-chat/settings", {
        title_model_name: titleModelName.trim(),
        title_user_channel_id: titleUserChannelID || 0,
        title_generation_scope: titleGenerationScope,
        connector_approval_agent_id: connectorApprovalAgentID,
      })
      return normalizeAdvancedChatUserSettings(res.data)
    },
    onSuccess: (saved) => {
      setTitleModelName(saved.title_model_name || "")
      setTitleUserChannelID(saved.title_user_channel_id || 0)
      setTitleGenerationScope(saved.title_generation_scope || "recent")
      setConnectorApprovalAgentID(saved.connector_approval_agent_id || "")
      queryClient.invalidateQueries({ queryKey: ["advanced-chat-user-settings"] })
    },
  })

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">{sectionTitle}</h1>

      {section === "profile" && (
        <div className="flex justify-end">
          <Button type="button" variant="outline" onClick={resetOnboardingGuide}>重新回顾设置向导</Button>
        </div>
      )}

      {section === "profile" && <PageTitleSlot />}
      <div className="grid gap-4 lg:grid-cols-2">
        {section === "profile" && <>
          <Card>
            <CardHeader>
              <CardTitle>{t("settings.profile")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {isLoading ? (
                <div className="text-sm text-muted-foreground">{t("common.loading")}</div>
              ) : (
                <>
                  <div className="flex items-center gap-4 border-b pb-4">
                    <div className="relative shrink-0">
                      <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border bg-muted text-lg font-semibold text-foreground">
                        {avatarPreview || user?.avatar_url ? (
                          <img src={avatarPreview || apiURL(user?.avatar_url || "")} alt="" className="h-full w-full object-cover" />
                        ) : (
                          avatarInitials(user?.username || user?.email || "") || <UserCircle size={30} />
                        )}
                      </div>
                      <button
                        type="button"
                        className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full border bg-background text-foreground shadow-sm transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
                        aria-label={copy.uploadAvatar}
                        title={copy.uploadAvatar}
                        disabled={uploadAvatar.isPending}
                        onClick={() => avatarInputRef.current?.click()}
                      >
                        <Camera size={15} />
                      </button>
                      <input ref={avatarInputRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp" className="hidden" onChange={selectAvatar} />
                    </div>
                    <div className="min-w-0 space-y-1">
                      <div className="text-sm font-medium">{copy.avatar}</div>
                      <div className="text-xs text-muted-foreground">{uploadAvatar.isPending ? copy.avatarUploading : copy.avatarHint}</div>
                      {avatarStatus && <div className="text-xs text-muted-foreground">{avatarStatus}</div>}
                    </div>
                  </div>
                  <Field label={t("common.username")} value={user?.username || "-"} />
                  <Field label={t("common.email")} value={user?.email || "-"} />
                  {publicSettings.sms_enabled && <Field label={copy.phone} value={user?.phone || copy.notBound} />}
                  <Field label={copy.oidcAccount} value={user?.oidc_sub ? copy.bound : copy.notBound} />
                  <Field label={t("common.group")} value={groupNames(user)} />
                  <Field label={t("common.balance")} value={`${publicSettings.payment_currency_display_name}${user?.balance || 0}`} />
                  <Field label={t("common.role")} value={user?.is_admin ? t("common.admin") : t("common.user")} />
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("common.language")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-sm text-muted-foreground">{t("settings.languageSubtitle")}</div>
              <LanguageSwitcher placement="bottom" />
            </CardContent>
          </Card>

          <PageInlineSlot className="lg:col-span-2" slotKey="primary" />
        </>}

        {section === "assistant" && <>
          <Card>
          <CardHeader>
            <CardTitle>{copy.titleGeneration}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-sm text-muted-foreground">{copy.titleGenerationDescription}</div>
            <label className="space-y-1 text-sm">
              <span className="font-medium">{copy.titleChannel}</span>
              <Select value={String((titleUserChannelID || "") || "__shadcn_empty__")} onValueChange={(value) => {
                  const nextID = Number((value === "__shadcn_empty__" ? "" : value)) || 0
                  setTitleUserChannelID(nextID)
                  const nextModels = modelsForChannel(catalog, nextID)
                  if (titleModelName && !nextModels.includes(titleModelName)) {
                    setTitleModelName("")
                  }
                }}><SelectTrigger className="h-10 w-full rounded-2xl border border-border bg-background px-3 text-sm"><SelectValue /></SelectTrigger><SelectContent>
                <SelectItem value="__shadcn_empty__">{copy.anyChannel}</SelectItem>
                {catalog.map((channel) => (
                  <SelectItem key={channel.id} value={String(channel.id)}>
                    {channel.name}
                  </SelectItem>
                ))}
              </SelectContent></Select>
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium">{copy.titleModel}</span>
              <Select value={String((titleModelName) || "__shadcn_empty__")} onValueChange={(value) => setTitleModelName((value === "__shadcn_empty__" ? "" : value))}><SelectTrigger className="h-10 w-full rounded-2xl border border-border bg-background px-3 text-sm"><SelectValue /></SelectTrigger><SelectContent>
                <SelectItem value="__shadcn_empty__">{copy.titleDisabled}</SelectItem>
                {titleSelectOptions.map((model) => (
                  <SelectItem key={model} value={String(model)}>
                    {model}
                  </SelectItem>
                ))}
              </SelectContent></Select>
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium">{copy.titleScope}</span>
              <Select value={String((titleGenerationScope) || "__shadcn_empty__")} onValueChange={(value) => setTitleGenerationScope(normalizeTitleScope((value === "__shadcn_empty__" ? "" : value)))}><SelectTrigger className="h-10 w-full rounded-2xl border border-border bg-background px-3 text-sm"><SelectValue /></SelectTrigger><SelectContent>
                <SelectItem value="recent">{copy.titleScopeRecent}</SelectItem>
                <SelectItem value="all">{copy.titleScopeAll}</SelectItem>
              </SelectContent></Select>
            </label>
            <Button className="gap-2" disabled={saveTitleSettings.isPending} onClick={() => saveTitleSettings.mutate()}>
              {saveTitleSettings.isPending ? copy.saving : copy.saveTitleSettings}
            </Button>
          </CardContent>
        </Card>
          <Card>
          <CardHeader>
            <CardTitle>{copy.connectorApproval}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-sm text-muted-foreground">{copy.connectorApprovalDescription}</div>
            <label className="space-y-1 text-sm">
              <span className="font-medium">{copy.approvalAssistant}</span>
              <Select value={String((connectorApprovalAgentID) || "__shadcn_empty__")} onValueChange={(value) => setConnectorApprovalAgentID((value === "__shadcn_empty__" ? "" : value))}><SelectTrigger className="h-10 w-full rounded-2xl border border-border bg-background px-3 text-sm"><SelectValue /></SelectTrigger><SelectContent>
                <SelectItem value="__shadcn_empty__">{copy.noApprovalAssistant}</SelectItem>
                {advancedChatAgents.map((agent) => (
                  <SelectItem key={agent.id} value={String(agent.id)}>{agent.name}</SelectItem>
                ))}
              </SelectContent></Select>
            </label>
            <Button className="gap-2" disabled={saveTitleSettings.isPending} onClick={() => saveTitleSettings.mutate()}>
              {saveTitleSettings.isPending ? copy.saving : copy.saveApprovalSettings}
            </Button>
          </CardContent>
          </Card>
        </>}
        {section === "security" && <>
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

        </>}
        {section === "profile" && <PageInlineSlot className="lg:col-span-2" slotKey="secondary" />}
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

function groupNames(user?: CurrentUser) {
  const names = (user?.groups || [])
    .filter((membership) => !membership.expires_at || new Date(membership.expires_at).getTime() > Date.now())
    .map((membership) => membership.group?.name)
    .filter((name): name is string => Boolean(name))
  if (names.length > 0) {
    return names.join(", ")
  }
  return user?.group?.name || "-"
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

function avatarInitials(value: string) {
  const trimmed = value.trim()
  if (!trimmed) {
    return ""
  }
  const parts = trimmed.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
  }
  return trimmed.slice(0, 2).toUpperCase()
}

function normalizeCatalogItem(value: unknown): UserChannelCatalog {
  const item = isRecord(value) ? value : {}
  return {
    id: Number(item.id || 0),
    name: typeof item.name === "string" ? item.name : "",
    models: Array.isArray(item.models) ? item.models.filter((model): model is string => typeof model === "string") : [],
  }
}

function modelsForChannel(catalog: UserChannelCatalog[], channelID: number) {
  if (!channelID) {
    return Array.from(new Set(catalog.flatMap((channel) => channel.models))).sort()
  }
  return catalog.find((channel) => channel.id === channelID)?.models || []
}

function normalizeAdvancedChatAgentOption(value: unknown): AdvancedChatAgentOption | null {
  const item = isRecord(value) ? value : {}
  const id = typeof item.id === "string" ? item.id : String(item.id || "")
  if (!id) {
    return null
  }
  return { id, name: typeof item.name === "string" && item.name ? item.name : id }
}

function normalizeAdvancedChatUserSettings(value: unknown): AdvancedChatUserSettings {
  const item = isRecord(value) ? value : {}
  return {
    title_model_name: typeof item.title_model_name === "string" ? item.title_model_name : "",
    title_user_channel_id: Number(item.title_user_channel_id || 0) || undefined,
    title_generation_scope: normalizeTitleScope(item.title_generation_scope),
    connector_approval_agent_id: typeof item.connector_approval_agent_id === "string" ? item.connector_approval_agent_id : "",
  }
}

function normalizeTitleScope(value: unknown): "all" | "recent" {
  return value === "all" ? "all" : "recent"
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

const zhSettingsCopy = {
  avatar: "头像",
  uploadAvatar: "上传头像",
  avatarHint: "支持 JPEG、PNG、GIF 或 WebP，最大 2 MB。",
  avatarUploading: "正在上传头像...",
  avatarUpdated: "头像已更新",
  avatarInvalid: "请选择不超过 2 MB 的 JPEG、PNG、GIF 或 WebP 图片。",
  avatarUploadFailed: "头像上传失败",
  referral: "推广返佣",
  referralCode: "推广码",
  inviteCount: "邀请人数",
  totalCommission: "累计返佣",
  oidcAccount: "OIDC 账号",
  oidcBinding: "OIDC 绑定",
  oidcBindDescription: "绑定后可以使用 OIDC 登录当前账号。",
  oidcBoundDescription: "当前账号已经绑定 OIDC。",
  bindOIDC: "绑定 OIDC",
  oidcBindFailed: "OIDC 绑定失败",
  bound: "已绑定",
  notBound: "未绑定",
  phone: "手机号",
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
  dailyCheckIn: "每日签到",
  currentStreak: "当前连续签到",
  todayReward: "今日奖励",
  todayStatus: "今日状态",
  nextStreakReward: "下个连续奖励",
  checkedIn: "今日已签到",
  notCheckedIn: "今日未签到",
  checkInNow: "立即签到",
  checkInSuccess: "签到成功，获得 {amount}，连续 {streak} 天。",
  checkInFailed: "签到失败",
  recentCheckIns: "最近签到",
  streakDays: "连续 {days} 天",
  rechargeBalance: "余额充值",
  rechargeDescription: "最低充值 {min}，支付按汇率 1 = ¥{rate} 换算人民币。",
  rechargeAmountPlaceholder: "充值金额",
  createPaymentOrder: "创建支付订单",
  paymentOrderCreated: "订单 {order} 已创建，充值 {amount}。正在跳转到支付页面...",
  paymentOrderFailed: "创建支付订单失败",
  alipay: "支付宝",
  wxpay: "微信支付",
  titleGeneration: "会话标题生成",
  titleGenerationDescription: "发送第一条消息后，系统会并行调用这里配置的模型生成会话标题。留空则继续使用本地摘要标题。",
  titleChannel: "标题生成渠道",
  titleModel: "标题生成模型",
  anyChannel: "任意可用渠道",
  titleDisabled: "不使用模型生成标题",
  titleScope: "重新生成范围",
  titleScopeRecent: "最近对话",
  titleScopeAll: "全部对话",
  saveTitleSettings: "保存标题设置",
  connectorApproval: "连接器审批",
  connectorApprovalDescription: "选择一个助手来审核连接器的文件修改和命令执行。选择后，可在聊天输入框中启用“助手审批”。",
  approvalAssistant: "审批助手",
  noApprovalAssistant: "暂不使用助手审批",
  saveApprovalSettings: "保存审批设置",
  assistantSettings: "助手设置",
  securitySettings: "安全设置",
  saving: "保存中...",
}

const enSettingsCopy: typeof zhSettingsCopy = {
  avatar: "Avatar",
  uploadAvatar: "Upload avatar",
  avatarHint: "JPEG, PNG, GIF, or WebP up to 2 MB.",
  avatarUploading: "Uploading avatar...",
  avatarUpdated: "Avatar updated",
  avatarInvalid: "Choose a JPEG, PNG, GIF, or WebP image up to 2 MB.",
  avatarUploadFailed: "Failed to upload avatar",
  referral: "Referral",
  referralCode: "Referral code",
  inviteCount: "Invites",
  totalCommission: "Total commission",
  oidcAccount: "OIDC account",
  oidcBinding: "OIDC binding",
  oidcBindDescription: "Bind OIDC to sign in to this account with OIDC.",
  oidcBoundDescription: "This account is already bound to OIDC.",
  bindOIDC: "Bind OIDC",
  oidcBindFailed: "Failed to bind OIDC",
  bound: "Bound",
  notBound: "Not bound",
  phone: "Phone",
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
  dailyCheckIn: "Daily check-in",
  currentStreak: "Current streak",
  todayReward: "Today's reward",
  todayStatus: "Today's status",
  nextStreakReward: "Next streak reward",
  checkedIn: "Checked in today",
  notCheckedIn: "Not checked in",
  checkInNow: "Check in now",
  checkInSuccess: "Check-in succeeded. You received {amount}; streak {streak} days.",
  checkInFailed: "Check-in failed",
  recentCheckIns: "Recent check-ins",
  streakDays: "{days} day streak",
  rechargeBalance: "Balance recharge",
  rechargeDescription: "Minimum recharge {min}. Payments are converted to RMB at 1 = ¥{rate}.",
  rechargeAmountPlaceholder: "Recharge amount",
  createPaymentOrder: "Create payment order",
  paymentOrderCreated: "Order {order} created for {amount}. Redirecting to payment...",
  paymentOrderFailed: "Failed to create payment order",
  alipay: "Alipay",
  wxpay: "WeChat Pay",
  titleGeneration: "Conversation title generation",
  titleGenerationDescription: "After the first message is sent, the system calls this model in parallel to generate the session title. Leave it empty to keep the local fallback title.",
  titleChannel: "Title channel",
  titleModel: "Title model",
  anyChannel: "Any available channel",
  titleDisabled: "Do not generate titles with a model",
  titleScope: "Regeneration scope",
  titleScopeRecent: "Recent conversation",
  titleScopeAll: "Full conversation",
  saveTitleSettings: "Save title settings",
  connectorApproval: "Connector approval",
  connectorApprovalDescription: "Choose an assistant to review connector file changes and command execution. It can then be enabled from the chat composer.",
  approvalAssistant: "Approval assistant",
  noApprovalAssistant: "Do not use assistant approval",
  saveApprovalSettings: "Save approval settings",
  assistantSettings: "Assistant settings",
  securitySettings: "Security settings",
  saving: "Saving...",
}
