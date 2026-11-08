import { parseCoords, toDms } from './coords'

const close = (input: string, lat: number, lon: number) => {
  const r = parseCoords(input)
  expect(typeof r).toBe('object')
  if (typeof r === 'object') {
    expect(r.lat).toBeCloseTo(lat, 4)
    expect(r.lon).toBeCloseTo(lon, 4)
  }
}

describe('parseCoords', () => {
  it('reads decimal degrees with dot or comma', () => {
    close('40.4168, -3.7038', 40.4168, -3.7038)
    close('40,4168 -3,7038', 40.4168, -3.7038)
    close('40,4168,-3,7038', 40.4168, -3.7038)
    close('-33.8688 151.2093', -33.8688, 151.2093)
  })
  it('reads hemisphere letters, including O for oeste', () => {
    close('40.4168 N 3.7038 W', 40.4168, -3.7038)
    close('40.4168N 3.7038O', 40.4168, -3.7038)
    close('S 54.8 W 68.3', -54.8, -68.3)
    close('3.7038W 40.4168N', 40.4168, -3.7038)
  })
  it('reads degrees-minutes and degrees-minutes-seconds', () => {
    close(`40°25'00.5"N 3°42'13.7"W`, 40.416806, -3.703806)
    close('N 40 25.008 W 3 42.228', 40.4168, -3.7038)
    close('40º 25′ 0.5″ N, 3º 42′ 13.7″ O', 40.416806, -3.703806)
  })
  it('rejects bad input', () => {
    expect(parseCoords('')).toBe('empty')
    expect(parseCoords('40.4')).toBe('count')
    expect(parseCoords('95 10')).toBe('range')
    expect(parseCoords('10 200')).toBe('range')
    expect(parseCoords('40 75 3 10')).toBe('minutes')
  })
  it('formats DMS', () => {
    expect(toDms(40.416806, 'lat')).toBe('40°25′00.5″N')
    expect(toDms(-3.703806, 'lon')).toBe('3°42′13.7″W')
  })
})
