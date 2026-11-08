// World Magnetic Model 2025 (NOAA NCEI / BGS, public domain), evaluated from
// the official coefficient file. Reproduces the model's own test values
// (src/lib/wmm.test.ts). Valid 2025.0–2030.0; outside it the result is an
// extrapolation and the UI says so.
import cof from '../data/WMM2025.COF?raw'

const A = 6378.137 // WGS-84 semi-major axis, km
const F = 1 / 298.257223563
const E2 = F * (2 - F)
const RE = 6371.2 // geomagnetic reference radius, km
const RAD = Math.PI / 180

interface Model {
  epoch: number
  name: string
  nMax: number
  g: number[][]
  h: number[][]
  gd: number[][]
  hd: number[][]
}

function parse(text: string): Model {
  const lines = text.split(/\r?\n/)
  const [epoch, name] = lines[0].trim().split(/\s+/)
  const sq = () => Array.from({ length: 13 }, () => new Array<number>(13).fill(0))
  const m: Model = { epoch: Number(epoch), name, nMax: 0, g: sq(), h: sq(), gd: sq(), hd: sq() }
  for (const line of lines.slice(1)) {
    const p = line.trim().split(/\s+/).map(Number)
    if (p.length !== 6 || p[0] > 12) continue
    const [n, k, g, h, gd, hd] = p
    m.g[n][k] = g
    m.h[n][k] = h
    m.gd[n][k] = gd
    m.hd[n][k] = hd
    m.nMax = Math.max(m.nMax, n)
  }
  return m
}

const MODEL = parse(cof)
export const WMM_NAME = MODEL.name
export const WMM_EPOCH = MODEL.epoch
export const WMM_VALID_UNTIL = MODEL.epoch + 5

/** Schmidt semi-normalised associated Legendre functions and their θ-derivative. */
function legendre(nMax: number, ct: number, st: number) {
  const P = Array.from({ length: nMax + 1 }, () => new Array<number>(nMax + 1).fill(0))
  const dP = Array.from({ length: nMax + 1 }, () => new Array<number>(nMax + 1).fill(0))
  P[0][0] = 1
  for (let n = 1; n <= nMax; n++) {
    for (let m = 0; m <= n; m++) {
      if (m === n) {
        P[n][m] = st * P[n - 1][m - 1]
        dP[n][m] = st * dP[n - 1][m - 1] + ct * P[n - 1][m - 1]
      } else {
        const k = n > 1 ? ((n - 1) ** 2 - m * m) / ((2 * n - 1) * (2 * n - 3)) : 0
        const p2 = n > 1 ? P[n - 2][m] : 0
        const d2 = n > 1 ? dP[n - 2][m] : 0
        P[n][m] = ct * P[n - 1][m] - k * p2
        dP[n][m] = ct * dP[n - 1][m] - st * P[n - 1][m] - k * d2
      }
    }
  }
  // Gauss-normalised → Schmidt semi-normalised.
  const S = Array.from({ length: nMax + 1 }, () => new Array<number>(nMax + 1).fill(0))
  S[0][0] = 1
  for (let n = 1; n <= nMax; n++) {
    S[n][0] = (S[n - 1][0] * (2 * n - 1)) / n
    for (let m = 1; m <= n; m++) S[n][m] = S[n][m - 1] * Math.sqrt(((n - m + 1) * (m === 1 ? 2 : 1)) / (n + m))
  }
  for (let n = 1; n <= nMax; n++)
    for (let m = 0; m <= n; m++) {
      P[n][m] *= S[n][m]
      dP[n][m] *= S[n][m]
    }
  return { P, dP }
}

export interface MagField {
  /** Declination, degrees, east positive. */
  decl: number
  /** Inclination (dip), degrees, down positive. */
  incl: number
  /** Field components, nT: horizontal, north, east, down, total. */
  h: number
  x: number
  y: number
  z: number
  f: number
  /** Yearly change of declination and inclination, degrees/year. */
  declDot: number
  inclDot: number
  hDot: number
  xDot: number
  yDot: number
  zDot: number
  fDot: number
}

/**
 * Field at geodetic latitude/longitude (degrees), height above the WGS-84
 * ellipsoid (km) and decimal year.
 */
export function magneticField(lat: number, lon: number, heightKm: number, year: number): MagField {
  // shortcut: nudges exact poles by 1e-7° to avoid dividing by cos(lat)=0; the WMM
  // C library rotates the frame instead. Results there differ by far less than the model error.
  const latC = Math.max(-90 + 1e-7, Math.min(90 - 1e-7, lat))
  const phi = latC * RAD
  const lam = lon * RAD
  const sinPhi = Math.sin(phi)
  const rc = A / Math.sqrt(1 - E2 * sinPhi * sinPhi)
  const p = (rc + heightKm) * Math.cos(phi)
  const zc = (rc * (1 - E2) + heightKm) * sinPhi
  const r = Math.hypot(p, zc)
  const phiC = Math.asin(zc / r) // geocentric latitude
  const ct = Math.sin(phiC) // cos(colatitude)
  const st = Math.cos(phiC)
  const { P, dP } = legendre(MODEL.nMax, ct, st)
  const dt = year - MODEL.epoch

  // Main field (index 0) and secular variation (index 1) in the geocentric frame.
  const Xp = [0, 0]
  const Yp = [0, 0]
  const Zp = [0, 0]
  for (let n = 1; n <= MODEL.nMax; n++) {
    const ar = (RE / r) ** (n + 2)
    for (let m = 0; m <= n; m++) {
      const cm = Math.cos(m * lam)
      const sm = Math.sin(m * lam)
      const sets: [number, number][] = [
        [MODEL.g[n][m] + dt * MODEL.gd[n][m], MODEL.h[n][m] + dt * MODEL.hd[n][m]],
        [MODEL.gd[n][m], MODEL.hd[n][m]],
      ]
      sets.forEach(([g, h], i) => {
        const gh = g * cm + h * sm
        Xp[i] += ar * gh * dP[n][m]
        Yp[i] += (ar * m * (g * sm - h * cm) * P[n][m]) / st
        Zp[i] -= ar * (n + 1) * gh * P[n][m]
      })
    }
  }
  // Rotate to the geodetic (local horizon) frame.
  const psi = phiC - phi
  const rot = (i: number) => ({
    x: Xp[i] * Math.cos(psi) - Zp[i] * Math.sin(psi),
    y: Yp[i],
    z: Xp[i] * Math.sin(psi) + Zp[i] * Math.cos(psi),
  })
  const { x, y, z } = rot(0)
  const { x: xDot, y: yDot, z: zDot } = rot(1)
  const h = Math.hypot(x, y)
  const f = Math.hypot(h, z)
  const hDot = (x * xDot + y * yDot) / h
  const fDot = (x * xDot + y * yDot + z * zDot) / f
  return {
    decl: Math.atan2(y, x) / RAD,
    incl: Math.atan2(z, h) / RAD,
    h,
    x,
    y,
    z,
    f,
    declDot: (x * yDot - y * xDot) / (h * h) / RAD,
    inclDot: (h * zDot - z * hDot) / (f * f) / RAD,
    hDot,
    xDot,
    yDot,
    zDot,
    fDot,
  }
}

/** Decimal year of a date (UTC). */
export function decimalYear(d: Date): number {
  const y = d.getUTCFullYear()
  const start = Date.UTC(y, 0, 1)
  return y + (d.getTime() - start) / (Date.UTC(y + 1, 0, 1) - start)
}

/**
 * Where the compass is unreliable, per the WMM specification: horizontal
 * field below 2000 nT is the blackout zone, below 6000 nT the caution zone.
 */
export function compassZone(h: number): 'ok' | 'caution' | 'blackout' {
  return h < 2000 ? 'blackout' : h < 6000 ? 'caution' : 'ok'
}

/** Normalises an angle to [0, 360). */
export const norm360 = (a: number) => ((a % 360) + 360) % 360

/** Map (true) bearing → compass (magnetic) bearing, and back. East declination is positive. */
export const trueToMagnetic = (bearing: number, decl: number) => norm360(bearing - decl)
export const magneticToTrue = (bearing: number, decl: number) => norm360(bearing + decl)
