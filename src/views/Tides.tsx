import { useEffect, useMemo, useState } from 'react'
import { type Key, useI18n } from '../i18n'
import { estimate, type GridPoint, loadGridPoint } from '../lib/eot20'
import type { SavedPlace } from '../lib/place'
import { usePersistentState } from '../lib/storage'
import { AUTO_KM, NEGLIGIBLE_M, type Prediction, type Station, type TideData, nearest, precision, predict, range, roundLevel, roundTime } from '../lib/tides'
import { dateLabel, hhmm, localDate, localDay } from '../lib/tz'

interface Props {
  place: SavedPlace
  start: number
}

let cache: Promise<TideData> | null = null
function loadStations(): Promise<TideData> {
  cache ??= fetch('./data/tides.json').then((r) => {
    if (!r.ok) throw new Error(String(r.status))
    return r.json() as Promise<TideData>
  })
  cache.catch(() => (cache = null))
  return cache
}

const DAY = 86400000

export default function Tides({ place, start }: Props) {
  const { t, lang, num } = useI18n()
  const [ack, setAck] = usePersistentState<boolean>('tide-ack', () => false)
  const [data, setData] = useState<TideData | null>(null)
  const [error, setError] = useState(false)
  const [choice, setChoice] = useState<string>('auto')
  const [grid, setGrid] = useState<GridPoint | null | 'loading'>('loading')

  useEffect(() => {
    loadStations().then(setData, () => setError(true))
  }, [])
  useEffect(() => setChoice('auto'), [place])
  useEffect(() => {
    let live = true
    setGrid('loading')
    loadGridPoint(place.lat, place.lon).then(
      (g) => live && setGrid(g),
      () => live && setGrid(null),
    )
    return () => {
      live = false
    }
  }, [place])

  const near = useMemo(() => (data ? nearest(data, place.lat, place.lon, 8) : []), [data, place])
  const picked = choice === 'auto' ? (near[0] && near[0].km <= AUTO_KM ? near[0] : null) : choice === 'model' ? null : near.find((x) => x.st.id === choice) ?? null
  const useModel = !picked && grid && grid !== 'loading'

  // Seven local days from the chosen date; the curve covers the first 48 hours.
  const days = useMemo(() => {
    const out: [number, number][] = []
    let s = start
    for (let i = 0; i < 7; i++) {
      const d = localDate(s + 12 * 3600000, place.zone)
      const r = localDay(d.y, d.m, d.d, place.zone)
      out.push(r)
      s = r[1]
    }
    return out
  }, [start, place.zone])

  const result = useMemo((): { pred: Prediction; st: Station; km: number } | null => {
    if (!ack) return null
    if (picked && data) return { pred: predict(data, picked.st, days[0][0], days[6][1]), st: picked.st, km: picked.km }
    if (useModel) {
      const st: Station = { id: 'eot20', n: 'EOT20', la: grid.lat, lo: grid.lon, s: 'eot20', cd: null }
      return { pred: estimate(grid, days[0][0], days[6][1]), st, km: grid.km }
    }
    return null
  }, [ack, data, picked, useModel, grid, days])

  if (!ack)
    return (
      <div className="view">
        <section className="card warn" role="dialog" aria-labelledby="ack-title">
          <h2 id="ack-title">{t('tide.ackTitle')}</h2>
          <p>{t('tide.ackText')}</p>
          <ul>
            <li>{t('tide.ackWeather')}</li>
            <li>{t('tide.ackDatum')}</li>
            <li>{t('tide.ackModel')}</li>
          </ul>
          <button className="primary" onClick={() => setAck(true)}>
            {t('tide.ackButton')}
          </button>
        </section>
      </div>
    )

  const prec = result ? precision(result.st) : { minutes: 5, metres: 0.1 }
  const lvl = (v: number) => `${num(roundLevel(v, prec.metres), prec.metres < 0.1 ? 2 : 1)} m`
  const tm = (ts: number) => hhmm(roundTime(ts, prec.minutes), place.zone)
  const rng = result ? range(result.pred.extremes) : 0

  return (
    <div className="view">
      <p className="banner" role="note">
        {t('tide.banner')}
      </p>
      {error && <p className="error">{t('tide.loadError')}</p>}
      {(data || (grid && grid !== 'loading')) && (
        <section className="card">
          <label className="inline wrap">
            <span>{t('tide.source')}</span>
            <select value={choice} onChange={(e) => setChoice(e.target.value)}>
              <option value="auto">{t('tide.auto')}</option>
              {near.map(({ st, km }) => (
                <option key={st.id} value={st.id}>
                  {st.n} · {t(`tide.src.${st.s}` as Key)} · {num(km, km < 10 ? 1 : 0)} km
                </option>
              ))}
              {grid && grid !== 'loading' && <option value="model">{t('tide.modelOption', { km: num(grid.km, 0) })}</option>}
            </select>
          </label>
          {result && (
            <p className="confidence">
              {result.st.s === 'eot20'
                ? t('tide.confModel', { km: num(result.km, 0) })
                : t(result.st.cd ? 'tide.confStationDatum' : 'tide.confStation', {
                    src: t(`tide.src.${result.st.s}` as Key),
                    name: result.st.n,
                    km: num(result.km, result.km < 10 ? 1 : 0),
                    datum: result.st.cd ?? '',
                  })}
              {result.st.ref && ` ${t('tide.subordinate')}`}
            </p>
          )}
          {!result && grid !== 'loading' && (
            <p className="callout">
              {near[0] ? t('tide.noneNear', { name: near[0].st.n, km: num(near[0].km, 0) }) : t('tide.noData')}{' '}
              {grid === null && t('tide.noCoast')}
            </p>
          )}
        </section>
      )}

      {result && (
        <>
          {rng < NEGLIGIBLE_M ? (
            <p className="callout">{t('tide.negligible')}</p>
          ) : (
            <section className="card">
              <h2>{t('tide.next48')}</h2>
              <TideCurve pred={result.pred} from={days[0][0]} to={days[0][0] + 2 * DAY} zone={place.zone} lvl={lvl} />
              <p className="muted small">{t('tide.range', { m: lvl(rng) })}</p>
            </section>
          )}
          <section className="card">
            <h2>{t('tide.table')}</h2>
            <div className="tide-days">
              {days.map(([a, b]) => {
                const ex = result.pred.extremes.filter((e) => e.t >= a && e.t < b)
                return (
                  <div key={a} className="tide-day">
                    <h4>{dateLabel(a, place.zone, lang, { weekday: 'short', day: 'numeric', month: 'short' })}</h4>
                    <table className="table">
                      <tbody>
                        {ex.map((e) => (
                          <tr key={e.t}>
                            <th scope="row">{t(e.high ? 'tide.high' : 'tide.low')}</th>
                            <td>{tm(e.t)}</td>
                            <td>{lvl(e.level)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              })}
            </div>
            <p className="muted small">{t(result.st.cd ? 'tide.datumChart' : 'tide.datumMsl', { datum: result.st.cd ?? '' })}</p>
            <p className="muted small">{t('place.clock', { zone: place.zone })}</p>
          </section>
        </>
      )}
    </div>
  )
}

function TideCurve({ pred, from, to, zone, lvl }: { pred: Prediction; from: number; to: number; zone: string; lvl: (v: number) => string }) {
  const pts = pred.curve.filter((p) => p.t >= from && p.t <= to)
  if (pts.length < 2) return null
  const W = 720
  const H = 200
  const pad = { l: 44, r: 8, t: 10, b: 24 }
  const lo = Math.min(...pts.map((p) => p.level))
  const hi = Math.max(...pts.map((p) => p.level))
  const x = (ts: number) => pad.l + ((ts - from) / (to - from)) * (W - pad.l - pad.r)
  const y = (v: number) => pad.t + (1 - (v - lo) / (hi - lo || 1)) * (H - pad.t - pad.b)
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)} ${y(p.level).toFixed(1)}`).join('')
  const now = Date.now()
  const ticks = [0, 6, 12, 18, 24, 30, 36, 42, 48].map((h) => from + h * 3600000)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="tide-curve" role="img" aria-label="">
      {ticks.map((ts) => (
        <g key={ts}>
          <line x1={x(ts)} x2={x(ts)} y1={pad.t} y2={H - pad.b} className="grid" />
          <text x={x(ts)} y={H - 6} textAnchor="middle" className="axis">
            {hhmm(ts, zone)}
          </text>
        </g>
      ))}
      <text x={4} y={y(hi) + 4} className="axis">
        {lvl(hi)}
      </text>
      <text x={4} y={y(lo)} className="axis">
        {lvl(lo)}
      </text>
      <path d={`${d}L${x(pts[pts.length - 1].t)} ${H - pad.b}L${x(pts[0].t)} ${H - pad.b}Z`} className="area" />
      <path d={d} className="line" />
      {pred.extremes
        .filter((e) => e.t >= from && e.t <= to)
        .map((e) => (
          <circle key={e.t} cx={x(e.t)} cy={y(Math.max(lo, Math.min(hi, e.level)))} r={3.5} className={e.high ? 'hi' : 'lo'} />
        ))}
      {now >= from && now <= to && <line x1={x(now)} x2={x(now)} y1={pad.t} y2={H - pad.b} className="now" />}
    </svg>
  )
}
