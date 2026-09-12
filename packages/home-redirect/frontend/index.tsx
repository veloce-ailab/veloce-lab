import { Navigate, frameHome, type DashboardContext, type DashboardRoute } from "@velocelab/dashboard/frontend";

/** Where the root lands; the chat frame decides its own landing page. */
const fallbackHomePath = "/chat";

const homeRoute: DashboardRoute = {
  path: "/",
  // `owned` keeps the redirect out of the console chrome, so the root never
  // flashes a sidebar on its way to the chat frame.
  shell: "owned",
  component: () => <Navigate to={frameHome("chat") ?? fallbackHomePath} replace />,
};

export function apply(ctx: DashboardContext) {
  ctx.route(homeRoute);
}

export default apply;
