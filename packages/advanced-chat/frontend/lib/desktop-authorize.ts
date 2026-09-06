// Helpers for the desktop PKCE authorization flow. The desktop app opens an
// embedded window at /desktop/authorize; if the user still needs to sign in,
// the pending request is stashed in sessionStorage so flows that bounce
// through other pages (OIDC callback lands on /dashboard?token=...) can return
// to the authorize page afterwards.

const stashKey = "veloce.desktop_authorize"
const stashTTLMs = 10 * 60 * 1000

export const desktopAuthCallbackURL = "veloce://desktop-auth/callback"

export const isValidDesktopAuthState = (value: string) => /^[A-Za-z0-9_-]{16,128}$/.test(value)
export const isValidDesktopCodeChallenge = (value: string) => /^[A-Za-z0-9_-]{43}$/.test(value)

export interface DesktopAuthorizeStash {
  state: string
  code_challenge: string
  ts: number
}

export function saveDesktopAuthorizeStash(state: string, codeChallenge: string) {
  try {
    sessionStorage.setItem(stashKey, JSON.stringify({ state, code_challenge: codeChallenge, ts: Date.now() }))
  } catch {
    // Session storage unavailable; the direct return_to path still works.
  }
}

export function readDesktopAuthorizeStash(): DesktopAuthorizeStash | null {
  try {
    const raw = sessionStorage.getItem(stashKey)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<DesktopAuthorizeStash>
    if (
      typeof parsed.state !== "string" ||
      typeof parsed.code_challenge !== "string" ||
      typeof parsed.ts !== "number" ||
      !isValidDesktopAuthState(parsed.state) ||
      !isValidDesktopCodeChallenge(parsed.code_challenge) ||
      Date.now() - parsed.ts > stashTTLMs
    ) {
      sessionStorage.removeItem(stashKey)
      return null
    }
    return { state: parsed.state, code_challenge: parsed.code_challenge, ts: parsed.ts }
  } catch {
    return null
  }
}

export function clearDesktopAuthorizeStash() {
  try {
    sessionStorage.removeItem(stashKey)
  } catch {
    // Ignore.
  }
}

export function desktopAuthorizePath(stash: Pick<DesktopAuthorizeStash, "state" | "code_challenge">) {
  const params = new URLSearchParams({ state: stash.state, code_challenge: stash.code_challenge })
  return `/desktop/authorize?${params.toString()}`
}

// Where to send the user after a successful sign-in on the web app: an explicit
// same-origin return_to wins, then a pending desktop authorization, then the
// dashboard.
export function resolvePostLoginPath() {
  const returnTo = new URLSearchParams(window.location.search).get("return_to") || ""
  if (returnTo.startsWith("/") && !returnTo.startsWith("//")) {
    return returnTo
  }
  const stash = readDesktopAuthorizeStash()
  if (stash) {
    return desktopAuthorizePath(stash)
  }
  return "/chat"
}
