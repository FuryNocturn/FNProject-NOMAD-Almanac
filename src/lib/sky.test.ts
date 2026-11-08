import { moonDay, phaseKey, seasons, sunDay } from './sky'
import { hhmm, localDay } from './tz'

// Expected values transcribed from the USNO Astronomical Applications API
// (rstt/oneday) on 2026-11-08; the raw answers are in data-src/usno/.
// USNO rounds to the minute, so ±1 minute is allowed.
type Fix = {
  name: string
  lat: number
  lon: number
  date: [number, number, number]
  zone: string
  sun: { dawn?: string; rise?: string; noon?: string; set?: string; dusk?: string; polar?: 'up' | 'down' }
  moon: { rise?: string[]; set?: string[]; transit?: string[]; polar?: 'up' | 'down' }
  fraction: number
}
const FIX: Fix[] = [
  { name: 'London', lat: 51.5072, lon: -0.1276, date: [2026, 11, 18], zone: 'UTC',
    sun: { dawn: '06:46', rise: '07:24', noon: '11:46', set: '16:07', dusk: '16:45' },
    moon: { rise: ['13:26'], set: [], transit: ['18:58'] }, fraction: 0.6 },
  { name: 'Nairobi', lat: -1.2864, lon: 36.8172, date: [2026, 6, 21], zone: 'UTC+03:00',
    sun: { dawn: '06:11', rise: '06:33', noon: '12:35', set: '18:36', dusk: '18:59' },
    moon: { rise: ['12:09'], set: [], transit: ['18:19'] }, fraction: 0.45 },
  { name: 'Ushuaia', lat: -54.8019, lon: -68.303, date: [2026, 6, 21], zone: 'UTC-03:00',
    sun: { dawn: '09:14', rise: '09:59', noon: '13:35', set: '17:11', dusk: '17:57' },
    moon: { rise: ['13:16'], set: ['00:46'], transit: ['19:32'] }, fraction: 0.47 },
  { name: 'Sydney', lat: -33.8688, lon: 151.2093, date: [2026, 12, 21], zone: 'UTC+11:00',
    sun: { dawn: '05:11', rise: '05:41', noon: '12:53', set: '20:05', dusk: '20:35' },
    moon: { rise: ['17:06'], set: ['02:29'], transit: ['22:12'] }, fraction: 0.87 },
  { name: 'Madrid', lat: 40.4168, lon: -3.7038, date: [2026, 3, 15], zone: 'UTC+01:00',
    sun: { dawn: '06:59', rise: '07:27', noon: '13:24', set: '19:21', dusk: '19:49' },
    moon: { rise: ['05:42'], set: ['15:33'], transit: ['10:34'] }, fraction: 0.14 },
  { name: 'Tromsø polar night', lat: 69.6492, lon: 18.9553, date: [2026, 12, 21], zone: 'UTC+01:00',
    sun: { dawn: '09:31', dusk: '13:53', polar: 'down' },
    moon: { rise: [], set: [], transit: ['21:24'], polar: 'up' }, fraction: 0.9 },
  { name: 'Tromsø midnight sun', lat: 69.6492, lon: 18.9553, date: [2026, 6, 21], zone: 'UTC+02:00',
    sun: { noon: '12:46', polar: 'up' },
    moon: { rise: ['12:18'], set: ['00:37'], transit: ['18:33'] }, fraction: 0.45 },
]

const minutes = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3))
const near = (ts: number | null | undefined, expected: string, zone: string) => {
  expect(ts).not.toBeNull()
  expect(Math.abs(minutes(hhmm(ts!, zone)) - minutes(expected))).toBeLessThanOrEqual(1)
}

describe.each(FIX)('$name', (f) => {
  const [start, end] = localDay(...f.date, f.zone)
  const place = { lat: f.lat, lon: f.lon }
  it('sun matches USNO', () => {
    const s = sunDay(place, start, end)
    if (f.sun.rise) near(s.rise?.t, f.sun.rise, f.zone)
    if (f.sun.set) near(s.set?.t, f.sun.set, f.zone)
    if (f.sun.noon) near(s.noon?.t, f.sun.noon, f.zone)
    if (f.sun.dawn) near(s.civil[0], f.sun.dawn, f.zone)
    if (f.sun.dusk) near(s.civil[1], f.sun.dusk, f.zone)
    expect(s.polar).toBe(f.sun.polar ?? null)
    if (f.sun.polar) {
      expect(s.rise).toBeNull()
      expect(s.set).toBeNull()
      expect(s.nextChange).toBeGreaterThan(end)
    }
  })
  it('moon matches USNO', () => {
    const m = moonDay(place, start, end)
    expect(m.rises.length).toBe(f.moon.rise!.length)
    expect(m.sets.length).toBe(f.moon.set!.length)
    expect(m.polar).toBe(f.moon.polar ?? null)
    f.moon.rise!.forEach((x, i) => near(m.rises[i].t, x, f.zone))
    f.moon.set!.forEach((x, i) => near(m.sets[i].t, x, f.zone))
    f.moon.transit!.forEach((x, i) => near(m.transits[i].t, x, f.zone))
    // USNO prints the fraction at 00:00 UT rounded to 1 %; ours is at local midday.
    expect(Math.abs(m.fraction - f.fraction)).toBeLessThan(0.08)
  })
})

describe('local days and seasons', () => {
  it('handles 25- and 23-hour DST days', () => {
    const [a, b] = localDay(2024, 10, 27, 'Europe/Berlin')
    expect((b - a) / 3600000).toBe(25)
    const [c, d] = localDay(2024, 3, 10, 'America/New_York')
    expect((d - c) / 3600000).toBe(23)
  })
  it('puts the 2026 equinoxes and solstices on the right days', () => {
    const s = seasons(2026)
    expect(new Date(s.marEquinox).toISOString().slice(0, 10)).toBe('2026-03-20')
    expect(new Date(s.junSolstice).toISOString().slice(0, 10)).toBe('2026-06-21')
    expect(new Date(s.sepEquinox).toISOString().slice(0, 10)).toBe('2026-09-23')
    expect(new Date(s.decSolstice).toISOString().slice(0, 10)).toBe('2026-12-21')
  })
  it('shows a dusk after midnight as the next day, not the previous night', () => {
    const [start, end] = localDay(2026, 11, 8, 'UTC-03:00')
    const s = sunDay({ lat: -54.8019, lon: -68.303 }, start, end)
    expect(s.astronomical[1]).toBeGreaterThan(end)
    expect(s.astronomical[0]).toBeLessThan(s.noon!.t)
    expect(s.set!.t).toBeLessThan(end)
  })
  it('names phases', () => {
    expect(phaseKey(0)).toBe('new')
    expect(phaseKey(359)).toBe('new')
    expect(phaseKey(90)).toBe('firstQuarter')
    expect(phaseKey(180)).toBe('full')
    expect(phaseKey(250)).toBe('lastQuarter')
  })
})
