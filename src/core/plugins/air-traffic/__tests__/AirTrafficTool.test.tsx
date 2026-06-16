// @vitest-environment jsdom
/**
 * Component tests for AirTrafficTool. We mock MapLibre's runtime (no real map),
 * the OpenSkyClient (no real fetch), and exercise toggle / mount / click.
 */
import * as React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import type { Mock } from 'vitest'
import { MapContext } from '../../../store/Map/context'
import { MapLayerClickPriority } from '../../../components/viewers/map/utils/MapEventManager/MapClickManager'

// Mock the OpenSky client — we don't want any real fetches.
let lastClient: { start: Mock, stop: Mock } | null = null
let lastOnUpdate: ((u: unknown) => void) | null = null
vi.mock('../lib/opensky', async () => {
  const actual = await vi.importActual<typeof import('../lib/opensky')>('../lib/opensky')
  return {
    ...actual,
    OpenSkyClient: vi.fn().mockImplementation(function (onUpdate: (u: unknown) => void) {
      lastOnUpdate = onUpdate
      lastClient = { start: vi.fn(), stop: vi.fn() }
      return lastClient
    }),
  }
})

// Mock maplibre-gl Popup — we just want to assert it's constructed correctly.
const popupRemove = vi.fn()
const popupSetLngLat = vi.fn().mockReturnThis()
const popupSetHTML = vi.fn().mockReturnThis()
const popupAddTo = vi.fn().mockReturnThis()
vi.mock('maplibre-gl', () => ({
  __esModule: true,
  default: {},
  Popup: vi.fn().mockImplementation(() => ({
    setLngLat: popupSetLngLat,
    setHTML: popupSetHTML,
    addTo: popupAddTo,
    remove: popupRemove,
  })),
}))

import { AirTrafficTool } from '../components/AirTrafficTool'
import { useAirLegend } from '../components/useAirLegend'

// Probe component reads the published legend state from the shared store.
function LegendProbe() {
  const legend = useAirLegend()
  return <div data-testid="legend-state">{legend.active ? 'active' : 'inactive'}</div>
}

function makeMockMap() {
  const layers = new Map<string, unknown>()
  const sources = new Map<string, { setData: Mock }>()
  const images = new Set<string>()
  return {
    isStyleLoaded: () => true,
    once: vi.fn(),
    off: vi.fn(),
    hasImage: (id: string) => images.has(id),
    addImage: vi.fn((id: string) => { images.add(id) }),
    removeImage: vi.fn((id: string) => { images.delete(id) }),
    getSource: (id: string) => sources.get(id),
    addSource: vi.fn((id: string) => { sources.set(id, { setData: vi.fn() }) }),
    removeSource: vi.fn((id: string) => { sources.delete(id) }),
    getLayer: (id: string) => layers.get(id),
    addLayer: vi.fn((spec: { id: string }) => { layers.set(spec.id, spec) }),
    removeLayer: vi.fn((id: string) => { layers.delete(id) }),
    _layers: layers,
    _sources: sources,
  }
}

function makeMockClickManager() {
  const handlers = new Map<string, { priority: number, cb: unknown }>()
  return {
    register: vi.fn((layerId: string, priority: number, cb: unknown) => {
      handlers.set(layerId, { priority, cb })
    }),
    unregister: vi.fn((layerId: string) => {
      handlers.delete(layerId)
    }),
    _handlers: handlers,
  }
}

function renderTool(mapOverride?: ReturnType<typeof makeMockMap>) {
  const map = mapOverride ?? makeMockMap()
  const clickManager = makeMockClickManager()
  const ctxValue = {
    state: { map: { mapClickManager: clickManager } },
    dispatch: vi.fn(),
  }
  return {
    ...render(
      <MapContext.Provider value={ctxValue as never}>
        <AirTrafficTool map={map as never} />
      </MapContext.Provider>,
    ),
    map,
    clickManager,
  }
}

describe('AirTrafficTool', () => {
  beforeEach(() => {
    lastClient = null
    lastOnUpdate = null
    popupRemove.mockClear()
    popupSetLngLat.mockClear()
    popupSetHTML.mockClear()
    popupAddTo.mockClear()
  })

  it('renders a toggle button', () => {
    renderTool()
    expect(screen.getByRole('button', { name: /Air Traffic/i })).toBeInTheDocument()
  })

  it('starts the OpenSky client on enable, stops on disable', () => {
    const { rerender } = renderTool()
    fireEvent.click(screen.getByRole('button', { name: /Air Traffic/i }))
    expect(lastClient?.start).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: /Air Traffic/i }))
    expect(lastClient?.stop).toHaveBeenCalledTimes(1)
  })

  it('mounts source + symbol layer + trail layer when enabled', () => {
    const { map } = renderTool()
    fireEvent.click(screen.getByRole('button', { name: /Air Traffic/i }))
    expect(map.addSource).toHaveBeenCalledWith('air-traffic-source', expect.objectContaining({ type: 'geojson' }))
    expect(map.addSource).toHaveBeenCalledWith('air-traffic-trails-source', expect.objectContaining({ type: 'geojson' }))
    expect(map.addLayer).toHaveBeenCalledWith(expect.objectContaining({ id: 'air-traffic-symbols' }))
    expect(map.addLayer).toHaveBeenCalledWith(expect.objectContaining({ id: 'air-traffic-trails' }))
  })

  it('symbol layer has on_ground filter', () => {
    const { map } = renderTool()
    fireEvent.click(screen.getByRole('button', { name: /Air Traffic/i }))
    const symbolCall = map.addLayer.mock.calls.find(c => (c[0] as { id: string }).id === 'air-traffic-symbols')!
    const spec = symbolCall[0] as unknown as { filter: unknown }
    expect(spec.filter).toEqual(['==', ['get', 'on_ground'], false])
  })

  it('registers the click handler at AirTrafficClickPriority (376)', () => {
    const { clickManager } = renderTool()
    fireEvent.click(screen.getByRole('button', { name: /Air Traffic/i }))
    expect(clickManager.register).toHaveBeenCalledWith(
      'air-traffic-symbols',
      MapLayerClickPriority.AirTrafficClickPriority,
      expect.any(Function),
    )
    expect(MapLayerClickPriority.AirTrafficClickPriority).toBe(376)
  })

  it('unregisters click handler on disable', () => {
    const { clickManager } = renderTool()
    fireEvent.click(screen.getByRole('button', { name: /Air Traffic/i }))
    fireEvent.click(screen.getByRole('button', { name: /Air Traffic/i }))
    expect(clickManager.unregister).toHaveBeenCalledWith('air-traffic-symbols')
  })

  it('publishes legend active state when enabled, inactive when disabled', () => {
    renderTool()
    render(<LegendProbe />)
    expect(screen.getByTestId('legend-state')).toHaveTextContent('inactive')
    fireEvent.click(screen.getByRole('button', { name: /Air Traffic/i }))
    expect(screen.getByTestId('legend-state')).toHaveTextContent('active')
    fireEvent.click(screen.getByRole('button', { name: /Air Traffic/i }))
    expect(screen.getByTestId('legend-state')).toHaveTextContent('inactive')
  })

  it('removes layers and sources on disable', () => {
    const { map } = renderTool()
    fireEvent.click(screen.getByRole('button', { name: /Air Traffic/i }))
    fireEvent.click(screen.getByRole('button', { name: /Air Traffic/i }))
    expect(map.removeLayer).toHaveBeenCalledWith('air-traffic-symbols')
    expect(map.removeLayer).toHaveBeenCalledWith('air-traffic-trails')
    expect(map.removeSource).toHaveBeenCalledWith('air-traffic-source')
    expect(map.removeSource).toHaveBeenCalledWith('air-traffic-trails-source')
  })
})
