import { Monitor, Moon, Sun } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { useI18n } from "@/lib/i18n"
import { useTheme } from "@/lib/theme"
import type { ThemeMode } from "@/lib/theme"

interface ThemeOption {
  value: ThemeMode
  icon: LucideIcon
}

const options: ThemeOption[] = [
  { value: "light", icon: Sun },
  { value: "dark", icon: Moon },
  { value: "system", icon: Monitor },
]

export function ThemeSwitcher() {
  const { language } = useI18n()
  const { mode, resolvedTheme, setMode } = useTheme()
  const labels = themeLabels(language)
  const CurrentIcon = mode === "system" ? Monitor : resolvedTheme === "dark" ? Moon : Sun

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" title={labels.title} aria-label={labels.title}>
          <CurrentIcon size={18} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuRadioGroup value={mode} onValueChange={(value) => setMode(value as ThemeMode)}>
          {options.map((option) => {
            const Icon = option.icon
            return (
              <DropdownMenuRadioItem key={option.value} value={option.value} className="gap-2">
                <Icon size={16} />
                {labels[option.value]}
              </DropdownMenuRadioItem>
            )
          })}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function themeLabels(language: string) {
  if (language === "zh") {
    return {
      title: "切换主题",
      light: "浅色",
      dark: "深色",
      system: "跟随系统",
    }
  }
  if (language === "ja") {
    return {
      title: "テーマ切替",
      light: "ライト",
      dark: "ダーク",
      system: "システム",
    }
  }
  return {
    title: "Switch theme",
    light: "Light",
    dark: "Dark",
    system: "System",
  }
}
