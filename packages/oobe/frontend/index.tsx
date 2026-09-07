import { defineExtension } from "@velocelab/dashboard/frontend"
import DesktopAuthorize from "./pages/DesktopAuthorize"
import Login from "./pages/Login"
import Setup from "./pages/Setup"
defineExtension((api) => { api.route({ path: "/setup", component: Setup }); api.route({ path: "/login", component: Login }); api.route({ path: "/desktop/authorize", component: DesktopAuthorize }) })
