import { Ionicons } from "@expo/vector-icons"
import { useCallback, useEffect, useState } from "react"
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native"
import { request } from "../api"
import type { Palette } from "../theme"
import DevicesPage from "./DevicesPage"
import FilesPage from "./FilesPage"
import MemoriesPage from "./MemoriesPage"
import TasksPage from "./TasksPage"
import WorkspacesPage from "./WorkspacesPage"

type Detail = "devices" | "workspaces" | "tasks" | "memories" | "files" | "deliveries" | ""
const entries: Array<{ id: Detail; label: string; icon: keyof typeof Ionicons.glyphMap; endpoint: string; description: string }> = [
  { id: "files", label: "文件库", icon: "document-text-outline", endpoint: "/user/advanced-chat/files", description: "上传、查看和管理文件" },
  { id: "devices", label: "设备", icon: "laptop-outline", endpoint: "/user/advanced-chat/devices", description: "连接器设备与访问令牌" },
  { id: "workspaces", label: "工作区", icon: "folder-open-outline", endpoint: "/user/advanced-chat/workspaces", description: "Markdown 文件与 AI 工作区" },
  { id: "deliveries", label: "结果投递", icon: "send-outline", endpoint: "/user/advanced-chat/deliveries", description: "任务结果投递配置" },
  { id: "tasks", label: "定时任务", icon: "calendar-outline", endpoint: "/user/advanced-chat/scheduled-tasks", description: "自动和重复执行的任务" },
  { id: "memories", label: "记忆", icon: "bulb-outline", endpoint: "/user/advanced-chat/memories", description: "长期记忆与智能体上下文" },
]

export default function LibraryPage({ colors }: { colors: Palette }) {
  const [detail, setDetail] = useState<Detail>(""); const [counts, setCounts] = useState<Record<string, number>>({}); const [loading, setLoading] = useState(false)
  const load = useCallback(async () => { setLoading(true); try { const values = await Promise.all(entries.map(async item => { const data = await request<any>(item.endpoint); const list = data?.files || data?.devices || data?.workspaces || data?.deliveries || data?.tasks || data?.memories || data; return [item.id, Array.isArray(list) ? list.length : 0] as const })); setCounts(Object.fromEntries(values)) } finally { setLoading(false) } }, [])
  useEffect(() => { void load() }, [load])
  if (detail === "devices") return <DevicesPage colors={colors} onBack={() => setDetail("")} />
  if (detail === "files") return <FilesPage colors={colors} onBack={() => setDetail("")} />
  if (detail === "workspaces") return <WorkspacesPage colors={colors} onBack={() => setDetail("")} />
  if (detail === "tasks") return <TasksPage colors={colors} onBack={() => setDetail("")} />
  if (detail === "memories") return <MemoriesPage colors={colors} onBack={() => setDetail("")} />
  return <View style={styles.root}><View style={[styles.header, { borderColor: colors.border }]}><Text style={[styles.title, { color: colors.text }]}>资源</Text></View><FlatList data={entries} keyExtractor={item => item.id} refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />} contentContainerStyle={styles.list} renderItem={({ item }) => <Pressable onPress={() => setDetail(item.id)} style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border }]}><View style={[styles.icon, { backgroundColor: colors.input }]}><Ionicons name={item.icon} size={21} color={colors.text} /></View><View style={{ flex: 1 }}><Text style={{ color: colors.text, fontWeight: "600" }}>{item.label}</Text><Text style={{ color: colors.muted, fontSize: 12 }} numberOfLines={1}>{item.description}</Text></View><Text style={{ color: colors.muted, fontSize: 12 }}>{counts[item.id] || 0}</Text><Ionicons name="chevron-forward" size={18} color={colors.muted} /></Pressable>} /></View>
}
const styles = StyleSheet.create({ root: { flex: 1 }, header: { height: 58, borderBottomWidth: StyleSheet.hairlineWidth, justifyContent: "center", paddingHorizontal: 16 }, title: { fontSize: 18, fontWeight: "600" }, list: { padding: 16, gap: 10 }, row: { minHeight: 72, borderWidth: 1, borderRadius: 12, padding: 12, flexDirection: "row", alignItems: "center", gap: 11 }, icon: { width: 42, height: 42, borderRadius: 10, alignItems: "center", justifyContent: "center" } })
