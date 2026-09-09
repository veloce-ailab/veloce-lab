import { DashboardContext } from "./extension"
import type { DashboardPlugin } from "./runtime"
export interface DashboardPluginAsset { id: string; url: string; mime?: string; plugin?: string; data?: Record<string, unknown> }
export class DashboardPluginLoader {
  private readonly contexts = new Map<string, DashboardContext>()
  private readonly styles = new Map<string, HTMLLinkElement>()
  async sync(assets: DashboardPluginAsset[]) {
    const scripts = assets.filter((asset) => asset.mime?.includes("javascript") || !asset.mime)
    const next = new Set(scripts.map((asset) => asset.plugin ?? asset.id))
    await Promise.all([...this.contexts].filter(([id]) => !next.has(id)).map(async ([id, context]) => { await context.dispose(); this.contexts.delete(id) }))
    await Promise.all(assets.filter((asset) => asset.mime?.includes("css")).map((asset) => this.loadStyle(asset)))
    for (const [id, link] of this.styles) {
      if (!next.has(link.dataset.dashboardPlugin ?? id)) {
        link.remove()
        this.styles.delete(id)
      }
    }
    await Promise.all(scripts.map(async (asset) => {
      const key = asset.plugin ?? asset.id
      if (this.contexts.has(key)) return
      const module = await import(/* @vite-ignore */ asset.url) as { apply?: DashboardPlugin; default?: DashboardPlugin }
      const plugin = module.apply ?? module.default
      if (typeof plugin !== "function") throw new Error(`Dashboard plugin ${asset.plugin ?? asset.id} does not export apply()`)
      const context = new DashboardContext(undefined, asset.data)
      await context.plugin(plugin)
      this.contexts.set(key, context)
    }))
  }
  private async loadStyle(asset: DashboardPluginAsset) {
    if (this.styles.has(asset.id)) return
    const link = document.createElement("link")
    link.rel = "stylesheet"
    link.href = asset.url
    link.dataset.dashboardPlugin = asset.plugin ?? asset.id
    document.head.appendChild(link)
    this.styles.set(asset.id, link)
  }
  async dispose() {
    for (const context of this.contexts.values()) await context.dispose()
    this.contexts.clear()
    for (const link of this.styles.values()) link.remove()
    this.styles.clear()
  }
}
