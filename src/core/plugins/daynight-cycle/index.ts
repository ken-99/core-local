import type { PluginContext } from '../sdk/types'
import { SunMoon } from 'lucide-react'
import { DayNightToolbarIcon } from './components/DayNightToolbarIcon'

export function activate(ctx: PluginContext): void {
  ctx.register('map.tools', {
    id: 'daynight-toggle',
    label: 'Day/Night Cycle',
    icon: SunMoon,
    component: DayNightToolbarIcon,
    stayActive: true,
  })
}
