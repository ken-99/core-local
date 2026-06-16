import { AIRCRAFT_CATEGORIES } from '../lib/aircraftTypes'
import { useAirLegendState } from '../lib/legendStore'
import type { LegendRegistration } from '../../sdk/types'
export const useAirLegend: LegendRegistration['useLegend'] = () => {
  const { active, unavailable, counts } = useAirLegendState()
  return {
    active,
    unavailable,
    rows: AIRCRAFT_CATEGORIES.map(c => ({ label: c.label, color: c.color, count: counts[c.id] ?? 0 })),
  }
}
