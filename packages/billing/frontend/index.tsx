import { DollarSign, type DashboardContext } from "@velocelab/dashboard/frontend";
import ModelPrices from "./pages/ModelPrices";

export function apply(ctx: DashboardContext) {
  ctx.page({
    frame: "settings",
    path: "/settings/model-prices",
    component: ModelPrices,
    nav: { id: "billing.modelPrices", labelKey: "billing.modelPrices", icon: DollarSign, order: 55, scope: "settings", group: { id: "ai", labelKey: "channelAdmin.settingsGroup", order: 20 } },
  });
}

export default apply;
