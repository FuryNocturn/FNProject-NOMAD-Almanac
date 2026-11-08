// Sun and moon for one local calendar day at one place, on astronomy-engine
// (±1 arcminute against JPL; rise and set use the USNO definition: upper limb
// on a sea-level horizon with standard refraction).
import {
  Body,
  Equator,
  Horizon,
  Illumination,
  MoonPhase,
  NextMoonQuarter,
  Observer,
  SearchAltitude,
  SearchHourAngle,
  SearchMoonQuarter,
  SearchRiseSet,
  Seasons,
  type AstroTime,
} from 'astronomy-engine'

const DAY = 86400000
const AU_KM = 149597870.7
export const SYNODIC_MONTH = 29.530588853

export interface Place {
  lat: number
  lon: number
  /** Metres above sea level; only nudges rise and set times. */
  elev?: number
}

export interface Event {
  t: number
  /** Azimuth, degrees from true north. */
  az?: number
  /** Altitude, degrees. */
  alt?: number
}

export interface SunDay {
  rise: Event | null
  set: Event | null
  noon: Event | null
  /** Time above the horizon during this local day, ms. */
  dayLength: number
  /** Dawn/dusk at -6°, -12°, -18° (null if the sun never gets that low or that high). */
  civil: [number | null, number | null]
  nautical: [number | null, number | null]
  astronomical: [number | null, number | null]
  /** 'up' or 'down' all day when neither rise nor set happens. */
  polar: 'up' | 'down' | null
  /** Next rise (or set) after a polar day, when polar is set. */
  nextChange: number | null
}

export interface MoonDay {
  rises: Event[]
  sets: Event[]
  transits: Event[]
  /** 'up' or 'down' all day when the moon neither rises nor sets. */
  polar: 'up' | 'down' | null
  /** 0 = new, 90 = first quarter, 180 = full, 270 = last quarter. */
  phase: number
  /** Illuminated fraction, 0–1. */
  fraction: number
  /** Days since new moon. */
  age: number
  distanceKm: number
  /** Next four principal phases: quarter 0 = new, 1 = first quarter, 2 = full, 3 = last quarter. */
  quarters: { quarter: number; t: number }[]
}

const ms = (a: AstroTime) => a.date.getTime()
const obs = (p: Place) => new Observer(p.lat, p.lon, p.elev ?? 0)

function azAlt(body: Body, t: number, o: Observer) {
  const eq = Equator(body, new Date(t), o, true, true)
  const h = Horizon(new Date(t), o, eq.ra, eq.dec, 'normal')
  return { az: h.azimuth, alt: h.altitude }
}

/** Every rise (direction +1) or set (-1) of the body within [start, end). */
function allRiseSet(body: Body, o: Observer, dir: 1 | -1, start: number, end: number): Event[] {
  const out: Event[] = []
  let from = start
  while (from < end) {
    const r = SearchRiseSet(body, o, dir, new Date(from), (end - from) / DAY)
    if (!r || ms(r) >= end) break
    out.push({ t: ms(r), ...azAlt(body, ms(r), o) })
    from = ms(r) + 60000
  }
  return out
}

function altitudeCross(o: Observer, dir: 1 | -1, start: number, end: number, alt: number): number | null {
  const r = SearchAltitude(Body.Sun, o, dir, new Date(start), (end - start) / DAY, alt)
  return r && ms(r) < end ? ms(r) : null
}

/** Upper transits (hour angle 0) of the body within [start, end). */
function transits(body: Body, o: Observer, start: number, end: number): Event[] {
  const out: Event[] = []
  let from = start
  while (from < end) {
    const e = SearchHourAngle(body, o, 0, new Date(from), +1)
    if (ms(e.time) >= end) break
    out.push({ t: ms(e.time), az: e.hor.azimuth, alt: e.hor.altitude })
    from = ms(e.time) + 3600000
  }
  return out
}

export function sunDay(place: Place, start: number, end: number): SunDay {
  const o = obs(place)
  const noon = transits(Body.Sun, o, start, end)[0] ?? null
  const riseToday = allRiseSet(Body.Sun, o, +1, start, end)[0] ?? null
  const setToday = allRiseSet(Body.Sun, o, -1, start, end)[0] ?? null
  // Evening events belong to the day that had the noon before them: a sunset or
  // dusk just after midnight (high latitudes in summer) is shown as "+1", not as
  // the previous evening's leftover at 00:30.
  const evening = noon?.t ?? start
  const late = end + DAY / 2
  const rise = riseToday
  const set = allRiseSet(Body.Sun, o, -1, evening, late)[0] ?? null

  // Time above the horizon during this local day.
  let polar: SunDay['polar'] = null
  let dayLength: number
  if (!riseToday && !setToday) {
    // No crossing today: up or down for the whole day. Decide at noon (or midday).
    const probe = noon?.t ?? (start + end) / 2
    polar = azAlt(Body.Sun, probe, o).alt > -0.8333 ? 'up' : 'down'
    dayLength = polar === 'up' ? end - start : 0
  } else if (riseToday && setToday) {
    dayLength = riseToday.t < setToday.t ? setToday.t - riseToday.t : setToday.t - start + (end - riseToday.t)
  } else if (riseToday) {
    dayLength = end - riseToday.t
  } else {
    dayLength = setToday!.t - start
  }

  let nextChange: number | null = null
  if (polar) {
    const r = SearchRiseSet(Body.Sun, o, polar === 'down' ? +1 : -1, new Date(end), 370)
    nextChange = r ? ms(r) : null
  }

  const tw = (alt: number): [number | null, number | null] => [
    altitudeCross(o, +1, start, noon?.t ?? end, alt),
    altitudeCross(o, -1, evening, late, alt),
  ]
  return { rise, set: polar ? null : set, noon, dayLength, civil: tw(-6), nautical: tw(-12), astronomical: tw(-18), polar, nextChange }
}

export function moonDay(place: Place, start: number, end: number): MoonDay {
  const o = obs(place)
  const mid = (start + end) / 2
  const phase = MoonPhase(new Date(mid))
  const ill = Illumination(Body.Moon, new Date(mid))
  const quarters: MoonDay['quarters'] = []
  let q = SearchMoonQuarter(new Date(start))
  for (let i = 0; i < 4; i++) {
    quarters.push({ quarter: q.quarter, t: ms(q.time) })
    q = NextMoonQuarter(q)
  }
  const rises = allRiseSet(Body.Moon, o, +1, start, end)
  const sets = allRiseSet(Body.Moon, o, -1, start, end)
  const polar = rises.length || sets.length ? null : azAlt(Body.Moon, mid, o).alt > -0.8333 ? 'up' : 'down'
  return {
    rises,
    sets,
    transits: transits(Body.Moon, o, start, end),
    polar,
    phase,
    fraction: ill.phase_fraction,
    age: (phase / 360) * SYNODIC_MONTH,
    distanceKm: ill.geo_dist * AU_KM,
    quarters,
  }
}

/** Equinoxes and solstices of a year, as instants. */
export function seasons(year: number) {
  const s = Seasons(year)
  return { marEquinox: ms(s.mar_equinox), junSolstice: ms(s.jun_solstice), sepEquinox: ms(s.sep_equinox), decSolstice: ms(s.dec_solstice) }
}

/** Phase name key from the phase angle (8 named phases). */
export function phaseKey(phase: number): 'new' | 'waxingCrescent' | 'firstQuarter' | 'waxingGibbous' | 'full' | 'waningGibbous' | 'lastQuarter' | 'waningCrescent' {
  const keys = ['new', 'waxingCrescent', 'firstQuarter', 'waxingGibbous', 'full', 'waningGibbous', 'lastQuarter', 'waningCrescent'] as const
  return keys[Math.round(phase / 45) % 8]
}
