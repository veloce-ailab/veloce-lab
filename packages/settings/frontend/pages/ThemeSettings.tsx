import { useState } from "react"
import { Check, Monitor, Moon, Palette, RotateCcw, Sun } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  DashboardSlot,
  cn,
  Button,
  Input,
  useI18n,
  useTheme,
  type UserThemePalette,
  type ThemeMode,
} from "@velocelab/dashboard/frontend"

interface ThemeOption {
  value: ThemeMode
  icon: LucideIcon
  label: string
  description: string
}

interface PalettePreset { id: string; palette: UserThemePalette }

const palettePresets: PalettePreset[] = [
  { id: "ocean", palette: { light: { background: "#f5f8fa", foreground: "#263747", surface: "#eaf0f4", primary: "#285f8f" }, dark: { background: "#141d26", foreground: "#e9f0f5", surface: "#1b2733", primary: "#73aad4" } } },
  { id: "moss", palette: { light: { background: "#f6f8f3", foreground: "#27352b", surface: "#e8eee2", primary: "#52764c" }, dark: { background: "#171f18", foreground: "#e7f0e5", surface: "#232f24", primary: "#91be83" } } },
  { id: "amber", palette: { light: { background: "#fff8eb", foreground: "#3d3324", surface: "#f3ead7", primary: "#a45d1c" }, dark: { background: "#211a13", foreground: "#f4e9d6", surface: "#30251a", primary: "#e8a65d" } } },
  { id: "berry", palette: { light: { background: "#fcf4f4", foreground: "#3e2c31", surface: "#f1e5e7", primary: "#a94d65" }, dark: { background: "#21171c", foreground: "#f2e6e9", surface: "#302127", primary: "#e2869e" } } },
]

export default function ThemeSettings() {
  const { language } = useI18n()
  const { mode, resolvedTheme, setMode, palette, setPalette } = useTheme()
  const [customMode, setCustomMode] = useState<"light" | "dark">("light")
  const copy = themeSettingsCopy(language)
  const options: ThemeOption[] = [
    { value: "light", icon: Sun, label: copy.light, description: copy.lightDescription },
    { value: "dark", icon: Moon, label: copy.dark, description: copy.darkDescription },
    { value: "system", icon: Monitor, label: copy.system, description: copy.systemDescription },
  ]

  return (
    <div className="space-y-6">
      <DashboardSlot name="settings.theme.before" />
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
      <Card>
        <CardHeader>
          <CardTitle>{copy.paletteTitle}</CardTitle>
          <CardDescription>{copy.paletteDescription}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" role="radiogroup" aria-label={copy.paletteTitle}>
            {palettePresets.map((preset) => {
              const selected = JSON.stringify(palette) === JSON.stringify(preset.palette)
              return (
                <button key={preset.id} type="button" role="radio" aria-checked={selected} onClick={() => setPalette(preset.palette)} className={cn("min-w-0 rounded-lg border p-3 text-left transition-colors hover:bg-muted/40", selected ? "border-primary ring-1 ring-primary" : "hover:border-primary/50")}>
                  <span className="flex items-center justify-between gap-2 text-sm font-medium">{copy.presets[preset.id as keyof typeof copy.presets]}{selected && <Check size={15} className="text-primary" />}</span>
                  <span className="mt-3 grid grid-cols-2 gap-2">
                    {(["light", "dark"] as const).map((appearance) => <span key={appearance} className="flex h-9 items-center gap-1.5 rounded border px-1.5" style={{ backgroundColor: preset.palette[appearance].background }} aria-label={appearance === "light" ? copy.light : copy.dark}>
                      <span className="size-4 rounded-full border border-black/10" style={{ backgroundColor: preset.palette[appearance].primary }} />
                      <span className="size-4 rounded-full border border-black/10" style={{ backgroundColor: preset.palette[appearance].surface }} />
                    </span>)}
                  </span>
                </button>
              )
            })}
          </div>

          <div className="border-t pt-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div><div className="text-sm font-medium">{copy.customPalette}</div><p className="mt-1 text-xs text-muted-foreground">{copy.customPaletteDescription}</p></div>
              <div className="flex items-center gap-1 rounded-md border p-1" role="group" aria-label={copy.customPaletteMode}>
                {(["light", "dark"] as const).map((appearance) => <Button key={appearance} type="button" size="sm" variant={customMode === appearance ? "secondary" : "ghost"} aria-pressed={customMode === appearance} onClick={() => setCustomMode(appearance)}>{appearance === "light" ? copy.light : copy.dark}</Button>)}
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {(["background", "surface", "primary"] as const).map((colorKey) => {
                const activePalette = palette || palettePresets[0].palette
                const labels = { background: copy.background, surface: copy.surface, primary: copy.primary }
                return <label key={colorKey} className="flex min-w-0 items-center justify-between gap-3 rounded-md border px-3 py-2">
                  <span className="truncate text-sm">{labels[colorKey]}</span>
                  <Input type="color" value={activePalette[customMode][colorKey]} onChange={(event) => setPalette({ ...activePalette, [customMode]: { ...activePalette[customMode], [colorKey]: event.target.value } })} className="h-8 w-12 shrink-0 cursor-pointer p-1" aria-label={`${labels[colorKey]} · ${customMode === "light" ? copy.light : copy.dark}`} />
                </label>
              })}
            </div>
            <Button type="button" variant="ghost" size="sm" className="mt-3 gap-2" onClick={() => setPalette(null)}><RotateCcw size={15} />{copy.resetPalette}</Button>
          </div>
        </CardContent>
      </Card>
      <DashboardSlot name="settings.theme.after" />
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
      paletteTitle: "配色方案",
      paletteDescription: "预设同时包含浅色和深色配色，并保存在当前设备。",
      presets: { ocean: "海蓝", moss: "苔绿", amber: "琥珀", berry: "莓果" },
      customPalette: "自定义配色",
      customPaletteDescription: "分别设置浅色和深色模式的颜色。",
      customPaletteMode: "编辑配色模式",
      background: "背景",
      surface: "表面",
      primary: "强调色",
      resetPalette: "恢复站点默认配色",
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
    paletteTitle: "カラーパレット",
    paletteDescription: "各プリセットにはライトとダークの両方が含まれ、このデバイスに保存されます。",
    presets: { ocean: "オーシャン", moss: "モス", amber: "アンバー", berry: "ベリー" },
    customPalette: "カスタムカラー",
    customPaletteDescription: "ライトとダークそれぞれの色を設定します。",
    customPaletteMode: "編集するテーマ",
    background: "背景",
    surface: "サーフェス",
    primary: "アクセント",
    resetPalette: "サイトの既定色に戻す",
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
    paletteTitle: "Color palette",
    paletteDescription: "Each preset includes light and dark colors and is saved on this device.",
    presets: { ocean: "Ocean", moss: "Moss", amber: "Amber", berry: "Berry" },
    customPalette: "Custom colors",
    customPaletteDescription: "Choose colors separately for light and dark appearance.",
    customPaletteMode: "Edit appearance",
    background: "Background",
    surface: "Surface",
    primary: "Accent",
    resetPalette: "Restore site colors",
    current: "Current theme",
    light: "Light",
    dark: "Dark",
    system: "System",
    lightDescription: "Bright and clear interface",
    darkDescription: "Comfortable in low light",
    systemDescription: "Follow your operating system",
  }
}
