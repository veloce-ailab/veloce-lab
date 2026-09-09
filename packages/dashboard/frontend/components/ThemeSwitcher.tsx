import { Moon, Sun } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useI18n } from "@/lib/i18n"
import { useTheme } from "@/lib/theme"

export function ThemeSwitcher() {
  const { language } = useI18n()
  const { resolvedTheme, setMode } = useTheme()
  const labels = themeLabels(language)
  const nextTheme = resolvedTheme === "dark" ? "light" : "dark"
  const CurrentIcon = resolvedTheme === "dark" ? Sun : Moon

  return <Button variant="outline" size="icon" title={labels.title} aria-label={labels.title} onClick={() => setMode(nextTheme)}><CurrentIcon size={18} /></Button>
}

function themeLabels(language: string) {
  if (language === "zh") {
    return {
      title: "切换主题",
      light: "浅色",
      dark: "深色",
    }
  }
  if (language === "ja") {
    return {
      title: "テーマ切替",
      light: "ライト",
      dark: "ダーク",
    }
  }
  return {
    title: "Switch theme",
    light: "Light",
    dark: "Dark",
  }
}
