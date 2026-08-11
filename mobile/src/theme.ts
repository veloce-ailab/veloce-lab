import { Appearance } from "react-native"
import type { ThemeMode } from "./types"

export type Palette = { background: string; card: string; text: string; muted: string; border: string; primary: string; primaryText: string; input: string; bubble: string; destructive: string; shade: string }
const light: Palette = { background: "#ffffff", card: "#ffffff", text: "#171717", muted: "#737373", border: "#e5e5e5", primary: "#202020", primaryText: "#ffffff", input: "#f5f5f5", bubble: "#f4f4f5", destructive: "#dc2626", shade: "#fafafa" }
const dark: Palette = { background: "#171717", card: "#252525", text: "#fafafa", muted: "#a3a3a3", border: "#424242", primary: "#f5f5f5", primaryText: "#171717", input: "#303030", bubble: "#333333", destructive: "#f87171", shade: "#202020" }
export function paletteFor(mode: ThemeMode) { return (mode === "dark" || (mode === "system" && Appearance.getColorScheme() === "dark")) ? dark : light }
