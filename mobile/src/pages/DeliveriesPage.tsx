import { Ionicons } from "@expo/vector-icons"
import { useCallback, useEffect, useState } from "react"
import { Alert, FlatList, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native"
import { request } from "../api"
import type { Palette } from "../theme"
import { Action, Choice, Input, Sheet, Top } from "./TasksPage"

type DeliveryMethod = "webhook" | "email"
type Delivery = {
  id: string
  name: string
  description?: string
  method: DeliveryMethod
  webhook_url?: string
  webhook_headers?: string
  email_to?: string
  smtp_host?: string
  smtp_port?: string
  smtp_username?: string
  smtp_password?: string
  smtp_from?: string
  enabled?: boolean
}

type Settings = { message_delivery_enabled?: boolean; delivery_system_smtp_enabled?: boolean }

const defaults = {
  name: "",
  description: "",
  method: "webhook" as DeliveryMethod,
  webhook_url: "",
  webhook_headers: "{}",
  email_to: "",
  smtp_host: "",
  smtp_port: "587",
  smtp_username: "",
  smtp_password: "",
  smtp_from: "",
  enabled: true,
}

export default function DeliveriesPage({ colors, onBack }: { colors: Palette; onBack: () => void }) {
  const [items, setItems] = useState<Delivery[]>([])
  const [settings, setSettings] = useState<Settings>({})
  const [editor, setEditor] = useState<Delivery | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [form, setForm] = useState({ ...defaults })
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)
  const enabled = settings.message_delivery_enabled !== false
  const systemSMTPEnabled = settings.delivery_system_smtp_enabled !== false

  const load = useCallback(async () => {
    try {
      setError("")
      const [nextSettings, data] = await Promise.all([
        request<Settings>("/user/advanced-chat/settings"),
        request<unknown>("/user/advanced-chat/deliveries"),
      ])
      setSettings(nextSettings || {})
      setItems(Array.isArray(data) ? data.map(normalize).filter((item): item is Delivery => Boolean(item)) : [])
    } catch (cause) {
      setError(message(cause))
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const open = (item?: Delivery) => {
    setError("")
    setEditor(item || null)
    setEditorOpen(true)
    setForm(item ? {
      name: item.name,
      description: item.description || "",
      method: item.method,
      webhook_url: item.webhook_url || "",
      webhook_headers: item.webhook_headers || "{}",
      email_to: item.email_to || "",
      smtp_host: item.smtp_host || "",
      smtp_port: item.smtp_port || "587",
      smtp_username: item.smtp_username || "",
      smtp_password: item.smtp_password || "",
      smtp_from: item.smtp_from || "",
      enabled: item.enabled !== false,
    } : { ...defaults, name: "新投递" })
  }

  const close = () => { setEditor(null); setEditorOpen(false); setError("") }

  const save = async () => {
    const payload = {
      name: form.name.trim(),
      description: form.description.trim(),
      method: form.method,
      webhook_url: form.webhook_url.trim(),
      webhook_headers: form.webhook_headers.trim() || "{}",
      email_to: form.email_to.trim(),
      smtp_host: form.smtp_host.trim(),
      smtp_port: form.smtp_port.trim() || "587",
      smtp_username: form.smtp_username.trim(),
      smtp_password: form.smtp_password,
      smtp_from: form.smtp_from.trim(),
      enabled: form.enabled,
    }
    if (!payload.name) { setError("请输入投递名称"); return }
    if (payload.method === "webhook" && !payload.webhook_url) { setError("请输入 Webhook 地址"); return }
    if (payload.method === "email" && !payload.email_to) { setError("请输入收件邮箱"); return }
    if (payload.method === "email" && !systemSMTPEnabled && (!payload.smtp_host || !payload.smtp_from)) { setError("请填写 SMTP 主机和发件邮箱"); return }
    if (payload.method === "webhook") {
      try { JSON.parse(payload.webhook_headers) } catch { setError("Webhook 请求头必须是有效的 JSON 对象"); return }
    }
    setSaving(true)
    try {
      await request(editor?.id ? `/user/advanced-chat/deliveries/${encodeURIComponent(editor.id)}` : "/user/advanced-chat/deliveries", {
        method: editor?.id ? "PUT" : "POST",
        body: payload,
      })
      close()
      await load()
    } catch (cause) {
      setError(message(cause))
    } finally {
      setSaving(false)
    }
  }

  const remove = (item: Delivery) => Alert.alert("删除投递配置", `确定删除“${item.name}”？`, [
    { text: "取消", style: "cancel" },
    { text: "删除", style: "destructive", onPress: async () => {
      try {
        await request(`/user/advanced-chat/deliveries/${encodeURIComponent(item.id)}`, { method: "DELETE" })
        await load()
      } catch (cause) {
        setError(message(cause))
      }
    } },
  ])

  return <View style={styles.root}>
    <Top colors={colors} title="结果投递" onBack={onBack} right="add" onRight={() => enabled && open()} />
    {error ? <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text> : null}
    {!enabled ? <View style={styles.empty}><Ionicons name="lock-closed-outline" size={24} color={colors.muted} /><Text style={{ color: colors.muted }}>管理员已关闭消息投递</Text></View> : <FlatList
      data={items}
      keyExtractor={item => item.id}
      onRefresh={load}
      refreshing={false}
      contentContainerStyle={items.length ? styles.list : styles.empty}
      ListEmptyComponent={<View style={styles.empty}><Ionicons name="send-outline" size={28} color={colors.muted} /><Text style={{ color: colors.muted }}>暂无投递配置</Text><Text style={[styles.emptyHint, { color: colors.muted }]}>新建 Webhook 或邮件投递，供定时任务使用。</Text></View>}
      renderItem={({ item }) => <Pressable onPress={() => open(item)} onLongPress={() => remove(item)} style={({ pressed }) => [styles.row, { borderColor: colors.border, backgroundColor: colors.card }, pressed && styles.pressed]}>
        <View style={[styles.icon, { backgroundColor: colors.input }]}><Ionicons name={item.method === "email" ? "mail-outline" : "globe-outline"} size={20} color={colors.text} /></View>
        <View style={styles.rowContent}><View style={styles.nameRow}><Text style={{ color: colors.text, fontWeight: "600", flexShrink: 1 }} numberOfLines={1}>{item.name}</Text><Text style={[styles.badge, { color: colors.muted, backgroundColor: colors.input }]}>{item.method === "email" ? "邮箱" : "Webhook"}</Text><Text style={[styles.badge, { color: item.enabled === false ? colors.muted : colors.text, backgroundColor: colors.input }]}>{item.enabled === false ? "停用" : "启用"}</Text></View>
          {item.description ? <Text style={{ color: colors.muted, fontSize: 12 }} numberOfLines={1}>{item.description}</Text> : null}
          <Text style={{ color: colors.muted, fontSize: 12 }} numberOfLines={1}>{item.method === "email" ? item.email_to : item.webhook_url}</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.muted} />
      </Pressable>}
    />}
    <Modal visible={editorOpen} transparent animationType="slide" onRequestClose={close}>
      <Sheet colors={colors} title={editor?.id ? "编辑投递" : "新建投递"} onClose={close}>
        <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
          <Input colors={colors} label="名称" value={form.name} onChangeText={(value: string) => setForm(current => ({ ...current, name: value }))} />
          <Choice colors={colors} label="方式" values={["webhook", "email"]} labels={["Webhook", "邮箱"]} value={form.method} onChange={(value: DeliveryMethod) => setForm(current => ({ ...current, method: value }))} />
          <Input colors={colors} label="描述" value={form.description} multiline onChangeText={(value: string) => setForm(current => ({ ...current, description: value }))} />
          {form.method === "webhook" ? <>
            <Input colors={colors} label="Webhook 地址" value={form.webhook_url} autoCapitalize="none" autoCorrect={false} keyboardType="url" placeholder="https://example.com/webhook" onChangeText={(value: string) => setForm(current => ({ ...current, webhook_url: value }))} />
            <Input colors={colors} label="Webhook 请求头（JSON）" value={form.webhook_headers} autoCapitalize="none" autoCorrect={false} multiline onChangeText={(value: string) => setForm(current => ({ ...current, webhook_headers: value }))} />
          </> : <>
            <Input colors={colors} label="收件邮箱" value={form.email_to} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" onChangeText={(value: string) => setForm(current => ({ ...current, email_to: value }))} />
            <View style={[styles.smtp, { borderColor: colors.border, backgroundColor: colors.input }]}>
              <Text style={{ color: colors.text, fontWeight: "600" }}>SMTP 设置</Text>
              <Text style={{ color: colors.muted, fontSize: 12 }}>{systemSMTPEnabled ? "可留空并使用管理员允许的系统 SMTP；填写后优先使用自定义 SMTP。" : "管理员未允许系统 SMTP，请填写自定义 SMTP。"}</Text>
              <Input colors={colors} label="SMTP 主机" value={form.smtp_host} autoCapitalize="none" autoCorrect={false} onChangeText={(value: string) => setForm(current => ({ ...current, smtp_host: value }))} />
              <Input colors={colors} label="SMTP 端口" value={form.smtp_port} keyboardType="numeric" onChangeText={(value: string) => setForm(current => ({ ...current, smtp_port: value }))} />
              <Input colors={colors} label="SMTP 用户名" value={form.smtp_username} autoCapitalize="none" autoCorrect={false} onChangeText={(value: string) => setForm(current => ({ ...current, smtp_username: value }))} />
              <Input colors={colors} label="SMTP 密码" value={form.smtp_password} autoCapitalize="none" autoCorrect={false} secureTextEntry onChangeText={(value: string) => setForm(current => ({ ...current, smtp_password: value }))} />
              <Input colors={colors} label="发件邮箱" value={form.smtp_from} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" onChangeText={(value: string) => setForm(current => ({ ...current, smtp_from: value }))} />
            </View>
          </>}
          <View style={styles.toggle}><Text style={{ color: colors.text }}>启用投递</Text><Switch value={form.enabled} onValueChange={(value) => setForm(current => ({ ...current, enabled: value }))} trackColor={{ false: colors.border, true: colors.primary }} /></View>
          <Action colors={colors} title={saving ? "保存中…" : "保存投递"} onPress={save} disabled={saving} />
        </ScrollView>
      </Sheet>
    </Modal>
  </View>
}

function normalize(value: unknown): Delivery | null {
  if (!value || typeof value !== "object") return null
  const item = value as Record<string, unknown>
  const id = String(item.id || "")
  if (!id) return null
  return {
    id,
    name: String(item.name || ""),
    description: typeof item.description === "string" ? item.description : "",
    method: item.method === "email" ? "email" : "webhook",
    webhook_url: typeof item.webhook_url === "string" ? item.webhook_url : "",
    webhook_headers: typeof item.webhook_headers === "string" ? item.webhook_headers : "{}",
    email_to: typeof item.email_to === "string" ? item.email_to : "",
    smtp_host: typeof item.smtp_host === "string" ? item.smtp_host : "",
    smtp_port: typeof item.smtp_port === "string" ? item.smtp_port : "587",
    smtp_username: typeof item.smtp_username === "string" ? item.smtp_username : "",
    smtp_password: typeof item.smtp_password === "string" ? item.smtp_password : "",
    smtp_from: typeof item.smtp_from === "string" ? item.smtp_from : "",
    enabled: item.enabled !== false,
  }
}

function message(error: unknown) { return error instanceof Error ? error.message : "发生未知错误" }

const styles = StyleSheet.create({
  root: { flex: 1 },
  error: { paddingHorizontal: 16, paddingTop: 10 },
  list: { padding: 16, gap: 10 },
  empty: { flexGrow: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 9 },
  emptyHint: { textAlign: "center", fontSize: 12 },
  row: { minHeight: 82, borderWidth: 1, borderRadius: 12, padding: 12, flexDirection: "row", gap: 11, alignItems: "center" },
  rowContent: { flex: 1, gap: 3 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  icon: { width: 42, height: 42, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  badge: { borderRadius: 7, overflow: "hidden", paddingHorizontal: 6, paddingVertical: 2, fontSize: 10 },
  pressed: { opacity: 0.58, transform: [{ scale: 0.985 }] },
  form: { gap: 13, paddingBottom: 16 },
  smtp: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 10 },
  toggle: { minHeight: 46, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
})
