'use client'

import * as React from 'react'
import * as LR from 'lucide-react'
import { Toggle } from '../../../../../../../ui/Toggle'
import { MapContext } from '../../../../../../../../store'
import { setPoiIconsVisible } from '../../../../../utils/poiIcons'

export function PoiIcons() {
  const { dispatch: mapDispatch, state: mapState } = React.useContext(MapContext)
  const { map, showPoiIcons, mapStyle } = mapState.map

  // The `poi` layer only exists on the CDT basemaps, so only show this control there.
  const isCdtBasemap = Boolean(mapStyle?.name?.startsWith('CDT Basemap'))

  // Apply the current setting to the live map, and re-apply after a basemap swap
  // (setStyle rebuilds all layers, so `styledata` is when the `poi` layer reappears).
  React.useEffect(() => {
    if (!map) return
    const apply = () => setPoiIconsVisible(map, showPoiIcons)
    if (map.isStyleLoaded()) apply()
    map.on('styledata', apply)
    return () => {
      try {
        map.off('styledata', apply)
      } catch {
        // map may already be destroyed
      }
    }
  }, [map, showPoiIcons, mapStyle])

  if (!isCdtBasemap) return null

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">Points of interest</label>
      <Toggle
        variant="outline"
        pressed={showPoiIcons}
        onPressedChange={pressed =>
          mapDispatch({ type: 'UPDATE_SHOW_POI_ICONS', payload: { showPoiIcons: pressed } })
        }
        className="w-full justify-start"
        aria-label="Toggle points of interest icons"
      >
        <LR.MapPin className="w-4 h-4 mr-2" />
        {showPoiIcons ? 'Icons shown' : 'Icons hidden'}
      </Toggle>
    </div>
  )
}
