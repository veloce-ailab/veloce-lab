import type { DashboardContext } from "@velocelab/dashboard/frontend";

// Desktop integration does not own the notification settings page. The standalone
// notification plugin provides the browser/PWA settings surface for all clients.
export function apply(_ctx: DashboardContext) {}
export default apply
