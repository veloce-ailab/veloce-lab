// Puts the static shell page where `main.ts` expects it (`dist/shell`), so a
// window has something to show while the built-in server starts.
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const desktopRoot = path.resolve(scriptDir, "..")
const from = path.join(desktopRoot, "shell")
const to = path.join(desktopRoot, "dist", "shell")

fs.rmSync(to, { recursive: true, force: true })
fs.mkdirSync(path.dirname(to), { recursive: true })
fs.cpSync(from, to, { recursive: true })
console.log(`[copy-static] ${path.relative(desktopRoot, to)}`)
