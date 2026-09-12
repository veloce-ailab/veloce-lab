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

## Frontend ownership: the chat area

`/chat` is a frame owned by `@velocelab/advanced-chat`, the same way the settings
area is owned by `@velocelab/settings`. The frame renders the chat chrome and a
two-level navigation built from the contributions it is given; every page inside
it, the conversation included, is registered by the package that owns the
capability:

| page | owner | section |
| --- | --- | --- |
| `/chat`, `/chat/session/:id` | `advanced-chat` | frame home, not in the menu |
| `/chat/groups`, `/chat/agents`, `/chat/agent-groups/*` | `advanced-chat` | `direct`, `agents` |
| `/chat/community/*` | `community` | `direct` |
| `/chat/knowledge` | `knowledge` | `library` |
| `/chat/files` | `workspace` | `library` |
| `/chat/memories` | `memory` | `agents` |
| `/chat/skills` | `skill` | `agents` |
| `/chat/mcp` | `mcp` | `agents` |
| `/chat/scheduled-tasks` | `scheduler` | `workflow` |
| `/chat/deliveries` | `delivery` | `workflow` |

The menu has two levels: items in the `direct` section are listed flat, and every
other section is a heading that opens its own list. A package introduces a new
submenu by declaring the section on its own page
(`group: { id, labelKey, order }`) — no edit to `advanced-chat` is needed, and the
frame only backstops the section labels nobody declares.

What used to live in the frame and no longer does, because it was knowledge about
other packages' pages:

- a `/chat/*` owned route whose `<Routes>` re-declared pages owned elsewhere,
- a path-keyed icon-tone table (`advancedChatSidebarIconTones`) covering pages
  such as `/chat/admin-users` that the frame did not even own,
- a path-to-window-title table replaced by the matching page's own navigation
  label.

`navItemForPath` and `pageForPath` resolve `:param` and `*` patterns before
falling back to prefix matching, so a nested page keeps its own title and its
`layout: "full"` hint.

With only `@velocelab/advanced-chat` enabled, the frame renders the chat page and
its own menu rows (home, groups, agents, studios) and nothing else: sections that
no package contributes do not appear, and no row points at a page that is not
registered. A frame is also self-sufficient in the other direction — it links to
the settings area through `frameHome("settings")` and hides the entry when no
settings frame exists.

## Frontend ownership: the top bar and the site root

Neither frame draws the top bar. `@velocelab/topbar` owns it and registers it into
the `frame.topbar` slot; the console layout, the settings frame and the chat frame
each render that slot and hand over only what belongs to them:

- `leading` — the control that drives the frame's own sidebar,
- `actions` — frame features that sit in the bar, such as the chat session search.

The bar itself carries the brand, the configurable top navigation, the
`header.nav`/`header.actions`/`header.brand.after` slots, the theme and language
switchers and the account entry, and it links to frames through `frameHome(...)`
rather than to hardcoded paths. Because the bar is a contribution, disabling
`@velocelab/topbar` leaves the frames without one — accepted, like every other
plugin-owned surface.

`@velocelab/home-redirect` claims `/` and sends it to the home of the chat frame.
The root used to match no route at all. Nothing else owns `/`.

Cross-frame links no longer name another package's page: the chat frame's settings
entry resolves to `frameHome("settings")`, the settings frame's chat entry to
`frameHome("chat")`, and the message-channel page links to its own
`/settings/message-channel` path. `avatar_url`, `site_name` and the switchers come
from the top bar package, so the dashboard no longer exports an `AppHeader`.

## Authentication is a layer, not a page

`@velocelab/auth` no longer contributes a frontend at all: it does not depend on
`@velocelab/dashboard` and ships no page to the dashboard. Authentication cannot be
a page of the application, because the application is what it protects — anything
it wanted to render would have to be loaded before a session exists.

Instead the package installs one global middleware and serves one document:

- `ctx.use("authentication", …)` decides every request. A request that carries a
  session — the `Authorization: Bearer` token the application sends, or the
  `veloce_session` cookie a browser navigation carries — passes through with
  `session.properties.user` set. Everything else is refused: a navigation is
  answered with `302` to `/login?next=…`, an API call with `401`.
- `GET /login` is a self-contained document with its own inlined styles and
  script. It reads `/api/configuration` and `/api/public/settings` for the
  agreement mode, the registration switch and the site name, posts to
  `/auth/password/login` (and `/auth/password/register`), stores the token and
  continues to `next`. `next` is validated as a same-site absolute path, so it
  cannot be used as an open redirect.
- The public surface is explicit and small: `/login`, `/setup` and the assets
  those two load, `/api/public/settings`, `/api/configuration`, `/api/setup*`,
  `/api/dashboard/manifest`, `/api/static/plugin`, the password endpoints,
  `/auth/logout`, and the connector webhooks under
  `/api/advanced-chat/connectors/`, which authenticate with their own token.
  While an instance has no administrator, blocked requests are sent to `/setup`
  rather than to the login page.
- Password registration is refused unless
  `password_registration_enabled` is set, matching what the page offers.
- A session proven by the token is written back as a cookie, so the first-run
  wizard — which holds a token but never logged in — survives a page reload.

The account surface that used to live here (passwords, passkeys, phone and OIDC
bindings) moved to `@velocelab/user` as `/settings/security`: it is a settings page
about the signed-in account, and its API is `/user/*` either way.

The application side follows the same rule: `lib/api.ts` answers a `401` by
clearing the token and sending the browser to `/login?next=<current path>`, and
logging out posts to `/auth/logout` — which revokes the token and clears the
cookie — before leaving for the login page.

`@velocelab/auth` is not enabled in `yumeri.json`, so the instance behind it is
open as before; enabling the plugin puts every request behind a session.

## Development mode: the frontend is served from source

`NODE_ENV=production` serves the build. Anywhere else — and whenever the
dashboard plugin is configured with `"dev": true` — the frontend is compiled on
demand instead, so editing a dashboard component or a plugin page updates the
browser without a build step.

The Vite server is embedded rather than started next to the application: it runs
in middleware mode, `appType: "custom"`, and answers through the dashboard's own
catch-all route on the port the application already listens on. Nothing opens a
second HTTP port. The HMR socket is attached to the same http server, and the
server's own upgrade handler — which answers every unmatched upgrade with a 400
and closes it — is wrapped so that `vite-hmr` and `vite-ping` upgrades reach
Vite while every other upgrade, such as a plugin's own websocket, still reaches
the application untouched.

Entries follow the mode. `addEntry({ dev, prod })` already registered both, and
the manifest now resolves them accordingly: the sources are published as `/@fs/`
URLs that the embedded server compiles, the build keeps its
`/api/static/plugin?file=…` URL, and whichever of the two is missing on disk
falls back to the other. `/api/static/plugin` answers a source with a redirect,
so an old client cannot fetch uncompiled TSX.

Because the plugin sources are compiled by the *dashboard's* Vite server, one
module graph covers everything: `@velocelab/dashboard/frontend` resolves to
`frontend/client.ts`, `@/components|lib|hooks` resolves to the dashboard's own
files, and React, React Router, React Query and lucide come from one pre-bundled
dependency set. A plugin page and the shell therefore share React and both
hot-update. `/dashboard-client.js` — the stable URL that *built* plugin bundles
import — redirects to that same source runtime, so a mix of compiled and
pre-built parts still holds a single copy of React.

If Vite or one of its plugins is not installed, the dashboard logs the reason and
serves `dist/web` exactly as before: development mode is a convenience, not a
requirement. Production behaviour is unchanged.

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
