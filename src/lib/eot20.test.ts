import { existsSync, readFileSync } from 'node:fs'
import { decodeTile, estimate, type GridPoint, tileKeys } from './eot20'
import { distanceKm } from './tides'

describe('EOT20 tiles', () => {
  it('wraps tile keys across the antimeridian and stops at the poles', () => {
    expect(tileKeys(-41.3, 179.9, 5)).toEqual(expect.arrayContaining(['-45_175', '-45_-180', '-40_-180', '-40_175']))
    expect(tileKeys(88, 10, 5).every((k) => Number(k.split('_')[0]) < 90)).toBe(true)
  })

  it('decodes the tile layout written by build-eot20.py', () => {
    const idx = { step: 0.125, constituents: ['M2', 'K1'] }
    const buf = new DataView(new ArrayBuffer(2 * (2 + 8)))
    // cell (row 3, col 4): M2 1.234 m at 56.7°, K1 0.1 m at 359.9°
    buf.setUint8(0, 3)
    buf.setUint8(1, 4)
    buf.setUint16(2, 1234, true)
    buf.setUint16(4, 567, true)
    buf.setUint16(6, 100, true)
    buf.setUint16(8, 3599, true)
    buf.setUint8(10, 40)
    buf.setUint8(11, 0)
    const { cells, comps } = decodeTile(buf, '-10_175', idx)
    expect(cells).toHaveLength(2)
    expect(cells[0]).toMatchObject({ lat: -10 + 3 * 0.125, lon: 175 + 4 * 0.125 })
    expect(cells[1]).toMatchObject({ lat: -5, lon: 175 })
    expect(comps(cells[0].off)).toEqual([
      { name: 'M2', amplitude: 1.234, phase: 56.7 },
      { name: 'K1', amplitude: 0.1, phase: 359.9 },
    ])
  })

  it('predicts a pure M2 tide with the right range and period', () => {
    const g: GridPoint = { lat: 0, lon: 0, km: 1, comps: [{ name: 'M2', amplitude: 1, phase: 0 }] }
    const start = Date.UTC(2027, 0, 5)
    const p = estimate(g, start, start + 3 * 86400000)
    const highs = p.extremes.filter((e) => e.high)
    // M2 period 12.42 h: six highs in three days, each about +f·1 m (nodal factor f ≈ 0.96–1.04).
    expect(highs.length).toBeGreaterThanOrEqual(5)
    for (const h of highs) expect(Math.abs(h.level)).toBeGreaterThan(0.9)
    const gaps = highs.slice(1).map((h, i) => (h.t - highs[i].t) / 3600000)
    for (const gap of gaps) expect(gap).toBeCloseTo(12.42, 1)
  })
})

// Grid-vs-gauge sanity on the built tiles (skipped when they are not present, e.g.
// before scripts/build-eot20.py or the Docker stage has put them in public/data/eot20).
const TILES = 'public/data/eot20/index.json'
describe.skipIf(!existsSync(TILES))('EOT20 against official gauges', () => {
  const idx = JSON.parse(existsSync(TILES) ? readFileSync(TILES, 'utf8') : '{}')
  const cell = (lat: number, lon: number) => {
    let best: { km: number; comps: { name: string; amplitude: number; phase: number }[] } | null = null
    for (const k of tileKeys(lat, lon, idx.tile).filter((k: string) => idx.tiles.includes(k))) {
      const b = readFileSync(`public/data/eot20/${k}.bin`)
      const { cells, comps } = decodeTile(new DataView(b.buffer, b.byteOffset, b.byteLength), k, idx)
      for (const c of cells) {
        const km = distanceKm(lat, lon, c.lat, c.lon)
        if (!best || km < best.km) best = { km, comps: comps(c.off) }
      }
    }
    return best!
  }
  const phaseDiff = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180)

  // Kartverket Bergen (BGO), constants of 2006–2020, phases converted from UTC+1 to Greenwich.
  it('matches M2 at Bergen within 10 % and 10°', () => {
    const c = cell(60.398046, 5.320487)
    const m2 = c.comps.find((x) => x.name === 'M2')!
    expect(c.km).toBeLessThan(20)
    expect(Math.abs(m2.amplitude - 0.4536) / 0.4536).toBeLessThan(0.1)
    expect(phaseDiff(m2.phase, 312.52 - 28.98410425)).toBeLessThan(10)
  })
})
