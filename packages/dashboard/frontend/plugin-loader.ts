import { DashboardContext } from "./extension"
import type { DashboardPlugin } from "./runtime"
export interface DashboardPluginAsset { id: string; url: string; mime?: string; plugin?: string; data?: Record<string, unknown> }
export interface DashboardManifestEntry { id: string; plugin?: string; data?: Record<string, unknown>; files: DashboardPluginAsset[] }
export interface DashboardManifest { revision?: string; entries?: DashboardManifestEntry[]; assets?: DashboardPluginAsset[]; i18n?: Record<string, Record<string, string>> }
export class DashboardPluginLoader {
  private readonly contexts = new Map<string, DashboardContext>()
  private readonly styles = new Map<string, HTMLLinkElement[]>()
  private readonly signatures = new Map<string, string>()
  async sync(input: DashboardManifest | DashboardPluginAsset[]) {
    const entries = Array.isArray(input) ? this.legacyEntries(input) : (input.entries?.length ? input.entries : this.legacyEntries(input.assets ?? []))
    const next = new Set(entries.map((entry) => entry.id))
    for (const [id, context] of [...this.contexts]) {
      if (next.has(id)) continue
      await context.dispose()
      this.contexts.delete(id)
      this.removeStyles(id)
    }
    for (const id of [...this.styles.keys()]) if (!next.has(id)) this.removeStyles(id)
    for (const id of [...this.signatures.keys()]) if (!next.has(id)) this.signatures.delete(id)
    for (const entry of entries) {
      const signature = JSON.stringify({ files: entry.files.map(({ id, url, mime }) => ({ id, url, mime })), data: entry.data })
      if (this.signatures.get(entry.id) === signature) continue
      if (this.contexts.has(entry.id)) {
        await this.contexts.get(entry.id)!.dispose()
        this.contexts.delete(entry.id)
        this.removeStyles(entry.id)
      }
      try {
        for (const asset of entry.files.filter((file) => file.mime?.includes("css"))) this.loadStyle(entry.id, asset)
        const scripts = entry.files.filter((asset) => asset.mime?.includes("javascript") || !asset.mime)
        for (const asset of scripts) await this.loadScript(entry.id, asset)
        this.signatures.set(entry.id, signature)
      } catch (error) {
        this.removeStyles(entry.id)
        console.error(`Failed to load dashboard plugin ${entry.plugin ?? entry.id}`, error)
      }
    }
  }
  private async loadScript(key: string, asset: DashboardPluginAsset) {
      const module = await import(/* @vite-ignore */ asset.url) as { apply?: DashboardPlugin; default?: DashboardPlugin }
      // Koishi entries conventionally default-export the install function. Keep
      // the named `apply` form for existing extensions during the migration.
      const plugin = module.default ?? module.apply
      if (typeof plugin !== "function") throw new Error(`Dashboard plugin ${asset.plugin ?? asset.id} does not export a plugin function`)
      const context = new DashboardContext(undefined, asset.data)
      try {
        await context.plugin(plugin)
      } catch (error) {
        await context.dispose()
        throw error
      }
      this.contexts.set(key, context)
  }
  private loadStyle(key: string, asset: DashboardPluginAsset) {
    const link = document.createElement("link")
    link.rel = "stylesheet"
    link.href = asset.url
    link.dataset.dashboardPlugin = key
    document.head.appendChild(link)
    this.styles.set(key, [...(this.styles.get(key) ?? []), link])
  }
  private removeStyles(key: string) {
    for (const link of this.styles.get(key) ?? []) link.remove()
    this.styles.delete(key)
  }
  private legacyEntries(assets: DashboardPluginAsset[]): DashboardManifestEntry[] {
    const groups = new Map<string, DashboardPluginAsset[]>()
    for (const asset of assets) {
      const key = asset.plugin ?? asset.id
      groups.set(key, [...(groups.get(key) ?? []), asset])
    }
    return [...groups].map(([id, files]) => ({ id, plugin: files[0]?.plugin, data: files[0]?.data, files }))
  }
  async dispose() {
    for (const context of this.contexts.values()) await context.dispose()
    this.contexts.clear()
    for (const links of this.styles.values()) for (const link of links) link.remove()
    this.styles.clear()
    this.signatures.clear()
  }
}
