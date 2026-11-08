import { parseCoords } from './coords'
import { browserZone, isValidZone, localDate } from './tz'

export interface SavedPlace {
  name: string
  lat: number
  lon: number
  elev: number
  /** IANA zone or "UTC±HH:MM". */
  zone: string
}

/**
 * A place passed in the address, e.g. ?lat=40.4168&lng=-3.7038 (or &lon=),
 * optionally &name= and &tz=. Lets the NOMAD map, or a bookmark, open the
 * almanac on a spot.
 */
export function placeFromUrl(search: string): SavedPlace | null {
  const q = new URLSearchParams(search)
  const lat = q.get('lat')
  const lon = q.get('lng') ?? q.get('lon')
  if (lat === null || lon === null) return null
  const p = parseCoords(`${lat} ${lon}`)
  if (typeof p !== 'object') return null
  const tz = q.get('tz')
  return {
    name: (q.get('name') ?? '').slice(0, 80),
    lat: p.lat,
    lon: p.lon,
    elev: Number(q.get('elev')) || 0,
    zone: tz && isValidZone(tz) ? tz : browserZone(),
  }
}

/** Today's date (YYYY-MM-DD) in the zone. */
export function todayIn(zone: string): string {
  const { y, m, d } = localDate(Date.now(), zone)
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}
