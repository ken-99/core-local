import { MODE_PALETTE, modeLabel } from '../lib/modes'
import { useTransitLegendState } from '../lib/legendStore'
import type { LegendRegistration } from '../../sdk/types'

export const usePublicTransitLegend: LegendRegistration['useLegend'] = () => {
  const { active, title, modes, counts, unavailable } = useTransitLegendState()
  return {
    active,
    title,
    unavailable,
    rows: modes.map(m => ({
      label: modeLabel(m),
      color: MODE_PALETTE[m],
      count: counts[m] ?? 0,
    })),
  }
}
