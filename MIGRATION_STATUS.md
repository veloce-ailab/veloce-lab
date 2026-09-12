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

When migrating an item, place its routes in that plugin's `apply` function and
make all dependencies optional through `ctx.component` lookups. Do not add
new routes to `service` or create an `api` catch-all package.
