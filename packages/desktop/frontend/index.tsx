import { defineExtension } from "@velocelab/dashboard/frontend"
import DesktopAuthorize from "./pages/DesktopAuthorize"
defineExtension((api) => { api.route({ path: "/desktop/authorize", component: DesktopAuthorize }) })
