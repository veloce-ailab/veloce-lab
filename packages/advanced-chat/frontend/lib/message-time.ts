// How a message's send time reads inside the conversation.
//
// The hover row has room for a handful of characters, so the short form shows
// the clock alone only for something sent today: anything older always carries
// its date, and something from another year carries the year as well — a bare
// "09:05" on a week-old message reads as a fresh one, which is the mistake this
// avoids. The exact moment is always available as the element's tooltip.
//
// The locale comes from the UI language rather than the OS: a Chinese interface
// on an English machine must not render "02/27", and a numeric date is
// ambiguous in half the world anyway.

/** BCP 47 locale for one of the app's interface languages. */
export function messageTimeLocale(language: string): string {
  if (language === "zh") return "zh-CN"
  if (language === "ja") return "ja-JP"
  return "en-US"
}

export interface MessageClockOptions {
  /** What "today" is measured against; injectable for tests. */
  now?: Date
  /** Interface locale, from `messageTimeLocale`. */
  locale?: string
}

/** The send time: clock only today, date and clock otherwise, plus the year. */
export function formatMessageClock(value: string, options: MessageClockOptions = {}): string {
  const { now = new Date(), locale } = options
  const date = new Date(value)
  if (!value || Number.isNaN(date.getTime())) return ""
  const clock = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(date)
  if (date.toDateString() === now.toDateString()) return clock
  const sameYear = date.getFullYear() === now.getFullYear()
  const day = new Intl.DateTimeFormat(
    locale,
    sameYear ? { month: "short", day: "numeric" } : { year: "numeric", month: "short", day: "numeric" },
  ).format(date)
  return `${day} ${clock}`
}

/** The full send time, for the tooltip behind that short form. */
export function formatMessageMoment(value: string, locale?: string): string {
  const date = new Date(value)
  if (!value || Number.isNaN(date.getTime())) return ""
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "medium" }).format(date)
}
