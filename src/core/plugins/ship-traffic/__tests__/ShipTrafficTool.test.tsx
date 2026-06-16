// @vitest-environment jsdom
import * as React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { ShipTrafficTool } from '../components/ShipTrafficTool'
import { useShipLegend } from '../components/useShipLegend'
import { MapContext } from '../../../store/Map/context'
import { AISStreamClient } from '../lib/aisstream'
import { SHIP_CATEGORIES } from '../lib/shipTypes'

// Probe component reads the published legend state from the shared store.
function LegendProbe() {
  const legend = useShipLegend()
  return (
    <div>
      <div data-testid="legend-state">{legend.active ? 'active' : 'inactive'}</div>
      <div data-testid="legend-rows">{legend.rows.map(r => r.label).join('|')}</div>
    </div>
  )
}

// Mock the AISStream client so we don't open a real WebSocket
vi.mock('../lib/aisstream', async () => {
  const actual = await vi.importActual<typeof import('../lib/aisstream')>('../lib/aisstream')
  return {
    ...actual,
    AISStreamClient: vi.fn().mockImplementation(function (
      this: any,
      _key: string,
      _onUpdate: any,
      onStatus?: (s: string) => void,
    ) {
      this.connect = vi.fn(() => onStatus?.('open'))
      this.disconnect = vi.fn(() => onStatus?.('idle'))
      this.getStatus = () => 'open'
    }),
  }
})

function makeFakeMap() {
  const sources: Record<string, unknown> = {}
  const layers: Record<string, unknown> = {}
  const images: Record<string, unknown> = {}
  return {
    isStyleLoaded: () => true,
    once: vi.fn(),
    addSource: vi.fn((id: string, def: unknown) => { sources[id] = def }),
    addLayer: vi.fn((def: any) => { layers[def.id] = def }),
    getSource: vi.fn((id: string) => sources[id]),
    getLayer: vi.fn((id: string) => layers[id]),
    removeSource: vi.fn((id: string) => { delete sources[id] }),
    removeLayer: vi.fn((id: string) => { delete layers[id] }),
    addImage: vi.fn((id: string, img: unknown) => { images[id] = img }),
    hasImage: vi.fn((id: string) => id in images),
    removeImage: vi.fn((id: string) => { delete images[id] }),
  } as any
}

function renderWithMapContext(ui: React.ReactElement) {
  // Minimal MapContext value — we only need .state.map.mapClickManager
  // to be a defined-or-null object so the click-handler effect can register/skip cleanly.
  // Using `null` keeps the click effect inert (early-return) and decouples component tests
  // from MapClickManager internals.
  const value = {
    state: {
      map: {
        mapClickManager: null,
      },
    },
    dispatch: () => null,
  } as any
  return render(<MapContext.Provider value={value}>{ui}</MapContext.Provider>)
}

describe('ShipTrafficTool', () => {
  const ORIGINAL_KEY = process.env.NEXT_PUBLIC_AISSTREAM_API_KEY

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NEXT_PUBLIC_AISSTREAM_API_KEY = 'test-key'
  })
  afterEach(() => {
    process.env.NEXT_PUBLIC_AISSTREAM_API_KEY = ORIGINAL_KEY
  })

  test('renders disabled with "not configured" tooltip when API key missing', () => {
    process.env.NEXT_PUBLIC_AISSTREAM_API_KEY = ''
    renderWithMapContext(<ShipTrafficTool map={makeFakeMap()} />)
    const button = screen.getByRole('button')
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('title', expect.stringMatching(/not configured/i))
  })

  test('renders enabled and tooltip says "off" by default', () => {
    renderWithMapContext(<ShipTrafficTool map={makeFakeMap()} />)
    const button = screen.getByRole('button')
    expect(button).not.toBeDisabled()
    expect(button).toHaveAttribute('title', expect.stringMatching(/off/i))
    expect(button).toHaveAttribute('aria-pressed', 'false')
  })

  test('toggling on adds points and trail sources/layers + triangle icon', () => {
    const map = makeFakeMap()
    renderWithMapContext(<ShipTrafficTool map={map} />)
    fireEvent.click(screen.getByRole('button'))
    expect(map.addImage).toHaveBeenCalledWith('ship-traffic-triangle', expect.any(Object), { sdf: true })
    expect(map.addSource).toHaveBeenCalledWith('ship-traffic-source', expect.any(Object))
    expect(map.addSource).toHaveBeenCalledWith('ship-traffic-trails-source', expect.any(Object))
    expect(map.addLayer).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'ship-traffic-symbols', type: 'symbol' }),
    )
    expect(map.addLayer).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'ship-traffic-trails', type: 'line' }),
    )
  })

  test('toggling off removes both layers, sources, and the icon', () => {
    const map = makeFakeMap()
    renderWithMapContext(<ShipTrafficTool map={map} />)
    const button = screen.getByRole('button')
    fireEvent.click(button) // on
    fireEvent.click(button) // off
    expect(map.removeLayer).toHaveBeenCalledWith('ship-traffic-symbols')
    expect(map.removeLayer).toHaveBeenCalledWith('ship-traffic-trails')
    expect(map.removeSource).toHaveBeenCalledWith('ship-traffic-source')
    expect(map.removeSource).toHaveBeenCalledWith('ship-traffic-trails-source')
    expect(map.removeImage).toHaveBeenCalledWith('ship-traffic-triangle')
  })

  test('toggling on instantiates the AIS client and calls connect', () => {
    renderWithMapContext(<ShipTrafficTool map={makeFakeMap()} />)
    fireEvent.click(screen.getByRole('button'))
    expect(AISStreamClient).toHaveBeenCalledWith('test-key', expect.any(Function), expect.any(Function))
    const instance = vi.mocked(AISStreamClient).mock.instances[0]
    expect(instance.connect).toHaveBeenCalled()
  })

  test('publishes legend active state when enabled, inactive when disabled', () => {
    renderWithMapContext(<ShipTrafficTool map={makeFakeMap()} />)
    render(<LegendProbe />)
    expect(screen.getByTestId('legend-state')).toHaveTextContent('inactive')
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByTestId('legend-state')).toHaveTextContent('active')
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByTestId('legend-state')).toHaveTextContent('inactive')
  })

  test('published legend includes every ship category', () => {
    render(<LegendProbe />)
    const labels = screen.getByTestId('legend-rows').textContent ?? ''
    for (const cat of SHIP_CATEGORIES) {
      expect(labels.split('|')).toContain(cat.label)
    }
  })
})
