import type { PluginEntry } from '../sdk/types'
import { Satellite } from 'lucide-react'
import { SentinelImageryTool } from './components/SentinelImageryTool'

export const activate: PluginEntry['activate'] = (ctx) => {
  ctx.register('map.tools', {
    id: 'sentinel-imagery',
    label: 'Sentinel-2 Imagery',
    icon: Satellite,
    component: SentinelImageryTool,
  })
}
