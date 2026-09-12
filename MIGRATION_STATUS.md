# TypeScript migration status

The TypeScript backend is assembled from optional Yumeri plugins. Each plugin
registers only its own component and routes; no central route aggregator is
used.

## Migrated foundations

- database drivers and database-core
- model persistence services
- user context
- authentication middleware and password routes
- channel administration and health/model-config routes
- advanced-chat sessions, runs, tools and connector routes
- model catalog listing and upstream synchronization routes
- provider adapter registry and independently removable adapters
- cache, rate limiting, file storage, MCP, skills, uptime and OOBE

## Remaining legacy areas

The following behaviours still exist only in `old/internal/service` and need
to be moved into independently optional plugins. They are intentionally listed
here to keep the migration incremental and reviewable:

- billing/wallet/subscription and usage charging (`billing`, `wallet.go`,
  `subscription*.go`)
- audit records and request logging (`audit.go`)
- scheduler/cluster coordination and price synchronisation (`scheduler.go`,
  `cluster.go`, `price_sync_schedule.go`)
- plugin host/market/update runtime (`plugin_*.go`, `plugins.go`)
- reliability, retries and automatic recovery (`reliability.go`, `restart.go`)
- user-channel access, failover and provider synchronisation
  (`user_channel_access_test.go`, `sync.go`, `providers.go`)
- advanced-chat knowledge, workspace, MCP client and task subdomains
  (`advanced_chat_knowledge*.go`, `advanced_chat_workspaces.go`,
  `advanced_chat_tasks.go`)
- inbound/outbound message-channel provider runtimes
  (`message_channel_assistant.go` and provider-specific legacy handlers)

## Route ownership completed in this pass

Model listing and synchronization endpoints are now owned by
`@velocelab/model-catalog`. The plugin declares its `database` dependency and
can be removed without introducing routes through a generic API package.

## Frontend ownership: settings area

`@velocelab/dashboard` no longer contains settings pages, a settings sidebar or
a page-title table. It exposes framework primitives only:

- `nav(scope)` / `navItemForPath` / `navItemLabel` for contribution-driven
  navigation, with labels resolved from `labelKey` translations.
- `pages(frame)` / `pageForPath` / `frameHome` for frame pages, per-page layout
  hints (`layout: "full"`) and landing pages (`home: true`).
- `DashboardFrameOutlet`, slots, i18n, the UI kit and `AppHeader`.

The settings frame, shell and sidebar now live in `@velocelab/settings`, which
declares only the contribution contract: navigation items scoped to `settings`,
group labels read from `settings.group.<id>`, and pages registered on the
`settings` frame. Capability plugins own their pages and labels:

| Page | Owner | Label key |
| --- | --- | --- |
| `/settings/profile` (frame landing page) | `user` | `user.settings` |
| `/settings/security` | `auth` | `auth.settings` |
| `/settings/chat`, `/settings/assistant`, `/settings/credentials` | `advanced-chat` | `advancedChat.*` |
| `/settings/devices` | `connector` | `connector.settings` |
| `/settings/message-channel` | `channel` | `channel.settings` |
| `/settings/channels` | `channel-admin` | `channelAdmin.settings` |
| `/settings/notifications` | `desktop` | `desktop.settings` |
| `/settings/statistics` | `uptime` | `uptime.settings` |
| `/settings/system`, `/settings/theme`, `/settings/about` | `settings` | `settings.*` |

Known gap: the settings pages call `/api/settings`, which the TypeScript
backend does not implement yet (it exists only in the legacy Go service), so the
network proxy form cannot load or save until a system-settings store and route
are added. That store belongs to Phase 10 of the roadmap.

Settings sections are contributions too. A navigation item joins a section with
`group: "chat"` or declares it with
`group: { id: "chat", labelKey: "advancedChat.settingsGroup", order: 30 }`; the
shell renders the sections it is given and keeps no registry of other packages'
headings. `channel-admin` owns `ai`, `advanced-chat` owns `chat` and this package
owns `system`, while `settings.group.<id>` only backstops the shell's own
`general` bucket. Adding a whole new settings section therefore needs no edit
here.

## Design system ownership

`@velocelab/dashboard` owns the only stylesheet in the repository
(`frontend/index.css`) and the only copy of the UI kit
(`frontend/components/ui`). Plugins consume both through
`@velocelab/dashboard/frontend` — or the `@/components/ui/*` alias, which
resolves to the same dashboard client bundle at build time. Plugins must not
ship theme tokens, font faces or their own copy of a component.

The stylesheet targets the shadcn preset `b27GcrRo` (base radix, style rhea,
neutral theme, Inter, lucide, default radius) and follows the Tailwind v4
conventions of that preset:

- `@theme inline` maps every token to a Tailwind colour, radius and font
  variable. Without that mapping no shadcn utility (`bg-background`,
  `border-border`, `text-muted-foreground`, `rounded-lg`, …) is emitted at all,
  which is what made pages render outside the design system.
- `tw-animate-css` and `shadcn/tailwind.css` provide the animation and variant
  layers that the kit's Radix components rely on.
- `@fontsource-variable/inter` ships the preset font with the bundle.
- `@source "../../*/frontend/**/*.tsx"` makes this single build scan every
  plugin frontend, so plugin pages compile against the same tokens instead of
  shipping a second stylesheet.

Re-apply the preset after a shadcn upgrade with
`yarn dlx shadcn@latest apply --preset b27GcrRo --only theme,font -c packages/dashboard`;
`packages/dashboard/components.json` points the CLI at that stylesheet.

### Colour parity with the legacy console

The token values are the ones the legacy `web/` console shipped
(`71a8e50^:web/src/index.css`), so switching to the plugin architecture did not
change how the product looks. Two values deviate on purpose, both measured as
WCAG contrast ratios:

| token | legacy | here | why |
| --- | --- | --- | --- |
| light `--muted-foreground` | `oklch(0.556 0 0)` | `oklch(0.52 0 0)` | muted text on a `bg-muted` panel was 4.34:1, now 5.05:1 |
| dark `--destructive-foreground` | `oklch(0.985 0 0)` | `oklch(0.205 0 0)` | light text on the dark `--destructive` was 2.77:1, now 6.19:1 |

The kit also keeps the legacy weight for surfaces and fields, because the
preset's own choices are invisible on a white background in light mode:

- floating surfaces (card, dialog, alert dialog, popover, menus, select
  content) ring with `--border` instead of `ring-foreground/5`, which measured
  1.05:1 against a white card — effectively no edge at all.
- form controls (input, textarea, select trigger, checkbox) use
  `border-input bg-background` instead of a `bg-input/50` fill with a
  transparent border, which measured 1.11:1 against the page.

Both are decisions of the dashboard, not of the callers: plugins render
`<Card>`, `<Input>` and friends and never restyle their edges.

### The stylesheet is the only palette

`lib/theme.tsx` used to write a full palette into a runtime `<style>` element
(`windypear-theme-vars`) built from `defaultPublicSettings`. Two things made that
fatal:

- the defaults were the old slate palette, so the injected block silently
  replaced the stylesheet's tokens everywhere, and
- the values were emitted as bare HSL triples (`217.2 32.6% 17.5%`) while every
  consumer uses the token as a colour (`border-color: var(--border)`,
  `--tw-ring-color: var(--border)`).

A bare triple is not a colour, so `border-color` fell back to `currentColor`
and, worse, the invalid `--tw-ring-color` made the composed
`box-shadow: var(--tw-inset-shadow), …, var(--tw-ring-shadow), var(--tw-shadow)`
invalid as a whole — every card lost both its ring and its shadow and every
`bg-card` surface computed to `transparent`. Symptom: "no borders anywhere".

The rule that follows from it, and that the code now enforces:

- `frontend/index.css` is the palette. A theme setting is an *override*, not a
  default: an empty value means "use the stylesheet", and when nothing is
  customised the injected element is removed entirely.
- Injected values are complete colours (normalised hex), never component
  triples, because tokens are consumed both directly and inside
  `color-mix(in oklab, var(--token) x%, transparent)`.

Verify a change to this area in a real render rather than by reading CSS: a
kit-shaped element must compute a `box-shadow` containing
`… 0px 0px 0px 1px` from `--border`.

When migrating an item, place its routes in that plugin's `apply` function and
make all dependencies optional through `ctx.component` lookups. Do not add
new routes to `service` or create an `api` catch-all package.
