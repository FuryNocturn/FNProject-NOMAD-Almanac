import { useMemo } from 'react'
import { type Key, useI18n } from '../i18n'
import { bearing, duration } from '../lib/format'
import type { SavedPlace } from '../lib/place'
import { type Event, moonDay, phaseKey, seasons, sunDay } from '../lib/sky'
import { dateLabel, hhmm } from '../lib/tz'
import { decimalYear, magneticField, trueToMagnetic } from '../lib/wmm'

interface Props {
  place: SavedPlace
  start: number
  end: number
}

/** Moon disc lit on the correct side for the hemisphere (waxing is lit on the right in the north). */
function MoonGlyph({ phase, southern }: { phase: number; southern: boolean }) {
  const r = 40
  const k = Math.cos((phase * Math.PI) / 180) // 1 new … -1 full
  const waxing = phase < 180
  // Lit half on the right while waxing (northern view); the terminator is an ellipse of half-width r·|k|.
  const litRight = waxing !== southern
  const sweepOuter = litRight ? 1 : 0
  const rx = Math.abs(k) * r
  const sweepInner = (k > 0) === litRight ? 0 : 1
  const d = `M50 ${50 - r} A${r} ${r} 0 0 ${sweepOuter} 50 ${50 + r} A${rx} ${r} 0 0 ${sweepInner} 50 ${50 - r}Z`
  return (
    <svg viewBox="0 0 100 100" className="moon" aria-hidden="true">
      <circle cx="50" cy="50" r={r} className="moon-dark" />
      <path d={d} className="moon-lit" />
    </svg>
  )
}

export default function Sky({ place, start, end }: Props) {
  const { t, lang, num } = useI18n()
  const z = place.zone
  const sun = useMemo(() => sunDay(place, start, end), [place, start, end])
  const moon = useMemo(() => moonDay(place, start, end), [place, start, end])
  const decl = useMemo(() => magneticField(place.lat, place.lon, (place.elev ?? 0) / 1000, decimalYear(new Date(start))).decl, [place, start])
  const year = new Date((start + end) / 2).getUTCFullYear()
  const seas = useMemo(() => seasons(year), [year])
  // Evening events after midnight are marked as belonging to the next day.
  const time = (ts: number | null) => (ts === null ? t('sun.never') : `${hhmm(ts, z)}${ts >= end ? ' (+1)' : ''}`)
  const day = (ts: number) => dateLabel(ts, z, lang, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
  const az = (e: Event) =>
    t('sun.azTrue', { az: bearing(e.az!, 'deg', lang), mag: bearing(trueToMagnetic(e.az!, decl), 'deg', lang) })
  // A time from another local day (e.g. a moonrise after midnight) never shows here: events are per local day.
  const moonList = (list: Event[]) => (list.length ? list.map((e) => hhmm(e.t, z)).join(' · ') : t('moon.none'))

  return (
    <div className="view">
      <div className="cols">
        <section className="card">
          <h2>{t('sun.title')}</h2>
          {sun.polar && (
            <p className="callout">
              {t(sun.polar === 'down' ? 'sun.polarDown' : 'sun.polarUp')}{' '}
              {sun.nextChange && t(sun.polar === 'down' ? 'sun.nextRise' : 'sun.nextSet', { date: `${day(sun.nextChange)} ${hhmm(sun.nextChange, z)}` })}
            </p>
          )}
          <dl className="facts">
            {sun.rise && (
              <>
                <dt>{t('sun.rise')}</dt>
                <dd>
                  <strong className="big">{hhmm(sun.rise.t, z)}</strong>
                  <span className="muted small">{az(sun.rise)}</span>
                </dd>
              </>
            )}
            {sun.noon && (
              <>
                <dt>{t('sun.noon')}</dt>
                <dd>
                  <strong className="big">{hhmm(sun.noon.t, z)}</strong>
                  <span className="muted small">{t('sun.altitude', { alt: `${num(sun.noon.alt!, 1)}°` })}</span>
                </dd>
              </>
            )}
            {sun.set && (
              <>
                <dt>{t('sun.set')}</dt>
                <dd>
                  <strong className="big">{time(sun.set.t)}</strong>
                  <span className="muted small">{az(sun.set)}</span>
                </dd>
              </>
            )}
            <dt>{t('sun.dayLength')}</dt>
            <dd>
              <strong>{duration(sun.dayLength)}</strong>
            </dd>
          </dl>
          <h3>{t('sun.twilight')}</h3>
          <table className="table">
            <thead>
              <tr>
                <th />
                <th>{t('sun.dawn')}</th>
                <th>{t('sun.dusk')}</th>
              </tr>
            </thead>
            <tbody>
              {(['civil', 'nautical', 'astronomical'] as const).map((k) => (
                <tr key={k}>
                  <th scope="row">{t(`sun.${k}` as Key)}</th>
                  <td>{time(sun[k][0])}</td>
                  <td>{time(sun[k][1])}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {sun.astronomical[0] === null && sun.astronomical[1] === null && sun.polar !== 'down' && <p className="muted small">{t('sun.noNight')}</p>}
          <p className="muted small">{t('sun.note')}</p>
        </section>

        <section className="card">
          <h2>{t('moon.title')}</h2>
          <div className="moon-row">
            <MoonGlyph phase={moon.phase} southern={place.lat < 0} />
            <div>
              <strong className="big">{t(`phase.${phaseKey(moon.phase)}` as Key)}</strong>
              <div className="muted">
                {t('moon.lit')}: {num(moon.fraction * 100, 0)} % · {t('moon.age')}: {t('moon.ageDays', { n: num(moon.age, 1) })}
              </div>
            </div>
          </div>
          {moon.polar && <p className="callout">{t(moon.polar === 'up' ? 'moon.allUp' : 'moon.allDown')}</p>}
          <dl className="facts">
            <dt>{t('moon.rise')}</dt>
            <dd>{moonList(moon.rises)}</dd>
            <dt>{t('moon.transit')}</dt>
            <dd>{moonList(moon.transits)}</dd>
            <dt>{t('moon.set')}</dt>
            <dd>{moonList(moon.sets)}</dd>
            <dt>{t('moon.distance')}</dt>
            <dd>{num(moon.distanceKm, 0)} km</dd>
          </dl>
          <h3>{t('moon.next')}</h3>
          <ul className="plain">
            {moon.quarters.map((q) => (
              <li key={q.t}>
                <strong>{t(`phase.${(['new', 'firstQuarter', 'full', 'lastQuarter'] as const)[q.quarter]}` as Key)}</strong>{' '}
                <span className="muted">
                  {day(q.t)} {hhmm(q.t, z)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="card">
        <h3>{t('season.title', { year })}</h3>
        <ul className="plain seasons">
          {(
            [
              ['season.mar', seas.marEquinox],
              ['season.jun', seas.junSolstice],
              ['season.sep', seas.sepEquinox],
              ['season.dec', seas.decSolstice],
            ] as const
          ).map(([k, ts]) => (
            <li key={k}>
              <strong>{t(k)}</strong> <span className="muted">{day(ts)} {hhmm(ts, z)}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
