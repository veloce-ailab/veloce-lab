import { Ionicons } from "@expo/vector-icons"
import { useCallback, useEffect, useMemo, useState } from "react"
import { Alert, FlatList, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native"
import { request } from "../api"
import type { Palette } from "../theme"
import { Action, Choice, Input, Sheet, Top } from "./TasksPage"

type MCPType = "http" | "connector"
type MCPServer = { id: string; name: string; type?: MCPType | string; url?: string; headers?: string; command?: string; args?: string[]; env?: Record<string, string>; cwd?: string; enabled?: boolean; request_mode?: string; readonly?: boolean }
type Settings = { builtin_mcp_servers?: unknown[]; custom_mcp_servers?: unknown[]; mcp_servers?: unknown[] }

const defaults = { id: "", type: "http" as MCPType, name: "", url: "", headers: "", command: "", argsText: "", envText: "", cwd: "", configJSON: "", enabled: true }

export default function MCPServersPage({ colors, onBack }: { colors: Palette; onBack: () => void }) {
  const [builtins, setBuiltins] = useState<MCPServer[]>([])
  const [custom, setCustom] = useState<MCPServer[]>([])
  const [editor, setEditor] = useState<MCPServer | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [form, setForm] = useState({ ...defaults })
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const allServers = useMemo(() => mergeServers(builtins.map(item => ({ ...item, readonly: true })), custom), [builtins, custom])
  const load = useCallback(async () => {
    setLoading(true)
    try {
      setError("")
      const settings = await request<Settings>("/user/advanced-chat/settings")
      setBuiltins(Array.isArray(settings?.builtin_mcp_servers) ? settings.builtin_mcp_servers.map(normalize).filter((item): item is MCPServer => Boolean(item)) : [])
      setCustom(Array.isArray(settings?.custom_mcp_servers) ? settings.custom_mcp_servers.map(normalize).filter((item): item is MCPServer => Boolean(item)) : [])
    } catch (cause) {
      setError(message(cause))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const open = (item?: MCPServer) => {
    setError("")
    setEditor(item || null)
    setEditorOpen(true)
    setForm(item ? {
      id: item.id,
      type: item.type === "connector" ? "connector" : "http",
      name: item.name,
      url: item.url || "",
      headers: item.headers || "",
      command: item.command || "",
      argsText: Array.isArray(item.args) ? item.args.join("\n") : "",
      envText: item.env && Object.keys(item.env).length ? JSON.stringify(item.env, null, 2) : "",
      cwd: item.cwd || "",
      configJSON: "",
      enabled: item.enabled !== false,
    } : { ...defaults })
  }

  const close = () => { setEditor(null); setEditorOpen(false); setError("") }

  const applyConfig = (raw: string) => {
    setForm(current => {
      const parsed = parseConfig(raw)
      return parsed ? { ...current, ...parsed, id: current.id || parsed.id || "", type: "connector", configJSON: raw } : { ...current, configJSON: raw }
    })
  }

  const save = async () => {
    const type = form.type
    const name = form.name.trim()
    if (!name) { setError("请输入 MCP 服务器名称"); return }
    if (type === "http" && !form.url.trim()) { setError("请输入 MCP 服务器地址"); return }
    if (type === "http" && form.headers.trim()) {
      try { JSON.parse(form.headers) } catch { setError("请求头必须是有效的 JSON 对象"); return }
    }
    const env = parseEnv(form.envText)
    if (type === "connector" && form.envText.trim() && !env) { setError("环境变量必须是 JSON 对象"); return }
    if (type === "connector" && !form.command.trim()) { setError("请输入连接器命令"); return }
    const next: MCPServer = type === "connector" ? {
      id: form.id || createID(), name, type, command: form.command.trim(), args: parseArgs(form.argsText), env: env || {}, cwd: form.cwd.trim(), enabled: form.enabled, request_mode: "connector",
    } : {
      id: form.id || createID(), name, type, url: form.url.trim(), headers: form.headers.trim(), enabled: form.enabled, request_mode: "backend",
    }
    const nextCustom = custom.some(item => item.id === next.id) ? custom.map(item => item.id === next.id ? next : item) : [...custom, next]
    setSaving(true)
    try {
      const data = await request<Settings>("/user/advanced-chat/mcp-servers", { method: "PUT", body: { custom_mcp_servers: nextCustom.map(saveShape) } })
      setCustom(Array.isArray(data?.custom_mcp_servers) ? data.custom_mcp_servers.map(normalize).filter((item): item is MCPServer => Boolean(item)) : nextCustom)
      close()
    } catch (cause) {
      setError(message(cause))
    } finally {
      setSaving(false)
    }
  }

  const remove = (item: MCPServer) => Alert.alert("删除 MCP 服务器", `确定删除“${item.name}”？`, [
    { text: "取消", style: "cancel" },
    { text: "删除", style: "destructive", onPress: async () => {
      const nextCustom = custom.filter(server => server.id !== item.id)
      setSaving(true)
      try {
        const data = await request<Settings>("/user/advanced-chat/mcp-servers", { method: "PUT", body: { custom_mcp_servers: nextCustom.map(saveShape) } })
        setCustom(Array.isArray(data?.custom_mcp_servers) ? data.custom_mcp_servers.map(normalize).filter((server): server is MCPServer => Boolean(server)) : nextCustom)
      } catch (cause) {
        setError(message(cause))
      } finally {
        setSaving(false)
      }
    } },
  ])

  return <View style={styles.root}>
    <Top colors={colors} title="MCP" onBack={onBack} right="add" onRight={() => open()} />
    {error ? <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text> : null}
    <FlatList
      data={allServers}
      keyExtractor={item => `${item.request_mode || item.type}-${item.id}`}
      refreshing={loading}
      onRefresh={load}
      contentContainerStyle={allServers.length ? styles.list : styles.empty}
      ListEmptyComponent={<View style={styles.empty}><Ionicons name="extension-puzzle-outline" size={28} color={colors.muted} /><Text style={{ color: colors.muted }}>暂无 MCP 服务器</Text><Text style={[styles.emptyHint, { color: colors.muted }]}>新建 HTTP 或连接器类型的 MCP 服务器。</Text></View>}
      renderItem={({ item }) => <Pressable disabled={item.readonly} onPress={() => open(item)} onLongPress={() => !item.readonly && remove(item)} style={({ pressed }) => [styles.row, { borderColor: colors.border, backgroundColor: colors.card }, pressed && !item.readonly && styles.pressed]}>
        <View style={[styles.icon, { backgroundColor: colors.input }]}><Ionicons name={item.type === "connector" ? "terminal-outline" : "globe-outline"} size={20} color={colors.text} /></View>
        <View style={{ flex: 1, gap: 3 }}><View style={styles.nameRow}><Text style={{ color: colors.text, fontWeight: "600", flexShrink: 1 }} numberOfLines={1}>{item.name}</Text><Text style={[styles.badge, { backgroundColor: colors.input, color: colors.muted }]}>{item.type === "connector" ? "连接器" : "HTTP"}</Text>{item.readonly ? <Text style={[styles.badge, { backgroundColor: colors.input, color: colors.muted }]}>内置</Text> : null}{item.enabled === false ? <Text style={[styles.badge, { backgroundColor: colors.input, color: colors.muted }]}>停用</Text> : null}</View><Text style={{ color: colors.muted, fontSize: 12 }} numberOfLines={1}>{item.type === "connector" ? [item.command, ...(item.args || [])].filter(Boolean).join(" ") : item.url}</Text></View>{item.readonly ? <Ionicons name="lock-closed-outline" size={17} color={colors.muted} /> : <Ionicons name="chevron-forward" size={18} color={colors.muted} />}
      </Pressable>}
    />
    <Modal visible={editorOpen} transparent animationType="slide" onRequestClose={close}>
      <Sheet colors={colors} title={editor?.id ? "编辑 MCP 服务器" : "新建 MCP 服务器"} onClose={close}>
        <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
          <Choice colors={colors} label="类型" values={["http", "connector"]} labels={["HTTP", "连接器"]} value={form.type} onChange={(value: MCPType) => setForm(current => ({ ...current, type: value }))} />
          <Input colors={colors} label="名称" value={form.name} onChangeText={(value: string) => setForm(current => ({ ...current, name: value }))} />
          {form.type === "http" ? <>
            <Input colors={colors} label="服务器地址" value={form.url} autoCapitalize="none" autoCorrect={false} keyboardType="url" placeholder="https://example.com/mcp" onChangeText={(value: string) => setForm(current => ({ ...current, url: value }))} />
            <Input colors={colors} label="请求头（JSON，可留空）" value={form.headers} autoCapitalize="none" autoCorrect={false} multiline onChangeText={(value: string) => setForm(current => ({ ...current, headers: value }))} />
          </> : <>
            <Input colors={colors} label="导入配置（JSON，可选）" value={form.configJSON} autoCapitalize="none" autoCorrect={false} multiline placeholder={'{"mcpServers":{"example":{"command":"npx","args":["-y","package"]}}}'} onChangeText={applyConfig} />
            <Input colors={colors} label="命令" value={form.command} autoCapitalize="none" autoCorrect={false} placeholder="npx" onChangeText={(value: string) => setForm(current => ({ ...current, command: value }))} />
            <Input colors={colors} label="工作目录（可选）" value={form.cwd} autoCapitalize="none" autoCorrect={false} onChangeText={(value: string) => setForm(current => ({ ...current, cwd: value }))} />
            <Input colors={colors} label="参数（每行一个，或 JSON 数组）" value={form.argsText} autoCapitalize="none" autoCorrect={false} multiline placeholder={'-y\n@notionhq/notion-mcp-server'} onChangeText={(value: string) => setForm(current => ({ ...current, argsText: value }))} />
            <Input colors={colors} label="环境变量（JSON，可选）" value={form.envText} autoCapitalize="none" autoCorrect={false} multiline placeholder={'{"TOKEN":"secret"}'} onChangeText={(value: string) => setForm(current => ({ ...current, envText: value }))} />
          </>}
          <View style={styles.toggle}><Text style={{ color: colors.text }}>启用服务器</Text><Switch value={form.enabled} onValueChange={(value) => setForm(current => ({ ...current, enabled: value }))} trackColor={{ false: colors.border, true: colors.primary }} /></View>
          <Text style={{ color: colors.muted, fontSize: 12 }}>连接器类型需要由已连接设备执行；HTTP 类型由服务端请求。</Text>
          <Action colors={colors} title={saving ? "保存中…" : "保存 MCP 服务器"} onPress={save} disabled={saving} />
        </ScrollView>
      </Sheet>
    </Modal>
  </View>
}

function normalize(value: unknown): MCPServer | null {
  if (!value || typeof value !== "object") return null
  const item = value as Record<string, unknown>
  const id = typeof item.id === "string" ? item.id : ""
  return id ? { id, name: typeof item.name === "string" ? item.name : id, type: item.type === "connector" ? "connector" : "http", url: typeof item.url === "string" ? item.url : "", headers: typeof item.headers === "string" ? item.headers : "", command: typeof item.command === "string" ? item.command : "", args: Array.isArray(item.args) ? item.args.filter((arg): arg is string => typeof arg === "string") : [], env: stringRecord(item.env) || {}, cwd: typeof item.cwd === "string" ? item.cwd : "", enabled: item.enabled !== false, request_mode: typeof item.request_mode === "string" ? item.request_mode : "backend" } : null
}
function saveShape(server: MCPServer): MCPServer { return server.type === "connector" ? { id: server.id, name: server.name, type: "connector", command: server.command || "", args: server.args || [], env: server.env || {}, cwd: server.cwd || "", enabled: server.enabled !== false, request_mode: "connector" } : { id: server.id, name: server.name, type: "http", url: server.url || "", headers: server.headers || "", enabled: server.enabled !== false, request_mode: "backend" } }
function mergeServers(...groups: MCPServer[][]) { const seen = new Set<string>(); return groups.flat().filter(item => { if (seen.has(item.id)) return false; seen.add(item.id); return true }) }
function stringRecord(value: unknown): Record<string, string> | null { return value && typeof value === "object" && Object.values(value as Record<string, unknown>).every(item => typeof item === "string") ? value as Record<string, string> : null }
function parseArgs(value: string) { const raw = value.trim(); if (!raw) return []; if (raw.startsWith("[")) { try { const parsed = JSON.parse(raw); return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [] } catch { return [] } } return value.split(/\r?\n/).map(item => item.trim()).filter(Boolean) }
function parseEnv(value: string) { if (!value.trim()) return {}; try { return stringRecord(JSON.parse(value)) } catch { return null } }
function parseConfig(value: string): Partial<typeof defaults> | null { try { const parsed = JSON.parse(value) as Record<string, unknown>; const root = parsed.mcpServers && typeof parsed.mcpServers === "object" ? parsed.mcpServers as Record<string, unknown> : parsed; const [id, raw] = Object.entries(root)[0] || ["", parsed]; if (!raw || typeof raw !== "object") return null; const item = raw as Record<string, unknown>; const command = typeof item.command === "string" ? item.command : ""; if (!command) return null; const args = Array.isArray(item.args) ? item.args.filter((arg): arg is string => typeof arg === "string").join("\n") : ""; return { id: typeof parsed.id === "string" ? parsed.id : id, name: typeof item.name === "string" ? item.name : id, command, argsText: args, envText: stringRecord(item.env) ? JSON.stringify(item.env, null, 2) : "", cwd: typeof item.cwd === "string" ? item.cwd : "" } } catch { return null } }
function createID() { return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}` }
function message(error: unknown) { return error instanceof Error ? error.message : "发生未知错误" }

const styles = StyleSheet.create({
  root: { flex: 1 }, error: { paddingHorizontal: 16, paddingTop: 10 }, list: { padding: 16, gap: 10 }, empty: { flexGrow: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 9 }, emptyHint: { textAlign: "center", fontSize: 12 }, row: { minHeight: 78, borderWidth: 1, borderRadius: 12, padding: 12, flexDirection: "row", gap: 11, alignItems: "center" }, icon: { width: 42, height: 42, borderRadius: 10, alignItems: "center", justifyContent: "center" }, nameRow: { flexDirection: "row", alignItems: "center", gap: 6 }, badge: { borderRadius: 7, paddingHorizontal: 6, paddingVertical: 2, fontSize: 10, overflow: "hidden" }, pressed: { opacity: 0.58, transform: [{ scale: 0.985 }] }, form: { gap: 13, paddingBottom: 16 }, toggle: { minHeight: 46, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
})
