// @vitest-environment jsdom
/**
 * Component tests for PublicTransitTool. We mock both adapters (no real
 * network), provide a fake MapLibre instance + MapClickManager via
 * MapContext, and exercise toggle / city switch / legend / unregister.
 */
import * as React from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import type { Mock } from 'vitest'
import type maplibregl from 'maplibre-gl'
import { MapContext } from '../../../store/Map/context'

// Adapters MUST be mocked so the test doesn't hit the network.
vi.mock('../lib/adapters/tfl', () => ({
  tflAdapter: {
    id: 'tfl',
    poll: vi.fn().mockResolvedValue([]),
    defaultIntervalMs: 30_000,
  },
}))
vi.mock('../lib/adapters/hslGtfsRt', () => ({
  hslGtfsRtAdapter: {
    id: 'hslGtfsRt',
    poll: vi.fn().mockResolvedValue([]),
    defaultIntervalMs: 10_000,
  },
}))

// maplibre-gl Popup is constructed inside the click handler effect via require().
// We don't trigger that path here, but stub it so any incidental construction
// doesn't blow up jsdom.
vi.mock('maplibre-gl', () => ({
  __esModule: true,
  default: {},
  Popup: vi.fn().mockImplementation(() => ({
    setLngLat: vi.fn().mockReturnThis(),
    setHTML: vi.fn().mockReturnThis(),
    addTo: vi.fn().mockReturnThis(),
    remove: vi.fn(),
  })),
}))

import { PublicTransitTool } from '../components/PublicTransitTool'
import { usePublicTransitLegend } from '../components/usePublicTransitLegend'

// The Tool publishes legend state to a module-singleton store (consumed by the
// shared <MapLegendHost> in a separate React tree). This probe reads that store
// via the plugin's own legend hook so we can assert what the Tool published.
function LegendProbe() {
  const legend = usePublicTransitLegend()
  if (!legend.active) return <div data-testid="legend-state">inactive</div>
  return (
    <div data-testid="legend-state">
      <span data-testid="legend-title">{legend.title}</span>
      {legend.rows.map(r => (
        <span key={r.label}>{r.label}</span>
      ))}
    </div>
  )
}

function makeMockMap() {
  return {
    getSource: vi.fn().mockReturnValue(undefined),
    addSource: vi.fn(),
    removeSource: vi.fn(),
    getLayer: vi.fn().mockReturnValue(undefined),
    addLayer: vi.fn(),
    removeLayer: vi.fn(),
    hasImage: vi.fn().mockReturnValue(false),
    addImage: vi.fn(),
    removeImage: vi.fn(),
    isStyleLoaded: vi.fn().mockReturnValue(true),
    flyTo: vi.fn(),
    getMaxBounds: vi.fn().mockReturnValue(null),
    setMaxBounds: vi.fn(),
    once: vi.fn(),
    off: vi.fn(),
    on: vi.fn(),
  } as unknown as maplibregl.Map
}

function makeMockContext(map: maplibregl.Map) {
  const mapClickManager = {
    register: vi.fn(),
    unregister: vi.fn(),
  }
  return {
    state: {
      map: {
        map,
        mapClickManager,
      },
    },
    dispatch: vi.fn(),
  } as unknown as React.ContextType<typeof MapContext>
}

function getClickManager(ctx: React.ContextType<typeof MapContext>) {
  return (ctx as unknown as {
    state: { map: { mapClickManager: { register: Mock, unregister: Mock } } }
  }).state.map.mapClickManager
}

async function renderTool(map?: maplibregl.Map) {
  const m = map ?? makeMockMap()
  const ctx = makeMockContext(m)
  let utils!: ReturnType<typeof render>
  await act(async () => {
    utils = render(
      <MapContext.Provider value={ctx}>
        <PublicTransitTool tool={null} />
      </MapContext.Provider>,
    )
    await Promise.resolve()
  })
  return { map: m, ctx, utils }
}

async function openPopover() {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /Public Transit/i }))
    await Promise.resolve()
  })
}

async function enableVehicles() {
  await act(async () => {
    fireEvent.click(screen.getByLabelText('Show vehicles'))
    await Promise.resolve()
  })
  // Give the legend's mount effect a tick to set mounted=true.
  await act(async () => { await Promise.resolve() })
}

describe('PublicTransitTool', () => {
  it('renders the toolbar button', async () => {
    await renderTool()
    expect(screen.getByRole('button', { name: /Public Transit/i })).toBeInTheDocument()
  })

  it('toggling the popover reveals city dropdown + show-vehicles checkbox', async () => {
    await renderTool()
    expect(screen.queryByRole('dialog', { name: /Public transit settings/i })).not.toBeInTheDocument()
    await openPopover()
    expect(screen.getByRole('dialog', { name: /Public transit settings/i })).toBeInTheDocument()
    expect(screen.getByRole('combobox')).toBeInTheDocument()
    expect(screen.getByLabelText('Show vehicles')).toBeInTheDocument()
  })

  it('enabling vehicles calls map.flyTo with London center', async () => {
    const { map } = await renderTool()
    await openPopover()
    await enableVehicles()
    expect(map.flyTo).toHaveBeenCalledWith(expect.objectContaining({
      center: [-0.118, 51.509],
    }))
  })

  it('switching city to Helsinki calls flyTo with Helsinki center', async () => {
    const { map } = await renderTool()
    await openPopover()
    await enableVehicles()
    ;(map.flyTo as unknown as Mock).mockClear()
    await act(async () => {
      fireEvent.change(screen.getByRole('combobox'), { target: { value: 'helsinki' } })
      await Promise.resolve()
    })
    expect(map.flyTo).toHaveBeenCalledWith(expect.objectContaining({
      center: [24.945, 60.192],
    }))
  })

  it('disabling vehicles unregisters the click handler', async () => {
    const { ctx } = await renderTool()
    const cm = getClickManager(ctx)
    await openPopover()
    await enableVehicles()
    expect(cm.register).toHaveBeenCalledWith(
      'public-transit-symbols',
      expect.any(Number),
      expect.any(Function),
    )
    await act(async () => {
      fireEvent.click(screen.getByLabelText('Show vehicles'))
      await Promise.resolve()
    })
    expect(cm.unregister).toHaveBeenCalledWith('public-transit-symbols')
  })

  it('publishes active legend state with the city title when enabled', async () => {
    await renderTool()
    await openPopover()
    await enableVehicles()
    let probe!: ReturnType<typeof render>
    await act(async () => { probe = render(<LegendProbe />) })
    expect(probe.getByTestId('legend-title')).toHaveTextContent('London')
  })

  it('does not publish an active legend when disabled', async () => {
    await renderTool()
    await openPopover()
    let probe!: ReturnType<typeof render>
    await act(async () => { probe = render(<LegendProbe />) })
    expect(probe.getByTestId('legend-state')).toHaveTextContent('inactive')
  })
})
