// Turns the official station data in data-raw/ (scripts/fetch-tides.mjs) into
// public/data/tides.json, the one file the Tides tab loads. Every source's
// conventions are normalised here, once:
//   - amplitudes in metres, phases as Greenwich phase lags (kappa', UTC);
//   - NOAA heights about chart datum (MLLW): z0 = MSL − MLLW from the station datums;
//   - Kartverket and LINZ heights about mean sea level (z0 = 0, no chart datum);
//   - NOAA subordinate stations keep their reference station and official offsets.
// Run: node scripts/build-tides.mjs
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { constituents as known } from '@neaps/tide-predictor'

const RAW = resolve(import.meta.dirname, '../data-raw')
const OUT = resolve(import.meta.dirname, '../public/data/tides.json')

const names = new Map()
for (const [k, v] of Object.entries(known)) {
  names.set(k.toUpperCase(), k)
  for (const a of v.aliases ?? []) names.set(a.toUpperCase(), k)
}
// Kartverket abbreviations for constituents the engine knows under the IHO name.
// ALP1, BET1, H1 and H2 are not in the engine and are dropped (each under 1 cm).
const ALIAS = { THE1: 'THETA1', EPS2: 'EPSILON2', SIG1: 'SIGMA1', GAM2: 'GAMMA2', LDA2: 'LAMBDA2' }
const unknown = new Map()
/** Canonical constituent name the engine knows, or null (logged). */
function canon(src, name) {
  const n = names.get(name.toUpperCase()) ?? names.get((ALIAS[name.toUpperCase()] ?? '').toUpperCase())
  if (!n) unknown.set(`${src}:${name}`, (unknown.get(`${src}:${name}`) ?? 0) + 1)
  return n ?? null
}

const CONST = [] // global constituent table, referenced by index
const idx = (n) => {
  let i = CONST.indexOf(n)
  if (i < 0) i = CONST.push(n) - 1
  return i
}
const r3 = (v) => Math.round(v * 1000) / 1000
const r2 = (v) => Math.round(v * 100) / 100
const norm = (p) => ((p % 360) + 360) % 360

const stations = []

// ── NOAA CO-OPS ──────────────────────────────────────────────
const noaaList = JSON.parse(readFileSync(join(RAW, 'noaa-stations.json'), 'utf8')).stations
const noaaRefs = new Set()
let skipped = 0
for (const s of noaaList.filter((x) => x.type === 'R')) {
  const hc = readFileSync(join(RAW, 'noaa-harcon', `${s.id}.json`), 'utf8')
  const dt = readFileSync(join(RAW, 'noaa-datums', `${s.id}.json`), 'utf8')
  const h = hc ? JSON.parse(hc).HarmonicConstituents ?? [] : []
  const datums = dt ? Object.fromEntries((JSON.parse(dt).datums ?? []).map((d) => [d.name, d.value])) : {}
  const comps = h
    .filter((c) => c.amplitude > 0)
    .map((c) => [canon('noaa', c.name), c.amplitude, c.phase_GMT])
    .filter((c) => c[0])
    .map(([n, a, p]) => [idx(n), r3(a), r2(norm(p))])
  if (!comps.length) {
    skipped++
    continue
  }
  const hasDatum = Number.isFinite(datums.MSL) && Number.isFinite(datums.MLLW)
  noaaRefs.add(s.id)
  stations.push({
    id: `noaa:${s.id}`,
    n: s.name + (s.state ? `, ${s.state}` : ''),
    la: s.lat,
    lo: s.lng,
    s: 'noaa',
    // Heights about MLLW when the datums are published, else about MSL.
    z0: hasDatum ? r3(datums.MSL - datums.MLLW) : 0,
    cd: hasDatum ? 'MLLW' : null,
    h: comps,
  })
}
let subSkipped = 0
for (const s of noaaList.filter((x) => x.type === 'S')) {
  const raw = readFileSync(join(RAW, 'noaa-offsets', `${s.id}.json`), 'utf8')
  const o = raw ? JSON.parse(raw) : null
  if (!o || !noaaRefs.has(o.refStationId) || !['R', 'F'].includes(o.heightAdjustedType)) {
    subSkipped++
    continue
  }
  const ref = stations.find((x) => x.id === `noaa:${o.refStationId}`)
  stations.push({
    id: `noaa:${s.id}`,
    n: s.name + (s.state ? `, ${s.state}` : ''),
    la: s.lat,
    lo: s.lng,
    s: 'noaa',
    cd: ref.cd,
    ref: `noaa:${o.refStationId}`,
    // Official offsets: minutes, and a ratio or a fixed height in the units NOAA publishes (see FIXED_UNIT).
    o: [o.timeOffsetHighTide, o.timeOffsetLowTide, o.heightOffsetHighTide, o.heightOffsetLowTide, o.heightAdjustedType],
  })
}
console.log(`NOAA: ${noaaRefs.size} harmonic (${skipped} without constants), ${stations.length - noaaRefs.size} subordinate (${subSkipped} skipped)`)

// ── Kartverket ───────────────────────────────────────────────
const kvDir = join(RAW, 'kv-constituents')
let kv = 0
for (const f of existsSync(kvDir) ? readdirSync(kvDir) : []) {
  const x = readFileSync(join(kvDir, f), 'utf8')
  const loc = x.match(/<location name="([^"]+)" code="([A-Z]{3})" longitude="([\d.-]+)" latitude="([\d.-]+)"/)
  const meta = x.match(/<constituents unit="(\w+)" utcoffset="([+-]\d\d):(\d\d)"/)
  if (!loc || !meta) throw new Error(`Kartverket ${f}: unexpected format`)
  const scale = meta[1] === 'cm' ? 0.01 : meta[1] === 'm' ? 1 : NaN
  if (!Number.isFinite(scale)) throw new Error(`Kartverket ${f}: unit ${meta[1]}`)
  const tzHours = Number(meta[2]) + Math.sign(Number(meta[2]) || 1) * (Number(meta[3]) / 60)
  const comps = [...x.matchAll(/<constituent name="([^"]+)" amplitude="([\d.]+)" phaseangle="([\d.-]+)" speed="([\d.]+)"/g)]
    .map(([, n, a, p, sp]) => [canon('kv', n), Number(a) * scale, Number(p), Number(sp)])
    .filter((c) => c[0] && c[1] > 0)
    // Phases are referred to the zone time (UTC+1): kappa' = g − speed·offset.
    .map(([n, a, p, sp]) => [idx(n), r3(a), r2(norm(p - sp * tzHours))])
  stations.push({ id: `kv:${loc[2]}`, n: loc[1], la: Number(loc[4]), lo: Number(loc[3]), s: 'kv', z0: 0, cd: null, h: comps })
  kv++
}
console.log(`Kartverket: ${kv} stations`)

if (unknown.size) console.warn('constituents the engine does not know (dropped):', [...unknown].map(([k, v]) => `${k}×${v}`).join(' '))

writeFileSync(OUT, JSON.stringify({ c: CONST, s: stations }))
console.log(`wrote ${OUT} (${(readFileSync(OUT).length / 1024).toFixed(0)} KB, ${stations.length} stations, ${CONST.length} constituents)`)
