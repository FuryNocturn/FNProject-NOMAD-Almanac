// Maintainer-only: downloads the official tide station data into data-raw/
// (never committed, never in the image). scripts/build-tides.mjs turns it into
// public/data/tides.json. Run again only when an agency publishes new constants.
//
//   node scripts/fetch-tides.mjs            # NOAA + Kartverket + validation samples
//
// Polite: a few requests at a time, a user agent that names the project.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const RAW = resolve(import.meta.dirname, '../data-raw')
const CHECK = resolve(import.meta.dirname, '../data-src/tide-checks')
const NOAA = 'https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi'
const NOAA_DATA = 'https://api.tidesandcurrents.noaa.gov/api/prod/datagetter'
const KV = 'https://vannstand.kartverket.no/tideapi.php'
const UA = { 'User-Agent': 'NOMAD-Almanac data build (github.com/FuryNocturn/FNProject-NOMAD-Almanac)' }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function get(url, tries = 4) {
  for (let i = 0; ; i++) {
    try {
      const r = await fetch(url, { headers: UA })
      if (r.ok) return await r.text()
      if (r.status === 404) return null
      throw new Error(`HTTP ${r.status}`)
    } catch (e) {
      if (i >= tries) throw new Error(`${url}: ${e.message}`)
      // 403/429 means "slow down": back off for minutes, not seconds.
      await sleep(/HTTP 4(03|29)/.test(e.message) ? 120000 * (i + 1) : 2000 * (i + 1))
    }
  }
}

/** Runs fn over items, `n` at a time, caching each answer as a file. */
async function cached(dir, items, n, name, fn) {
  mkdirSync(dir, { recursive: true })
  let done = 0
  const queue = [...items]
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (queue.length) {
        const it = queue.shift()
        const file = join(dir, name(it))
        if (!existsSync(file)) {
          const body = await fn(it)
          writeFileSync(file, body ?? '')
          await sleep(1000)
        }
        if (++done % 200 === 0) console.log(`  ${dir.split(/[\\/]/).pop()}: ${done}/${items.length}`)
      }
    }),
  )
}

async function noaa() {
  console.log('NOAA CO-OPS station list…')
  const listFile = join(RAW, 'noaa-stations.json')
  if (!existsSync(listFile)) writeFileSync(listFile, await get(`${NOAA}/stations.json?type=tidepredictions`))
  const list = readFileSync(listFile, 'utf8')
  const stations = JSON.parse(list).stations
  const R = stations.filter((s) => s.type === 'R').map((s) => s.id)
  const S = stations.filter((s) => s.type === 'S').map((s) => s.id)
  console.log(`  ${R.length} harmonic, ${S.length} subordinate`)
  await cached(join(RAW, 'noaa-harcon'), R, 1, (id) => `${id}.json`, (id) => get(`${NOAA}/stations/${id}/harcon.json?units=metric`))
  await cached(join(RAW, 'noaa-datums'), R, 1, (id) => `${id}.json`, (id) => get(`${NOAA}/stations/${id}/datums.json?units=metric`))
  await cached(join(RAW, 'noaa-offsets'), S, 1, (id) => `${id}.json`, (id) => get(`${NOAA}/stations/${id}/tidepredoffsets.json`))
}

async function kartverket() {
  console.log('Kartverket station list and constituents…')
  const list = await get(`${KV}?tide_request=stationlist&type=perm&lang=en`)
  writeFileSync(join(RAW, 'kv-stations.xml'), list)
  const codes = [...list.matchAll(/code="([A-Z]{3})"/g)].map((m) => m[1])
  await cached(join(RAW, 'kv-constituents'), codes, 2, (c) => `${c}.xml`, (c) => get(`${KV}?tide_request=constituents&stationcode=${c}&lang=en`))
}

/**
 * Official predictions for a few stations, committed as the oracle the tests
 * compare our predictions with (data-src/tide-checks/).
 */
async function checks() {
  mkdirSync(CHECK, { recursive: true })
  const begin = '20270105'
  const end = '20270111'
  // Harmonic stations across the US, plus subordinate stations with ratio and fixed offsets.
  const noaaIds = ['9447130', '8518750', '8443970', '1612340', '9414290', '8771450', '9455920']
  for (const id of noaaIds) {
    const f = join(CHECK, `noaa-${id}.json`)
    if (existsSync(f)) continue
    const q = `begin_date=${begin}&end_date=${end}&station=${id}&product=predictions&datum=MLLW&time_zone=gmt&interval=hilo&units=metric&format=json&application=NOMAD-Almanac`
    writeFileSync(f, await get(`${NOAA_DATA}?${q}`))
    await sleep(300)
  }
  const sub = JSON.parse(readFileSync(join(RAW, 'noaa-stations.json'), 'utf8')).stations.filter((s) => s.type === 'S')
  const offsets = (id) => JSON.parse(readFileSync(join(RAW, 'noaa-offsets', `${id}.json`), 'utf8') || '{}')
  const pick = [
    ...sub.filter((s) => offsets(s.id).heightAdjustedType === 'R').slice(0, 3),
    ...sub.filter((s) => offsets(s.id).heightAdjustedType === 'F').slice(0, 3),
  ]
  for (const s of pick) {
    const f = join(CHECK, `noaa-${s.id}.json`)
    if (existsSync(f)) continue
    const q = `begin_date=${begin}&end_date=${end}&station=${s.id}&product=predictions&datum=MLLW&time_zone=gmt&interval=hilo&units=metric&format=json&application=NOMAD-Almanac`
    writeFileSync(f, await get(`${NOAA_DATA}?${q}`))
    await sleep(300)
  }
  for (const c of ['BGO', 'TOS', 'OSL', 'NYA']) {
    const f = join(CHECK, `kv-${c}.xml`)
    if (existsSync(f)) continue
    const st = readFileSync(join(RAW, 'kv-stations.xml'), 'utf8').match(new RegExp(`code="${c}" latitude="([\\d.-]+)" longitude="([\\d.-]+)"`))
    const q = `tide_request=locationdata&lat=${st[1]}&lon=${st[2]}&datatype=tab&refcode=msl&fromtime=2027-01-05T00:00&totime=2027-01-11T00:00&interval=60&tzone=0&lang=en&place=${c}&dst=0&file=`
    writeFileSync(f, await get(`${KV}?${q}`))
    await sleep(300)
  }
}

mkdirSync(RAW, { recursive: true })
await noaa()
await kartverket()
await checks()
console.log('done')
