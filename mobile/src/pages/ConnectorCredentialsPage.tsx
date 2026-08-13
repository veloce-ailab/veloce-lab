import { Ionicons } from "@expo/vector-icons"
import { useCallback, useEffect, useState } from "react"
import { Alert, FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native"
import { request } from "../api"
import type { Palette } from "../theme"
import { Action, Choice, Input, Sheet, Top } from "./TasksPage"

type CredentialType = "environment" | "http_header"
type Credential = { id: string; name: string; type: CredentialType; key: string; value_set?: boolean }
const defaults = { name: "", type: "environment" as CredentialType, key: "", value: "" }

export default function ConnectorCredentialsPage({ colors, onBack }: { colors: Palette; onBack: () => void }) {
  const [items, setItems] = useState<Credential[]>([])
  const [editor, setEditor] = useState<Credential | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [form, setForm] = useState({ ...defaults })
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setError("")
      const data = await request<unknown>("/user/advanced-chat/connector-credentials")
      setItems(Array.isArray(data) ? data.map(normalize).filter((item): item is Credential => Boolean(item)) : [])
    } catch (cause) {
      setError(message(cause))
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => { void load() }, [load])

  const open = (item?: Credential) => {
    setError("")
    setEditor(item || null)
    setEditorOpen(true)
    setForm(item ? { name: item.name, type: item.type, key: item.key, value: "" } : { ...defaults })
  }
  const close = () => { setEditor(null); setEditorOpen(false); setError("") }
  const save = async () => {
    if (!form.name.trim() || !form.key.trim() || (!editor?.id && !form.value.trim())) { setError("请填写名称、键名和凭据值"); return }
    setSaving(true)
    try {
      const body = { name: form.name.trim(), type: form.type, key: form.key.trim(), value: form.value || undefined }
      await request(editor?.id ? `/user/advanced-chat/connector-credentials/${encodeURIComponent(editor.id)}` : "/user/advanced-chat/connector-credentials", { method: editor?.id ? "PUT" : "POST", body })
      close()
      await load()
    } catch (cause) {
      setError(message(cause))
    } finally {
      setSaving(false)
    }
  }
  const remove = (item: Credential) => Alert.alert("删除凭据", `确定删除“${item.name}”？关联的连接器将自动解除绑定。`, [{ text: "取消", style: "cancel" }, { text: "删除", style: "destructive", onPress: async () => { try { await request(`/user/advanced-chat/connector-credentials/${encodeURIComponent(item.id)}`, { method: "DELETE" }); await load() } catch (cause) { setError(message(cause)) } } }])

  return <View style={styles.root}>
    <Top colors={colors} title="连接器凭据" onBack={onBack} right="add" onRight={() => open()} />
    {error ? <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text> : null}
    <FlatList data={items} keyExtractor={item => item.id} refreshing={loading} onRefresh={load} contentContainerStyle={items.length ? styles.list : styles.empty} ListEmptyComponent={<View style={styles.empty}><Ionicons name="key-outline" size={28} color={colors.muted} /><Text style={{ color: colors.muted }}>暂无凭据</Text><Text style={[styles.emptyHint, { color: colors.muted }]}>新建凭据后可在设备详情中进行绑定。</Text></View>} renderItem={({ item }) => <Pressable onPress={() => open(item)} onLongPress={() => remove(item)} style={({ pressed }) => [styles.row, { borderColor: colors.border, backgroundColor: colors.card }, pressed && styles.pressed]}><View style={[styles.icon, { backgroundColor: colors.input }]}><Ionicons name="key-outline" size={20} color={colors.text} /></View><View style={{ flex: 1, gap: 3 }}><View style={styles.nameRow}><Text style={{ color: colors.text, fontWeight: "600", flexShrink: 1 }} numberOfLines={1}>{item.name}</Text><Text style={[styles.badge, { backgroundColor: colors.input, color: colors.muted }]}>{item.type === "http_header" ? "请求头" : "环境变量"}</Text></View><Text style={{ color: colors.muted, fontFamily: "monospace", fontSize: 12 }} numberOfLines={1}>{item.key}</Text></View><Text style={[styles.badge, { backgroundColor: colors.input, color: colors.muted }]}>{item.value_set ? "已设置" : "未设置"}</Text><Ionicons name="chevron-forward" size={18} color={colors.muted} /></Pressable>} />
    <Modal visible={editorOpen} transparent animationType="slide" onRequestClose={close}><Sheet colors={colors} title={editor?.id ? "编辑凭据" : "新建凭据"} onClose={close}><ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled"><Input colors={colors} label="名称" value={form.name} onChangeText={(value: string) => setForm(current => ({ ...current, name: value }))} /><Choice colors={colors} label="类型" values={["environment", "http_header"]} labels={["环境变量", "HTTP 请求头"]} value={form.type} onChange={(value: CredentialType) => setForm(current => ({ ...current, type: value }))} /><Input colors={colors} label="键名" value={form.key} autoCapitalize="none" autoCorrect={false} placeholder={form.type === "environment" ? "API_TOKEN" : "Authorization"} onChangeText={(value: string) => setForm(current => ({ ...current, key: value }))} /><Input colors={colors} label="值" value={form.value} autoCapitalize="none" autoCorrect={false} secureTextEntry placeholder={editor?.id ? "留空则保持现有值不变" : "凭据值不会显示在页面中"} onChangeText={(value: string) => setForm(current => ({ ...current, value }))} /><Text style={{ color: colors.muted, fontSize: 12 }}>{editor?.id ? "留空则保持现有值不变。" : "凭据值不会显示在页面或任务记录中。"}</Text><Action colors={colors} title={saving ? "保存中…" : "保存凭据"} onPress={save} disabled={saving} /></ScrollView></Sheet></Modal>
  </View>
}
function normalize(value: unknown): Credential | null { if (!value || typeof value !== "object") return null; const item = value as Record<string, unknown>; return typeof item.id === "string" ? { id: item.id, name: typeof item.name === "string" ? item.name : item.id, type: item.type === "http_header" ? "http_header" : "environment", key: typeof item.key === "string" ? item.key : "", value_set: item.value_set === true } : null }
function message(error: unknown) { return error instanceof Error ? error.message : "发生未知错误" }
const styles = StyleSheet.create({ root: { flex: 1 }, error: { paddingHorizontal: 16, paddingTop: 10 }, list: { paddingVertical: 0 }, empty: { flexGrow: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 9 }, emptyHint: { textAlign: "center", fontSize: 12 }, row: { minHeight: 74, borderBottomWidth: StyleSheet.hairlineWidth, paddingHorizontal: 16, flexDirection: "row", gap: 10, alignItems: "center" }, icon: { width: 42, height: 42, borderRadius: 10, alignItems: "center", justifyContent: "center" }, nameRow: { flexDirection: "row", alignItems: "center", gap: 6 }, badge: { borderRadius: 7, paddingHorizontal: 6, paddingVertical: 2, fontSize: 10, overflow: "hidden" }, pressed: { opacity: 0.58, backgroundColor: "rgba(127,127,127,.08)" }, form: { gap: 13, paddingBottom: 16 } })
