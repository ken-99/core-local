import { SHIP_CATEGORIES } from '../lib/shipTypes'
import { useShipLegendState } from '../lib/legendStore'
import type { LegendRegistration } from '../../sdk/types'
export const useShipLegend: LegendRegistration['useLegend'] = () => {
  const { active, unavailable, counts } = useShipLegendState()
  return {
    active,
    unavailable,
    rows: SHIP_CATEGORIES.map(c => ({ label: c.label, color: c.color, count: counts[c.id] ?? 0 })),
  }
}
