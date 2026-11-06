// Puts the built-in server payload next to the packaged app.
//
// `extraResources` cannot be used for it: electron-builder's file matcher treats
// `node_modules` as something the packager owns and skips it, which silently
// produced a server without its plugins. Copying the directory ourselves after
// the app is packed keeps the payload exactly what `build-server.mjs` built.
import fs from "node:fs"
import path from "node:path"

const PAYLOAD = "server"

export default async function afterPack(context) {
  const source = path.join(context.packager.projectDir, "resources", PAYLOAD)
  const resourcesDir = context.packager.getResourcesDir(context.appOutDir)
  const destination = path.join(resourcesDir, PAYLOAD)
  if (!fs.existsSync(source)) {
    throw new Error(`${PAYLOAD} payload is missing: run \`npm run build:server\` first (${source})`)
  }
  fs.rmSync(destination, { recursive: true, force: true })
  fs.cpSync(source, destination, { recursive: true, dereference: true })
  const runtime = path.join(destination, "runtime", process.platform === "win32" ? "node.exe" : "node")
  if (fs.existsSync(runtime)) fs.chmodSync(runtime, 0o755)
  const entry = path.join(destination, "node_modules", "yumeri", "bin.js")
  if (!fs.existsSync(entry)) {
    throw new Error(`the ${PAYLOAD} payload has no server entry: ${entry}`)
  }
  console.log(`  • copied built-in server  ${path.relative(context.appOutDir, destination)}`)
}
