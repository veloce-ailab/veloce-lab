import { spawnSync } from "node:child_process"

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm"
const env = {
  ...process.env,
  ELECTRON_MIRROR: "https://npmmirror.com/mirrors/electron/",
}

const install = spawnSync(npmCommand, ["install", "--registry=https://registry.npmmirror.com"], {
  env,
  stdio: "inherit",
})

if (install.status !== 0) {
  process.exit(install.status ?? 1)
}

const electronInstall = spawnSync(process.execPath, ["scripts/install-electron-with-mirror.mjs"], {
  env,
  stdio: "inherit",
})

process.exit(electronInstall.status ?? 1)
