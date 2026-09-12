import { Monitor, Moon, Palette, Sun } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  cn,
  useI18n,
  useTheme,
  type ThemeMode,
} from "@velocelab/dashboard/frontend"

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
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{copy.title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{copy.description}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Palette size={18} />{copy.appearance}</CardTitle>
          <CardDescription>{copy.appearanceDescription}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-3" role="radiogroup" aria-label={copy.appearance}>
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
                    "flex min-h-28 flex-col items-start gap-3 rounded-lg border p-4 text-left transition-colors",
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
        </CardContent>
        <CardFooter className="border-t text-xs text-muted-foreground">
          {copy.current}: {mode === "system" ? `${copy.system} (${resolvedTheme === "dark" ? copy.dark : copy.light})` : mode === "dark" ? copy.dark : copy.light}
        </CardFooter>
      </Card>
    </div>
  )
}

function themeSettingsCopy(language: string) {
  if (language === "zh") {
    return {
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
