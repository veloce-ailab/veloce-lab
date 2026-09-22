import { Context, Schema, Session } from "yumeri";
import "@velocelab/dashboard";

export const depend = ["dashboard"];
export const provide = ["pwa"];
export interface PWAConfig { name: string; shortName: string; description: string; themeColor: string; backgroundColor: string; iconUrl: string; maskableIconUrl: string; startUrl: string; display: "standalone" | "fullscreen" | "minimal-ui" | "browser" }
export const config: Schema<PWAConfig> = Schema.object({
  name: Schema.string("Installed application name").key("pwa.config.name").default("Veloce"),
  shortName: Schema.string("Short installed application name").key("pwa.config.shortName").default("Veloce"),
  description: Schema.string("Application description").key("pwa.config.description").default("Veloce AI workspace"),
  themeColor: Schema.string("Browser and application theme color").key("pwa.config.themeColor").default("#09090b"),
  backgroundColor: Schema.string("Splash screen background color").key("pwa.config.backgroundColor").default("#09090b"),
  iconUrl: Schema.string("192px or larger application icon URL").key("pwa.config.iconUrl").default("/logo.png"),
  maskableIconUrl: Schema.string("Maskable application icon URL; leave equal to icon URL when unavailable").key("pwa.config.maskableIconUrl").default("/logo.png"),
  startUrl: Schema.string("Application start URL").key("pwa.config.startUrl").default("/"),
  display: Schema.enum(["standalone", "fullscreen", "minimal-ui", "browser"], "Installed application display mode").key("pwa.config.display").default("standalone"),
});
function safePath(value: string) { return value.startsWith("/") && !value.startsWith("//") ? value : "/" }
export function apply(ctx: Context, cfg: PWAConfig) {
  ctx.component.dashboard.addEntry({ dev: new URL("../frontend/index.tsx", import.meta.url).pathname, prod: new URL("./frontend/pwa.js", import.meta.url).pathname, plugin: "pwa", data: { themeColor: cfg.themeColor, iconUrl: cfg.iconUrl } });
  ctx.route("/pwa-manifest.webmanifest").methods("GET").action((session: Session) => { session.setMime("application/manifest+json; charset=utf-8"); session.respond({ name: cfg.name, short_name: cfg.shortName, description: cfg.description, start_url: safePath(cfg.startUrl), scope: "/", display: cfg.display, theme_color: cfg.themeColor, background_color: cfg.backgroundColor, icons: [{ src: cfg.iconUrl, sizes: "192x192", type: "image/png" }, { src: cfg.maskableIconUrl || cfg.iconUrl, sizes: "512x512", type: "image/png", purpose: "any maskable" }] }, "json"); });
  ctx.route("/pwa-service-worker.js").methods("GET").action((session: Session) => { session.setMime("application/javascript; charset=utf-8"); session.head["Cache-Control"] = "no-cache"; session.respond("const CACHE='veloce-pwa-v1';self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.add('/'))));self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));self.addEventListener('fetch',event=>{if(event.request.method!=='GET'||new URL(event.request.url).origin!==self.location.origin)return;event.respondWith(fetch(event.request).catch(()=>caches.match(event.request).then(hit=>hit||caches.match('/'))))});", "plain"); });
}
