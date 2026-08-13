import { Ionicons } from "@expo/vector-icons"
import * as DocumentPicker from "expo-document-picker"
import { useCallback, useEffect, useRef, useState } from "react"
import { ActivityIndicator, Alert, Animated, BackHandler, Easing, FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native"
import { request, streamRequest, uploadFile } from "../api"
import type { Palette } from "../theme"
import type { Agent, Session, SessionMessage } from "../types"
import { Action, Choice, Input, Sheet, Toggle } from "./TasksPage"

type Attachment = { id: string; storageID?: string; name: string; type: string; size: number; text: string; truncated?: boolean }
type SessionConfig = { model_name: string; max_tokens: string; temperature: string; reasoning_effort: string; auto_compress_context: boolean }
type Props = { colors: Palette; agent: Agent; onBack: () => void }

const defaultConfig = (agent: Agent): SessionConfig => ({ model_name: agent.default_model || "", max_tokens: "0", temperature: "", reasoning_effort: "", auto_compress_context: true })

export default function ChatPage({ colors, agent, onBack }: Props) {
  const [sessions, setSessions] = useState<Session[]>([])
  const [activeID, setActiveID] = useState("")
  const [newSession, setNewSession] = useState(false)
  const [draft, setDraft] = useState("")
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [drawer, setDrawer] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [config, setConfig] = useState<SessionConfig>(() => defaultConfig(agent))
  const [models, setModels] = useState<string[]>([])
  const [error, setError] = useState("")
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const abortRef = useRef<AbortController | null>(null)
  const scrollRef = useRef<ScrollView>(null)
  const drawerProgress = useRef(new Animated.Value(0)).current

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [sessionData, catalog] = await Promise.all([request<Session[]>("/user/advanced-chat/sessions"), request<any[]>("/user/catalog")])
      const next = (Array.isArray(sessionData) ? sessionData : []).filter(item => item.agent_id === agent.id)
      setSessions(next)
      setModels([...new Set((Array.isArray(catalog) ? catalog : []).flatMap(item => item.models || []))])
      setActiveID(current => current || (newSession ? "" : next[0]?.id || ""))
    } catch (cause) {
      setError(message(cause))
    } finally {
      setLoading(false)
    }
  }, [agent.id, newSession])

  useEffect(() => { void load() }, [load])
  useEffect(() => { if (!drawer) return; drawerProgress.setValue(0); Animated.timing(drawerProgress, { toValue: 1, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start() }, [drawer, drawerProgress])
  useEffect(() => { const subscription = BackHandler.addEventListener("hardwareBackPress", () => { if (settingsOpen) { setSettingsOpen(false); return true } if (drawer) { setDrawer(false); return true } onBack(); return true }); return () => subscription.remove() }, [drawer, onBack, settingsOpen])

  const active = sessions.find(item => item.id === activeID)
  const startNewSession = () => { setActiveID(""); setNewSession(true); setDraft(""); setAttachments([]); setConfig(defaultConfig(agent)); setDrawer(false); setError("") }
  const selectSession = (session: Session) => { setActiveID(session.id); setNewSession(false); setConfig(configFromSession(session, agent)); setDrawer(false); setError("") }

  const chooseFiles = async () => {
    const picked = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: false })
    if (picked.canceled) return
    try {
      const next: Attachment[] = []
      for (const asset of picked.assets) {
        const result = await uploadFile("/user/advanced-chat/files", asset)
        if (result.file?.id) next.push({ id: String(result.file.id), storageID: String(result.file.id), name: result.file.name || asset.name, type: result.file.type || asset.mimeType || "application/octet-stream", size: result.file.size || asset.size || 0, text: result.content?.text || "", truncated: result.content?.truncated })
      }
      setAttachments(current => [...current, ...next])
    } catch (cause) { setError(message(cause)) }
  }

  const saveSessionSettings = async () => {
    const payload = settingsPayload(config)
    if (!activeID) { setSettingsOpen(false); return }
    try {
      const updated = await request<Session>(`/user/advanced-chat/sessions/${encodeURIComponent(activeID)}`, { method: "PUT", body: payload })
      setSessions(current => current.map(item => item.id === activeID ? { ...item, ...updated, ...payload } : item))
      setSettingsOpen(false)
    } catch (cause) { setError(message(cause)) }
  }

  const send = async () => {
    const prompt = draft.trim()
    if ((!prompt && !attachments.length) || sending) return
    const now = new Date().toISOString()
    const id = activeID || `mobile-${Date.now()}`
    const content = [prompt, ...attachments.map(item => `[Attachment: ${item.name}; type=${item.type}; size=${formatBytes(item.size)}; file_id=${item.storageID}]\n${item.text || "(binary content omitted)"}`)].filter(Boolean).join("\n\n")
    const userMessage: SessionMessage = { id: `user-${Date.now()}`, role: "user", content, created_at: now }
    const assistantID = `assistant-${Date.now()}`
    const optimistic: Session = { ...(active || { id, title: prompt.slice(0, 40) || attachments[0]?.name || "新对话", messages: [] }), id, messages: [...(active?.messages || []), userMessage, { id: assistantID, role: "assistant", content: "正在思考…", created_at: now }], agent_id: agent.id, ...settingsPayload(config) }
    setSessions(current => [optimistic, ...current.filter(item => item.id !== id)])
    setActiveID(id)
    setNewSession(false)
    setDraft("")
    setAttachments([])
    setSending(true)
    const controller = new AbortController()
    abortRef.current = controller
    try {
      await streamRequest("/user/advanced-chat/completions", {
        session_id: id,
        title: optimistic.title,
        channel_id: 0,
        mode: "assistant",
        messages: optimistic.messages.slice(0, -1).map(item => ({ id: item.id, role: item.role, content: item.content, tool_calls: [] })),
        agent_id: agent.id,
        skill_ids: active?.skill_ids || [],
        mcp_server_ids: active?.mcp_server_ids || [],
        knowledge_base_ids: active?.knowledge_base_ids || [],
        stream: agent.stream !== false,
        ...settingsPayload(config),
      }, event => {
        if (event.type === "text" && typeof event.payload?.delta === "string") setSessions(current => current.map(item => item.id === id ? { ...item, messages: item.messages.map(messageItem => messageItem.id === assistantID ? { ...messageItem, content: messageItem.content === "正在思考…" ? event.payload.delta : messageItem.content + event.payload.delta } : messageItem) } : item))
        if (event.type === "done") void load()
      }, controller.signal)
    } catch (cause) {
      if ((cause as Error).name !== "AbortError") setError(message(cause))
    } finally {
      abortRef.current = null
      setSending(false)
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50)
    }
  }

  const remove = (session: Session) => Alert.alert("删除会话", `确定删除“${session.title || "未命名会话"}”？`, [{ text: "取消", style: "cancel" }, { text: "删除", style: "destructive", onPress: async () => { try { await request(`/user/advanced-chat/sessions/${encodeURIComponent(session.id)}`, { method: "DELETE" }); setSessions(items => items.filter(item => item.id !== session.id)); if (activeID === session.id) startNewSession() } catch (cause) { setError(message(cause)) } } }])

  return <>
    <View style={styles.flex}>
      <View style={[styles.header, { borderColor: colors.border }]}>
        <Pressable onPress={onBack} hitSlop={10} style={styles.headerAction}><Ionicons name="chevron-back" size={27} color={colors.text} /></Pressable>
        <View style={styles.headerCenter}><Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>{agent.name}</Text><Text style={{ color: colors.muted, fontSize: 11 }} numberOfLines={1}>{active?.title || "新会话"}</Text></View>
        <View style={styles.headerActions}><Pressable onPress={() => setSettingsOpen(true)} hitSlop={9} style={styles.headerAction}><Ionicons name="settings-outline" size={20} color={colors.text} /></Pressable><Pressable onPress={() => setDrawer(true)} hitSlop={9} style={styles.headerAction}><Ionicons name="time-outline" size={21} color={colors.text} /></Pressable><Pressable onPress={startNewSession} hitSlop={9} style={styles.headerAction}><Ionicons name="add" size={27} color={colors.text} /></Pressable></View>
      </View>
      <ScrollView ref={scrollRef} style={styles.flex} contentContainerStyle={styles.messages}>{loading ? <ActivityIndicator color={colors.muted} /> : active?.messages?.length ? active.messages.map(item => <Bubble key={item.id} colors={colors} item={item} />) : <Welcome colors={colors} name={agent.name} onSelect={setDraft} />}{error ? <Text style={{ color: colors.destructive }}>{error}</Text> : null}</ScrollView>
      {attachments.length ? <ScrollView horizontal contentContainerStyle={styles.attachments}>{attachments.map(item => <View key={item.id} style={[styles.attachment, { backgroundColor: colors.input }]}><Text style={{ color: colors.text }} numberOfLines={1}>{item.name}</Text><Pressable onPress={() => setAttachments(items => items.filter(value => value.id !== item.id))}><Ionicons name="close" size={15} color={colors.muted} /></Pressable></View>)}</ScrollView> : null}
      <View style={[styles.composer, { borderColor: colors.border, backgroundColor: colors.card }]}><Pressable onPress={chooseFiles} disabled={sending}><Ionicons name="attach-outline" size={21} color={colors.text} /></Pressable><TextInput value={draft} onChangeText={setDraft} editable={!sending} multiline placeholder={`给${agent.name}发送消息`} placeholderTextColor={colors.muted} style={[styles.input, { color: colors.text, backgroundColor: colors.input }]} /><Pressable onPress={() => sending ? abortRef.current?.abort() : void send()}><Ionicons name={sending ? "stop" : "arrow-up"} size={21} color={sending ? colors.destructive : colors.text} /></Pressable></View>
    </View>
    <SessionDrawer colors={colors} drawer={drawer} progress={drawerProgress} sessions={sessions} activeID={activeID} onClose={() => setDrawer(false)} onNew={startNewSession} onSelect={selectSession} onRemove={remove} />
    <Modal visible={settingsOpen} transparent animationType="slide" onRequestClose={() => setSettingsOpen(false)}><Sheet colors={colors} title="会话设置" onClose={() => setSettingsOpen(false)}><ScrollView contentContainerStyle={styles.settingsForm}><Choice colors={colors} label="模型" values={["", ...models]} labels={["使用智能体默认模型", ...models]} value={config.model_name} onChange={(value: string) => setConfig(current => ({ ...current, model_name: value }))} /><Input colors={colors} label="最大 Token（0 为默认）" value={config.max_tokens} keyboardType="numeric" onChangeText={(value: string) => setConfig(current => ({ ...current, max_tokens: value }))} /><Input colors={colors} label="温度（留空为默认）" value={config.temperature} keyboardType="decimal-pad" onChangeText={(value: string) => setConfig(current => ({ ...current, temperature: value }))} /><Choice colors={colors} label="推理强度" values={["", "minimal", "low", "medium", "high"]} labels={["默认", "最小", "低", "中", "高"]} value={config.reasoning_effort} onChange={(value: string) => setConfig(current => ({ ...current, reasoning_effort: value }))} /><Toggle colors={colors} label="自动压缩上下文" value={config.auto_compress_context} onChange={(value: boolean) => setConfig(current => ({ ...current, auto_compress_context: value }))} /><Text style={{ color: colors.muted, fontSize: 12 }}>{activeID ? "保存后会应用于当前会话的后续消息。" : "新建会话的设置会在发送第一条消息时生效。"}</Text><Action colors={colors} title={activeID ? "保存会话设置" : "完成"} onPress={saveSessionSettings} /></ScrollView></Sheet></Modal>
  </>
}

function SessionDrawer({ colors, drawer, progress, sessions, activeID, onClose, onNew, onSelect, onRemove }: any) { return <Modal visible={drawer} transparent animationType="fade" onRequestClose={onClose}><View style={styles.drawerOverlay}><Pressable style={styles.drawerSpace} onPress={onClose} /><Animated.View style={[styles.drawer, { backgroundColor: colors.card, transform: [{ translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [360, 0] }) }] }]}><View style={styles.drawerTop}><Text style={[styles.drawerTitle, { color: colors.text }]}>会话</Text><Pressable onPress={onClose}><Ionicons name="close" size={22} color={colors.text} /></Pressable></View><Pressable onPress={onNew} style={[styles.newButton, { backgroundColor: colors.input }]}><Ionicons name="add" size={20} color={colors.text} /><Text style={{ color: colors.text, fontWeight: "600" }}>新建会话</Text></Pressable><FlatList data={sessions} keyExtractor={(item: Session) => item.id} ListEmptyComponent={<Text style={{ color: colors.muted, padding: 12 }}>暂无会话</Text>} renderItem={({ item }: { item: Session }) => <Pressable onPress={() => onSelect(item)} onLongPress={() => onRemove(item)} style={({ pressed }) => [styles.session, activeID === item.id && { backgroundColor: colors.input }, pressed && styles.pressed]}><Text style={{ color: colors.text }} numberOfLines={1}>{item.title || "未命名会话"}</Text></Pressable>} /></Animated.View></View></Modal> }
function Bubble({ colors, item }: { colors: Palette; item: SessionMessage }) { const user = item.role === "user"; return <View style={[styles.bubbleWrap, user && styles.userBubble]}><View style={[styles.bubble, { backgroundColor: user ? colors.primary : colors.bubble }]}><Text style={{ color: user ? colors.primaryText : colors.text, fontSize: 16, lineHeight: 23 }}>{item.content}</Text></View></View> }
function Welcome({ colors, name, onSelect }: { colors: Palette; name: string; onSelect: (value: string) => void }) { return <View style={styles.welcome}><Ionicons name="sparkles" size={36} color={colors.text} /><Text style={[styles.welcomeTitle, { color: colors.text }]}>和{name}聊聊</Text>{["帮我整理今天的工作计划", "根据已有资料生成产品方案", "分析这段内容并给出改进建议"].map(value => <Pressable key={value} onPress={() => onSelect(value)} style={[styles.suggestion, { borderColor: colors.border }]}><Text style={{ color: colors.text }}>{value}</Text></Pressable>)}</View> }
function configFromSession(session: Session, agent: Agent): SessionConfig { return { model_name: session.model_name || agent.default_model || "", max_tokens: String(session.max_tokens || 0), temperature: session.temperature == null ? "" : String(session.temperature), reasoning_effort: session.reasoning_effort || "", auto_compress_context: session.auto_compress_context !== false } }
function settingsPayload(config: SessionConfig) { return { model_name: config.model_name, max_tokens: Number(config.max_tokens) || 0, temperature: config.temperature === "" ? null : Number(config.temperature), reasoning_effort: config.reasoning_effort, auto_compress_context: config.auto_compress_context } }
function formatBytes(value: number) { return value < 1024 ? `${value} B` : value < 1024 * 1024 ? `${(value / 1024).toFixed(1)} KB` : `${(value / 1024 / 1024).toFixed(1)} MB` }
function message(error: unknown) { return error instanceof Error ? error.message : "发生未知错误" }
const styles = StyleSheet.create({ flex: { flex: 1 }, header: { height: 58, borderBottomWidth: StyleSheet.hairlineWidth, paddingHorizontal: 10, flexDirection: "row", alignItems: "center" }, headerCenter: { flex: 1, alignItems: "center", paddingHorizontal: 4 }, headerTitle: { fontSize: 17, fontWeight: "600" }, headerActions: { flexDirection: "row", alignItems: "center" }, headerAction: { width: 34, height: 40, alignItems: "center", justifyContent: "center" }, messages: { padding: 16, gap: 10, paddingBottom: 20, flexGrow: 1 }, bubbleWrap: { alignSelf: "flex-start", maxWidth: "88%" }, userBubble: { alignSelf: "flex-end" }, bubble: { borderRadius: 16, padding: 12 }, welcome: { alignItems: "center", justifyContent: "center", flexGrow: 1, gap: 12, padding: 24 }, welcomeTitle: { fontSize: 24, fontWeight: "700" }, suggestion: { width: "100%", borderWidth: 1, borderRadius: 12, padding: 14 }, composer: { borderTopWidth: StyleSheet.hairlineWidth, padding: 12, flexDirection: "row", alignItems: "flex-end", gap: 10 }, input: { flex: 1, minHeight: 44, maxHeight: 130, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 }, attachments: { paddingHorizontal: 12, paddingVertical: 6, gap: 8 }, attachment: { maxWidth: 220, height: 32, borderRadius: 9, paddingHorizontal: 8, flexDirection: "row", alignItems: "center", gap: 6 }, drawerOverlay: { flex: 1, flexDirection: "row", backgroundColor: "rgba(0,0,0,.3)" }, drawerSpace: { flex: 1 }, drawer: { width: "82%", maxWidth: 360, padding: 18 }, drawerTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }, drawerTitle: { fontSize: 22, fontWeight: "700" }, newButton: { height: 46, paddingHorizontal: 12, borderRadius: 10, flexDirection: "row", alignItems: "center", gap: 7, marginBottom: 8 }, session: { padding: 12, borderRadius: 10 }, settingsForm: { gap: 13, paddingBottom: 16 }, pressed: { opacity: .58, transform: [{ scale: .985 }] } })
