import assert from "node:assert/strict"
import test from "node:test"
import { sourceUrl } from "../src/dev.ts"

test("a source URL survives a workspace path that is not ASCII", () => {
  const url = sourceUrl("/home/dev/文档/project/veloce-lab/packages/dashboard/frontend/client.ts")
  assert.ok(url.startsWith("/@fs/home/dev/"), url)
  assert.match(url, /%E6%96%87%E6%A1%A3/, url)
  // A raw non-ASCII character in a Location header makes Node throw.
  assert.doesNotMatch(url, /[^\x20-\x7E]/, url)
})

test("a Windows path keeps its drive colon and encodes the rest", () => {
  const url = sourceUrl("C:\\Users\\dev\\project with spaces\\frontend\\client.ts")
  assert.equal(url, "/@fs/C:/Users/dev/project%20with%20spaces/frontend/client.ts")
})

test("a POSIX path loses the leading slash after the /@fs prefix", () => {
  assert.equal(sourceUrl("/home/dev/app/frontend/client.ts"), "/@fs/home/dev/app/frontend/client.ts")
})
