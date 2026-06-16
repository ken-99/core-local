import type { PluginContext } from '../sdk/types'
import { Ship } from 'lucide-react'
import { ShipTrafficTool } from './components/ShipTrafficTool'
import { useShipLegend } from './components/useShipLegend'

export function activate(ctx: PluginContext): void {
  ctx.register('map.tools', {
    id: 'ship-traffic-toggle',
    label: 'Ship Traffic',
    icon: Ship,
    component: ShipTrafficTool,
    stayActive: true,
  })
  ctx.register('map.legends', {
    id: 'ship-traffic',
    title: 'Ship Traffic',
    useLegend: useShipLegend,
  })
}
