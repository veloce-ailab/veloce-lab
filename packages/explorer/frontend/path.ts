export interface WorkspaceBreadcrumb { label: string; path: string }

export function workspaceBreadcrumbs(root: string, current: string): WorkspaceBreadcrumb[] {
  if (!root) return []
  const windows = /^(?:[a-z]:[\\/]|\\\\)/i.test(root)
  const separator = windows ? "\\" : "/"
  const trimRoot = (value: string) => {
    const trimmed = value.replace(/[\\/]+$/, "")
    return trimmed || (value.startsWith("/") ? "/" : value.slice(0, 3))
  }
  const base = trimRoot(root)
  const target = trimRoot(current)
  const normalizeForCompare = (value: string) => windows ? value.replace(/\//g, "\\").toLowerCase() : value
  const comparedBase = normalizeForCompare(base)
  const comparedTarget = normalizeForCompare(target)
  const prefix = base.endsWith(separator) ? base : `${base}${separator}`
  const relative = comparedTarget === comparedBase
    ? ""
    : comparedTarget.startsWith(normalizeForCompare(prefix))
      ? target.slice(base.length).replace(/^[\\/]+/, "")
      : ""
  const label = base.split(/[\\/]/).filter(Boolean).at(-1) || base
  const crumbs: WorkspaceBreadcrumb[] = [{ label, path: base }]
  let cursor = base
  for (const part of relative.split(/[\\/]/).filter(Boolean)) {
    cursor = cursor.endsWith("/") || cursor.endsWith("\\") ? `${cursor}${part}` : `${cursor}${separator}${part}`
    crumbs.push({ label: part, path: cursor })
  }
  return crumbs
}
