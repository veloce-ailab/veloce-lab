import assert from "node:assert/strict"
import { test } from "node:test"
import { recentSessionSummaries } from "../dist/index.js"

const session = (id, title, updated, extra = {}) => ({ id, title, updated_at: updated, visible: true, ...extra })

test("the newest conversations come first and the limit is honoured", () => {
  const summaries = recentSessionSummaries([
    session("a", "older", "2026-03-01T10:00:00.000Z"),
    session("b", "newest", "2026-03-03T10:00:00.000Z"),
    session("c", "middle", "2026-03-02T10:00:00.000Z"),
  ], 2)
  assert.deepEqual(summaries.map((item) => item.title), ["newest", "middle"])
  assert.deepEqual(Object.keys(summaries[0]).sort(), ["id", "title", "updated_at"])
})

test("hidden and archived conversations stay out of the menu", () => {
  const summaries = recentSessionSummaries([
    session("a", "shown", "2026-03-03T10:00:00.000Z"),
    session("b", "hidden", "2026-03-03T11:00:00.000Z", { visible: false }),
    session("c", "archived", "2026-03-03T12:00:00.000Z", { archived: true }),
    session("", "no id", "2026-03-03T13:00:00.000Z"),
  ])
  assert.deepEqual(summaries.map((item) => item.id), ["a"])
})

test("a conversation without a title still has an entry to click", () => {
  const [entry] = recentSessionSummaries([session("a", "   ", "2026-03-03T10:00:00.000Z")])
  assert.equal(entry.id, "a")
  assert.equal(entry.title, "")
})

test("the limit is clamped to something a menu can show", () => {
  const many = Array.from({ length: 40 }, (_, index) => session(`id-${index}`, `t${index}`, `2026-03-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`))
  assert.equal(recentSessionSummaries(many, 999).length, 20)
  assert.equal(recentSessionSummaries(many, 0).length, 8)
})
