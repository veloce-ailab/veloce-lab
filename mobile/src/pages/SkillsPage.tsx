import { Ionicons } from "@expo/vector-icons"
import * as DocumentPicker from "expo-document-picker"
import { useCallback, useEffect, useState } from "react"
import { Alert, FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native"
import { request, uploadFile } from "../api"
import type { Palette } from "../theme"
import { Top } from "./TasksPage"

type Skill = { id: string; name: string; description?: string; source?: string; size?: number; enabled?: boolean }
type SkillFile = { path: string; size?: number; skill?: boolean }
type SkillDetail = Skill & { files?: SkillFile[]; package_source_name?: string; hash?: string }
type SkillFileContent = { path?: string; content?: string; truncated?: boolean }

export default function SkillsPage({ colors, onBack }: { colors: Palette; onBack: () => void }) {
  const [items, setItems] = useState<Skill[]>([])
  const [selected, setSelected] = useState<SkillDetail | null>(null)
  const [file, setFile] = useState<SkillFile | null>(null)
  const [content, setContent] = useState<SkillFileContent | null>(null)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setError("")
      const data = await request<unknown>("/user/advanced-chat/skills")
      setItems(Array.isArray(data) ? data.map(normalizeSkill).filter((item): item is Skill => Boolean(item)) : [])
    } catch (cause) {
      setError(message(cause))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const upload = async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: ["application/zip", "application/gzip", "application/x-gzip"], copyToCacheDirectory: false })
    if (result.canceled) return
    const asset = result.assets[0]
    if (!/\.(zip|tgz|tar\.gz)$/i.test(asset.name || "")) {
      setError("请上传 zip、tar.gz 或 tgz 格式的 Skill 包")
      return
    }
    setUploading(true)
    try {
      setError("")
      await uploadFile("/user/advanced-chat/skill-packages", asset)
      await load()
    } catch (cause) {
      setError(message(cause))
    } finally {
      setUploading(false)
    }
  }

  const open = async (skill: Skill) => {
    setLoading(true)
    try {
      setError("")
      const data = await request<unknown>(`/user/advanced-chat/skills/${encodeURIComponent(skill.id)}`)
      const detail = normalizeDetail(data)
      if (!detail) throw new Error("Skill 不存在或已被删除")
      setSelected(detail)
      const initial = detail.files?.find(item => item.skill) || detail.files?.[0] || null
      setFile(initial)
      setContent(null)
      if (initial) await openFile(detail.id, initial)
    } catch (cause) {
      setError(message(cause))
    } finally {
      setLoading(false)
    }
  }

  const openFile = async (skillID: string, next: SkillFile) => {
    setFile(next)
    setContent(null)
    try {
      const data = await request<unknown>(`/user/advanced-chat/skills/${encodeURIComponent(skillID)}/files?path=${encodeURIComponent(next.path)}`)
      setContent(normalizeContent(data))
    } catch (cause) {
      setError(message(cause))
    }
  }

  if (selected) return <View style={styles.root}>
    <Top colors={colors} title={selected.name} onBack={() => { setSelected(null); setFile(null); setContent(null) }} />
    {error ? <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text> : null}
    <View style={[styles.detailMeta, { borderColor: colors.border, backgroundColor: colors.input }]}>
      <View style={{ flex: 1 }}><Text style={{ color: colors.text, fontWeight: "600" }} numberOfLines={1}>{selected.package_source_name || selected.source || "已上传"}</Text><Text style={{ color: colors.muted, fontSize: 12 }}>{formatBytes(selected.size || 0)}{selected.hash ? ` · ${selected.hash.slice(0, 12)}` : ""}</Text></View>
      <Text style={[styles.badge, { backgroundColor: colors.card, color: selected.enabled === false ? colors.muted : colors.text }]}>{selected.enabled === false ? "停用" : "启用"}</Text>
    </View>
    <View style={styles.detail}>
      <View style={[styles.filePane, { borderColor: colors.border }]}>
        <Text style={[styles.paneTitle, { color: colors.muted }]}>文件</Text>
        <ScrollView contentContainerStyle={styles.fileList}>{selected.files?.length ? selected.files.map(item => <Pressable key={item.path} onPress={() => void openFile(selected.id, item)} style={[styles.fileRow, { backgroundColor: file?.path === item.path ? colors.input : "transparent" }]}><Ionicons name={item.skill ? "sparkles-outline" : "document-text-outline"} size={16} color={colors.text} /><Text style={{ color: colors.text, flex: 1, fontSize: 12 }} numberOfLines={1}>{item.path}</Text>{item.skill ? <Text style={{ color: colors.muted, fontSize: 10 }}>SKILL</Text> : null}</Pressable>) : <Text style={{ color: colors.muted, fontSize: 12 }}>暂无文件</Text>}</ScrollView>
      </View>
      <View style={styles.contentPane}>
        <Text style={[styles.paneTitle, { color: colors.muted }]} numberOfLines={1}>{file?.path || "选择文件"}</Text>
        <ScrollView contentContainerStyle={styles.contentScroll}><Text selectable style={[styles.code, { color: colors.text }]}>{file ? (content?.content || (loading ? "加载中…" : "文件为空")) : "从上方选择一个文件以查看内容"}</Text>{content?.truncated ? <Text style={{ color: colors.muted, fontSize: 12 }}>内容已截断</Text> : null}</ScrollView>
      </View>
    </View>
  </View>

  return <View style={styles.root}>
    <Top colors={colors} title="技能" onBack={onBack} right="add" onRight={() => void upload()} />
    {error ? <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text> : null}
    <FlatList
      data={items}
      keyExtractor={item => item.id}
      refreshing={loading}
      onRefresh={load}
      contentContainerStyle={items.length ? styles.list : styles.empty}
      ListEmptyComponent={<View style={styles.empty}><Ionicons name="sparkles-outline" size={28} color={colors.muted} /><Text style={{ color: colors.muted }}>{uploading ? "上传中…" : "暂无技能"}</Text><Text style={[styles.emptyHint, { color: colors.muted }]}>点按“新建”上传 zip、tar.gz 或 tgz 格式的 Skill 包。</Text></View>}
      renderItem={({ item }) => <Pressable onPress={() => void open(item)} style={({ pressed }) => [styles.row, { borderColor: colors.border, backgroundColor: colors.card }, pressed && styles.pressed]}><View style={[styles.icon, { backgroundColor: colors.input }]}><Ionicons name="sparkles-outline" size={20} color={colors.text} /></View><View style={{ flex: 1, gap: 3 }}><View style={styles.nameRow}><Text style={{ color: colors.text, fontWeight: "600", flexShrink: 1 }} numberOfLines={1}>{item.name}</Text><Text style={[styles.badge, { backgroundColor: colors.input, color: colors.muted }]}>{item.source || "uploaded"}</Text></View>{item.description ? <Text style={{ color: colors.muted, fontSize: 12 }} numberOfLines={2}>{item.description}</Text> : null}<Text style={{ color: colors.muted, fontSize: 11 }} numberOfLines={1}>{item.id}</Text></View><Ionicons name="chevron-forward" size={18} color={colors.muted} /></Pressable>}
    />
    {uploading ? <View style={[styles.uploadNotice, { backgroundColor: colors.input }]}><Text style={{ color: colors.text }}>正在上传 Skill 包…</Text></View> : null}
  </View>
}

function normalizeSkill(value: unknown): Skill | null {
  if (!value || typeof value !== "object") return null
  const item = value as Record<string, unknown>
  const id = String(item.id || "")
  return id ? { id, name: typeof item.name === "string" ? item.name : id, description: typeof item.description === "string" ? item.description : "", source: typeof item.source === "string" ? item.source : "uploaded", size: typeof item.size === "number" ? item.size : 0, enabled: item.enabled !== false } : null
}

function normalizeDetail(value: unknown): SkillDetail | null {
  const skill = normalizeSkill(value)
  if (!skill || !value || typeof value !== "object") return null
  const item = value as Record<string, unknown>
  return { ...skill, package_source_name: typeof item.package_source_name === "string" ? item.package_source_name : "", hash: typeof item.hash === "string" ? item.hash : "", files: Array.isArray(item.files) ? item.files.map(normalizeFile).filter((file): file is SkillFile => Boolean(file)) : [] }
}

function normalizeFile(value: unknown): SkillFile | null {
  if (!value || typeof value !== "object") return null
  const item = value as Record<string, unknown>
  return typeof item.path === "string" && item.path ? { path: item.path, size: typeof item.size === "number" ? item.size : 0, skill: item.skill === true } : null
}

function normalizeContent(value: unknown): SkillFileContent | null {
  if (!value || typeof value !== "object") return null
  const item = value as Record<string, unknown>
  return { path: typeof item.path === "string" ? item.path : "", content: typeof item.content === "string" ? item.content : "", truncated: item.truncated === true }
}

function message(error: unknown) { return error instanceof Error ? error.message : "发生未知错误" }
function formatBytes(value: number) { return value < 1024 ? `${value} B` : value < 1024 * 1024 ? `${(value / 1024).toFixed(1)} KB` : `${(value / 1024 / 1024).toFixed(1)} MB` }

const styles = StyleSheet.create({
  root: { flex: 1 },
  error: { paddingHorizontal: 16, paddingTop: 10 },
  list: { padding: 16, gap: 10 },
  empty: { flexGrow: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 9 },
  emptyHint: { textAlign: "center", fontSize: 12 },
  row: { minHeight: 78, borderWidth: 1, borderRadius: 12, padding: 12, flexDirection: "row", gap: 11, alignItems: "center" },
  icon: { width: 42, height: 42, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  badge: { borderRadius: 7, paddingHorizontal: 6, paddingVertical: 2, fontSize: 10, overflow: "hidden" },
  pressed: { opacity: 0.58, transform: [{ scale: 0.985 }] },
  uploadNotice: { position: "absolute", left: 16, right: 16, bottom: 16, borderRadius: 10, padding: 12, alignItems: "center" },
  detailMeta: { margin: 12, borderWidth: 1, borderRadius: 12, padding: 12, flexDirection: "row", gap: 10, alignItems: "center" },
  detail: { flex: 1, paddingHorizontal: 12, gap: 12 },
  filePane: { maxHeight: "34%", borderWidth: 1, borderRadius: 12, padding: 10 },
  contentPane: { flex: 1, minHeight: 0 },
  paneTitle: { fontSize: 12, fontWeight: "600", marginBottom: 8 },
  fileList: { gap: 3 },
  fileRow: { minHeight: 36, borderRadius: 8, paddingHorizontal: 8, flexDirection: "row", alignItems: "center", gap: 8 },
  contentScroll: { paddingBottom: 20 },
  code: { fontFamily: "monospace", fontSize: 12, lineHeight: 19 },
})
