# Backend and frontend migration roadmap

Each phase is complete only when the owning plugin contains the database/service
logic, routes, frontend entry, and runtime integrations that existed in the Go
implementation. Configuration-only settings pages are deferred until the
plugin-management/schema aggregator exists.

## Phase 1: Advanced Chat core

Owner: `advanced-chat`

- sessions, folders, title regeneration, completions, runs, run events
- agent CRUD, generation, agent groups, agent tasks
- chat groups, group messages, private conversations, member activity
- connector approval/task orchestration exposed as extension points
- preserve request/response JSON and database names

## Phase 2: Knowledge

Owner: `knowledge`

- knowledge base CRUD
- document upload, text creation, content read/update/delete
- vectorize and search operations
- file ownership and size limits
- embedding/runtime provider hooks
- knowledge frontend routes and slot contributions

## Phase 3: Workspace and files

Owners: `workspace`, `file`

- workspace CRUD and directory access
- workspace file CRUD/content/download
- Git status/actions
- path guards and storage accounting
- connector-backed workspace operations

## Phase 4: Connector runtime

Owner: `connector`

- device registration, token creation/rotation, heartbeat
- credentials and device task lifecycle
- connector approvals, cancellation, MCP process control
- terminal open/input/output/resize/close
- desktop connector ensure flow
- move connector routes out of `advanced-chat`

## Phase 5: Memory

Owner: `memory`

- document storage and CRUD (partially done)
- scope and group access rules
- attached-memory limits and prompt generation
- list/read/upsert/patch/delete tools
- group memory APIs
- runtime context injection and storage usage hooks

## Phase 6: MCP and skills

Owners: `mcp`, `skill`

- persistent MCP server configuration and user settings
- MCP client calls, connector processes and failures
- skill CRUD, packages, file reads and imports
- workspace skill refresh
- runtime context/tool injection through `advanced-chat`

## Phase 7: Scheduler, delivery and reliability

Owners: `scheduler`, `delivery`, `uptime`

- scheduled task persistence, run history, status and timeout
- manual/primary-only execution and failure recovery
- delivery CRUD and dispatch behavior
- reliability probes, auto-disable and recovery

## Phase 8: Authentication and user

Owners: `auth`, `user`, `desktop`, `oobe`

- logout/session invalidation
- OIDC, passkey, phone/SMS and desktop authorization
- profile, avatar, phone and user preferences
- security routes owned by auth; profile routes owned by user

## Phase 9: Model/catalog and channel parity

Owners: `model-catalog`, `channel`, `channel-admin`, adapters

- remove duplicate model-sync routes from `service`
- provider synchronization and price synchronization
- channel access, failover, retries and health state
- adapter response/stream parity

## Phase 10: Plugin management and settings aggregation

Owner: new plugin-management capability

- discover enabled plugins and their schemas
- aggregate plugin settings without Dashboard knowing plugin identities
- render settings through slots
- remove deferred legacy configuration pages

### Settings ownership (done ahead of the aggregator)

`@velocelab/dashboard` is framework-only: extension registry, navigation
registry, frame outlet, slots and the UI kit. The settings area is assembled
from contributions instead of being rendered by the framework:

- `@velocelab/settings` owns the settings shell (`/settings` frame and sidebar)
  and the platform-level pages (network proxy, theme, about).
- Capability plugins own their own settings pages and navigation entries:
  `user` (profile), `auth` (security), `advanced-chat` (chat, assistant,
  credentials), `connector` (devices), `channel` (message channels),
  `channel-admin` (providers and models), `desktop` (notifications),
  `uptime` (statistics), `memory` (memory route).
- Navigation labels come from i18n keys (`<plugin>.settings`, `settings.group.<id>`)
  registered by the contributing plugin, so the shell holds no page list.
- A frame landing page is declared by the owning plugin with `home: true`, and
  per-page chrome with `layout: "full"`.

Remaining work for this phase: aggregate the deferred configuration pages
(system settings store, provider/pricing sections) behind plugin-declared
schemas instead of hand-written pages.

## Completion checks per phase

- compare all old Go routes for the domain
- compare persistence fields and limits
- verify optional plugin can be disabled without startup failure
- verify the plugin registers its own routes and frontend entry
- add focused tests or route/service smoke checks
