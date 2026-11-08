import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { compassZone, magneticField, magneticToTrue, trueToMagnetic } from './wmm'

// The official WMM2025 test values, as shipped by NCEI in WMM2025COF.zip.
const rows = readFileSync(resolve(__dirname, '../../data-src/wmm2025/WMM2025_TestValues.txt'), 'utf8')
  .split(/\r?\n/)
  .filter((l) => l.trim() && !l.startsWith('#'))
  .map((l) => l.trim().split(/\s+/).map(Number))

describe('WMM2025 against the official test values', () => {
  it('has the full set', () => expect(rows.length).toBeGreaterThanOrEqual(100))

  it.each(rows.map((r) => [r[0], r[1], r[2], r[3], r] as const))('%f %f km %f %f', (year, alt, lat, lon, r) => {
    const m = magneticField(lat, lon, alt, year)
    // Angles are printed to 0.01°; components to 1e-6 nT.
    expect(Math.abs(m.decl - r[4])).toBeLessThanOrEqual(0.005 + 1e-9)
    expect(Math.abs(m.incl - r[5])).toBeLessThanOrEqual(0.005 + 1e-9)
    expect(m.h).toBeCloseTo(r[6], 1)
    expect(m.x).toBeCloseTo(r[7], 1)
    expect(m.y).toBeCloseTo(r[8], 1)
    expect(m.z).toBeCloseTo(r[9], 1)
    expect(m.f).toBeCloseTo(r[10], 1)
    expect(m.declDot).toBeCloseTo(r[11], 3)
    expect(m.inclDot).toBeCloseTo(r[12], 3)
    expect(m.hDot).toBeCloseTo(r[13], 1)
    expect(m.zDot).toBeCloseTo(r[16], 1)
    expect(m.fDot).toBeCloseTo(r[17], 1)
  })
})

describe('compass helpers', () => {
  it('converts bearings with east declination positive', () => {
    expect(trueToMagnetic(90, -12.3)).toBeCloseTo(102.3)
    expect(magneticToTrue(102.3, -12.3)).toBeCloseTo(90)
    expect(trueToMagnetic(5, 10)).toBeCloseTo(355)
  })
  it('flags the blackout and caution zones', () => {
    expect(compassZone(1500)).toBe('blackout')
    expect(compassZone(4000)).toBe('caution')
    expect(compassZone(20000)).toBe('ok')
  })
})
