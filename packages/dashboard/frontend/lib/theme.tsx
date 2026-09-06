import { createContext, useContext, useEffect, useMemo, useState } from "react"
import type { ReactNode } from "react"
import { useQuery } from "@tanstack/react-query"
import api from "@/lib/api"
import type { PublicSettings } from "@/lib/public-settings"
import { withPublicSettingsDefaults } from "@/lib/public-settings"

export type ThemeMode = "light" | "dark" | "system"
export type ResolvedTheme = "light" | "dark"

const themeStorageKey = "theme-mode"
const themeStyleElementID = "windypear-theme-vars"
const themeCustomizationStyleElementID = "windypear-theme-customizations"

type ThemeContextValue = {
  mode: ThemeMode
  resolvedTheme: ResolvedTheme
  setMode: (mode: ThemeMode) => void
}

type ThemeColorSettingKey = Extract<keyof PublicSettings, `theme_${string}`>

const themeVariableMap: Array<readonly [string, ThemeColorSettingKey, ThemeColorSettingKey]> = [
  ["background", "theme_light_background", "theme_dark_background"],
  ["foreground", "theme_light_foreground", "theme_dark_foreground"],
  ["card", "theme_light_card", "theme_dark_card"],
  ["card-foreground", "theme_light_card_foreground", "theme_dark_card_foreground"],
  ["popover", "theme_light_card", "theme_dark_card"],
  ["popover-foreground", "theme_light_card_foreground", "theme_dark_card_foreground"],
  ["primary", "theme_light_primary", "theme_dark_primary"],
  ["primary-foreground", "theme_light_primary_foreground", "theme_dark_primary_foreground"],
  ["secondary", "theme_light_secondary", "theme_dark_secondary"],
  ["secondary-foreground", "theme_light_secondary_foreground", "theme_dark_secondary_foreground"],
  ["accent", "theme_light_accent", "theme_dark_accent"],
  ["accent-foreground", "theme_light_accent_foreground", "theme_dark_accent_foreground"],
  ["muted", "theme_light_muted", "theme_dark_muted"],
  ["muted-foreground", "theme_light_muted_foreground", "theme_dark_muted_foreground"],
  ["border", "theme_light_border", "theme_dark_border"],
  ["input", "theme_light_border", "theme_dark_border"],
  ["ring", "theme_light_primary", "theme_dark_primary"],
]

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(getStoredThemeMode)
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(() => getSystemTheme())
  const { data: settings } = useQuery<PublicSettings>({
    queryKey: ["public-settings"],
    queryFn: async () => {
      const res = await api.get("/public/settings")
      return res.data
    },
  })
  const publicSettings = useMemo(() => withPublicSettingsDefaults(settings), [settings])
  const resolvedTheme = mode === "system" ? systemTheme : mode

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)")
    const handleChange = () => setSystemTheme(mediaQuery.matches ? "dark" : "light")
    handleChange()
    mediaQuery.addEventListener("change", handleChange)
    return () => mediaQuery.removeEventListener("change", handleChange)
  }, [])

  useEffect(() => {
    document.documentElement.classList.toggle("dark", resolvedTheme === "dark")
    document.documentElement.style.colorScheme = resolvedTheme
    void window.veloceDesktop?.setTitleBarTheme(resolvedTheme)
  }, [resolvedTheme])

  useEffect(() => {
    applyThemeVariables(publicSettings, resolvedTheme)
  }, [publicSettings, resolvedTheme])

  const value = useMemo<ThemeContextValue>(() => ({
    mode,
    resolvedTheme,
    setMode: (nextMode) => {
      try {
        localStorage.setItem(themeStorageKey, nextMode)
      } catch {
        // Theme still applies for the current session when browser storage is blocked.
      }
      setModeState(nextMode)
    },
  }), [mode, resolvedTheme])

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider")
  }
  return context
}

export function isThemeMode(value: string | null): value is ThemeMode {
  return value === "light" || value === "dark" || value === "system"
}

export function normalizeHexColor(value: string) {
  const trimmed = value.trim()
  const match = trimmed.match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i)
  if (!match) {
    return ""
  }
  const hex = match[1]
  if (hex.length === 3) {
    return `#${hex.split("").map((part) => part + part).join("")}`.toLowerCase()
  }
  return `#${hex}`.toLowerCase()
}

function getStoredThemeMode(): ThemeMode {
  if (typeof window === "undefined") {
    return "system"
  }
  try {
    const stored = localStorage.getItem(themeStorageKey)
    return isThemeMode(stored) ? stored : "system"
  } catch {
    return "system"
  }
}

function getSystemTheme(): ResolvedTheme {
  if (typeof window === "undefined") {
    return "light"
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
}

function applyThemeVariables(settings: PublicSettings, resolvedTheme: ResolvedTheme) {
  let styleElement = document.getElementById(themeStyleElementID) as HTMLStyleElement | null
  if (!styleElement) {
    styleElement = document.createElement("style")
    styleElement.id = themeStyleElementID
    document.head.appendChild(styleElement)
  }
  styleElement.textContent = [
    buildThemeBlock(":root", settings, "light"),
    buildThemeBlock(".dark", settings, "dark"),
  ].join("\n\n")
  applyThemeCustomizations(settings)
  updateThemeColorMeta(settings, resolvedTheme)
}

function applyThemeCustomizations(settings: PublicSettings) {
  let styleElement = document.getElementById(themeCustomizationStyleElementID) as HTMLStyleElement | null
  const backgroundImage = safeBackgroundImageURL(settings.theme_background_image)
  const customCSS = settings.theme_custom_css.trim()

  if (!backgroundImage && !customCSS) {
    styleElement?.remove()
    return
  }

  if (!styleElement) {
    styleElement = document.createElement("style")
    styleElement.id = themeCustomizationStyleElementID
    document.head.appendChild(styleElement)
  }

  const backgroundCSS = backgroundImage
    ? `body {\n  background-image: url(${JSON.stringify(backgroundImage)});\n  background-size: cover;\n  background-position: center;\n  background-attachment: fixed;\n}\n`
    : ""
  styleElement.textContent = `${backgroundCSS}\n${customCSS}`
}

function safeBackgroundImageURL(value: string) {
  const trimmed = value.trim()
  if (!trimmed) {
    return ""
  }
  if (trimmed.startsWith("/") || trimmed.startsWith("./") || trimmed.startsWith("../")) {
    return trimmed
  }
  try {
    const url = new URL(trimmed)
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : ""
  } catch {
    return ""
  }
}

function buildThemeBlock(selector: string, settings: PublicSettings, theme: ResolvedTheme) {
  const variables = themeVariableMap
    .map(([cssVariable, lightKey, darkKey]) => {
      const settingKey = theme === "dark" ? darkKey : lightKey
      const hsl = hexToHsl(settings[settingKey])
      return hsl ? `  --${cssVariable}: ${hsl};` : ""
    })
    .filter(Boolean)

  return `${selector} {\n${variables.join("\n")}\n}`
}

function updateThemeColorMeta(settings: PublicSettings, resolvedTheme: ResolvedTheme) {
  const settingKey = resolvedTheme === "dark" ? "theme_dark_background" : "theme_light_background"
  const color = normalizeHexColor(settings[settingKey])
  if (!color) {
    return
  }
  let meta = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null
  if (!meta) {
    meta = document.createElement("meta")
    meta.name = "theme-color"
    document.head.appendChild(meta)
  }
  meta.content = color
}

function hexToHsl(value: string) {
  const hex = normalizeHexColor(value)
  if (!hex) {
    return ""
  }

  const red = Number.parseInt(hex.slice(1, 3), 16) / 255
  const green = Number.parseInt(hex.slice(3, 5), 16) / 255
  const blue = Number.parseInt(hex.slice(5, 7), 16) / 255

  const max = Math.max(red, green, blue)
  const min = Math.min(red, green, blue)
  const lightness = (max + min) / 2
  const delta = max - min
  let hue = 0
  let saturation = 0

  if (delta !== 0) {
    saturation = lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min)
    switch (max) {
      case red:
        hue = (green - blue) / delta + (green < blue ? 6 : 0)
        break
      case green:
        hue = (blue - red) / delta + 2
        break
      default:
        hue = (red - green) / delta + 4
        break
    }
    hue /= 6
  }

  return `${roundHue(hue * 360)} ${roundPercent(saturation * 100)}% ${roundPercent(lightness * 100)}%`
}

function roundHue(value: number) {
  return Number(value.toFixed(1))
}

function roundPercent(value: number) {
  return Number(value.toFixed(1))
}
