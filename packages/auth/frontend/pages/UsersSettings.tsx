import { useMemo, useState } from "react"
import { Pencil, Plus, Search, ShieldCheck, Trash2 } from "lucide-react"
import {
  Badge,
  Button,
  Card,
  CardContent,
  DashboardSlot,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  PageTitleSlot,
  Skeleton,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  api,
  useConfirmDialog,
  useI18n,
  useQuery,
  useQueryClient,
  useToast,
} from "@velocelab/dashboard/frontend"

interface Account {
  id: number
  username: string
  email: string
  is_admin: boolean
  avatar_url?: string
  created_at?: string
  providers?: string[]
}

interface AccountsResponse {
  users: Account[]
  total: number
  /** Id of the account named in the plugin configuration; it is re-promoted on every start. */
  configured: number
}

interface Draft {
  id?: number
  username: string
  email: string
  password: string
  is_admin: boolean
}

const emptyDraft: Draft = { username: "", email: "", password: "", is_admin: false }

/** Server error codes, so the wording lives in the translation table. */
const errorKeys: Record<string, string> = {
  invalid: "auth.users.errorInvalid",
  duplicate: "auth.users.errorDuplicate",
  configured: "auth.users.errorConfigured",
  self: "auth.users.errorSelf",
  not_found: "auth.users.errorNotFound",
  forbidden: "auth.users.errorForbidden",
}

/**
 * The accounts that may reach this instance. Authentication owns this page
 * because it owns the gate: the same plugin decides who gets in and who exists.
 */
export default function UsersSettings() {
  const { t } = useI18n()
  const toast = useToast()
  const client = useQueryClient()
  const { confirm, confirmDialog } = useConfirmDialog()
  const [search, setSearch] = useState("")
  const [draft, setDraft] = useState<Draft | null>(null)
  const [saving, setSaving] = useState(false)

  const query = useQuery<AccountsResponse>({
    queryKey: ["auth", "users"],
    queryFn: async () => (await api.get("/auth/users")).data,
  })
  const accounts = query.data?.users ?? []
  const configured = query.data?.configured ?? 0

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase()
    if (!needle) return accounts
    return accounts.filter((account) =>
      [account.username, account.email].some((value) => String(value ?? "").toLowerCase().includes(needle)),
    )
  }, [accounts, search])

  const explain = (error: unknown) => {
    const code = (error as { response?: { data?: { error?: string } } })?.response?.data?.error
    return code && errorKeys[code] ? t(errorKeys[code]) : t("auth.users.errorFailed")
  }

  const refresh = () => client.invalidateQueries({ queryKey: ["auth", "users"] })

  const submit = async () => {
    if (!draft) return
    setSaving(true)
    try {
      if (draft.id) {
        await api.post("/auth/users/update", {
          id: draft.id,
          username: draft.username,
          email: draft.email,
          password: draft.password,
          is_admin: draft.is_admin,
        })
        toast.success(t("auth.users.updated"))
      } else {
        await api.post("/auth/users", {
          username: draft.username,
          email: draft.email,
          password: draft.password,
          is_admin: draft.is_admin,
        })
        toast.success(t("auth.users.created"))
      }
      setDraft(null)
      refresh()
    } catch (error) {
      toast.error(explain(error))
    } finally {
      setSaving(false)
    }
  }

  const remove = async (account: Account) => {
    const confirmed = await confirm({
      title: t("auth.users.confirmRemove"),
      description: `${account.username} — ${t("auth.users.confirmRemoveBody")}`,
      confirmText: t("auth.users.remove"),
      variant: "destructive",
    })
    if (!confirmed) return
    try {
      await api.post("/auth/users/delete", { id: account.id })
      toast.success(t("auth.users.deleted"))
      refresh()
    } catch (error) {
      toast.error(explain(error))
    }
  }

  const canSubmit = Boolean(
    draft &&
      draft.username.trim().length >= 3 &&
      draft.email.includes("@") &&
      (draft.id ? draft.password.length === 0 || draft.password.length >= 8 : draft.password.length >= 8),
  )

  return (
    <div className="space-y-6">
      {confirmDialog}
      <DashboardSlot name="auth.users.before" />
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">{t("auth.users.title")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{t("auth.users.subtitle")}</p>
        </div>
        <Button className="shrink-0 gap-2" onClick={() => setDraft({ ...emptyDraft })}>
          <Plus size={16} />
          {t("auth.users.create")}
        </Button>
      </div>
      <PageTitleSlot />

      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="relative">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder={t("auth.users.search")}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>

          {query.isLoading && <div className="space-y-3">{[0, 1, 2].map((key) => <Skeleton key={key} className="h-12 w-full" />)}</div>}
          {query.isError && <p className="text-sm text-destructive">{t("auth.users.loadFailed")}</p>}
          {!query.isLoading && !query.isError && visible.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">{t("auth.users.empty")}</p>
          )}

          {visible.length > 0 && (
            <div className="overflow-hidden rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("auth.users.columnUser")}</TableHead>
                    <TableHead className="w-40">{t("auth.users.columnRole")}</TableHead>
                    <TableHead className="hidden w-48 md:table-cell">{t("auth.users.columnProviders")}</TableHead>
                    <TableHead className="hidden w-48 sm:table-cell">{t("auth.users.columnCreated")}</TableHead>
                    <TableHead className="w-24 text-right">{t("auth.users.columnActions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visible.map((account) => (
                    <TableRow key={account.id}>
                      <TableCell>
                        <div className="font-medium">{account.username}</div>
                        <div className="text-xs text-muted-foreground">{account.email}</div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={account.is_admin ? "default" : "secondary"} className="gap-1">
                          {account.is_admin && <ShieldCheck size={12} />}
                          {account.is_admin ? t("auth.users.admin") : t("auth.users.member")}
                        </Badge>
                      </TableCell>
                       <TableCell className="hidden md:table-cell">
                         <div className="flex flex-wrap gap-1">{account.providers?.length ? account.providers.map((provider) => <Badge key={provider} variant="outline" className="font-mono text-xs">{provider}</Badge>) : <span className="text-sm text-muted-foreground">—</span>}</div>
                       </TableCell>
                       <TableCell className="hidden text-sm text-muted-foreground sm:table-cell">
                         {account.created_at ? new Date(account.created_at).toLocaleString() : "—"}
                       </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            title={t("auth.users.edit")}
                            onClick={() =>
                              setDraft({
                                id: account.id,
                                username: account.username,
                                email: account.email,
                                password: "",
                                is_admin: account.is_admin,
                              })
                            }
                          >
                            <Pencil size={16} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            title={t("auth.users.remove")}
                            disabled={account.id === configured}
                            onClick={() => void remove(account)}
                          >
                            <Trash2 size={16} />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={Boolean(draft)} onOpenChange={(open) => { if (!open) setDraft(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{draft?.id ? t("auth.users.edit") : t("auth.users.create")}</DialogTitle>
            <DialogDescription>{t("auth.users.adminHint")}</DialogDescription>
          </DialogHeader>
          {draft && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="account-username">{t("auth.users.username")}</Label>
                <Input
                  id="account-username"
                  value={draft.username}
                  onChange={(event) => setDraft({ ...draft, username: event.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="account-email">{t("auth.users.email")}</Label>
                <Input
                  id="account-email"
                  type="email"
                  value={draft.email}
                  onChange={(event) => setDraft({ ...draft, email: event.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="account-password">{t("auth.users.password")}</Label>
                <Input
                  id="account-password"
                  type="password"
                  placeholder={draft.id ? t("auth.users.passwordKeep") : ""}
                  value={draft.password}
                  onChange={(event) => setDraft({ ...draft, password: event.target.value })}
                />
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <div className="text-sm font-medium">{t("auth.users.admin")}</div>
                  <div className="text-xs text-muted-foreground">{t("auth.users.adminHint")}</div>
                </div>
                <Switch
                  checked={draft.is_admin}
                  onCheckedChange={(checked) => setDraft({ ...draft, is_admin: checked })}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDraft(null)}>{t("auth.users.cancel")}</Button>
            <Button disabled={!canSubmit || saving} onClick={() => void submit()}>
              {draft?.id ? t("auth.users.save") : t("auth.users.createAction")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DashboardSlot name="auth.users.after" />
    </div>
  )
}
