import { Monitor, Moon, Palette, Sun } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { useI18n } from "@/lib/i18n"
import { useTheme } from "@/lib/theme"
import type { ThemeMode } from "@/lib/theme"
import { cn } from "@/lib/utils"

interface ThemeOption {
  value: ThemeMode
  icon: LucideIcon
  label: string
  description: string
}

export default function ThemeSettings() {
  const { language } = useI18n()
  const { mode, resolvedTheme, setMode } = useTheme()
  const copy = themeSettingsCopy(language)
  const options: ThemeOption[] = [
    { value: "light", icon: Sun, label: copy.light, description: copy.lightDescription },
    { value: "dark", icon: Moon, label: copy.dark, description: copy.darkDescription },
    { value: "system", icon: Monitor, label: copy.system, description: copy.systemDescription },
  ]

  return (
    <div className="mx-auto max-w-5xl space-y-7 pb-10">
      <div className="border-b pb-6">
        <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground"><Palette size={14} />{copy.breadcrumb}</div>
        <h1 className="text-3xl font-semibold tracking-tight">{copy.title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{copy.description}</p>
      </div>

      <section className="overflow-hidden rounded-lg border bg-card shadow-sm" aria-labelledby="theme-options-title">
        <div className="border-b px-5 py-4">
          <h2 id="theme-options-title" className="font-semibold">{copy.appearance}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{copy.appearanceDescription}</p>
        </div>
        <div className="grid gap-3 p-5 sm:grid-cols-3" role="radiogroup" aria-label={copy.appearance}>
          {options.map((option) => {
            const Icon = option.icon
            const selected = mode === option.value
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setMode(option.value)}
                className={cn(
                  "flex min-h-28 flex-col items-start gap-3 rounded-md border p-4 text-left transition-colors",
                  selected ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:border-primary/50 hover:bg-muted/50",
                )}
              >
                <span className={cn("flex h-9 w-9 items-center justify-center rounded-md", selected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
                  <Icon size={18} />
                </span>
                <span>
                  <span className="block text-sm font-medium">{option.label}</span>
                  <span className="mt-1 block text-xs text-muted-foreground">{option.description}</span>
                </span>
              </button>
            )
          })}
        </div>
        <div className="border-t bg-muted/20 px-5 py-3 text-xs text-muted-foreground">
          {copy.current}: {mode === "system" ? `${copy.system} (${resolvedTheme === "dark" ? copy.dark : copy.light})` : mode === "dark" ? copy.dark : copy.light}
        </div>
      </section>
    </div>
  )
}

function themeSettingsCopy(language: string) {
  if (language === "zh") {
    return {
      breadcrumb: "系统 / 设置",
      title: "主题设置",
      description: "选择 Veloce 的界面外观。",
      appearance: "界面主题",
      appearanceDescription: "主题偏好会保存在当前设备上，并立即生效。",
      current: "当前主题",
      light: "浅色",
      dark: "深色",
      system: "跟随系统",
      lightDescription: "明亮、清晰的界面",
      darkDescription: "适合低光环境",
      systemDescription: "跟随操作系统偏好",
    }
  }
  if (language === "ja") {
    return {
      breadcrumb: "システム / 設定",
      title: "テーマ設定",
      description: "Veloce の表示テーマを選択します。",
      appearance: "表示テーマ",
      appearanceDescription: "テーマはこのデバイスに保存され、すぐに反映されます。",
      current: "現在のテーマ",
      light: "ライト",
      dark: "ダーク",
      system: "システム",
      lightDescription: "明るく見やすい表示",
      darkDescription: "暗い環境に適した表示",
      systemDescription: "OS の設定に合わせる",
    }
  }
  return {
    breadcrumb: "System / Settings",
    title: "Theme",
    description: "Choose how Veloce looks.",
    appearance: "Appearance",
    appearanceDescription: "Your theme preference is saved on this device and applied immediately.",
    current: "Current theme",
    light: "Light",
    dark: "Dark",
    system: "System",
    lightDescription: "Bright and clear interface",
    darkDescription: "Comfortable in low light",
    systemDescription: "Follow your operating system",
  }
}
