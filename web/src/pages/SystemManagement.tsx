import { useEffect, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Bot, Paperclip, Save, Server } from "lucide-react"
import AdvancedChatManagement from "./AdvancedChatManagement"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useToast } from "@/components/ui/toast"
import api from "@/lib/api"

type SystemSection = "general" | "advancedChat"

interface SystemSettings {
  site_name: string
  icon_url: string
  message_channel_enabled: boolean
}

const defaults: SystemSettings = {
  site_name: "Veloce",
  icon_url: "",
  message_channel_enabled: true,
}

export default function SystemManagement({ section = "general" }: { section?: SystemSection }) {
  if (section === "advancedChat") {
    return <AdvancedChatSettings />
  }
  return <GeneralSettings />
}

function GeneralSettings() {
  const queryClient = useQueryClient()
  const { success, error } = useToast()
  const [form, setForm] = useState<SystemSettings>(defaults)
  const settings = useQuery<SystemSettings>({
    queryKey: ["system-settings"],
    queryFn: async () => (await api.get("/settings")).data,
  })

  useEffect(() => {
    if (settings.data) {
      setForm({ ...defaults, ...settings.data })
    }
  }, [settings.data])

  const save = useMutation({
    mutationFn: async () => api.put("/settings", form),
    onSuccess: () => {
      success("系统设置已保存")
      queryClient.invalidateQueries({ queryKey: ["system-settings"] })
      queryClient.invalidateQueries({ queryKey: ["public-settings"] })
    },
    onError: (cause: unknown) => error(apiError(cause)),
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">系统设置</h1>
          <p className="mt-1 text-sm text-muted-foreground">配置单用户聊天站点的基础信息。</p>
        </div>
        <Button className="gap-2" disabled={save.isPending || settings.isLoading} onClick={() => save.mutate()}>
          <Save size={16} />保存
        </Button>
      </div>

      <section className="grid gap-5 border-t pt-6">
        <Field label="站点名称">
          <Input value={form.site_name} onChange={(event) => setForm({ ...form, site_name: event.target.value })} />
        </Field>
        <Field label="站点图标 URL">
          <Input value={form.icon_url} placeholder="https://example.com/icon.png" onChange={(event) => setForm({ ...form, icon_url: event.target.value })} />
        </Field>
        <Toggle label="启用消息通道" checked={form.message_channel_enabled} onChange={(checked) => setForm({ ...form, message_channel_enabled: checked })} />
      </section>
    </div>
  )
}

function AdvancedChatSettings() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">高级聊天设置</h1>
        <p className="mt-1 text-sm text-muted-foreground">管理聊天助理、附件处理和 MCP 工具。</p>
      </div>
      <Tabs defaultValue="assistant">
        <TabsList>
          <TabsTrigger value="assistant"><Bot size={15} />助理</TabsTrigger>
          <TabsTrigger value="attachments"><Paperclip size={15} />附件</TabsTrigger>
          <TabsTrigger value="mcp"><Server size={15} />MCP</TabsTrigger>
        </TabsList>
        <TabsContent value="assistant"><AdvancedChatManagement mode="assistant" /></TabsContent>
        <TabsContent value="attachments"><AdvancedChatManagement mode="attachments" /></TabsContent>
        <TabsContent value="mcp"><AdvancedChatManagement mode="mcp" /></TabsContent>
      </Tabs>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="grid max-w-2xl gap-2"><Label>{label}</Label>{children}</div>
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <div className="flex max-w-2xl items-center justify-between border-y py-4"><Label>{label}</Label><Switch checked={checked} onCheckedChange={onChange} /></div>
}

function apiError(cause: unknown) {
  const value = cause as { response?: { data?: { error?: string } }; message?: string }
  return value.response?.data?.error || value.message || "保存失败"
}
