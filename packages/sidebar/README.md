# Chat sidebar plugins

`@velocelab/sidebar` contributes the resizable right sidebar to the chat page's
`frame.right-sidebar` slot and its toggle to `chat.toolbar.sidebar`. It owns
layout and collapse state, but has no imports of individual panels. Folding the
sidebar keeps its panels mounted so terminal connections and pending Git tasks
are preserved.

Panels are separate Yumeri plugins, enabled independently in `yumeri.json`:

| Plugin | Contribution |
| --- | --- |
| `@velocelab/chat-environment` | Device selection, recent workspaces, workspace picker |
| `@velocelab/chat-git` | Status, diffs, branch comparisons, commit/push/rollback, approvals |
| `@velocelab/chat-terminal` | Inline terminal and floating terminal window |
| `@velocelab/chat-files` | Generated files reported in live chat messages |

The tracked `scripts/yumeri.json` enables all five plugins. Existing deployments
must add the corresponding empty objects under `plugins` in their local config.
Panel plugins depend on `sidebar` and `advanced-chat`; the Git panel also depends
on the existing `workspace` service. Git and terminal endpoints retain their
existing service owners and permission checks.

## Contributing a panel

Register a component using the existing dashboard plugin lifecycle:

```tsx
import type { DashboardContext } from "@velocelab/dashboard/frontend"
import type { ChatSlotData } from "@velocelab/advanced-chat/frontend/slots"

function MyPanel(props: Record<string, unknown>) {
  const { session, device, messages } = props as ChatSlotData
  return <div>{session?.id}: {device?.name} ({messages.length})</div>
}

export default function apply(ctx: DashboardContext) {
  ctx.slot("chat.sidebar.panels", MyPanel, "my-plugin.panel", 50, "/chat")
}
```

`ChatSlotData` is a public type-only contract. Chat passes current session,
effective run mode, live messages, device, permitted devices, recent workspace
paths, and callbacks for changing the session device/workspace or opening the
workspace picker. A panel does not parse URLs or refetch the session. Device
choices already reflect shared-session permissions and enabled capabilities.

Registrations are removed by `DashboardContext.dispose()` when a frontend
plugin is unloaded. The host contains no central list of panel IDs. Stateful
panels key their content by session/device/workspace so switching context cannot
reuse the previous workspace's drafts, selected branch or terminal.

Run `yarn workspace @velocelab/sidebar test` for the plugin composition tests.
