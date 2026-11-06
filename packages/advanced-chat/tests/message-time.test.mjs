import assert from "node:assert/strict"
import { test } from "node:test"
import {
  formatMessageClock,
  formatMessageMoment,
  messageTimeLocale,
} from "../frontend/lib/message-time.ts"

const now = new Date(2026, 10, 6, 18, 30) // 2026-11-06, local time
const clock = (value, language = "en", at = now) =>
  formatMessageClock(value, { now: at, locale: messageTimeLocale(language) })
const iso = (year, month, day, hour, minute) => new Date(year, month - 1, day, hour, minute).toISOString()

test("a message sent today shows only its clock time", () => {
  const today = clock(iso(2026, 11, 6, 9, 5))
  assert.match(today, /09:05|9:05/)
  assert.doesNotMatch(today, /2026|Nov|11\/0?6|11-0?6/)
})

test("anything older than today always carries its date", () => {
  for (const older of [
    iso(2026, 11, 5, 9, 5), // yesterday
    iso(2026, 2, 27, 9, 5), // earlier this year
    iso(2024, 12, 31, 23, 50), // another year
  ]) {
    assert.match(clock(older), /2[045]|Nov|Dec|Feb|11|12|02/, `${older} lost its date`)
  }
  // The day itself is there, not just a month.
  assert.match(clock(iso(2026, 2, 27, 9, 5)), /27/)
  assert.match(clock(iso(2026, 11, 5, 9, 5)), /5|05/)
})

test("a message from another year also carries the year", () => {
  const older = clock(iso(2024, 12, 31, 23, 50))
  assert.match(older, /2024/)
  // …while one from this year does not repeat it.
  assert.doesNotMatch(clock(iso(2026, 2, 27, 9, 5)), /2026/)
})

test("the date follows the interface language, not the machine locale", () => {
  const value = iso(2026, 2, 27, 9, 5)
  assert.match(clock(value, "zh"), /2月27日/)
  assert.match(clock(value, "ja"), /2月27日/)
  assert.match(clock(value, "en"), /Feb\s*27/)
  assert.match(clock(iso(2024, 12, 31, 23, 50), "zh"), /2024年12月31日/)
})

test("the exact moment is spelled out for the tooltip", () => {
  const moment = formatMessageMoment(iso(2026, 2, 27, 9, 5), "zh-CN")
  assert.match(moment, /2026/)
  assert.ok(moment.length > clock(iso(2026, 2, 27, 9, 5), "zh").length)
})

test("an unreadable timestamp renders nothing rather than Invalid Date", () => {
  assert.equal(formatMessageClock(""), "")
  assert.equal(formatMessageClock("not a date"), "")
  assert.equal(formatMessageClock(undefined), "")
  assert.equal(formatMessageMoment(""), "")
  assert.equal(formatMessageMoment("nope"), "")
})
