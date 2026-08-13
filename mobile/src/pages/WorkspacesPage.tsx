import { Ionicons } from "@expo/vector-icons"
import { useCallback, useEffect, useState } from "react"
import { Alert, BackHandler, FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native"
import { request } from "../api"
import type { Palette } from "../theme"
import { Action, Choice, Input, Sheet, Top } from "./TasksPage"

type WorkspaceFile = { id: string; name: string; content?: string; updated_at?: string; size?: number; mime_type?: string }
type Workspace = { id: string; name: string; location?: string; device_id?: string; path?: string; model?: string; agent?: string; files?: WorkspaceFile[] }

export default function WorkspacesPage({ colors, onBack }: { colors: Palette; onBack: () => void }) {
  const [items, setItems] = useState<Workspace[]>([])
  const [agents, setAgents] = useState<any[]>([])
  const [models, setModels] = useState<string[]>([])
  const [workspace, setWorkspace] = useState<Workspace | null>(null)
  const [activeFile, setActiveFile] = useState<WorkspaceFile | null>(null)
  const [content, setContent] = useState("")
  const [fileName, setFileName] = useState("")
  const [editor, setEditor] = useState<Workspace | null>(null)
  const [form, setForm] = useState<any>({ name: "", location: "server", device_id: "", path: "", model: "", agent: "" })
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [data, nextAgents, catalog] = await Promise.all([request<any>("/user/advanced-chat/workspaces"), request<any[]>("/user/advanced-chat/agents"), request<any[]>("/user/catalog")])
      setItems(Array.isArray(data?.workspaces) ? data.workspaces : Array.isArray(data) ? data : [])
      setAgents(Array.isArray(nextAgents) ? nextAgents : [])
      setModels([...new Set((Array.isArray(catalog) ? catalog : []).flatMap(item => item.models || []))])
    } catch (cause) { setError(message(cause)) } finally { setLoading(false) }
  }, [])
  useEffect(() => { void load() }, [load])
  useEffect(() => { if (!workspace) return; const subscription = BackHandler.addEventListener("hardwareBackPress", () => { setWorkspace(null); setActiveFile(null); return true }); return () => subscription.remove() }, [workspace])

  const openWorkspace = async (item: Workspace) => {
    setLoading(true)
    try {
      setError("")
      const data = await request<any>(`/user/advanced-chat/workspaces/${encodeURIComponent(item.id)}`)
      const next = normalizeWorkspace(data?.workspace || data) || item
      setWorkspace(next)
      const file = next.files?.[0] || null
      setActiveFile(file)
      setContent(file?.content || "")
      setFileName(file?.name || "")
    } catch (cause) { setError(message(cause)) } finally { setLoading(false) }
  }

  const openWorkspaceEditor = (item?: Workspace) => {
    setEditor(item || null)
    setForm(item ? { name: item.name || "", location: item.location || "server", device_id: item.device_id || "", path: item.path || "", model: item.model || "", agent: item.agent || "" } : { name: "", location: "server", device_id: "", path: "", model: models[0] || "", agent: agents[0]?.id || "" })
  }
  const saveWorkspace = async () => {
    if (!form.name.trim() || !form.model || !form.agent) { setError("请填写名称、模型和代理"); return }
    setSaving(true)
    try {
      await request(editor?.id ? `/user/advanced-chat/workspaces/${encodeURIComponent(editor.id)}` : "/user/advanced-chat/workspaces", { method: editor?.id ? "PUT" : "POST", body: form })
      setEditor(null)
      await load()
    } catch (cause) { setError(message(cause)) } finally { setSaving(false) }
  }
  const remove = (item: Workspace) => Alert.alert("删除工作区", `确定删除“${item.name}”及其中文件？`, [{ text: "取消", style: "cancel" }, { text: "删除", style: "destructive", onPress: async () => { try { await request(`/user/advanced-chat/workspaces/${encodeURIComponent(item.id)}`, { method: "DELETE" }); await load() } catch (cause) { setError(message(cause)) } } }])

  const selectFile = (file: WorkspaceFile) => { setActiveFile(file); setContent(file.content || ""); setFileName(file.name) }
  const createFile = async () => {
    if (!workspace?.id) return
    try {
      const created = await request<WorkspaceFile>(`/user/advanced-chat/workspaces/${encodeURIComponent(workspace.id)}/files`, { method: "POST", body: { name: `未命名-${Date.now()}.md`, content: "# 新文档\n\n" } })
      const next = { ...workspace, files: [...(workspace.files || []), created] }
      setWorkspace(next)
      selectFile(created)
    } catch (cause) { setError(message(cause)) }
  }
  const saveFile = async () => {
    if (!workspace?.id || !activeFile?.id || isBinary(activeFile)) return
    setSaving(true)
    try {
      const updated = await request<WorkspaceFile>(`/user/advanced-chat/workspaces/${encodeURIComponent(workspace.id)}/files/${encodeURIComponent(activeFile.id)}`, { method: "PUT", body: { name: fileName.trim() || activeFile.name, content } })
      const nextFile = { ...activeFile, ...updated, name: updated?.name || fileName.trim() || activeFile.name, content }
      setWorkspace(current => current ? { ...current, files: (current.files || []).map(file => file.id === activeFile.id ? nextFile : file) } : current)
      setActiveFile(nextFile)
      setFileName(nextFile.name)
    } catch (cause) { setError(message(cause)) } finally { setSaving(false) }
  }

  if (workspace) return <WorkspaceDetail colors={colors} workspace={workspace} activeFile={activeFile} content={content} fileName={fileName} error={error} saving={saving} onBack={() => { setWorkspace(null); setActiveFile(null); void load() }} onCreate={createFile} onSelect={selectFile} onChangeContent={setContent} onChangeName={setFileName} onSave={saveFile} />
  return <View style={styles.root}><Top colors={colors} title="工作区" onBack={onBack} right="add" onRight={() => openWorkspaceEditor()} />{error ? <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text> : null}<FlatList data={items} keyExtractor={item => item.id} refreshing={loading} onRefresh={load} contentContainerStyle={items.length ? styles.workspaceList : styles.empty} ListEmptyComponent={<View style={styles.empty}><Ionicons name="folder-open-outline" size={30} color={colors.muted} /><Text style={{ color: colors.muted }}>暂无工作区</Text><Text style={[styles.emptyHint, { color: colors.muted }]}>点按右上角加号新建工作区。</Text></View>} renderItem={({ item }) => <Pressable onPress={() => void openWorkspace(item)} onLongPress={() => openWorkspaceEditor(item)} style={({ pressed }) => [styles.workspaceRow, { borderColor: colors.border, backgroundColor: colors.card }, pressed && styles.pressed]}><View style={[styles.workspaceIcon, { backgroundColor: colors.input }]}><Ionicons name="folder-open-outline" size={21} color={colors.text} /></View><View style={{ flex: 1, gap: 3 }}><Text style={{ color: colors.text, fontWeight: "600" }}>{item.name}</Text><Text style={{ color: colors.muted, fontSize: 12 }} numberOfLines={1}>{item.location === "server" ? "服务端" : "设备"} · {item.path || "默认路径"}</Text><Text style={{ color: colors.muted, fontSize: 11 }}>{item.files?.length || 0} 个文件</Text></View><Ionicons name="chevron-forward" size={18} color={colors.muted} /></Pressable>} /><Modal visible={editor !== null} transparent animationType="slide" onRequestClose={() => setEditor(null)}><Sheet colors={colors} title={editor?.id ? "编辑工作区" : "新建工作区"} onClose={() => setEditor(null)}><ScrollView contentContainerStyle={styles.form}><Input colors={colors} label="工作区名称" value={form.name} onChangeText={(value: string) => setForm({ ...form, name: value })} /><Choice colors={colors} label="存放位置" values={["server", "device"]} labels={["服务端", "连接器设备"]} value={form.location} onChange={(value: string) => setForm({ ...form, location: value })} />{form.location === "device" ? <Input colors={colors} label="设备 ID" value={form.device_id} onChangeText={(value: string) => setForm({ ...form, device_id: value })} /> : null}<Input colors={colors} label="路径" value={form.path} onChangeText={(value: string) => setForm({ ...form, path: value })} /><Choice colors={colors} label="模型" values={models} value={form.model} onChange={(value: string) => setForm({ ...form, model: value })} /><Choice colors={colors} label="代理" values={agents.map(item => item.id)} labels={agents.map(item => item.name)} value={form.agent} onChange={(value: string) => setForm({ ...form, agent: value })} /><Action colors={colors} title={saving ? "保存中…" : "保存工作区"} onPress={saveWorkspace} disabled={saving} />{editor?.id ? <Pressable onPress={() => { setEditor(null); remove(editor) }}><Text style={{ color: colors.destructive, textAlign: "center" }}>删除工作区</Text></Pressable> : null}</ScrollView></Sheet></Modal></View>
}

function WorkspaceDetail({ colors, workspace, activeFile, content, fileName, error, saving, onBack, onCreate, onSelect, onChangeContent, onChangeName, onSave }: any) {
  const binary = activeFile ? isBinary(activeFile) : false
  return <View style={styles.root}><Top colors={colors} title={workspace.name} onBack={onBack} right="add" onRight={() => void onCreate()} />{error ? <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text> : null}<View style={[styles.location, { borderColor: colors.border }]}><Ionicons name={workspace.location === "device" ? "laptop-outline" : "server-outline"} size={14} color={colors.muted} /><Text style={{ color: colors.muted, fontSize: 11 }} numberOfLines={1}>{workspace.path || "默认路径"} · {workspace.files?.length || 0} 个文件</Text></View><View style={styles.detail}><View style={[styles.filePanel, { borderColor: colors.border, backgroundColor: colors.card }]}><View style={styles.filePanelHeader}><Text style={{ color: colors.text, fontWeight: "600" }}>文件</Text><Pressable onPress={() => void onCreate()}><Ionicons name="add" size={22} color={colors.text} /></Pressable></View><ScrollView contentContainerStyle={styles.fileList}>{workspace.files?.length ? workspace.files.map((file: WorkspaceFile) => <Pressable key={file.id} onPress={() => onSelect(file)} style={[styles.fileRow, { backgroundColor: activeFile?.id === file.id ? colors.input : "transparent" }]}><Ionicons name={isBinary(file) ? "document-attach-outline" : "document-text-outline"} size={16} color={colors.text} /><Text style={{ color: colors.text, flex: 1, fontSize: 12 }} numberOfLines={1}>{file.name}</Text>{isBinary(file) ? <Ionicons name="lock-closed-outline" size={12} color={colors.muted} /> : null}</Pressable>) : <Text style={{ color: colors.muted, fontSize: 12, padding: 8 }}>暂无文件</Text>}</ScrollView></View><View style={[styles.editorPanel, { borderColor: colors.border, backgroundColor: colors.card }]}>{!activeFile ? <View style={styles.noFile}><Ionicons name="document-outline" size={30} color={colors.muted} /><Text style={{ color: colors.muted }}>从文件列表选择文件，或新建文件。</Text></View> : binary ? <View style={styles.noFile}><Ionicons name="document-lock-outline" size={30} color={colors.muted} /><Text style={{ color: colors.text, fontWeight: "600" }}>{activeFile.name}</Text><Text style={{ color: colors.muted, textAlign: "center", fontSize: 12 }}>二进制文件不能在线编辑。请在原始设备或本地工具中打开。</Text></View> : <><View style={styles.editorHeader}><TextInput value={fileName} onChangeText={onChangeName} style={[styles.fileName, { color: colors.text, backgroundColor: colors.input }]} /><Pressable onPress={onSave} disabled={saving} style={[styles.saveFile, { backgroundColor: colors.primary, opacity: saving ? .45 : 1 }]}><Ionicons name="save-outline" size={17} color={colors.primaryText} /></Pressable></View><TextInput value={content} onChangeText={onChangeContent} multiline textAlignVertical="top" autoCapitalize="none" autoCorrect={false} style={[styles.codeEditor, { color: colors.text, backgroundColor: colors.input }]} /></>}</View></View></View>
}
function normalizeWorkspace(value: unknown): Workspace | null { if (!value || typeof value !== "object") return null; const item = value as Record<string, unknown>; return typeof item.id === "string" ? { id: item.id, name: typeof item.name === "string" ? item.name : item.id, location: typeof item.location === "string" ? item.location : "server", device_id: typeof item.device_id === "string" ? item.device_id : "", path: typeof item.path === "string" ? item.path : "", model: typeof item.model === "string" ? item.model : "", agent: typeof item.agent === "string" ? item.agent : "", files: Array.isArray(item.files) ? item.files.map(normalizeFile).filter((file): file is WorkspaceFile => Boolean(file)) : [] } : null }
function normalizeFile(value: unknown): WorkspaceFile | null { if (!value || typeof value !== "object") return null; const item = value as Record<string, unknown>; return typeof item.id === "string" ? { id: item.id, name: typeof item.name === "string" ? item.name : item.id, content: typeof item.content === "string" ? item.content : "", updated_at: typeof item.updated_at === "string" ? item.updated_at : "", size: typeof item.size === "number" ? item.size : 0, mime_type: typeof item.mime_type === "string" ? item.mime_type : "" } : null }
function isBinary(file: WorkspaceFile) { return /\.(png|jpe?g|gif|webp|svg|ico|pdf|zip|gz|tar|7z|rar|mp[34]|wav|ogg|avi|mov|webm|exe|dll|so|dylib|bin|db)$/i.test(file.name) || /^(image|audio|video)\//.test(file.mime_type || "") || /application\/(pdf|zip|octet-stream)/.test(file.mime_type || "") }
function message(error: unknown) { return error instanceof Error ? error.message : "发生未知错误" }
const styles = StyleSheet.create({ root: { flex: 1 }, error: { paddingHorizontal: 16, paddingTop: 10 }, workspaceList: { paddingVertical: 0 }, empty: { flexGrow: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 9 }, emptyHint: { textAlign: "center", fontSize: 12 }, workspaceRow: { minHeight: 74, borderBottomWidth: StyleSheet.hairlineWidth, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", gap: 11 }, workspaceIcon: { width: 43, height: 43, borderRadius: 11, alignItems: "center", justifyContent: "center" }, pressed: { opacity: .58, backgroundColor: "rgba(127,127,127,.08)" }, form: { gap: 14, paddingBottom: 18 }, location: { minHeight: 31, borderBottomWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 6 }, detail: { flex: 1, padding: 12, gap: 10 }, filePanel: { height: "34%", minHeight: 150, borderWidth: 1, borderRadius: 12, padding: 10 }, filePanelHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }, fileList: { gap: 3 }, fileRow: { minHeight: 34, borderRadius: 7, paddingHorizontal: 7, flexDirection: "row", alignItems: "center", gap: 7 }, editorPanel: { flex: 1, minHeight: 0, borderWidth: 1, borderRadius: 12, padding: 10 }, noFile: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10, padding: 20 }, editorHeader: { height: 39, flexDirection: "row", gap: 8, marginBottom: 8 }, fileName: { flex: 1, borderRadius: 8, paddingHorizontal: 10, fontSize: 13 }, saveFile: { width: 42, borderRadius: 8, alignItems: "center", justifyContent: "center" }, codeEditor: { flex: 1, minHeight: 180, borderRadius: 9, padding: 10, fontFamily: "monospace", fontSize: 13, lineHeight: 20 } })
