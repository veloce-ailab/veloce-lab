import type { ChangeEvent } from "react"
import { useEffect, useRef, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Camera, UserCircle } from "lucide-react"
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  LanguageSwitcher,
  PageInlineSlot,
  PageTitleSlot,
  api,
  apiURL,
  resetOnboardingGuide,
  useI18n,
  withPublicSettingsDefaults,
  type PublicSettings,
} from "@velocelab/dashboard/frontend"

interface CurrentUser {
  id: number
  username: string
  email: string
  phone?: string | null
  oidc_sub?: string | null
  avatar_url?: string
  is_admin: boolean
}

/**
 * Account profile, avatar and console language. Owned by the user plugin: the
 * settings plugin only provides the shell around it.
 */
export default function ProfileSettings() {
  const { language, t } = useI18n()
  const copy = language === "zh" ? zhProfileCopy : enProfileCopy
  const queryClient = useQueryClient()
  const [avatarPreview, setAvatarPreview] = useState("")
  const [avatarStatus, setAvatarStatus] = useState("")
  const avatarInputRef = useRef<HTMLInputElement>(null)

  const { data: user, isLoading } = useQuery<CurrentUser>({
    queryKey: ["me"],
    queryFn: async () => (await api.get("/user/me")).data,
  })
  const { data: settings } = useQuery<PublicSettings>({
    queryKey: ["public-settings"],
    queryFn: async () => (await api.get("/public/settings")).data,
  })
  const publicSettings = withPublicSettingsDefaults(settings)

  useEffect(() => {
    return () => {
      if (avatarPreview.startsWith("blob:")) {
        URL.revokeObjectURL(avatarPreview)
      }
    }
  }, [avatarPreview])

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

  const selectAvatar = (event: ChangeEvent<HTMLInputElement>) => {
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

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">{t("settings.profile")}</h1>

      <div className="flex justify-end">
        <Button type="button" variant="outline" onClick={resetOnboardingGuide}>重新回顾设置向导</Button>
      </div>

      <PageTitleSlot />
      <div className="grid gap-4 lg:grid-cols-2">
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
                    <Input ref={avatarInputRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp" className="hidden" onChange={selectAvatar} />
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
        <PageInlineSlot className="lg:col-span-2" slotKey="secondary" />
      </div>
    </div>
  )
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

const zhProfileCopy = {
  avatar: "头像",
  uploadAvatar: "上传头像",
  avatarHint: "支持 JPEG、PNG、GIF 或 WebP，最大 2 MB。",
  avatarUploading: "正在上传头像...",
  avatarUpdated: "头像已更新",
  avatarInvalid: "请选择不超过 2 MB 的 JPEG、PNG、GIF 或 WebP 图片。",
  avatarUploadFailed: "头像上传失败",
  oidcAccount: "OIDC 账号",
  bound: "已绑定",
  notBound: "未绑定",
  phone: "手机号",
}

const enProfileCopy: typeof zhProfileCopy = {
  avatar: "Avatar",
  uploadAvatar: "Upload avatar",
  avatarHint: "JPEG, PNG, GIF, or WebP up to 2 MB.",
  avatarUploading: "Uploading avatar...",
  avatarUpdated: "Avatar updated",
  avatarInvalid: "Choose a JPEG, PNG, GIF, or WebP image up to 2 MB.",
  avatarUploadFailed: "Failed to upload avatar",
  oidcAccount: "OIDC account",
  bound: "Bound",
  notBound: "Not bound",
  phone: "Phone",
}
