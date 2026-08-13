import { Ionicons } from "@expo/vector-icons"
import { useCallback, useEffect, useState } from "react"
import { BackHandler, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native"
import { request } from "../api"
import type { Palette } from "../theme"
import ConnectorCredentialsPage from "./ConnectorCredentialsPage"
import DeliveriesPage from "./DeliveriesPage"
import DevicesPage from "./DevicesPage"
import FilesPage from "./FilesPage"
import MemoriesPage from "./MemoriesPage"
import TasksPage from "./TasksPage"
import WorkspacesPage from "./WorkspacesPage"
import ScreenTransition from "../components/ScreenTransition"

type Detail = "credentials" | "devices" | "workspaces" | "tasks" | "memories" | "files" | "deliveries" | ""
const entries: Array<{ id: Detail; label: string; icon: keyof typeof Ionicons.glyphMap; endpoint: string; description: string }> = [
  { id: "credentials", label: "连接器凭据", icon: "key-outline", endpoint: "/user/advanced-chat/connector-credentials", description: "设备环境变量和 HTTP 请求头" },
  { id: "files", label: "文件库", icon: "document-text-outline", endpoint: "/user/advanced-chat/files", description: "上传、查看和管理文件" },
  { id: "devices", label: "设备", icon: "laptop-outline", endpoint: "/user/advanced-chat/devices", description: "连接器设备与访问令牌" },
  { id: "workspaces", label: "工作区", icon: "folder-open-outline", endpoint: "/user/advanced-chat/workspaces", description: "Markdown 文件与 AI 工作区" },
  { id: "deliveries", label: "结果投递", icon: "send-outline", endpoint: "/user/advanced-chat/deliveries", description: "任务结果投递配置" },
  { id: "tasks", label: "定时任务", icon: "calendar-outline", endpoint: "/user/advanced-chat/scheduled-tasks", description: "自动和重复执行的任务" },
  { id: "memories", label: "记忆", icon: "bulb-outline", endpoint: "/user/advanced-chat/memories", description: "长期记忆与代理上下文" },
]

export default function LibraryPage({ colors, onNestedChange }: { colors: Palette; onNestedChange?: (nested: boolean) => void }) {
  const [detail, setDetail] = useState<Detail>(""); const [returning, setReturning] = useState(false); const [counts, setCounts] = useState<Record<string, number>>({}); const [loading, setLoading] = useState(false)
  const load = useCallback(async () => { setLoading(true); try { const values = await Promise.all(entries.map(async item => { const data = await request<any>(item.endpoint); const list = data?.files || data?.devices || data?.workspaces || data?.deliveries || data?.tasks || data?.memories || data?.credentials || data; return [item.id, Array.isArray(list) ? list.length : 0] as const })); setCounts(Object.fromEntries(values)) } finally { setLoading(false) } }, [])
  useEffect(() => { void load() }, [load])
  useEffect(() => { onNestedChange?.(Boolean(detail)); return () => onNestedChange?.(false) }, [detail, onNestedChange])
  useEffect(() => { if (!detail) return; const subscription = BackHandler.addEventListener("hardwareBackPress", () => { setReturning(true); setDetail(""); return true }); return () => subscription.remove() }, [detail])
  const goBack = () => { setReturning(true); setDetail("") }
  if (detail === "credentials") return <ScreenTransition direction="fromRight"><ConnectorCredentialsPage colors={colors} onBack={goBack} /></ScreenTransition>
  if (detail === "deliveries") return <ScreenTransition direction="fromRight"><DeliveriesPage colors={colors} onBack={goBack} /></ScreenTransition>
  if (detail === "devices") return <ScreenTransition direction="fromRight"><DevicesPage colors={colors} onBack={goBack} /></ScreenTransition>
  if (detail === "files") return <ScreenTransition direction="fromRight"><FilesPage colors={colors} onBack={goBack} /></ScreenTransition>
  if (detail === "workspaces") return <ScreenTransition direction="fromRight"><WorkspacesPage colors={colors} onBack={goBack} /></ScreenTransition>
  if (detail === "tasks") return <ScreenTransition direction="fromRight"><TasksPage colors={colors} onBack={goBack} /></ScreenTransition>
  if (detail === "memories") return <ScreenTransition direction="fromRight"><MemoriesPage colors={colors} onBack={goBack} /></ScreenTransition>
  return <ScreenTransition key={returning ? "library-return" : "library-root"} direction="fromLeft" enabled={returning}><View style={styles.root}><View style={[styles.header, { borderColor: colors.border }]}><Text style={[styles.title, { color: colors.text }]}>资源</Text></View><FlatList data={entries} keyExtractor={item => item.id} refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />} contentContainerStyle={styles.list} renderItem={({ item }) => <Pressable onPress={() => { setReturning(false); setDetail(item.id) }} android_ripple={{ color: colors.input }} style={({ pressed }) => [styles.row, { backgroundColor: colors.card, borderColor: colors.border }, pressed && styles.pressed]}><View style={[styles.icon, { backgroundColor: colors.input }]}><Ionicons name={item.icon} size={21} color={colors.text} /></View><View style={{ flex: 1 }}><Text style={{ color: colors.text, fontWeight: "600" }}>{item.label}</Text><Text style={{ color: colors.muted, fontSize: 12 }} numberOfLines={1}>{item.description}</Text></View><Text style={{ color: colors.muted, fontSize: 12 }}>{counts[item.id] || 0}</Text><Ionicons name="chevron-forward" size={18} color={colors.muted} /></Pressable>} /></View></ScreenTransition>
}
const styles = StyleSheet.create({ root: { flex: 1 }, header: { height: 58, borderBottomWidth: StyleSheet.hairlineWidth, justifyContent: "center", paddingHorizontal: 16 }, title: { fontSize: 18, fontWeight: "600" }, list: { paddingVertical: 0 }, row: { minHeight: 70, borderBottomWidth: StyleSheet.hairlineWidth, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", gap: 11 }, pressed: { opacity: .58, backgroundColor: "rgba(127,127,127,.08)" }, icon: { width: 38, height: 38, borderRadius: 9, alignItems: "center", justifyContent: "center" } })
