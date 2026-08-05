import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { ArrowRight, Bot, CircleDollarSign, KeyRound, Laptop, ListChecks, Puzzle, Server, Users } from "lucide-react"
import { Link } from "react-router-dom"
import api from "@/lib/api"
import { useI18n } from "@/lib/i18n"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"

const onboardingDismissedStorageKey = "veloce.onboarding.dismissed"

function isOnboardingDismissed() {
  try {
    return localStorage.getItem(onboardingDismissedStorageKey) === "true"
  } catch {
    return false
  }
}

function dismissOnboarding() {
  try {
    localStorage.setItem(onboardingDismissedStorageKey, "true")
  } catch {
    // The guide remains available when browser storage is unavailable.
  }
}

export function resetOnboardingGuide() {
  try {
    localStorage.removeItem(onboardingDismissedStorageKey)
  } catch {
    // The guide is already shown again on browsers without persistent storage.
  }
}

interface APIKeySummary {
  id: number
}

type GuideAction = {
  title: string
  description: string
  action: string
  href: string
  icon: typeof KeyRound
  tone: string
}

export function DashboardSetupGuide() {
  const [open, setOpen] = useState(false)
  const [dismissed, setDismissed] = useState(isOnboardingDismissed)
  const { language } = useI18n()
  const zh = language === "zh"
  const { data: apiKeys = [], isLoading } = useQuery<APIKeySummary[]>({
    queryKey: ["api-keys", "onboarding"],
    queryFn: async () => {
      const res = await api.get("/user/api-keys")
      return Array.isArray(res.data) ? res.data : []
    },
  })
  const needsFirstKey = !isLoading && apiKeys.length === 0
  const actions: GuideAction[] = [
    {
      title: zh ? "创建第一个 API 密钥" : "Create your first API key",
      description: zh ? "为应用生成独立凭据，并按需配置权限。" : "Generate a credential for your application and configure access when needed.",
      action: zh ? "创建 API 密钥" : "Create API key",
      href: "/dashboard/api-keys?create=1",
      icon: KeyRound,
      tone: "bg-cyan-500/15 text-cyan-600 dark:bg-cyan-400/15 dark:text-cyan-300",
    },
    {
      title: zh ? "充值账户余额" : "Add account balance",
      description: zh ? "充值后即可开始使用按量计费的模型与服务。" : "Add balance to start using metered models and services.",
      action: zh ? "进入充值" : "Go to recharge",
      href: "/dashboard/wallet",
      icon: CircleDollarSign,
      tone: "bg-amber-500/15 text-amber-600 dark:bg-amber-400/15 dark:text-amber-300",
    },
  ]

  if (dismissed) {
    return null
  }

  const skip = () => {
    dismissOnboarding()
    setOpen(false)
    setDismissed(true)
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant={needsFirstKey ? "default" : "outline"} className="gap-2" onClick={() => setOpen(true)}>
          <ListChecks size={16} />
          {zh ? "设置向导" : "Setup guide"}
        </Button>
        {needsFirstKey && <span className="text-sm text-muted-foreground">{zh ? "从创建第一个 API 密钥开始。" : "Start by creating your first API key."}</span>}
      </div>
      {needsFirstKey && (
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{zh ? "完成基础设置，开始使用" : "Complete the basics to get started"}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
            <span>{zh ? "创建 API 密钥并确认账户余额后，即可接入你的应用。" : "Create an API key and confirm your balance before connecting your application."}</span>
            <Button type="button" size="sm" onClick={() => setOpen(true)}>{zh ? "打开向导" : "Open guide"}</Button>
          </CardContent>
        </Card>
      )}
      <SetupGuideDialog
        open={open}
        onOpenChange={setOpen}
        title={zh ? "基础设置向导" : "Getting started"}
        description={zh ? "按顺序完成以下步骤，即可开始通过 API 使用平台。" : "Complete these steps to start using the platform through the API."}
        actions={actions}
        skipLabel={zh ? "跳过向导" : "Skip guide"}
        onSkip={skip}
      />
    </>
  )
}

export function ChatSetupGuide() {
  const [open, setOpen] = useState(false)
  const [dismissed, setDismissed] = useState(isOnboardingDismissed)
  const { language } = useI18n()
  const zh = language === "zh"
  const actions: GuideAction[] = [
    { title: zh ? "添加自己的 Skill" : "Add your Skill", description: zh ? "上传技能包，为代理提供可复用能力。" : "Upload a skill package to give agents reusable capabilities.", action: zh ? "管理 Skill" : "Manage Skills", href: "/chat/skills", icon: Puzzle, tone: "bg-fuchsia-500/15 text-fuchsia-600 dark:bg-fuchsia-400/15 dark:text-fuchsia-300" },
    { title: zh ? "配置 MCP" : "Configure MCP", description: zh ? "连接外部 MCP 服务和工具。" : "Connect external MCP servers and tools.", action: zh ? "添加 MCP" : "Add MCP", href: "/chat/mcp", icon: Server, tone: "bg-teal-500/15 text-teal-600 dark:bg-teal-400/15 dark:text-teal-300" },
    { title: zh ? "创建代理" : "Create an agent", description: zh ? "组合模型、Skill 和 MCP，定义专属工作方式。" : "Combine models, Skills, and MCP to define a dedicated working style.", action: zh ? "新建代理" : "New agent", href: "/chat/agents", icon: Bot, tone: "bg-violet-500/15 text-violet-600 dark:bg-violet-400/15 dark:text-violet-300" },
    { title: zh ? "连接设备" : "Connect a device", description: zh ? "生成连接命令，让代理能够使用你的设备环境。" : "Generate a connection command so agents can use your device environment.", action: zh ? "添加设备" : "Add device", href: "/chat/devices", icon: Laptop, tone: "bg-blue-500/15 text-blue-600 dark:bg-blue-400/15 dark:text-blue-300" },
    { title: zh ? "创建工作室" : "Create a studio", description: zh ? "把代理组织为工作室，并进入运营面板安排工作。" : "Organize agents into a studio and use its operations workspace.", action: zh ? "新建工作室" : "New studio", href: "/chat/agent-groups/new", icon: Users, tone: "bg-indigo-500/15 text-indigo-600 dark:bg-indigo-400/15 dark:text-indigo-300" },
  ]

  if (dismissed) {
    return null
  }

  const skip = () => {
    dismissOnboarding()
    setOpen(false)
    setDismissed(true)
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" className="h-9 gap-2 border-border bg-background" onClick={() => setOpen(true)}>
        <ListChecks size={16} />
        <span className="hidden sm:inline">{zh ? "设置向导" : "Setup guide"}</span>
      </Button>
      <SetupGuideDialog
        open={open}
        onOpenChange={setOpen}
        title={zh ? "聊天设置向导" : "Chat setup guide"}
        description={zh ? "按你的工作方式配置能力；每一项都可以稍后再补充。" : "Configure capabilities for your workflow. You can complete every item later."}
        actions={actions}
        skipLabel={zh ? "跳过向导" : "Skip guide"}
        onSkip={skip}
      />
    </>
  )
}

function SetupGuideDialog({ open, onOpenChange, title, description, actions, skipLabel, onSkip }: { open: boolean; onOpenChange: (open: boolean) => void; title: string; description: string; actions: GuideAction[]; skipLabel: string; onSkip: () => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {actions.map((item, index) => {
            const Icon = item.icon
            return (
              <div key={item.href} className="flex gap-3 rounded-2xl border bg-card/70 p-4">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-muted text-sm font-semibold text-muted-foreground">{index + 1}</span>
                <span className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${item.tone}`}><Icon size={18} /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">{item.title}</span>
                  <span className="mt-1 block text-sm text-muted-foreground">{item.description}</span>
                </span>
                <Button asChild variant="outline" size="sm" className="shrink-0" onClick={() => onOpenChange(false)}>
                  <Link to={item.href}>{item.action}<ArrowRight size={14} /></Link>
                </Button>
              </div>
            )
          })}
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onSkip}>{skipLabel}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
