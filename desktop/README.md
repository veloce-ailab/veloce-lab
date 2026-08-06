# Veloce Desktop

Electron shell for the desktop build of the Veloce web app.

The desktop bundle reuses the web source code, but Vite resolves `@/AppEntry` to `web/src/App.desktop.tsx` when built with `--mode desktop`. The desktop app only includes login/setup and `/chat/*` routes, then connects to an existing Veloce server selected in the app.

The Electron main process is written in TypeScript under `src/main.ts`. The app uses `assets/logo.png` for the window icon and tray icon. Closing the window hides it to the tray; use the tray menu to show or quit the app.

## Run

```bash
npm run install:mirror
npm run start
```

`npm run start` first builds the desktop web bundle into `desktop/dist/web`, compiles the Electron TypeScript entry into `desktop/dist/main.js`, then starts Electron.

`npm run install:mirror` uses `https://registry.npmmirror.com` for npm packages and `https://npmmirror.com/mirrors/electron/` for Electron binaries.

## Build Web Assets Only

```bash
npm run build:web
```

Server selection is stored in local storage under `veloce.desktop.server_url`; the default is `http://localhost:12789`.

## Special thanks

[Linuxdo](https://linux.do)
