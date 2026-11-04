import { createContext, useContext, useEffect, useMemo, useState } from "react"
import type { Context, ReactNode } from "react"
import { useQuery } from "@tanstack/react-query"
import api from "@/lib/api"
import type { PublicSettings } from "@/lib/public-settings"
import { withPublicSettingsDefaults } from "@/lib/public-settings"

export type ThemeMode = "light" | "dark" | "system"
export type ResolvedTheme = "light" | "dark"

export interface UserThemePalette {
  light: { background: string; foreground: string; surface: string; primary: string }
  dark: { background: string; foreground: string; surface: string; primary: string }
}

const themeStorageKey = "theme-mode"
const themeStyleElementID = "windypear-theme-vars"
const themeCustomizationStyleElementID = "windypear-theme-customizations"
const userThemePaletteStorageKey = "veloce.user-theme-palette.v1"
const userThemePaletteVariables = ["background", "foreground", "card", "card-foreground", "popover", "popover-foreground", "primary", "primary-foreground", "secondary", "secondary-foreground", "accent", "accent-foreground", "muted", "muted-foreground", "border", "input", "ring", "sidebar", "sidebar-foreground", "sidebar-primary", "sidebar-primary-foreground", "sidebar-accent", "sidebar-accent-foreground", "sidebar-border", "sidebar-ring"]

type ThemeContextValue = {
  mode: ThemeMode
  resolvedTheme: ResolvedTheme
  setMode: (mode: ThemeMode) => void
  palette: UserThemePalette | null
  setPalette: (palette: UserThemePalette | null) => void
}

type ThemeColorSettingKey = Extract<keyof PublicSettings, `theme_${string}`>

/**
 * Palette overrides applied on top of `frontend/index.css`.
 *
 * Values reach the stylesheet through plain `var(--token)` consumers, so they
 * must be complete colour values: emitting an `hsl` component triple here would
 * make every `border-color`, `background-color`, `--tw-ring-color` and therefore
 * every `box-shadow` invalid, which erases card edges, rings and shadows.
 */
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

const globalObject = globalThis as typeof globalThis & {
  __VELOCE_DASHBOARD_THEME_CONTEXT__?: Context<ThemeContextValue | null>
}
const ThemeContext = globalObject.__VELOCE_DASHBOARD_THEME_CONTEXT__ ??= createContext<ThemeContextValue | null>(null)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(getStoredThemeMode)
  const [palette, setPaletteState] = useState<UserThemePalette | null>(getStoredThemePalette)
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

  useEffect(() => {
    applyUserThemePalette(palette, resolvedTheme, publicSettings)
  }, [palette, publicSettings, resolvedTheme])

  const value = useMemo<ThemeContextValue>(() => ({
    mode,
    resolvedTheme,
    palette,
    setMode: (nextMode) => {
      try {
        localStorage.setItem(themeStorageKey, nextMode)
      } catch {
        // Theme still applies for the current session when browser storage is blocked.
      }
      setModeState(nextMode)
    },
    setPalette: (nextPalette) => {
      setPaletteState(nextPalette)
      try {
        if (nextPalette) localStorage.setItem(userThemePaletteStorageKey, JSON.stringify(nextPalette))
        else localStorage.removeItem(userThemePaletteStorageKey)
      } catch {
        // Keep the selected palette for this session when storage is unavailable.
      }
    },
  }), [mode, palette, resolvedTheme])

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

function getStoredThemePalette(): UserThemePalette | null {
  if (typeof window === "undefined") return null
  try {
    const stored = localStorage.getItem(userThemePaletteStorageKey)
    if (!stored) return null
    const value = JSON.parse(stored) as UserThemePalette
    for (const mode of ["light", "dark"] as const) {
      for (const color of Object.values(value[mode])) {
        if (!normalizeHexColor(color)) return null
      }
    }
    return value
  } catch {
    return null
  }
}

function applyUserThemePalette(palette: UserThemePalette | null, resolvedTheme: ResolvedTheme, settings: PublicSettings) {
  const root = document.documentElement
  if (!palette) {
    for (const variable of userThemePaletteVariables) root.style.removeProperty(`--${variable}`)
    updateThemeColorMeta(settings, resolvedTheme)
    return
  }
  const colors = palette[resolvedTheme]
  const values: Record<string, string> = {
    background: colors.background,
    foreground: colors.foreground,
    card: colors.surface,
    "card-foreground": colors.foreground,
    popover: colors.surface,
    "popover-foreground": colors.foreground,
    primary: colors.primary,
    "primary-foreground": readableForeground(colors.primary),
    secondary: colors.surface,
    "secondary-foreground": colors.foreground,
    accent: colors.surface,
    "accent-foreground": colors.foreground,
    muted: colors.surface,
    "muted-foreground": colors.foreground,
    border: colors.surface,
    input: colors.surface,
    ring: colors.primary,
    sidebar: colors.surface,
    "sidebar-foreground": colors.foreground,
    "sidebar-primary": colors.primary,
    "sidebar-primary-foreground": readableForeground(colors.primary),
    "sidebar-accent": colors.surface,
    "sidebar-accent-foreground": colors.foreground,
    "sidebar-border": colors.surface,
    "sidebar-ring": colors.primary,
  }
  for (const [name, value] of Object.entries(values)) root.style.setProperty(`--${name}`, normalizeHexColor(value))
  let meta = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null
  if (!meta) {
    meta = document.createElement("meta")
    meta.name = "theme-color"
    document.head.appendChild(meta)
  }
  meta.content = colors.background
}

function readableForeground(hex: string) {
  const color = normalizeHexColor(hex).slice(1)
  const channels = [0, 2, 4].map((offset) => Number.parseInt(color.slice(offset, offset + 2), 16) / 255)
  const luminance = channels.map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4).reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0)
  return luminance > 0.42 ? "#17212b" : "#ffffff"
}

function applyThemeVariables(settings: PublicSettings, resolvedTheme: ResolvedTheme) {
  let styleElement = document.getElementById(themeStyleElementID) as HTMLStyleElement | null
  const blocks = [
    buildThemeBlock(":root", settings, "light"),
    buildThemeBlock(".dark", settings, "dark"),
  ].filter(Boolean)

  if (blocks.length === 0) {
    // Nothing is customised: the stylesheet in frontend/index.css is the palette.
    styleElement?.remove()
  } else {
    if (!styleElement) {
      styleElement = document.createElement("style")
      styleElement.id = themeStyleElementID
      document.head.appendChild(styleElement)
    }
    styleElement.textContent = blocks.join("\n\n")
  }
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
      const color = normalizeHexColor(settings[settingKey])
      return color ? `  --${cssVariable}: ${color};` : ""
    })
    .filter(Boolean)

  return variables.length > 0 ? `${selector} {\n${variables.join("\n")}\n}` : ""
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
