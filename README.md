# NOMAD Almanac

Offline sun and moon times, compass declination and tide predictions
for any place on Earth, packaged as an app for [Project NOMAD](https://github.com/Crosstalk-Solutions/project-nomad).
Interface in Spanish and English.

Everything is computed in the browser from data bundled in the image. There is no
server code and no network access after the image is pulled; saved places live in
each browser's `localStorage`. Browser geolocation is deliberately not used
(NOMAD is served over plain HTTP and is meant to work offline): coordinates are
typed in, picked from saved places, or passed in the address.

## What it shows

- **Sun & Moon** — sunrise, sunset and solar noon with true and magnetic bearings,
  day length, civil/nautical/astronomical twilight, explicit polar day and night
  ("the sun does not rise today; next sunrise …"), moonrise/moonset/transit
  (0, 1 or 2 per local day), phase, illuminated fraction, age, distance, next
  principal phases, and the year's equinoxes and solstices.
- **Compass** — magnetic declination from WMM2025 with an East/West word, both
  bearing conversions (map → compass, compass → map), yearly change, inclination
  and field components, blackout/caution zone warnings and an expired-model
  banner after 2030. Degrees, degrees + minutes or NATO mils.
- **Tides** — 7-day high/low table and a 48-hour curve. Official stations within
  40 km are used first: NOAA CO-OPS (USA, harmonic and subordinate stations,
  heights on chart datum MLLW) and Kartverket (Norway, heights about mean sea
  level). Every other coast gets an estimate from the EOT20 global model, labelled
  as such, with the distance to the model cell. A "not for navigation" banner and a
  one-time acknowledgement come first. Times are rounded to 5 minutes; heights to
  5 cm on NOAA chart datum and to 10 cm about mean sea level. Checked against official
  predictions (`src/lib/tides.test.ts`): within about 10 minutes and a few per cent of
  the range, except Oslo (weak, flat tide: up to ~50 min and ~10 cm).

## Deep links

`?lat=40.4168&lng=-3.7038&name=Madrid&tz=Europe/Madrid` opens the almanac on a
place (`lon` is accepted for `lng`; `tz` and `name` are optional). Pages:
`#/sky`, `#/compass`, `#/tides`, `#/sources`.

## Data and licences

| What | Source | Licence |
|---|---|---|
| Sun and moon | [astronomy-engine](https://github.com/cosinekitty/astronomy) 2.1.19 | MIT (notice reproduced in the app: the npm package ships none) |
| Declination | World Magnetic Model 2025, NOAA NCEI / BGS (`src/data/WMM2025.COF`) | Public domain in the United States |
| Rise/set test fixtures | USNO Astronomical Applications API (`data-src/usno/`) | Public information, credit requested |
| Time zones | the browser's own ICU / IANA tz data | — |
| Tide engine | [@neaps/tide-predictor](https://github.com/openwatersio/neaps) 0.11.0 | MIT (notice reproduced in the app) |
| US tide stations | NOAA CO-OPS metadata API (`public/data/tides.json`) | Public domain; not official NOAA predictions |
| Norwegian tide stations | Kartverket water-level API | CC BY 4.0, ©Kartverket |
| Other coasts | EOT20, DGFI-TUM ([doi:10.17882/79489](https://doi.org/10.17882/79489)), coastal subset by this project | CC BY 4.0 |

These are computations, not official tables. Not affiliated with or endorsed by
NOAA, NCEI, BGS, the U.S. Navy, Kartverket or DGFI-TUM.

## Refreshing the tide data

```bash
node scripts/fetch-tides.mjs     # NOAA + Kartverket into data-raw/ (slow on purpose: 1 request/s)
node scripts/build-tides.mjs     # -> public/data/tides.json (committed)
python -I scripts/build-eot20.py # EOT20 NetCDF in data-raw/eot20/ -> public/data/eot20/ tiles
```

The EOT20 tiles are published as the `data-eot20-v1` release asset; the Dockerfile
fetches that file and checks its SHA-256 (`EOT20_SHA256`). After rebuilding the
tiles, upload a new asset under a new tag and update both build arguments.
`data-src/tide-checks/` holds official predictions the tests compare against.

## Development

```bash
npm ci
npm run dev      # http://localhost:5173
npm test         # WMM2025 official test values, USNO fixtures, DST days, coordinate parser
npm run build    # typecheck + build + offline guard (fails if the bundle reaches another host)
```

The image (`ghcr.io/furynocturn/nomad-almanac`) is built by
`.github/workflows/image.yml` for amd64 and arm64; the build runs the tests.
In NOMAD it listens on host port 8550.

## Licence

Apache 2.0, like Project NOMAD.
