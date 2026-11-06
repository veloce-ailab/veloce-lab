import assert from "node:assert/strict"
import { test } from "node:test"
import { desktopBootstrap } from "../dist/index.js"

test("the shell is told what it needs and nothing else", () => {
  assert.deepEqual(desktopBootstrap({ minShellVersion: "0.2.0", protocolScheme: "veloce" }), {
    app_name: "Veloce Lab",
    protocol_scheme: "veloce",
    min_shell_version: "0.2.0",
  })
})

test("a malformed scheme falls back instead of reaching app.setAsDefaultProtocolClient", () => {
  assert.equal(desktopBootstrap({ minShellVersion: "", protocolScheme: "not a scheme!" }).protocol_scheme, "notascheme")
  assert.equal(desktopBootstrap({ minShellVersion: "", protocolScheme: "" }).protocol_scheme, "veloce")
  assert.equal(desktopBootstrap({ minShellVersion: "", protocolScheme: "" }).min_shell_version, "0.1.0")
})
