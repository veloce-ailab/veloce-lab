import { spawnSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const desktopRoot = path.resolve(scriptDir, "..")
const runtimeDir = path.join(desktopRoot, "resources", "bin")
const goos = process.env.VELOCE_RUNTIME_GOOS || hostGoOS()
const goarch = process.env.VELOCE_RUNTIME_GOARCH || hostGoArch()
const binaryExtension = goos === "windows" ? ".exe" : ""
const communitySource = path.resolve(desktopRoot, process.env.VELOCE_COMMUNITY_SOURCE || "../community")
const connectorSource = path.resolve(desktopRoot, process.env.VELOCE_CONNECTOR_SOURCE || "../app")
const connectorVersion = process.env.VELOCE_RUNTIME_VERSION || "dev"

if (!goos || !goarch) {
  throw new Error("Unsupported runtime platform or architecture")
}

fs.mkdirSync(runtimeDir, { recursive: true })
buildGoBinary(communitySource, path.join(runtimeDir, `flai-community${binaryExtension}`), "-s -w")
buildGoBinary(connectorSource, path.join(runtimeDir, `veloce-connector${binaryExtension}`), `-s -w -X main.connectorVersion=${connectorVersion}`)

function buildGoBinary(source, output, ldflags) {
  const result = spawnSync("go", ["build", "-buildvcs=false", "-trimpath", "-ldflags", ldflags, "-o", output, "."], {
    cwd: source,
    env: {
      ...process.env,
      CGO_ENABLED: "0",
      GOOS: goos,
      GOARCH: goarch,
    },
    stdio: "inherit",
  })
  if (result.status !== 0) {
    throw new Error(`Failed to build runtime from ${source}`)
  }
}

function hostGoOS() {
  if (process.platform === "win32") return "windows"
  if (process.platform === "darwin") return "darwin"
  if (process.platform === "linux") return "linux"
  return ""
}

function hostGoArch() {
  if (process.arch === "x64") return "amd64"
  if (process.arch === "arm64") return "arm64"
  return ""
}
