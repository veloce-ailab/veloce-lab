import { Ionicons } from "@expo/vector-icons"
import AsyncStorage from "@react-native-async-storage/async-storage"
import { StatusBar } from "expo-status-bar"
import { useCallback, useEffect, useState } from "react"
import { Platform, Pressable, StatusBar as NativeStatusBar, StyleSheet, Text, useColorScheme, View } from "react-native"
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context"
import { clearToken, restoreConnection } from "./src/api"
import AgentsHomePage from "./src/pages/AgentsHomePage"
import ChatPage from "./src/pages/ChatPage"
import ExplorePage from "./src/pages/ExplorePage"
import LibraryPage from "./src/pages/LibraryPage"
import LoginPage from "./src/pages/LoginPage"
import SettingsPage from "./src/pages/SettingsPage"
import ScreenTransition from "./src/components/ScreenTransition"
import { paletteFor, type Palette } from "./src/theme"
import type { Agent, ThemeMode } from "./src/types"

const preferencesKey = "veloce.mobile.preferences"
type Tab = "chat" | "explore" | "library" | "settings"
type Preferences = { theme: ThemeMode; language: "zh" | "en" }
const defaults: Preferences = { theme: "system", language: "zh" }

export default function App() { return <SafeAreaProvider><VeloceApp /></SafeAreaProvider> }

function VeloceApp() {
  const systemTheme = useColorScheme()
  const [ready, setReady] = useState(false)
  const [authenticated, setAuthenticated] = useState(false)
  const [preferences, setPreferences] = useState<Preferences>(defaults)
  const colors = paletteFor(preferences.theme === "system" ? (systemTheme === "dark" ? "dark" : "light") : preferences.theme)
  const savePreferences = useCallback(async (next: Preferences) => { setPreferences(next); await AsyncStorage.setItem(preferencesKey, JSON.stringify(next)) }, [])
  useEffect(() => { Promise.all([restoreConnection(), AsyncStorage.getItem(preferencesKey)]).then(([connection, stored]) => { if (stored) setPreferences({ ...defaults, ...JSON.parse(stored) }); setAuthenticated(Boolean(connection.token)); setReady(true) }).catch(() => setReady(true)) }, [])
  if (!ready) return <View style={[styles.loading, { backgroundColor: colors.background }]}><Text style={{ color: colors.muted }}>加载中…</Text></View>
  return <View style={[styles.app, { backgroundColor: colors.background }]}><StatusBar style={colors.background === "#171717" ? "light" : "dark"} />{authenticated ? <Main colors={colors} preferences={preferences} savePreferences={savePreferences} onLogout={() => setAuthenticated(false)} /> : <LoginPage colors={colors} onLoggedIn={() => setAuthenticated(true)} />}</View>
}

function Main({ colors, preferences, savePreferences, onLogout }: { colors: Palette; preferences: Preferences; savePreferences: (next: Preferences) => void; onLogout: () => void }) {
  const [tab, setTab] = useState<Tab>("chat")
  const [tabDirection, setTabDirection] = useState<"fromRight" | "fromLeft">("fromRight")
  const [chatAgent, setChatAgent] = useState<Agent | null>(null)
  const [chatReturning, setChatReturning] = useState(false)
  const [nested, setNested] = useState(false)
  const insets = useSafeAreaInsets()
  const logout = async () => { await clearToken(); onLogout() }
  const changeTab = (next: Tab) => { if (next === tab) return; const order: Tab[] = ["chat", "explore", "library", "settings"]; setChatAgent(null); setNested(false); setTabDirection(order.indexOf(next) >= order.indexOf(tab) ? "fromRight" : "fromLeft"); setTab(next) }
  const openChat = (agent: Agent) => { setChatReturning(false); setChatAgent(agent) }
  const closeChat = () => { setChatReturning(true); setChatAgent(null) }
  return <View style={[styles.safe, { paddingTop: Math.max(insets.top, Platform.OS === "android" ? NativeStatusBar.currentHeight || 24 : 0) }]}><View style={styles.content}><ScreenTransition key={tab} direction={tabDirection}>{tab === "chat" && (chatAgent ? <ScreenTransition direction="fromRight"><ChatPage colors={colors} agent={chatAgent} onBack={closeChat} /></ScreenTransition> : <ScreenTransition key={chatReturning ? "agents-return" : "agents-home"} direction="fromLeft" enabled={chatReturning}><AgentsHomePage colors={colors} onOpen={openChat} /></ScreenTransition>)}{tab === "explore" && <ExplorePage colors={colors} onNestedChange={setNested} />}{tab === "library" && <LibraryPage colors={colors} onNestedChange={setNested} />}{tab === "settings" && <SettingsPage colors={colors} preferences={preferences} savePreferences={savePreferences} onLogout={logout} />}</ScreenTransition></View>{!chatAgent && !nested ? <BottomTabs colors={colors} active={tab} onChange={changeTab} bottom={Math.max(insets.bottom, 8)} /> : null}</View>
}

function BottomTabs({ colors, active, onChange, bottom }: { colors: Palette; active: Tab; onChange: (tab: Tab) => void; bottom: number }) {
  const tabs: { key: Tab; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [{ key: "chat", label: "首页", icon: "home-outline" }, { key: "explore", label: "工作台", icon: "grid-outline" }, { key: "library", label: "资源", icon: "folder-outline" }, { key: "settings", label: "设置", icon: "settings-outline" }]
  return <View style={[styles.tabs, { borderColor: colors.border, backgroundColor: colors.card, paddingBottom: bottom }]}>{tabs.map(item => <Pressable key={item.key} onPress={() => onChange(item.key)} android_ripple={{ color: colors.input }} style={({ pressed }) => [styles.tab, pressed && styles.pressed]}><Ionicons name={item.icon} size={22} color={active === item.key ? colors.text : colors.muted} /><Text style={[styles.tabLabel, { color: active === item.key ? colors.text : colors.muted }]}>{item.label}</Text></Pressable>)}</View>
}

const styles = StyleSheet.create({ app: { flex: 1 }, safe: { flex: 1 }, content: { flex: 1 }, loading: { flex: 1, alignItems: "center", justifyContent: "center" }, tabs: { minHeight: 65, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: "row", justifyContent: "space-around" }, tab: { flex: 1, alignItems: "center", justifyContent: "center", gap: 3 }, pressed: { opacity: .55, transform: [{ scale: .96 }] }, tabLabel: { fontSize: 11, fontWeight: "500" } })
