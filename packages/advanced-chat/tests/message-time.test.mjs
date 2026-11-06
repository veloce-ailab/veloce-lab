import assert from "node:assert/strict"
import { test } from "node:test"
import { formatMessageClock, formatMessageMoment } from "../frontend/lib/message-time.ts"

const at = (iso) => new Date(iso)

test("a message sent today shows only its clock time", () => {
  const now = at("2026-03-04T18:30:00")
  const clock = formatMessageClock("2026-03-04T09:05:00", now)
  assert.match(clock, /09:05|9:05/)
  assert.doesNotMatch(clock, /03|04|[A-Za-z]{3}/, clock)
})

test("an older message keeps its date next to the time", () => {
  const now = at("2026-03-04T18:30:00")
  const older = formatMessageClock("2026-02-27T09:05:00", now)
  assert.match(older, /09:05|9:05/)
  assert.match(older, /02|27/, older)
})

test("the exact moment is spelled out for the tooltip", () => {
  const moment = formatMessageMoment("2026-02-27T09:05:00")
  assert.match(moment, /2026/)
  assert.ok(moment.length > formatMessageClock("2026-02-27T09:05:00", at("2026-03-04T18:30:00")).length)
})

test("an unreadable timestamp renders nothing rather than Invalid Date", () => {
  assert.equal(formatMessageClock("", new Date()), "")
  assert.equal(formatMessageClock("not a date", new Date()), "")
  assert.equal(formatMessageClock(undefined, new Date()), "")
  assert.equal(formatMessageMoment(""), "")
  assert.equal(formatMessageMoment("nope"), "")
})
