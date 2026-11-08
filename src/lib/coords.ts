// Reads typed coordinates: decimal (with dot or comma), degrees-minutes and
// degrees-minutes-seconds, with signs or hemisphere letters (N S E W, and O
// for the Spanish "oeste").

export interface LatLon {
  lat: number
  lon: number
}

export type ParseError = 'empty' | 'count' | 'range' | 'minutes'

export function parseCoords(input: string): LatLon | ParseError {
  const s = input.toUpperCase().trim()
  if (!s) return 'empty'
  // A comma directly followed by a digit is a decimal comma; any other comma separates.
  const nums = [...s.matchAll(/[-+−]?\d+(?:[.,]\d+)?/g)].map((m) => ({
    v: Number(m[0].replace(',', '.').replace('−', '-')),
    neg: /^[-−]/.test(m[0]),
    at: m.index!,
  }))
  if (![2, 4, 6].includes(nums.length)) return 'count'
  const half = nums.length / 2
  const letters = [...s.matchAll(/[NSEWO]/g)].map((m) => m[0])
  // Longitude written first ("3W 40N") when the first hemisphere letter is east/west.
  const lonFirst = letters.length === 2 && /[EWO]/.test(letters[0]) && /[NS]/.test(letters[1])
  const groups = [nums.slice(0, half), nums.slice(half)]
  const [latG, lonG] = lonFirst ? [groups[1], groups[0]] : groups

  const value = (g: typeof nums): number | 'minutes' => {
    const [d, m = { v: 0 }, sec = { v: 0 }] = g
    if (m.v >= 60 || sec.v >= 60 || (g.length > 1 && (g[1].neg || (g[2]?.neg ?? false)))) return 'minutes'
    const abs = Math.abs(d.v) + m.v / 60 + sec.v / 3600
    return d.neg ? -abs : abs
  }
  let lat = value(latG)
  let lon = value(lonG)
  if (lat === 'minutes' || lon === 'minutes') return 'minutes'
  if (letters.includes('S')) lat = -Math.abs(lat)
  if (letters.includes('W') || letters.includes('O')) lon = -Math.abs(lon)
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return 'range'
  return { lat, lon }
}

/** 40.4168 → 40°25'00.5"N */
export function toDms(v: number, axis: 'lat' | 'lon'): string {
  const hemi = axis === 'lat' ? (v < 0 ? 'S' : 'N') : v < 0 ? 'W' : 'E'
  let total = Math.round(Math.abs(v) * 36000) // tenths of a second
  const tenths = total % 600
  total = (total - tenths) / 600
  const min = total % 60
  const deg = (total - min) / 60
  return `${deg}°${String(min).padStart(2, '0')}′${(tenths / 10).toFixed(1).padStart(4, '0')}″${hemi}`
}
