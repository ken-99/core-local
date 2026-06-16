import type { PluginContext } from '../sdk/types'
import { Plane } from 'lucide-react'
import { AirTrafficTool } from './components/AirTrafficTool'
import { useAirLegend } from './components/useAirLegend'

export function activate(ctx: PluginContext): void {
  ctx.register('map.tools', {
    id: 'air-traffic-toggle',
    label: 'Air Traffic',
    icon: Plane,
    component: AirTrafficTool,
    stayActive: true,
  })
  ctx.register('map.legends', { id: 'air-traffic', title: 'Air Traffic', useLegend: useAirLegend })
}
