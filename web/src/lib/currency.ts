import { useQuery } from "@tanstack/react-query"
import api from "@/lib/api"
import type { PublicSettings } from "@/lib/public-settings"
import { withPublicSettingsDefaults } from "@/lib/public-settings"

export function useCurrencyDisplayName() {
  const { data: settings } = useQuery<Partial<PublicSettings>>({
    queryKey: ["public-settings"],
    queryFn: async () => (await api.get("/public/settings")).data,
  })
  return withPublicSettingsDefaults(settings).payment_currency_display_name
}

export function formatCurrency(value: string | number, currency: string) {
  return `${currency}${value}`
}
