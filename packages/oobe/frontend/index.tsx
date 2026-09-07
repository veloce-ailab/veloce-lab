import { defineExtension } from "@velocelab/dashboard/frontend"
import Setup from "./pages/Setup"
defineExtension((api) => { api.route({ path: "/setup", component: Setup }) })
