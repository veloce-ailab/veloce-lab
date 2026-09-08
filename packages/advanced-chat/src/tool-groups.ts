const groups = new Set(["workspace", "web", "tasks", "ask_user", "memory"]);

export function normalizeDisabledToolGroups(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return [
    ...new Set(
      values
        .map((value) => String(value).trim().toLowerCase())
        .filter((value) => groups.has(value)),
    ),
  ];
}

export function filterToolsByDisabledGroups<T extends { name: string }>(
  tools: T[],
  disabled: unknown,
): T[] {
  const excluded = new Set(normalizeDisabledToolGroups(disabled));
  if (!excluded.size) return tools;
  return tools.filter((tool) => {
    const name = tool.name;
    const group = name.startsWith("memory_")
      ? "memory"
      : name === "ask_user"
        ? "ask_user"
        : name.startsWith("workspace_") ||
            [
              "list_files",
              "read_file",
              "write_file",
              "replace_text",
              "run_command",
            ].includes(name)
          ? "workspace"
          : name.startsWith("web_")
            ? "web"
            : name.startsWith("session_tasks_") || name.startsWith("tasks_")
              ? "tasks"
              : "";
    return !excluded.has(group);
  });
}
