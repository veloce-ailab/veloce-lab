// How a message's send time reads inside the conversation.
//
// The hover row has room for a handful of characters, so the short form drops
// the date for anything sent today and keeps it otherwise; the exact moment is
// always available as the element's tooltip. Kept out of the page module so the
// formatting can be tested without rendering a conversation.

/** The clock time a message was sent: time only today, date and time otherwise. */
export function formatMessageClock(value: string, now: Date = new Date()): string {
  const date = new Date(value)
  if (!value || Number.isNaN(date.getTime())) return ""
  const clock = date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
  if (date.toDateString() === now.toDateString()) return clock
  return `${date.toLocaleDateString(undefined, { month: "2-digit", day: "2-digit" })} ${clock}`
}

/** The full send time, for the tooltip behind that short form. */
export function formatMessageMoment(value: string): string {
  const date = new Date(value)
  if (!value || Number.isNaN(date.getTime())) return ""
  return date.toLocaleString()
}
