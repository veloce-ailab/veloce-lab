// Path rules for the workspace picker. Pure, and kept out of the page so they
// can be checked directly: the mistake they fix was invisible in the UI —
// "up" stopped at a drive root and there was no way back to This PC, so the
// drives could only be seen before a workspace had ever been chosen.

/** The device pages compare against a name, not the Node platform spelling. */
export function workspacePickerIsWindows(os?: string) {
  const value = os?.toLowerCase()
  return value === "windows" || value === "win32"
}

/** `C:` / `C:\` — a drive root, which on Windows behaves like nothing else. */
export function workspacePickerIsDriveRoot(path: string) {
  return /^[a-z]:[\\/]?$/i.test(path)
}

/**
 * Whether the up control means anything here. An empty path is This PC, the
 * top; on Windows a drive root is not the top, because This PC is what lists
 * the drives.
 */
export function workspacePickerCanGoUp(path: string, os?: string) {
  if (!path) {
    return false
  }
  if (workspacePickerIsWindows(os)) {
    return true
  }
  return path !== "/"
}

/** The folder one level up, with This PC (an empty path) above a drive. */
export function workspacePickerParentPath(path: string, os?: string) {
  if (!workspacePickerCanGoUp(path, os)) {
    return path
  }
  if (workspacePickerIsWindows(os)) {
    const normalized = path.replace(/\//g, "\\").replace(/\\+$/, "")
    if (workspacePickerIsDriveRoot(normalized)) {
      return ""
    }
    const separatorIndex = normalized.lastIndexOf("\\")
    return separatorIndex <= 2 ? normalized.slice(0, 3) : normalized.slice(0, separatorIndex)
  }
  const separatorIndex = path.replace(/\/+$/, "").lastIndexOf("/")
  return separatorIndex <= 0 ? "/" : path.slice(0, separatorIndex)
}
