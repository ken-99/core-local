import type { PluginEntry } from '../sdk/types'
import { Train } from 'lucide-react'
import { PublicTransitTool } from './components/PublicTransitTool'
import { usePublicTransitLegend } from './components/usePublicTransitLegend'

export const activate: PluginEntry['activate'] = (ctx) => {
  ctx.register('map.tools', {
    id: 'public-transit',
    label: 'Public Transit',
    icon: Train,
    component: PublicTransitTool,
  })
  ctx.register('map.legends', {
    id: 'public-transit',
    title: 'Public Transit',
    useLegend: usePublicTransitLegend,
  })
}
