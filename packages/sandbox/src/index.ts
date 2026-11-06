// The sandbox plugin: what "workspace-confined" means at the kernel boundary.
//
// A session's approval mode decides *that* a command is confined; this plugin
// owns *how*, for every capability that runs commands: which backend this host
// can use (bubblewrap, Seatbelt, Landlock), what stays writable, and what a
// refusal looks like. `device-local` and anything else that executes on the
// user's machine depends on this component instead of re-deriving a sandbox.
//
// Configuration lives here rather than in the executor for the same reason: the
// question "may a command write into the toolchain cache?" and "what happens on a
// host with no kernel backend at all?" are properties of the confinement, not of
// the connector that happens to call it.
import { Context, Schema } from "yumeri";
import { Sandbox, type SandboxService } from "./service.js";

export * from "./backends.js";
export * from "./layout.js";
export * from "./refusal.js";
export * from "./service.js";
export { landlockLauncher, landlockSourcePath } from "./landlock.js";

export const depend: string[] = [];
export const provide = ["sandbox"];

export interface SandboxConfig {
  /** Run unconfined on hosts that provide no kernel backend (deployment choice). */
  allowUnsandboxedCommands: boolean;
  /** Extra directories every confined command may write, one per line. */
  writablePaths: string;
}

export const config: Schema<SandboxConfig> = Schema.object({
  allowUnsandboxedCommands: Schema.boolean(
    "Run commands unconfined on hosts that provide no kernel sandbox",
  )
    .key("sandbox.config.allowUnsandboxedCommands")
    .default(false),
  writablePaths: Schema.string(
    "Extra directories a confined command may write, one absolute path per line",
  )
    .key("sandbox.config.writablePaths")
    .default(""),
});

declare module "yumeri" {
  interface Components {
    sandbox: SandboxService;
  }
}

export async function apply(ctx: Context, cfg: SandboxConfig) {
  ctx.i18n({
    sandbox: {
      settings: { zh: "沙箱", en: "Sandbox", ja: "サンドボックス" },
    },
  });
  const service = new Sandbox({
    writableRoots: String(cfg.writablePaths ?? "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean),
    allowUnsandboxed: cfg.allowUnsandboxedCommands === true,
  });
  ctx.registerComponent("sandbox", service);
}
