// Worldwide coastal tide estimate from the EOT20 model (DGFI-TUM, CC BY 4.0),
// cut to ocean cells near a coast by scripts/build-eot20.py. The browser
// fetches only the 5° tiles around the place (a few kB each).
import { createTidePredictor } from '@neaps/tide-predictor'
import { distanceKm, findExtremes, type Prediction } from './tides'

interface Index {
  step: number
  tile: number
  constituents: string[]
  tiles: string[]
}

export interface GridPoint {
  lat: number
  lon: number
  /** Distance from the place to the cell centre, km. */
  km: number
  comps: { name: string; amplitude: number; phase: number }[]
}

/** The model is used only if a coastal cell is this close. */
export const MAX_KM = 40

let index: Promise<Index | null> | null = null
const tiles = new Map<string, Promise<DataView | null>>()

const BASE = './data/eot20/'

function loadIndex(): Promise<Index | null> {
  index ??= fetch(`${BASE}index.json`)
    .then((r) => (r.ok ? (r.json() as Promise<Index>) : null))
    .catch(() => null)
  return index
}

function loadTile(key: string): Promise<DataView | null> {
  let p = tiles.get(key)
  if (!p) {
    p = fetch(`${BASE}${key}.bin`)
      .then((r) => (r.ok ? r.arrayBuffer() : null))
      .then((b) => (b ? new DataView(b) : null))
      .catch(() => null)
    tiles.set(key, p)
  }
  return p
}

const wrapLon = (lon: number) => ((((lon + 180) % 360) + 360) % 360) - 180

/** Tiles around a point: its own and the eight neighbours (a cell up to MAX_KM away can sit in any). */
export function tileKeys(lat: number, lon: number, size: number): string[] {
  const la0 = Math.floor(lat / size) * size
  const lo0 = Math.floor(wrapLon(lon) / size) * size
  const out: string[] = []
  for (const dla of [-size, 0, size])
    for (const dlo of [-size, 0, size]) {
      const la = la0 + dla
      if (la < -90 || la >= 90) continue
      out.push(`${la}_${wrapLon(lo0 + dlo)}`)
    }
  return out
}

/** Decodes one tile into cells. See scripts/build-eot20.py for the layout. */
export function decodeTile(view: DataView, key: string, idx: Pick<Index, 'step' | 'constituents'>) {
  const [la0, lo0] = key.split('_').map(Number)
  const n = idx.constituents.length
  const size = 2 + 4 * n
  const cells: { lat: number; lon: number; off: number }[] = []
  for (let off = 0; off + size <= view.byteLength; off += size)
    cells.push({ lat: la0 + view.getUint8(off) * idx.step, lon: lo0 + view.getUint8(off + 1) * idx.step, off })
  const comps = (off: number) =>
    idx.constituents.map((name, k) => ({
      name,
      amplitude: view.getUint16(off + 2 + 4 * k, true) / 1000, // mm → m
      phase: view.getUint16(off + 4 + 4 * k, true) / 10,
    }))
  return { cells, comps }
}

/** Nearest coastal model cell within MAX_KM, or null (inland or no data). */
export async function loadGridPoint(lat: number, lon: number): Promise<GridPoint | null> {
  const idx = await loadIndex()
  if (!idx) return null
  const have = new Set(idx.tiles)
  let best: GridPoint | null = null
  for (const key of tileKeys(lat, lon, idx.tile).filter((k) => have.has(k))) {
    const view = await loadTile(key)
    if (!view) continue
    const { cells, comps } = decodeTile(view, key, idx)
    for (const c of cells) {
      const km = distanceKm(lat, lon, c.lat, c.lon)
      if (km <= MAX_KM && (!best || km < best.km)) best = { lat: c.lat, lon: c.lon, km, comps: comps(c.off) }
    }
  }
  return best
}

/** Heights about mean sea level from the model constants. */
export function estimate(g: GridPoint, start: number, end: number): Prediction {
  const p = createTidePredictor(g.comps, { offset: 0 })
  const fine = p.getTimelinePrediction({ start: new Date(start), end: new Date(end), timeFidelity: 60 }).map((x) => ({ t: x.time.getTime(), level: x.level }))
  return { extremes: findExtremes(fine), curve: fine.filter((_, i) => i % 10 === 0) }
}
