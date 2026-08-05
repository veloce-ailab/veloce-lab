import { ChevronDown, Globe2, Languages } from "lucide-react"
import type { Language } from "@/lib/i18n"
import { useI18n } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"

interface LanguageOption {
  value: Language
  labelKey: "language.chinese" | "language.english" | "language.japanese"
  descriptionKey: "language.chineseDescription" | "language.englishDescription" | "language.japaneseDescription"
}

const languageOptions: LanguageOption[] = [
  { value: "zh", labelKey: "language.chinese", descriptionKey: "language.chineseDescription" },
  { value: "en", labelKey: "language.english", descriptionKey: "language.englishDescription" },
  { value: "ja", labelKey: "language.japanese", descriptionKey: "language.japaneseDescription" },
]

export function LanguageSwitcher({
  className,
  triggerClassName,
  menuClassName,
  placement = "bottom",
  showLabel = true,
  compact = false,
}: {
  className?: string
  triggerClassName?: string
  menuClassName?: string
  placement?: "top" | "bottom"
  showLabel?: boolean
  compact?: boolean
}) {
  const { language, setLanguage, t } = useI18n()
  const currentOption = languageOptions.find((option) => option.value === language) || languageOptions[0]

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size={compact ? "icon" : "default"}
          className={cn("group/language-trigger", !compact && "h-10 w-full justify-between rounded-2xl px-3", triggerClassName, className)}
        >
          {compact ? <Languages size={17} /> : (
            <>
              <span className="flex min-w-0 items-center gap-2">
                <Globe2 size={16} className="shrink-0 text-muted-foreground" />
                {showLabel && <span className="min-w-0 truncate"><span className="text-muted-foreground">{t("language.current")}: </span><span className="font-medium">{t(currentOption.labelKey)}</span></span>}
                {!showLabel && <span className="font-medium">{t(currentOption.labelKey)}</span>}
              </span>
              <ChevronDown size={16} className="shrink-0 text-muted-foreground transition-transform group-data-[state=open]/language-trigger:rotate-180" />
            </>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side={placement} align={compact ? "end" : "start"} className={cn("min-w-56", menuClassName)} aria-label={t("language.select")}>
        <DropdownMenuRadioGroup value={language} onValueChange={(value) => setLanguage(value as Language)}>
          {languageOptions.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value} className="min-h-12 items-start gap-3 py-2">
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{t(option.labelKey)}</span>
                <span className="block text-xs text-muted-foreground">{t(option.descriptionKey)}</span>
              </span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
