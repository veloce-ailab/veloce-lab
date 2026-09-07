import { defineExtension } from "@velocelab/dashboard/frontend"
import Login from "./pages/Login"
defineExtension((api) => { api.route({ path: "/login", component: Login }) })
