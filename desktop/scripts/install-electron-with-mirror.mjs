import { createRequire } from "node:module"
import { spawnSync } from "node:child_process"
import fs from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const require = createRequire(import.meta.url)
const { downloadArtifact } = require("@electron/get")
const electronPackage = require("electron/package.json")
const checksums = require("electron/checksums.json")

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const electronRoot = path.resolve(__dirname, "..", "node_modules", "electron")
const distPath = path.join(electronRoot, "dist")
const nextDistPath = path.join(electronRoot, `dist-next-${process.pid}`)
const platform = process.env.npm_config_platform || process.platform
const arch = process.env.npm_config_arch || process.arch

process.env.ELECTRON_MIRROR = process.env.ELECTRON_MIRROR || "https://npmmirror.com/mirrors/electron/"

const zipPath = await downloadArtifact({
  version: electronPackage.version,
  artifactName: "electron",
  force: true,
  cacheRoot: process.env.electron_config_cache,
  checksums,
  platform,
  arch,
})

await fs.rm(nextDistPath, { recursive: true, force: true })
await fs.mkdir(nextDistPath, { recursive: true })
extractArchive(zipPath, nextDistPath)
await fs.rm(distPath, { recursive: true, force: true })
await fs.rename(nextDistPath, distPath)
await fs.writeFile(path.join(electronRoot, "path.txt"), platformPath(platform))

function extractArchive(zipPath, destination) {
  const tar = spawnSync("tar", ["-xf", zipPath, "-C", destination], { stdio: "inherit" })
  if (tar.status === 0) {
    return
  }

  // The artifact is a zip, which GNU tar cannot read: try the extractors a host
  // may actually have before giving up.
  const fallbacks = process.platform === "win32"
    ? [["powershell.exe", ["-NoProfile", "-Command", "Expand-Archive -LiteralPath $args[0] -DestinationPath $args[1] -Force", zipPath, destination]]]
    : [
        ["unzip", ["-q", "-o", zipPath, "-d", destination]],
        ["bsdtar", ["-xf", zipPath, "-C", destination]],
      ]
  for (const [command, args] of fallbacks) {
    if (spawnSync(command, args, { stdio: "inherit" }).status === 0) {
      return
    }
  }
  process.exit(1)
}

function platformPath(value) {
  switch (value) {
    case "mas":
    case "darwin":
      return "Electron.app/Contents/MacOS/Electron"
    case "freebsd":
    case "openbsd":
    case "linux":
      return "electron"
    case "win32":
      return "electron.exe"
    default:
      throw new Error(`Electron builds are not available on platform: ${value}`)
  }
}
