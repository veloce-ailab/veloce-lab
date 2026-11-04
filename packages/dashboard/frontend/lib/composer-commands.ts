import type { DashboardComposerCommand } from "../runtime"

interface ComposerCommandStore {
  commands: Map<string, DashboardComposerCommand>
  listeners: Set<() => void>
}

const globalObject = globalThis as typeof globalThis & { __VELOCE_COMPOSER_COMMANDS__?: ComposerCommandStore }
const store = globalObject.__VELOCE_COMPOSER_COMMANDS__ ??= { commands: new Map(), listeners: new Set() }
const notify = () => store.listeners.forEach((listener) => listener())

export function registerComposerCommand(command: DashboardComposerCommand) {
  if (!command.id.trim() || !command.name.trim()) throw new Error("Composer commands require an id and name")
  const previous = store.commands.get(command.id)
  store.commands.set(command.id, command)
  notify()
  return () => {
    if (store.commands.get(command.id) !== command) return
    if (previous) store.commands.set(command.id, previous)
    else store.commands.delete(command.id)
    notify()
  }
}

export function composerCommands() {
  return [...store.commands.values()]
}

export function subscribeComposerCommands(listener: () => void) {
  store.listeners.add(listener)
  return () => { store.listeners.delete(listener) }
}

export type { DashboardComposerBlock, DashboardComposerCommand, DashboardComposerCommandContext } from "../runtime"
