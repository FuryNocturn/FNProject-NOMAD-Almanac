import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { NEGLIGIBLE_M, type Extreme, type TideData, nearest, precision, predict, range, roundLevel, roundTime } from './tides'

// Official predictions downloaded by scripts/fetch-tides.mjs into data-src/tide-checks/
// are the oracle: our predictions from the bundled constants must reproduce them.
const CHECKS = 'data-src/tide-checks'
const data: TideData = JSON.parse(readFileSync('public/data/tides.json', 'utf8'))
const START = Date.UTC(2027, 0, 5)
const END = Date.UTC(2027, 0, 11)

/** Pairs each official extreme with ours of the same kind nearest in time; returns the worst errors. */
function compare(official: Extreme[], ours: Extreme[]) {
  let dt = 0
  let dh = 0
  for (const o of official) {
    const m = ours.filter((x) => x.high === o.high).sort((a, b) => Math.abs(a.t - o.t) - Math.abs(b.t - o.t))[0]
    expect(m, `no ${o.high ? 'high' : 'low'} near ${new Date(o.t).toISOString()}`).toBeDefined()
    dt = Math.max(dt, Math.abs(m.t - o.t) / 60000)
    dh = Math.max(dh, Math.abs(m.level - o.level))
  }
  return { dt, dh }
}

const files = existsSync(CHECKS) ? readdirSync(CHECKS) : []

describe('NOAA stations against NOAA predictions (MLLW)', () => {
  const noaa = files.filter((f) => f.startsWith('noaa-'))
  it('has check files', () => expect(noaa.length).toBeGreaterThanOrEqual(7))
  it.each(noaa)('%s', (f) => {
    const id = `noaa:${f.slice(5, -5)}`
    const st = data.s.find((s) => s.id === id)!
    expect(st, id).toBeDefined()
    const official: Extreme[] = JSON.parse(readFileSync(`${CHECKS}/${f}`, 'utf8')).predictions.map((p: { t: string; v: string; type: string }) => ({
      t: Date.parse(p.t.replace(' ', 'T') + 'Z'),
      level: Number(p.v),
      high: p.type === 'H',
    }))
    // Compare only real turns of the tide: official extremes at least 5 cm from both neighbours.
    const inner = official.filter(
      (o, i) =>
        o.t > START + 6 * 3600000 &&
        o.t < END - 6 * 3600000 &&
        Math.min(Math.abs(o.level - (official[i - 1]?.level ?? Infinity)), Math.abs(o.level - (official[i + 1]?.level ?? Infinity))) >= 0.05,
    )
    const ours = predict(data, st, START, END).extremes
    // About as many highs and lows as NOAA's table. In mixed tides (Galveston) NOAA
    // also lists pairs a few millimetres apart; with the engine's few-centimetre
    // difference some of those ripples vanish, so up to 4 in 6 days may be missing.
    const n = official.filter((o) => o.t >= START && o.t < END).length
    expect(ours.length).toBeLessThanOrEqual(n)
    expect(ours.length).toBeGreaterThanOrEqual(n - 4)
    const { dt, dh } = compare(inner, ours)
    // The engine defines a few small constituents (T2, LAMBDA2, MU2, MSN2…) the IHO
    // way while NOAA uses Schureman's, so even with NOAA's own constants results
    // differ by minutes and by a few per cent of the range (Anchorage, 9 m range:
    // up to ~35 cm). This is why the display rounds to 5 minutes (tides.ts precision).
    const span = Math.max(...official.map((o) => o.level)) - Math.min(...official.map((o) => o.level))
    expect(dt).toBeLessThanOrEqual(st.ref ? 16 : 12) // subordinate: reference error plus offsets
    expect(dh).toBeLessThanOrEqual(Math.max(0.06, 0.045 * span))
  })
})

describe('Kartverket stations against Kartverket predictions (MSL)', () => {
  const kv = files.filter((f) => f.startsWith('kv-'))
  it('has check files', () => expect(kv.length).toBeGreaterThanOrEqual(3))
  it.each(kv)('%s', (f) => {
    const st = data.s.find((s) => s.id === `kv:${f.slice(3, -4)}`)!
    expect(st).toBeDefined()
    const xml = readFileSync(`${CHECKS}/${f}`, 'utf8')
    const official: Extreme[] = [...xml.matchAll(/<waterlevel value="([\d.-]+)" time="([^"]+)" flag="(high|low)"/g)].map((m) => ({
      t: Date.parse(m[2]),
      level: Number(m[1]) / 100,
      high: m[3] === 'high',
    }))
    expect(official.length).toBeGreaterThan(10)
    const inner = official.filter((o) => o.t > START + 6 * 3600000 && o.t < END - 6 * 3600000)
    const { dt, dh } = compare(inner, predict(data, st, START, END).extremes)
    // Known weak spot: Oslo, inner fjord, M2 only 15 cm and very flat highs and lows;
    // two Kartverket constituents the engine lacks (H1, H2, ~1.7 cm each) and the
    // flatness give up to ~50 min and ~10 cm. Planning use only, rounded to 5 min / 10 cm.
    const weak = f === 'kv-OSL.xml'
    expect(dt).toBeLessThanOrEqual(weak ? 60 : 12)
    expect(dh).toBeLessThanOrEqual(weak ? 0.12 : 0.05)
  })
})

describe('station choice and display policy', () => {
  it('finds Seattle as the nearest station to downtown Seattle', () => {
    const [first] = nearest(data, 47.6062, -122.3321, 3)
    expect(first.km).toBeLessThan(5)
  })
  it('uses minute/centimetre only with an official chart datum', () => {
    const noaa = data.s.find((s) => s.id === 'noaa:9447130')!
    const kv = data.s.find((s) => s.s === 'kv')!
    expect(precision(noaa)).toEqual({ minutes: 5, metres: 0.05 })
    expect(precision(kv)).toEqual({ minutes: 5, metres: 0.1 })
    expect(roundTime(Date.UTC(2027, 0, 1, 10, 7, 40), 5)).toBe(Date.UTC(2027, 0, 1, 10, 10))
    expect(roundLevel(1.234, 0.1)).toBeCloseTo(1.2)
  })
  it('measures the range between consecutive extremes', () => {
    expect(range([{ t: 0, level: 1, high: true }, { t: 1, level: -0.5, high: false }, { t: 2, level: 0.8, high: true }])).toBeCloseTo(1.5)
    expect(NEGLIGIBLE_M).toBe(0.1)
  })
})
