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
workspace file and command tools. Website devices run a static site server in
addition to the normal task receiver:

```powershell
go run . -server http://localhost:8080 -token <connector-token> -mode web_server -web-port 8080
```

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

Use `-data-dir <path>` to choose where hosted sites are stored. By default the
connector uses the user config directory and stores sites under `sites/<domain>`.

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

Website devices also accept static site tasks:

- `deploy_static_site`
- `set_static_site_enabled`
- `delete_static_site`

Static site routing uses the HTTP `Host` header. Unknown hosts return 404, and
suspended sites return 403. Deployments write to a temporary directory first and
then atomically swap the site's `public` directory.

## Build

```powershell
go build -o veloce-app.exe .
```
## Special thanks

[Linuxdo](https://linux.do)
