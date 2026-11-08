# NOMAD Almanac

Offline sun and moon times, compass declination and (from v0.2) tide predictions
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

## Deep links

`?lat=40.4168&lng=-3.7038&name=Madrid&tz=Europe/Madrid` opens the almanac on a
place (`lon` is accepted for `lng`; `tz` and `name` are optional). Pages:
`#/sky`, `#/compass`, `#/sources`.

## Data and licences

| What | Source | Licence |
|---|---|---|
| Sun and moon | [astronomy-engine](https://github.com/cosinekitty/astronomy) 2.1.19 | MIT (notice reproduced in the app: the npm package ships none) |
| Declination | World Magnetic Model 2025, NOAA NCEI / BGS (`src/data/WMM2025.COF`) | Public domain in the United States |
| Rise/set test fixtures | USNO Astronomical Applications API (`data-src/usno/`) | Public information, credit requested |
| Time zones | the browser's own ICU / IANA tz data | — |

These are computations, not official tables. Not affiliated with or endorsed by
NOAA, NCEI, BGS or the U.S. Navy.

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
