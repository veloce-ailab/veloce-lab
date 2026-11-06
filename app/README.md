# Veloce App Connector

Local connector for WindyPear agent chat assistant mode.

The connector registers a local device with the backend, polls for approved
tool tasks, and sends task results back to the backend. The workspace directory
is selected in the web session settings.

## Run

Generate a connector token in agent chat > Devices, then run:

```powershell
go run . -server http://localhost:8080 -token <connector-token>
```

If no mode is specified, the connector runs in the standard platform mode for
workspace file and command tools.

## What a device can do

The connector answers the same action set as the built-in local connector
(`packages/device-local`), so a session works the same whichever one it is
pointed at — the host cannot tell them apart, and it parses the same JSON from
both:

| Family | Actions |
|---|---|
| Workspace files | `list_files`, `list_directory`, `read_file`, `write_file`, `replace_text`, `file_sha256` |
| Folder choice | `list_directories`, `list_windows_drives`, `pick_directory` |
| Desktop | `open_file_manager`, `open_terminal`, `open_vscode` |
| Git | `git_status`, `git_action` |
| Terminals | `terminal_open`, `terminal_input`, `terminal_read`, `terminal_resize`, `terminal_close` |
| MCP | `mcp_list_tools`, `mcp_call_tool`, `list_mcp_processes`, `stop_mcp_process` |
| Beyond the built-in connector | `web_search`, `web_fetch`, agent skill and agent group actions, `commit_delta` (sandboxd mode) |

Paths follow the built-in connector's rules: a relative path starts in the
session workspace, an absolute path is accepted only while it stays inside it,
and `list_directories` is the one action that browses the machine (that is how a
workspace gets chosen). File actions answer with the same objects — `{path,
content}`, `{path, entries}`, `{path, size, added, removed}`, `{path, sha256,
size}` — so the panel's file tree and the model's tools read them unchanged.

`VELOCE_CONNECTOR_PICK_COMMAND` replaces the folder dialog with a command that
receives the starting folder as its last argument and prints the chosen one,
which is how a headless or test host supplies its own picker (the built-in
connector has the same hook as `DEVICE_LOCAL_PICK_COMMAND`).

## Command confinement

A session's approval mode decides the terms a command runs under. In `sandbox`
mode (the default) the command runs inside a kernel sandbox: bubblewrap mounts
the world read-only and binds the workspace back writable, and on hosts where
bubblewrap cannot start — a container without user namespaces, a machine without
bwrap — the connector applies the same boundary with Landlock instead. For that
it re-executes itself as

```bash
veloce-app -sandbox-landlock <writable-root>... -- sh -c '<command>'
```

which installs the ruleset on the child and then becomes the command. Either way
a write outside the workspace fails in the kernel (`EROFS` on Linux, `EACCES`
under Landlock), while reads and execs stay available. `full_access` runs
commands unconfined; `assistant` waits for an approval first.

Besides the workspace, a confined command may write to the scratch directory,
the user cache directory and `/dev`; `VELOCE_SANDBOX_WRITABLE` adds more, one
absolute path per line. The web connector keeps the same settings in the
sandbox plugin (`@velocelab/sandbox`).

## Managed cloud sandbox worker

Administrators can register a sandbox host in the admin API, which returns a
host-scoped connector token. Start the same binary on that host in `sandboxd`
mode:

```powershell
go run . -server https://platform.example -token <sandbox-host-token> -mode sandboxd -data-dir D:\veloce-sandboxes
```

`sandboxd` reuses the connector heartbeat and task-polling protocol, but its
workspaces are always created below `data-dir/sandboxes/<sandbox-id>/work`.
It never accepts a user workspace path. By default, commands run in Docker
with the image, CPU, memory, network, PID, capability, and read-only-root
settings supplied by the administrator's host security policy. Docker must be
installed and available on a Docker sandbox host.

For a Windows host, set `security_policy.runtime` to `appcontainer` and set
`security_policy.platform` to `windows`. sandboxd creates a distinct Windows
AppContainer profile for each sandbox, grants that profile access only to its
workspace, launches `cmd.exe` with `SECURITY_CAPABILITIES`, and supplies no
network capabilities. This runtime requires no Docker installation, rejects
policies that request network access, and requires a Windows version that
provides the AppContainer APIs.

## Permissions

Workspace file and command tasks usually run against the absolute workspace path
selected in the web session settings, and the connector verifies that directory
exists locally before those tools run. Paths from the model must be relative to
the workspace root.

Message channels may be configured without a workspace limit. In that mode,
file paths must be absolute paths on the connector device. On Windows, the model
can call `list_windows_drives` to discover available drive roots before choosing
an absolute path.

Agent skills are loaded from both the selected workspace `.agents` directory and
the user-level `~/veloce/.agents` directory. User-level skills are returned
under `.agents/global/...` so they do not collide with workspace-local skills.
Network tasks do not require a workspace path.

Read-only actions run directly:

- `list_files`
- `read_file`
- `list_windows_drives` (Windows connectors only)
- `web_search` (supports `auto`, `duckduckgo`, `bing`, `baidu`, and `google`)
- `web_fetch`

Editing actions require approval in the web frontend before the connector can
receive the task, unless automatic approval is enabled for the chat session:

- `write_file`
- `replace_text`

Command execution always requires approval unless the full command starts with
one of the prefixes allowed in the chat session settings:

- `run_command`

## Build

```powershell
go build -o veloce-app.exe .
```
## Special thanks

[Linuxdo](https://linux.do)
