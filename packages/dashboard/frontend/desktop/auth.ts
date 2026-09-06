import { getAuthToken } from "@/lib/api"

export function getTokenFromURL() {
  const hash = window.location.hash
  if (hash.startsWith("#token=")) return hash.substring("#token=".length)
  const queryIndex = hash.indexOf("?")
  if (queryIndex >= 0) {
    const token = new URLSearchParams(hash.substring(queryIndex + 1)).get("token")
    if (token) return token
  }
  return new URLSearchParams(window.location.search).get("token")
}

export function hasAuthToken() {
  return Boolean(getAuthToken() || getTokenFromURL())
}
