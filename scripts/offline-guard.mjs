// Post-build check that the built app stays offline: no JavaScript may load
// anything from another host. Relative fetches (./data) are fine.
// The only absolute URLs allowed are the ones the sources list prints as plain
// text and standard namespace/licence identifiers.
import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const dist = resolve(import.meta.dirname, '../dist')
const ALLOWED = [
  /^http:\/\/www\.w3\.org\//, // XML/SVG/MathML namespaces
  /^https?:\/\/(www\.)?(ncei\.noaa\.gov|tidesandcurrents\.noaa\.gov|kartverket\.no|linz\.govt\.nz|seanoe\.org)\b/,
  /^https:\/\/github\.com\/cosinekitty\/astronomy$/, // astronomy-engine error message text
  /^https?:\/\/reactjs\.org\/docs\/error-decoder/, // React error messages (text only)
  /^https?:\/\/react\.dev\/errors\//,
]
const files = readdirSync(join(dist, 'assets')).filter((f) => f.endsWith('.js'))
const bad = []
for (const f of files) {
  const js = readFileSync(join(dist, 'assets', f), 'utf8')
  for (const [url] of js.matchAll(/https?:\/\/[^\s"'`)<>\\]+/g)) if (!ALLOWED.some((re) => re.test(url))) bad.push(`${f}: ${url}`)
  for (const api of ['new WebSocket', 'XMLHttpRequest', 'navigator.geolocation', 'sendBeacon'])
    if (js.includes(api)) bad.push(`${f}: uses ${api}`)
  for (const [, arg] of js.matchAll(/fetch\(\s*([^)]{0,60})/g))
    if (/https?:/.test(arg)) bad.push(`${f}: fetch(${arg})`)
}
if (bad.length) {
  console.error('offline guard: the build reaches outside the box:\n  ' + bad.join('\n  '))
  process.exit(1)
}
console.log(`offline guard: ${files.length} bundle(s) clean`)
