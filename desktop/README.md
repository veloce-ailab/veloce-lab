# Veloce Lab Desktop

The desktop app is an Electron shell around a server it runs itself.

It does not bundle a frontend. On start it launches the Yumeri server that ships
with it (from `resources/server`), and every window then loads that server's own
dashboard — the same panel a browser would get from the same server, plugins
included. So the shell owns only what a browser cannot: the window, the tray, OS
notifications, the connector process and the update check, exposed to the page
through `window.veloceDesktop`.

Consequences worth knowing:

- the panel and the plugins always match the server that is running, because they
  are that server's;
- the server is local: no account, no network, and no way to point a release
  build at somebody else's machine (see *Developer mode*);
- several windows share one main process and one server process; there are no
  tabs and no per-window servers.

## Run

```bash
npm run install:mirror      # npm + Electron binaries from the mirrors
npm run start               # compile the shell, copy the static page, start Electron
```

`npm run start` does not build the server payload; a development run uses the one
already in `resources/server`. Rebuild it (after changing plugins) with:

```bash
# in the repository root
yarn build                  # every workspace package, including plugin frontends
cd desktop
npm run build:server        # resources/server: runtime + node_modules + yumeri.json
```

The payload is ignored by git (`desktop/resources/server`, `desktop/.cache`): it
is a build artifact of about 250 MB.

## Build

```bash
npm run build               # build:electron + build:shell + build:server
npm run dist                # ...then electron-builder
```

`electron-builder` packages `dist/` (the compiled main process and the static
shell page) and copies `resources/server` and `resources/bin` next to the app as
extra resources.

## Where things live

| What | Where |
|---|---|
| Settings (proxy, connector path, developer mode) | `<userData>/desktop-settings.json` |
| Server enable flag and port | `<userData>/desktop-server.json` |
| Generated server config | `<userData>/desktop-server/yumeri.json` |
| Server database, data root, log | `<userData>/desktop-server/{veloce.db,data/server.log}` |

`<userData>` is `%LOCALAPPDATA%\veloce-lab` on Windows and `~/.veloce-lab`
elsewhere.

`yumeri.json` is regenerated from `desktop/yumeri.json` on every start: the
template in the repository is the source of truth, and the machine-specific parts
(port, database, data root) are filled in for the machine. The server binds
`127.0.0.1` only, on a port picked at random each start — a page that reaches this
window gets the desktop bridge, so another program on the machine must not be able
to claim the address first. `desktop-server.json` records the port that was used,
for diagnostics.

## Developer mode

A release build only talks to the server it started. Settings → *Developer mode*
allows another server instead:

- it is off by default and enabling it asks for confirmation, because a page
  served by another machine gets this app's abilities (opening files, starting a
  connector, showing notifications);
- the shell pins that one origin: navigation elsewhere is handed to the system
  browser, and every IPC call checks the origin of the frame that made it;
- the window title says *external server* for as long as it is in use.

## What the server gets from the shell

The preload bridge (`src/preload.cts`) is the whole surface, and the page's copy
of the types lives in `packages/dashboard/frontend/vite-env.d.ts`. Notably:

- `ensureDesktopConnector({ serverURL, token, deviceID })` starts the bundled
  connector (`resources/bin/veloce-connector`) as a `desktop`-kind device. The
  page is what asks the server for that device token — the shell never holds a
  login credential, and a server without an authentication plugin works the same;
- `notifyConnectorApproval` / `onConnectorApprovalDecision` implement the OS
  toast whose buttons come back through the `veloce://connector-approval` URL;
- `saveDesktopSettings` is what developer mode goes through, so the confirmation
  and the URL validation cannot be skipped by the page.

## Not wired yet

- Desktop updates: the check button reports "not available" and the installer
  path is still there, but nothing is fetched (`desktopUpdateCheckEnabled`).
- The bundled connector is built by `scripts/build-runtimes.mjs` (needs Go); the
  built-in server does not start one on its own.

## Special thanks

[Linuxdo](https://linux.do)
