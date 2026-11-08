// Time zones without a library: the browser's own ICU data (Intl) for IANA
// zones, plus fixed offsets ("UTC+05:30") for when no zone fits, e.g. at sea.

const FIXED = /^UTC([+-])(\d{1,2})(?::?(\d{2}))?$/

/** Fixed offset in minutes for a "UTC±HH:MM" zone, or null for an IANA zone. */
export function fixedOffset(zone: string): number | null {
  if (zone === 'UTC') return 0
  const m = FIXED.exec(zone)
  if (!m) return null
  return (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] ?? 0))
}

export function formatFixed(minutes: number): string {
  if (minutes === 0) return 'UTC'
  const a = Math.abs(minutes)
  return `UTC${minutes < 0 ? '-' : '+'}${String(Math.floor(a / 60)).padStart(2, '0')}:${String(a % 60).padStart(2, '0')}`
}

export function isValidZone(zone: string): boolean {
  if (fixedOffset(zone) !== null) return true
  try {
    new Intl.DateTimeFormat('en', { timeZone: zone })
    return true
  } catch {
    return false
  }
}

const dtfCache = new Map<string, Intl.DateTimeFormat>()
function parts(ts: number, zone: string) {
  let f = dtfCache.get(zone)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    })
    dtfCache.set(zone, f)
  }
  const o: Record<string, number> = {}
  for (const p of f.formatToParts(ts)) if (p.type !== 'literal') o[p.type] = Number(p.value)
  return o
}

/** Offset of the zone from UTC at an instant, in minutes. */
export function offsetAt(ts: number, zone: string): number {
  const fixed = fixedOffset(zone)
  if (fixed !== null) return fixed
  const p = parts(ts, zone)
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  return Math.round((asUtc - Math.floor(ts / 1000) * 1000) / 60000)
}

/** Calendar date (y, m 1-12, d) of an instant in the zone. */
export function localDate(ts: number, zone: string): { y: number; m: number; d: number } {
  const t = new Date(ts + offsetAt(ts, zone) * 60000)
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() }
}

/** The instant of local midnight starting the given calendar day in the zone. */
export function localMidnight(y: number, m: number, d: number, zone: string): number {
  const guess = Date.UTC(y, m - 1, d)
  let t = guess - offsetAt(guess, zone) * 60000
  t = guess - offsetAt(t, zone) * 60000
  // A zone whose clocks skip midnight (rare DST rules) starts the day at the
  // first instant after the gap.
  const ld = localDate(t, zone)
  if (ld.d !== d) t = guess - offsetAt(t + 3 * 3600000, zone) * 60000
  return t
}

/** [start, end) of the local calendar day: 23, 24 or 25 hours long. */
export function localDay(y: number, m: number, d: number, zone: string): [number, number] {
  const next = new Date(Date.UTC(y, m - 1, d + 1))
  return [localMidnight(y, m, d, zone), localMidnight(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate(), zone)]
}

/** HH:MM of an instant in the zone. */
export function hhmm(ts: number, zone: string): string {
  const t = new Date(ts + offsetAt(ts, zone) * 60000)
  return `${String(t.getUTCHours()).padStart(2, '0')}:${String(t.getUTCMinutes()).padStart(2, '0')}`
}

/** Date label of an instant in the zone, in the UI language. */
export function dateLabel(ts: number, zone: string, lang: string, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }): string {
  const t = ts + offsetAt(ts, zone) * 60000
  return new Intl.DateTimeFormat(lang, { ...opts, timeZone: 'UTC' }).format(t)
}

/** The browser's zone, falling back to UTC. */
export function browserZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

/** Every IANA zone the browser knows, or a short list if it cannot say. */
export function zoneList(): string[] {
  try {
    const list = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.('timeZone')
    if (list?.length) return list
  } catch {
    // fall through
  }
  return ['UTC', 'Europe/Madrid', 'Europe/London', 'America/New_York', 'America/Mexico_City', 'America/Bogota', 'America/Buenos_Aires', 'Asia/Tokyo', 'Australia/Sydney']
}

/** Nautical time zone for a longitude (15° bands), as a fixed offset. */
export function nauticalZone(lon: number): string {
  return formatFixed(Math.round(lon / 15) * 60)
}
