// The server's half of the desktop shell contract.
//
// The desktop app runs a server of its own, so a server is always there to ask
// what the shell it is talking to must be: this plugin answers that and nothing
// else. It deliberately owns no login and no update feed — authentication is a
// separate plugin (the desktop template ships without it, and the shell must
// work when it is absent), and desktop updates are not wired yet.
//
// Everything the shell needs beyond this is the ordinary dashboard: the panel,
// its plugins and their bundles are served by `@velocelab/dashboard`.
import { Context, Schema, Session } from "yumeri";

export const depend = ["dashboard"];
export const provide = ["desktop"];

export interface DesktopConfig {
  /** Oldest desktop shell this server still supports. */
  minShellVersion: string;
  /** URL scheme the desktop app registers for OS notifications. */
  protocolScheme: string;
}

export const config: Schema<DesktopConfig> = Schema.object({
  minShellVersion: Schema.string("Oldest desktop shell this server still supports")
    .key("desktop.config.minShellVersion")
    .default("0.1.0"),
  protocolScheme: Schema.string("URL scheme the desktop app registers for OS notifications")
    .key("desktop.config.protocolScheme")
    .default("veloce"),
});

export interface DesktopBootstrap {
  app_name: string;
  protocol_scheme: string;
  min_shell_version: string;
}

/**
 * What the shell is told before it loads the panel. A shell that cannot reach
 * this endpoint keeps its own defaults, so the plugin is optional by design.
 */
export function desktopBootstrap(cfg: DesktopConfig): DesktopBootstrap {
  return {
    app_name: "Veloce Lab",
    protocol_scheme: String(cfg.protocolScheme ?? "").trim().replace(/[^a-z0-9+.-]/gi, "") || "veloce",
    min_shell_version: String(cfg.minShellVersion ?? "").trim() || "0.1.0",
  };
}

declare module "yumeri" {
  interface Components {
    desktop: { bootstrap(): DesktopBootstrap };
  }
}

export async function apply(ctx: Context, cfg: DesktopConfig) {
  ctx.i18n({
    desktop: {
      settings: { zh: "桌面端", en: "Desktop", ja: "デスクトップ" },
    },
  });
  const bootstrap = () => desktopBootstrap(cfg);
  ctx.registerComponent("desktop", { bootstrap });
  ctx
    .route("/api/desktop/bootstrap")
    .methods("GET")
    .action((session: Session) => {
      session.respond(bootstrap(), "json");
    });
}
