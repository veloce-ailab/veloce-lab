/** Keep the first registration so the advertised schema and executor agree. */
export function uniqueToolsByName<T extends { name: string }>(tools: T[]): T[] {
  const names = new Set<string>();
  return tools.filter((tool) => {
    if (names.has(tool.name)) return false;
    names.add(tool.name);
    return true;
  });
}
