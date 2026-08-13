import { Ionicons } from "@expo/vector-icons"
import * as DocumentPicker from "expo-document-picker"
import { useCallback, useEffect, useState } from "react"
import { Alert, BackHandler, FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native"
import { request, uploadFile } from "../api"
import type { Palette } from "../theme"
import { Action, Input, Sheet, Top } from "./TasksPage"

type Base = { id: string; name: string; description?: string; document_count?: number; vectorized?: boolean }
type Document = { id: string; name: string; embedding_status?: string; size?: number; created_at?: string }

export default function KnowledgeBasesPage({ colors, onBack }: { colors: Palette; onBack: () => void }) {
  const [items, setItems] = useState<Base[]>([])
  const [base, setBase] = useState<Base | null>(null)
  const [documents, setDocuments] = useState<Document[]>([])
  const [editor, setEditor] = useState<Base | null>(null)
  const [form, setForm] = useState({ name: "", description: "" })
  const [loading, setLoading] = useState(false)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState("")

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await request<any>("/user/advanced-chat/knowledge-bases")
      setItems(Array.isArray(data?.knowledge_bases) ? data.knowledge_bases : Array.isArray(data) ? data : [])
    } catch (cause) { setError(message(cause)) } finally { setLoading(false) }
  }, [])
  useEffect(() => { void load() }, [load])
  useEffect(() => { const subscription = BackHandler.addEventListener("hardwareBackPress", () => { if (editor) { setEditor(null); return true } if (base) { setBase(null); setDocuments([]); return true } onBack(); return true }); return () => subscription.remove() }, [base, editor, onBack])

  const loadDocuments = async (next: Base) => {
    setLoading(true)
    try {
      const data = await request<any>(`/user/advanced-chat/knowledge-bases/${encodeURIComponent(next.id)}/documents`)
      setBase(next)
      setDocuments(Array.isArray(data?.documents) ? data.documents : Array.isArray(data) ? data : [])
    } catch (cause) { setError(message(cause)) } finally { setLoading(false) }
  }
  const openEditor = (item?: Base) => { setEditor(item || null); setForm({ name: item?.name || "", description: item?.description || "" }) }
  const save = async () => {
    if (!form.name.trim()) { setError("请填写知识库名称"); return }
    setWorking(true)
    try {
      await request(editor?.id ? `/user/advanced-chat/knowledge-bases/${encodeURIComponent(editor.id)}` : "/user/advanced-chat/knowledge-bases", { method: editor?.id ? "PUT" : "POST", body: { name: form.name.trim(), description: form.description.trim() } })
      setEditor(null)
      await load()
    } catch (cause) { setError(message(cause)) } finally { setWorking(false) }
  }
  const removeBase = (item: Base) => Alert.alert("删除知识库", `确定删除“${item.name}”及其全部文档？`, [{ text: "取消", style: "cancel" }, { text: "删除", style: "destructive", onPress: async () => { try { await request(`/user/advanced-chat/knowledge-bases/${encodeURIComponent(item.id)}`, { method: "DELETE" }); await load() } catch (cause) { setError(message(cause)) } } }])
  const upload = async () => {
    if (!base?.id || working) return
    const picked = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: false })
    if (picked.canceled) return
    setWorking(true)
    try { for (const asset of picked.assets) await uploadFile(`/user/advanced-chat/knowledge-bases/${encodeURIComponent(base.id)}/documents`, asset); await loadDocuments(base); await load() } catch (cause) { setError(message(cause)) } finally { setWorking(false) }
  }
  const vectorize = async () => {
    if (!base?.id || working) return
    setWorking(true)
    try { await request(`/user/advanced-chat/knowledge-bases/${encodeURIComponent(base.id)}/vectorize`, { method: "POST" }); await loadDocuments(base); await load() } catch (cause) { setError(message(cause)) } finally { setWorking(false) }
  }
  const removeDocument = (document: Document) => { if (!base?.id) return; Alert.alert("删除文档", `确定删除“${document.name}”？`, [{ text: "取消", style: "cancel" }, { text: "删除", style: "destructive", onPress: async () => { try { await request(`/user/advanced-chat/knowledge-bases/${encodeURIComponent(base.id)}/documents/${encodeURIComponent(document.id)}`, { method: "DELETE" }); await loadDocuments(base); await load() } catch (cause) { setError(message(cause)) } } }]) }

  if (base) return <View style={styles.root}><Top colors={colors} title={base.name} onBack={() => { setBase(null); setDocuments([]); void load() }} right="add" onRight={() => void upload()} />{error ? <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text> : null}<View style={[styles.actions, { borderColor: colors.border }]}><Pressable onPress={() => void upload()} disabled={working}><Text style={{ color: colors.text }}>{working ? "处理中…" : "上传文档"}</Text></Pressable><Pressable onPress={() => void vectorize()} disabled={working}><Text style={{ color: colors.text }}>开始向量化</Text></Pressable><Pressable onPress={() => openEditor(base)}><Text style={{ color: colors.text }}>设置</Text></Pressable></View><FlatList data={documents} keyExtractor={item => item.id} refreshing={loading} onRefresh={() => void loadDocuments(base)} contentContainerStyle={documents.length ? styles.list : styles.empty} ListEmptyComponent={<View style={styles.empty}><Ionicons name="documents-outline" size={30} color={colors.muted} /><Text style={{ color: colors.muted }}>暂无文档</Text><Text style={[styles.emptyHint, { color: colors.muted }]}>使用右上角加号上传文档。</Text></View>} renderItem={({ item }) => <Pressable onLongPress={() => removeDocument(item)} style={({ pressed }) => [styles.row, { borderColor: colors.border, backgroundColor: colors.card }, pressed && styles.pressed]}><Ionicons name="document-text-outline" size={20} color={colors.text} /><View style={{ flex: 1 }}><Text style={{ color: colors.text, fontWeight: "600" }} numberOfLines={1}>{item.name}</Text><Text style={{ color: colors.muted, fontSize: 12 }}>{status(item.embedding_status)}{item.size ? ` · ${formatBytes(item.size)}` : ""}</Text></View><Ionicons name="ellipsis-horizontal" size={18} color={colors.muted} /></Pressable>} /><BaseEditor colors={colors} visible={Boolean(editor)} editing={editor} form={form} setForm={setForm} working={working} onClose={() => setEditor(null)} onSave={save} onDelete={() => editor && (setEditor(null), removeBase(editor))} /></View>
  return <View style={styles.root}><Top colors={colors} title="知识库" onBack={onBack} right="add" onRight={() => openEditor()} />{error ? <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text> : null}<FlatList data={items} keyExtractor={item => item.id} refreshing={loading} onRefresh={load} contentContainerStyle={items.length ? styles.list : styles.empty} ListEmptyComponent={<View style={styles.empty}><Ionicons name="library-outline" size={31} color={colors.muted} /><Text style={{ color: colors.muted }}>暂无知识库</Text><Text style={[styles.emptyHint, { color: colors.muted }]}>点按右上角加号创建知识库。</Text></View>} renderItem={({ item }) => <Pressable onPress={() => void loadDocuments(item)} onLongPress={() => openEditor(item)} style={({ pressed }) => [styles.row, { borderColor: colors.border, backgroundColor: colors.card }, pressed && styles.pressed]}><View style={[styles.icon, { backgroundColor: colors.input }]}><Ionicons name="library-outline" size={20} color={colors.text} /></View><View style={{ flex: 1 }}><Text style={{ color: colors.text, fontWeight: "600" }}>{item.name}</Text><Text style={{ color: colors.muted, fontSize: 12 }} numberOfLines={1}>{item.description || "未填写说明"}</Text></View><Text style={{ color: colors.muted, fontSize: 12 }}>{item.document_count || 0} 文档</Text><Ionicons name="chevron-forward" size={18} color={colors.muted} /></Pressable>} /><BaseEditor colors={colors} visible={Boolean(editor)} editing={editor} form={form} setForm={setForm} working={working} onClose={() => setEditor(null)} onSave={save} onDelete={() => editor && (setEditor(null), removeBase(editor))} /></View>
}
function BaseEditor({ colors, visible, editing, form, setForm, working, onClose, onSave, onDelete }: any) { return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}><Sheet colors={colors} title={editing?.id ? "知识库设置" : "新建知识库"} onClose={onClose}><ScrollView contentContainerStyle={styles.form}><Input colors={colors} label="名称" value={form.name} onChangeText={(value: string) => setForm({ ...form, name: value })} /><Input colors={colors} label="说明" value={form.description} onChangeText={(value: string) => setForm({ ...form, description: value })} multiline /><Action colors={colors} title={working ? "保存中…" : "保存知识库"} onPress={onSave} disabled={working} />{editing?.id ? <Pressable onPress={onDelete}><Text style={{ color: colors.destructive, textAlign: "center" }}>删除知识库</Text></Pressable> : null}</ScrollView></Sheet></Modal> }
function status(value?: string) { return value === "completed" || value === "ready" ? "已完成" : value === "processing" ? "处理中" : value || "待处理" }
function formatBytes(value: number) { return value < 1024 ? `${value} B` : value < 1024 * 1024 ? `${(value / 1024).toFixed(1)} KB` : `${(value / 1024 / 1024).toFixed(1)} MB` }
function message(error: unknown) { return error instanceof Error ? error.message : "发生未知错误" }
const styles = StyleSheet.create({ root: { flex: 1 }, error: { paddingHorizontal: 16, paddingTop: 10 }, actions: { minHeight: 46, paddingHorizontal: 16, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, list: { paddingVertical: 0 }, empty: { flexGrow: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 9 }, emptyHint: { textAlign: "center", fontSize: 12 }, row: { minHeight: 70, borderBottomWidth: StyleSheet.hairlineWidth, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", gap: 11 }, icon: { width: 38, height: 38, borderRadius: 9, alignItems: "center", justifyContent: "center" }, pressed: { opacity: .58, backgroundColor: "rgba(127,127,127,.08)" }, form: { gap: 14, paddingBottom: 18 } })
