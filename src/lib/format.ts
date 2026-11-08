export type AngleUnit = 'deg' | 'dm' | 'mil'

/** Absolute angle in the chosen unit: 12.3°, 12°18′ or 219 mils (6400 to the circle). */
export function angle(v: number, unit: AngleUnit, lang: string, decimals = 1): string {
  const a = Math.abs(v)
  if (unit === 'mil') return `${Math.round((a * 6400) / 360)} mil`
  if (unit === 'dm') {
    let deg = Math.floor(a)
    let min = Math.round((a - deg) * 60)
    if (min === 60) {
      deg += 1
      min = 0
    }
    return `${deg}°${String(min).padStart(2, '0')}′`
  }
  return `${new Intl.NumberFormat(lang, { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(a)}°`
}

/** A bearing 0–360 as three digits (077.7°) or in the chosen unit. */
export function bearing(v: number, unit: AngleUnit, lang: string): string {
  const b = ((v % 360) + 360) % 360
  if (unit === 'mil') return `${String(Math.round((b * 6400) / 360) % 6400).padStart(4, '0')} mil`
  if (unit === 'dm') {
    let deg = Math.floor(b)
    let min = Math.round((b - deg) * 60)
    if (min === 60) {
      deg = (deg + 1) % 360
      min = 0
    }
    return `${String(deg).padStart(3, '0')}°${String(min).padStart(2, '0')}′`
  }
  const s = new Intl.NumberFormat(lang, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(Math.round(b * 10) / 10 === 360 ? 0 : b)
  return `${s.padStart(5, '0')}°`
}

/** 10 h 23 min */
export function duration(ms: number): string {
  const total = Math.round(ms / 60000)
  return `${Math.floor(total / 60)} h ${String(total % 60).padStart(2, '0')} min`
}
