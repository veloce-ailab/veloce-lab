import { Ionicons } from "@expo/vector-icons"
import { useCallback, useEffect, useState } from "react"
import { Alert, BackHandler, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native"
import { request } from "../api"
import type { Palette } from "../theme"
import { Action, Top } from "./TasksPage"

type Device = { id: string; name?: string; hostname?: string; os?: string; arch?: string; version?: string; kind?: string; status?: string; online?: boolean; last_seen_at?: string }
type Task = { id: string; action?: string; status?: string; result?: string; error_message?: string; created_at?: string; started_at?: string; finished_at?: string }
type Credential = { id: string; name?: string; type?: "environment" | "http_header"; key?: string; value_set?: boolean }
type Process = { key: string; id?: string; name?: string; command?: string; args?: string[]; pid?: number; initialized?: boolean; pending_requests?: number; started_at?: string }
type CredentialsResponse = { credentials?: Credential[]; credential_ids?: string[] }

export default function DeviceDetailPage({ colors, deviceID, onBack }: { colors: Palette; deviceID: string; onBack: () => void }) {
  const [device, setDevice] = useState<Device | null>(null)
  const [tasks, setTasks] = useState<Task[]>([])
  const [credentials, setCredentials] = useState<Credential[]>([])
  const [selectedCredentials, setSelectedCredentials] = useState<string[]>([])
  const [processes, setProcesses] = useState<Process[]>([])
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [savingCredentials, setSavingCredentials] = useState(false)
  const [busyID, setBusyID] = useState("")

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setError("")
      const [nextDevice, nextTasks, credentialData] = await Promise.all([
        request<Device>(`/user/advanced-chat/devices/${encodeURIComponent(deviceID)}`),
        request<unknown>(`/user/advanced-chat/devices/${encodeURIComponent(deviceID)}/tasks?limit=80`),
        request<CredentialsResponse>(`/user/advanced-chat/devices/${encodeURIComponent(deviceID)}/credentials`),
      ])
      setDevice(nextDevice)
      setTasks(Array.isArray(nextTasks) ? nextTasks.map(normalizeTask).filter((item): item is Task => Boolean(item)) : [])
      setCredentials(Array.isArray(credentialData?.credentials) ? credentialData.credentials.map(normalizeCredential).filter((item): item is Credential => Boolean(item)) : [])
      setSelectedCredentials(Array.isArray(credentialData?.credential_ids) ? credentialData.credential_ids.filter((id): id is string => typeof id === "string") : [])
      if (nextDevice?.online) await refreshProcesses()
      else setProcesses([])
    } catch (cause) {
      setError(message(cause))
    } finally {
      setLoading(false)
    }
  }, [deviceID])

  const refreshProcesses = useCallback(async () => {
    try {
      const data = await request<{ processes?: unknown[] }>(`/user/advanced-chat/devices/${encodeURIComponent(deviceID)}/mcp-processes`)
      setProcesses(Array.isArray(data?.processes) ? data.processes.map(normalizeProcess).filter((item): item is Process => Boolean(item)) : [])
    } catch (cause) {
      setError(message(cause))
    }
  }, [deviceID])

  useEffect(() => { void load() }, [load])
  useEffect(() => { const subscription = BackHandler.addEventListener("hardwareBackPress", () => { onBack(); return true }); return () => subscription.remove() }, [onBack])

  const toggleCredential = (id: string) => setSelectedCredentials(current => current.includes(id) ? current.filter(value => value !== id) : [...current, id])
  const saveCredentials = async () => {
    setSavingCredentials(true)
    try {
      await request(`/user/advanced-chat/devices/${encodeURIComponent(deviceID)}/credentials`, { method: "PUT", body: { credential_ids: selectedCredentials } })
    } catch (cause) {
      setError(message(cause))
    } finally {
      setSavingCredentials(false)
    }
  }
  const cancelTask = (task: Task) => Alert.alert("取消连接器任务", `确定取消“${task.action || task.id}”？`, [{ text: "取消", style: "cancel" }, { text: "取消任务", style: "destructive", onPress: async () => { setBusyID(task.id); try { await request(`/user/advanced-chat/devices/${encodeURIComponent(deviceID)}/tasks/${encodeURIComponent(task.id)}/cancel`, { method: "POST" }); await load() } catch (cause) { setError(message(cause)) } finally { setBusyID("") } } }])
  const stopProcess = (process: Process) => Alert.alert("停止 MCP 进程", `确定停止“${process.name || process.command || process.key}”？`, [{ text: "取消", style: "cancel" }, { text: "停止", style: "destructive", onPress: async () => { setBusyID(process.key); try { await request(`/user/advanced-chat/devices/${encodeURIComponent(deviceID)}/mcp-processes/stop`, { method: "POST", body: { key: process.key } }); await refreshProcesses() } catch (cause) { setError(message(cause)) } finally { setBusyID("") } } }])

  const active = tasks.filter(task => ["queued", "running", "pending_approval"].includes(task.status || ""))
  const recent = tasks.filter(task => !active.some(value => value.id === task.id)).slice(0, 30)
  return <View style={styles.root}>
    <Top colors={colors} title={device?.name || "设备详情"} onBack={onBack} />
    {error ? <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text> : null}
    <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}>
      <Section colors={colors} title="设备概览"><View style={styles.grid}><Info colors={colors} label="状态" value={device?.online ? "在线" : "离线"} accent={device?.online} /><Info colors={colors} label="环境" value={[device?.hostname, device?.os, device?.arch].filter(Boolean).join(" / ") || "-"} /><Info colors={colors} label="版本" value={device?.version || "-"} /><Info colors={colors} label="最后在线" value={formatDate(device?.last_seen_at) || "-"} /></View></Section>
      <Section colors={colors} title="连接器凭据"><Text style={{ color: colors.muted, fontSize: 12 }}>勾选后，已连接的设备可在连接器任务中使用相应凭据。</Text>{credentials.length ? <>{credentials.map(item => <Pressable key={item.id} onPress={() => toggleCredential(item.id)} style={[styles.credential, { borderColor: colors.border, backgroundColor: selectedCredentials.includes(item.id) ? colors.input : colors.card }]}><Ionicons name={selectedCredentials.includes(item.id) ? "checkbox-outline" : "square-outline"} size={20} color={colors.text} /><View style={{ flex: 1 }}><Text style={{ color: colors.text, fontWeight: "600" }}>{item.name || item.id}</Text><Text style={{ color: colors.muted, fontSize: 12 }} numberOfLines={1}>{item.key || "-"} · {item.type === "http_header" ? "请求头" : "环境变量"}</Text></View><Text style={[styles.badge, { backgroundColor: colors.input, color: colors.muted }]}>{item.value_set ? "已设置" : "未设置"}</Text></Pressable>)}<Action colors={colors} title={savingCredentials ? "保存中…" : "保存凭据绑定"} onPress={saveCredentials} disabled={savingCredentials} /></> : <Text style={{ color: colors.muted, fontSize: 13 }}>暂无可绑定凭据，请先在网页端配置凭据。</Text>}</Section>
      <Section colors={colors} title="运行中的任务">{active.length ? active.map(task => <TaskRow key={task.id} colors={colors} task={task} actionLabel={busyID === task.id ? "取消中…" : "取消"} onAction={() => cancelTask(task)} />) : <Empty colors={colors} text="暂无运行中的任务" />}</Section>
      <Section colors={colors} title="MCP 进程">{!device?.online ? <Empty colors={colors} text="设备离线，无法读取 MCP 进程。" /> : processes.length ? <>{processes.map(process => <View key={process.key} style={[styles.process, { borderColor: colors.border, backgroundColor: colors.card }]}><View style={{ flex: 1, gap: 3 }}><Text style={{ color: colors.text, fontWeight: "600" }} numberOfLines={1}>{process.name || process.id || process.command || process.key}</Text><Text style={{ color: colors.muted, fontSize: 12 }} numberOfLines={1}>{[process.command, ...(process.args || [])].filter(Boolean).join(" ")}</Text><Text style={{ color: colors.muted, fontSize: 12 }}>PID {process.pid || "-"} · {process.initialized ? "已初始化" : "启动中"} · 待处理 {process.pending_requests || 0}</Text></View><Pressable onPress={() => stopProcess(process)} style={({ pressed }) => [styles.stop, { backgroundColor: colors.input }, pressed && styles.pressed]}><Text style={{ color: colors.text }}>{busyID === process.key ? "停止中…" : "停止"}</Text></Pressable></View>)}<Pressable onPress={() => void refreshProcesses()} style={({ pressed }) => [styles.refresh, { borderColor: colors.border }, pressed && styles.pressed]}><Text style={{ color: colors.text }}>刷新 MCP 进程</Text></Pressable></> : <Empty colors={colors} text="暂无 MCP 进程" />}</Section>
      <Section colors={colors} title="近期任务">{recent.length ? recent.map(task => <TaskRow key={task.id} colors={colors} task={task} />) : <Empty colors={colors} text="暂无近期任务" />}</Section>
    </ScrollView>
  </View>
}

function Section({ colors, title, children }: { colors: Palette; title: string; children: React.ReactNode }) { return <View style={styles.section}><Text style={[styles.sectionTitle, { color: colors.muted }]}>{title}</Text><View style={[styles.sectionBody, { borderColor: colors.border, backgroundColor: colors.card }]}>{children}</View></View> }
function Info({ colors, label, value, accent }: { colors: Palette; label: string; value: string; accent?: boolean }) { return <View style={[styles.info, { backgroundColor: colors.input }]}><Text style={{ color: colors.muted, fontSize: 11 }}>{label}</Text><Text style={{ color: accent ? colors.primary : colors.text, fontSize: 13, fontWeight: "600" }} numberOfLines={2}>{value}</Text></View> }
function Empty({ colors, text }: { colors: Palette; text: string }) { return <Text style={{ color: colors.muted, fontSize: 13, textAlign: "center", paddingVertical: 10 }}>{text}</Text> }
function TaskRow({ colors, task, actionLabel, onAction }: { colors: Palette; task: Task; actionLabel?: string; onAction?: () => void }) { return <View style={[styles.task, { borderColor: colors.border, backgroundColor: colors.input }]}><View style={{ flex: 1, gap: 3 }}><View style={styles.taskTitle}><Text style={{ color: colors.text, fontWeight: "600", flexShrink: 1 }}>{task.action || "connector"}</Text><Text style={[styles.badge, { backgroundColor: colors.card, color: colors.muted }]}>{task.status || "-"}</Text></View><Text style={{ color: colors.muted, fontSize: 12 }} numberOfLines={1}>{task.error_message || task.result || formatDate(task.created_at) || "-"}</Text></View>{onAction ? <Pressable onPress={onAction} style={({ pressed }) => [styles.stop, { backgroundColor: colors.card }, pressed && styles.pressed]}><Text style={{ color: colors.text }}>{actionLabel}</Text></Pressable> : null}</View> }
function normalizeTask(value: unknown): Task | null { if (!value || typeof value !== "object") return null; const item = value as Record<string, unknown>; return typeof item.id === "string" ? { id: item.id, action: typeof item.action === "string" ? item.action : "connector", status: typeof item.status === "string" ? item.status : "", result: typeof item.result === "string" ? item.result : "", error_message: typeof item.error_message === "string" ? item.error_message : "", created_at: typeof item.created_at === "string" ? item.created_at : "" } : null }
function normalizeCredential(value: unknown): Credential | null { if (!value || typeof value !== "object") return null; const item = value as Record<string, unknown>; return typeof item.id === "string" ? { id: item.id, name: typeof item.name === "string" ? item.name : "", type: item.type === "http_header" ? "http_header" : "environment", key: typeof item.key === "string" ? item.key : "", value_set: item.value_set === true } : null }
function normalizeProcess(value: unknown): Process | null { if (!value || typeof value !== "object") return null; const item = value as Record<string, unknown>; return typeof item.key === "string" ? { key: item.key, id: typeof item.id === "string" ? item.id : "", name: typeof item.name === "string" ? item.name : "", command: typeof item.command === "string" ? item.command : "mcp", args: Array.isArray(item.args) ? item.args.filter((arg): arg is string => typeof arg === "string") : [], pid: typeof item.pid === "number" ? item.pid : undefined, initialized: item.initialized === true, pending_requests: typeof item.pending_requests === "number" ? item.pending_requests : 0 } : null }
function formatDate(value?: string) { if (!value) return ""; const date = new Date(value); return Number.isNaN(date.getTime()) ? value : date.toLocaleString() }
function message(error: unknown) { return error instanceof Error ? error.message : "发生未知错误" }

const styles = StyleSheet.create({ root: { flex: 1 }, error: { paddingHorizontal: 16, paddingTop: 10 }, content: { padding: 16, gap: 16, paddingBottom: 28 }, section: { gap: 7 }, sectionTitle: { fontSize: 12, fontWeight: "600", textTransform: "uppercase" }, sectionBody: { borderWidth: 1, borderRadius: 13, padding: 12, gap: 10 }, grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 }, info: { minWidth: "47%", flexGrow: 1, flexBasis: "47%", minHeight: 58, borderRadius: 9, padding: 9, gap: 3 }, credential: { minHeight: 60, borderWidth: 1, borderRadius: 9, padding: 10, flexDirection: "row", alignItems: "center", gap: 9 }, process: { minHeight: 72, borderWidth: 1, borderRadius: 9, padding: 10, flexDirection: "row", alignItems: "center", gap: 9 }, task: { minHeight: 62, borderWidth: 1, borderRadius: 9, padding: 10, flexDirection: "row", alignItems: "center", gap: 9 }, taskTitle: { flexDirection: "row", alignItems: "center", gap: 6 }, badge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 7, fontSize: 10, overflow: "hidden" }, stop: { minWidth: 54, minHeight: 34, paddingHorizontal: 9, borderRadius: 8, alignItems: "center", justifyContent: "center" }, refresh: { minHeight: 40, borderWidth: 1, borderRadius: 8, alignItems: "center", justifyContent: "center" }, pressed: { opacity: 0.58, transform: [{ scale: 0.985 }] } })
