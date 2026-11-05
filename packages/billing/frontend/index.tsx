import { DollarSign, Users, type DashboardContext } from "@velocelab/dashboard/frontend";
import ModelPrices from "./pages/ModelPrices";
import UserQuotas from "./pages/UserQuotas";

export function apply(ctx: DashboardContext) {
  ctx.page({
    frame: "settings",
    path: "/settings/model-prices",
    component: ModelPrices,
    nav: { id: "billing.modelPrices", labelKey: "billing.modelPrices", icon: DollarSign, order: 55, scope: "settings", group: { id: "ai", labelKey: "channelAdmin.settingsGroup", order: 20 } },
  });
  // Quotas sit beside the price list but answer a different question: the price list
  // says what a token costs, this says how much of that cost a user may run up.
  ctx.page({
    frame: "settings",
    path: "/settings/user-quotas",
    component: UserQuotas,
    nav: { id: "billing.userQuotas", labelKey: "billing.userQuotas", icon: Users, order: 56, scope: "settings", group: { id: "ai", labelKey: "channelAdmin.settingsGroup", order: 20 } },
  });
}

export default apply;
