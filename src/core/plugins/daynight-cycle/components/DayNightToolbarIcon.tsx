// src/plugins/daynight-cycle/components/DayNightToolbarIcon.tsx
'use client'

import * as React from 'react'
import type { Map as MapLibreMap } from 'maplibre-gl'
import { SunMoon, Sun, Moon, Play, Pause } from 'lucide-react'
import { Button, Card, CardContent, CardHeader, CardTitle, Slider } from '../../sdk/components'
import type { MapToolProps } from '../../sdk/types'
import {
  getLight,
  getOverlayOpacity,
  getPresetTime,
  formatTime,
  formatUtcOffset,
  getTimeOffset,
  toDisplayMinutes,
  type Preset,
} from '../lib/sun'

const PRESETS: { key: Preset; label: string; emoji: string }[] = [
  { key: 'dawn',  label: 'Dawn',  emoji: '🌅' },
  { key: 'noon',  label: 'Noon',  emoji: '☀️' },
  { key: 'dusk',  label: 'Dusk',  emoji: '🌇' },
  { key: 'night', label: 'Night', emoji: '🌙' },
]

const OVERLAY_LAYER_ID = 'daynight-overlay'

function removeLayers(map: MapLibreMap): void {
  try {
    if (map.getLayer(OVERLAY_LAYER_ID)) map.removeLayer(OVERLAY_LAYER_ID)
    if (map.getSource(OVERLAY_LAYER_ID)) map.removeSource(OVERLAY_LAYER_ID)
  } catch {
    // Map may already be removed or style reloaded
  }
}

function resetLight(map: MapLibreMap): void {
  try {
    map.setLight({
      anchor: 'viewport',
      color: '#ffffff',
      intensity: 0.6,
      position: [1.15, 0, 0],
    })
  } catch {
    // Map may already be removed or style reloaded
  }
}

export function DayNightToolbarIcon({ map }: MapToolProps) {
  const [isOpen,     setIsOpen]     = React.useState(false)
  const [isEnabled,  setIsEnabled]  = React.useState(false)
  const [timeOfDay,  setTimeOfDay]  = React.useState(720)
  const [isPlaying,  setIsPlaying]  = React.useState(false)
  const [timeOffset, setTimeOffset] = React.useState(0)
  const [mapLng,     setMapLng]     = React.useState(0)

  // Track map center longitude → update solar time offset
  React.useEffect(() => {
    if (!map) return
    const update = () => {
      const lng = map.getCenter().lng
      setMapLng(lng)
      setTimeOffset(getTimeOffset(lng))
    }
    update()
    map.on('moveend', update)
    return () => { map.off('moveend', update) }
  }, [map])

  // Animation loop: 48 min/s = full day in 30 seconds
  React.useEffect(() => {
    if (!isPlaying || !isEnabled) return
    let rafId: number
    let lastTime = performance.now()
    function tick(now: number) {
      const delta = now - lastTime
      lastTime = now
      setTimeOfDay(prev => (prev + (delta / 1000) * 48) % 1440)
      rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [isPlaying, isEnabled])

  // Apply map lighting and overlay
  React.useEffect(() => {
    if (!map || !map.isStyleLoaded()) return

    if (!isEnabled) {
      removeLayers(map)
      resetLight(map)
      return
    }

    const light = getLight(timeOfDay, timeOffset)
    map.setLight({
      anchor: light.anchor,
      color: light.color,
      intensity: light.intensity,
      position: light.position,
    })

    const overlayOpacity = getOverlayOpacity(timeOfDay, timeOffset)
    if (!map.getLayer(OVERLAY_LAYER_ID)) {
      map.addLayer({
        id: OVERLAY_LAYER_ID,
        type: 'background',
        layout: {},
        paint: {
          'background-color': '#000000',
          'background-opacity': overlayOpacity,
        },
      })
    } else {
      map.setPaintProperty(OVERLAY_LAYER_ID, 'background-opacity', overlayOpacity)
    }
  }, [timeOfDay, isEnabled, timeOffset, map])

  // Clean up map layers on unmount
  React.useEffect(() => {
    return () => {
      if (map) {
        removeLayers(map)
        resetLight(map)
      }
    }
  }, [map])

  const displayMinutes = toDisplayMinutes(timeOfDay, timeOffset)

  return (
    <div className="relative">
      {/* Floating control panel above the toolbar */}
      {isOpen && (
        <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 z-50 pointer-events-auto">
          <Card className="w-72 shadow-lg">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {isEnabled && displayMinutes >= 360 && displayMinutes < 1110
                    ? <Sun  className="h-4 w-4 text-amber-400" />
                    : <Moon className="h-4 w-4 text-blue-300" />}
                  <CardTitle className="text-base">Day / Night Cycle</CardTitle>
                </div>
                <Button
                  size="sm"
                  variant={isEnabled ? 'default' : 'outline'}
                  onClick={() => setIsEnabled(!isEnabled)}
                  className="h-6 px-2 text-xs"
                >
                  {isEnabled ? 'On' : 'Off'}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Preset buttons */}
              <div className="flex gap-1.5">
                {PRESETS.map(preset => (
                  <Button
                    key={preset.key}
                    size="sm"
                    variant={
                      isEnabled && timeOfDay === getPresetTime(preset.key, timeOffset)
                        ? 'default'
                        : 'outline'
                    }
                    disabled={!isEnabled}
                    className="flex-1 text-xs px-1"
                    onClick={() => {
                      setTimeOfDay(getPresetTime(preset.key, timeOffset))
                      setIsPlaying(false)
                    }}
                  >
                    {preset.emoji} {preset.label}
                  </Button>
                ))}
              </div>

              {/* Time slider */}
              <div>
                <div className="flex justify-between text-xs text-muted-foreground mb-1">
                  <span>Local Time ({formatUtcOffset(mapLng)})</span>
                  <span className="font-mono">{formatTime(timeOfDay, timeOffset)}</span>
                </div>
                <Slider
                  value={[timeOfDay]}
                  onValueChange={([v]) => {
                    setTimeOfDay(v)
                    setIsPlaying(false)
                  }}
                  min={0}
                  max={1439}
                  step={1}
                  disabled={!isEnabled}
                />
              </div>

              {/* Play / pause */}
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!isEnabled}
                  onClick={() => setIsPlaying(!isPlaying)}
                  className="h-7 w-7 p-0"
                >
                  {isPlaying
                    ? <Pause className="h-3.5 w-3.5" />
                    : <Play  className="h-3.5 w-3.5" />}
                </Button>
                <span className="text-xs text-muted-foreground">
                  {isPlaying ? 'Playing — 30s full cycle' : 'Auto-cycle'}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Toolbar toggle button */}
      <Button
        size="icon"
        variant="ghost"
        className={`flex justify-center items-center h-8 w-7 pointer-events-auto text-primary-dark ${
          isEnabled ? 'bg-primary-dark/15' : ''
        }`}
        onClick={() => setIsOpen(!isOpen)}
        title="Day/Night Cycle"
      >
        <SunMoon className="w-5 h-5" />
      </Button>
    </div>
  )
}
