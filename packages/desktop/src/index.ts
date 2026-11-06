// The server's half of the desktop shell contract.
//
// The desktop app runs a server of its own, so a server is always there to ask
// what the shell it is talking to must be, and which conversations its tray menu
// lists. It deliberately owns no login and no update feed — authentication is a
// separate plugin (the desktop template ships without it, and the shell must
// work when it is absent), and desktop updates are not wired yet.
//
// Everything the shell needs beyond this is the ordinary dashboard: the panel,
// its plugins and their bundles are served by `@velocelab/dashboard`.
import { Context, Schema, Session } from "yumeri";
import "@velocelab/advanced-chat";

export const depend = ["dashboard", "advanced-chat"];
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

/** One entry of the shell's recent-conversation menu. */
export interface DesktopSessionSummary {
  id: string;
  title: string;
  updated_at: string;
}

interface SessionLike {
  id?: unknown;
  title?: unknown;
  updated_at?: unknown;
  created_at?: unknown;
  visible?: unknown;
  archived?: unknown;
}

/**
 * The conversations worth putting in a tray menu: visible, not archived, most
 * recently active first, and only a handful of them — a menu is not a list.
 */
export function recentSessionSummaries(sessions: SessionLike[], limit = 8): DesktopSessionSummary[] {
  const wanted = Math.max(1, Math.min(20, Math.trunc(limit) || 8));
  return sessions
    .filter((session) => session && session.visible !== false && session.archived !== true)
    .map((session) => ({
      id: String(session.id ?? ""),
      title: String(session.title ?? "").trim(),
      updated_at: String(session.updated_at ?? session.created_at ?? ""),
    }))
    .filter((session) => session.id !== "")
    .sort((left, right) => right.updated_at.localeCompare(left.updated_at))
    .slice(0, wanted);
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
  // The tray menu asks for this on its own schedule, with no page in between, so
  // the answer is the whole contract: ids, titles and when they were last used.
  ctx
    .route("/api/desktop/recent-sessions")
    .methods("GET")
    .action(async (session: Session, query: URLSearchParams) => {
      const chat = ctx.component["advanced-chat"] as
        | { listSessions(userId: number): Promise<SessionLike[]> }
        | undefined;
      if (!chat) {
        session.respond({ sessions: [] }, "json");
        return;
      }
      const userId = Number((session.properties.user as { id?: number } | undefined)?.id ?? 0);
      const sessions = await chat.listSessions(userId);
      session.respond(
        { sessions: recentSessionSummaries(sessions, Number(query.get("limit") ?? "8")) },
        "json",
      );
    });
}
