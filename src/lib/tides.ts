// Tide predictions at official stations, from the constants bundled in
// public/data/tides.json (scripts/build-tides.mjs), on @neaps/tide-predictor.
import { createTidePredictor } from '@neaps/tide-predictor'

export type Source = 'noaa' | 'kv' | 'linz' | 'eot20'

export interface Station {
  id: string
  n: string
  la: number
  lo: number
  s: Source
  /** Mean sea level above the chart datum, m (0 when heights are about MSL). */
  z0?: number
  /** Chart datum the heights refer to, or null for mean sea level. */
  cd: string | null
  /** [constituent index, amplitude m, Greenwich phase °]. */
  h?: [number, number, number][]
  /** Subordinate station: reference station id and official offsets. */
  ref?: string
  /** [time high min, time low min, height high, height low, 'R' ratio | 'F' fixed]. */
  o?: [number, number, number, number, 'R' | 'F']
}

export interface TideData {
  c: string[]
  s: Station[]
}

export interface Extreme {
  t: number
  level: number
  high: boolean
}

export interface Prediction {
  extremes: Extreme[]
  /** Water level every 10 minutes (subordinate stations: from the reference station, shifted). */
  curve: { t: number; level: number }[]
}

// NOAA publishes fixed subordinate height offsets in feet (the tidepredoffsets
// service has no units switch); checked against NOAA's own predictions in tides.test.ts.
const FIXED_UNIT = 0.3048

const R_EARTH = 6371.0088
export function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const r = Math.PI / 180
  const a = Math.sin(((lat2 - lat1) * r) / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(((lon2 - lon1) * r) / 2) ** 2
  return 2 * R_EARTH * Math.asin(Math.min(1, Math.sqrt(a)))
}

/** Stations sorted by distance, nearest first. */
export function nearest(data: TideData, lat: number, lon: number, count = 8): { st: Station; km: number }[] {
  return data.s
    .map((st) => ({ st, km: distanceKm(lat, lon, st.la, st.lo) }))
    .sort((a, b) => a.km - b.km)
    .slice(0, count)
}

/** A station is chosen automatically only this close; further away the user picks or the model estimate is used. */
export const AUTO_KM = 40

function constituentsOf(data: TideData, st: Station) {
  return st.h!.map(([i, amplitude, phase]) => ({ name: data.c[i], amplitude, phase }))
}

/**
 * Highs and lows that differ from a neighbour by less than this are dropped. NOAA's
 * own tables keep pairs a few millimetres apart (Galveston, mixed tide), so this
 * only removes numerical flat spots.
 */
export const PROMINENCE_M = 0.005

/**
 * Highs and lows from a curve sampled every minute: local extrema refined with a
 * parabola, then the least prominent high/low pairs removed until every step is
 * at least PROMINENCE_M. Used instead of the engine's own search, which also drops
 * extremes that are close in time and so loses the small real ones of mixed tides
 * (e.g. Galveston), unlike NOAA's tables.
 */
export function findExtremes(curve: { t: number; level: number }[]): Extreme[] {
  const ex: Extreme[] = []
  for (let i = 1; i < curve.length - 1; i++) {
    const [a, b, c] = [curve[i - 1].level, curve[i].level, curve[i + 1].level]
    const high = b > a && b >= c
    if (!high && !(b < a && b <= c)) continue
    const den = a - 2 * b + c
    const k = den === 0 ? 0 : (0.5 * (a - c)) / den // vertex offset in samples, -0.5..0.5
    const dt = curve[i + 1].t - curve[i].t
    ex.push({ t: curve[i].t + k * dt, level: b - 0.25 * (a - c) * k, high })
  }
  for (;;) {
    let worst = -1
    let step = PROMINENCE_M
    for (let i = 0; i + 1 < ex.length; i++) {
      const d = Math.abs(ex[i + 1].level - ex[i].level)
      if (d < step) {
        step = d
        worst = i
      }
    }
    if (worst < 0) return ex
    ex.splice(worst, 2)
  }
}

export function predict(data: TideData, st: Station, start: number, end: number): Prediction {
  const ref = st.ref ? data.s.find((x) => x.id === st.ref) : st
  if (!ref?.h) throw new Error(`no constants for ${st.id}`)
  const p = createTidePredictor(constituentsOf(data, ref), { offset: ref.z0 ?? 0 })
  // Search a little beyond the window so an extreme shifted by an offset is not lost.
  const pad = 3 * 3600000
  let extremes = findExtremes(
    p.getTimelinePrediction({ start: new Date(start - pad), end: new Date(end + pad), timeFidelity: 60 }).map((x) => ({ t: x.time.getTime(), level: x.level })),
  )
  let curve = p.getTimelinePrediction({ start: new Date(start), end: new Date(end), timeFidelity: 600 }).map((x) => ({ t: x.time.getTime(), level: x.level }))
  if (st.o) {
    const [th, tl, hh, hl, type] = st.o
    extremes = extremes.map((e) => {
      const dt = (e.high ? th : tl) * 60000
      const dh = e.high ? hh : hl
      return { t: e.t + dt, high: e.high, level: type === 'R' ? e.level * dh : e.level + dh * FIXED_UNIT }
    })
    // shortcut: the curve of a subordinate station is the reference curve shifted by the mean
    // time offset and scaled like the extremes; only the extremes are official. Good enough
    // for a planning graph; replace with a per-cycle interpolation between offset extremes if needed.
    const dt = ((th + tl) / 2) * 60000
    const scale = (h: number) => (type === 'R' ? h * ((hh + hl) / 2) : h + ((hh + hl) / 2) * FIXED_UNIT)
    curve = p
      .getTimelinePrediction({ start: new Date(start - dt), end: new Date(end - dt), timeFidelity: 600 })
      .map((x) => ({ t: x.time.getTime() + dt, level: scale(x.level) }))
  }
  return { extremes: extremes.filter((e) => e.t >= start && e.t < end), curve }
}

/**
 * Display precision (applied before anything is shown), so a result never looks
 * more exact than it is. Even from NOAA's own constants the engine differs from
 * NOAA's tables by up to about 10 minutes and a few centimetres (it defines some
 * small constituents the IHO way, NOAA the Schureman way; see tides.test.ts), so
 * times are always rounded to 5 minutes. Heights: 5 cm on an official chart datum
 * (NOAA), 10 cm about mean sea level.
 */
export function precision(st: Station): { minutes: number; metres: number } {
  return st.s === 'noaa' && st.cd ? { minutes: 5, metres: 0.05 } : { minutes: 5, metres: 0.1 }
}

export function roundTime(t: number, minutes: number): number {
  const step = minutes * 60000
  return Math.round(t / step) * step
}

export function roundLevel(v: number, metres: number): number {
  return Math.round(v / metres) * metres
}

/** Biggest spread between consecutive high and low in the window, m. */
export function range(extremes: Extreme[]): number {
  let r = 0
  for (let i = 1; i < extremes.length; i++) r = Math.max(r, Math.abs(extremes[i].level - extremes[i - 1].level))
  return r
}

/** Under this range the tide is reported as negligible. */
export const NEGLIGIBLE_M = 0.1
