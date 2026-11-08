import { useMemo, useState } from 'react'
import { useI18n } from '../i18n'
import { type AngleUnit, angle, bearing } from '../lib/format'
import type { SavedPlace } from '../lib/place'
import { usePersistentState } from '../lib/storage'
import { dateLabel } from '../lib/tz'
import { WMM_EPOCH, WMM_NAME, WMM_VALID_UNTIL, compassZone, decimalYear, magneticField, magneticToTrue, trueToMagnetic } from '../lib/wmm'

interface Props {
  place: SavedPlace
  start: number
}

/** Reads a typed bearing in degrees (dot or comma). */
const readBearing = (s: string) => {
  const v = Number(s.replace(',', '.'))
  return s.trim() !== '' && Number.isFinite(v) ? v : null
}

export default function Compass({ place, start }: Props) {
  const { t, lang, num } = useI18n()
  const [unit, setUnit] = usePersistentState<AngleUnit>('angle-unit', () => 'deg')
  const [mapIn, setMapIn] = useState('90')
  const [compassIn, setCompassIn] = useState('120')
  const year = decimalYear(new Date(start))
  const m = useMemo(() => magneticField(place.lat, place.lon, (place.elev ?? 0) / 1000, year), [place, year])
  const zone = compassZone(m.h)
  const east = m.decl >= 0
  const dir = t(east ? 'compass.east' : 'compass.west')
  const deg = angle(m.decl, unit, lang)
  const mapB = readBearing(mapIn)
  const compB = readBearing(compassIn)
  const nT = (v: number) => `${num(v, 0)} nT`

  return (
    <div className="view">
      <section className="card">
        <h2>{t('compass.title')}</h2>
        <p className="lead">{t('compass.intro')}</p>
        {year >= WMM_VALID_UNTIL && <p className="callout">{t('compass.expired', { model: WMM_NAME, until: WMM_VALID_UNTIL })}</p>}
        {year < WMM_EPOCH && <p className="callout">{t('compass.before', { model: WMM_NAME, from: WMM_EPOCH })}</p>}
        {zone !== 'ok' && <p className="callout danger">{t(zone === 'blackout' ? 'compass.blackout' : 'compass.caution')}</p>}
        <div className="decl">
          <CompassRose decl={m.decl} />
          <div>
            <div className="huge">{t('compass.value', { deg, dir })}</div>
            <p>{t(east ? 'compass.explainEast' : 'compass.explainWest', { deg })}</p>
            <p className="muted">
              {t('compass.change', {
                deg: angle(m.declDot, unit === 'mil' ? 'deg' : unit, lang, 2),
                dir: t(m.declDot >= 0 ? 'compass.east' : 'compass.west').toLowerCase(),
              })}
            </p>
          </div>
        </div>
        <label className="inline">
          <span>{t('compass.units')}</span>
          <select value={unit} onChange={(e) => setUnit(e.target.value as AngleUnit)}>
            <option value="deg">{t('compass.unitDeg')}</option>
            <option value="dm">{t('compass.unitDm')}</option>
            <option value="mil">{t('compass.unitMil')}</option>
          </select>
        </label>
      </section>

      <section className="card">
        <h3>{t('compass.convert')}</h3>
        <div className="cols">
          <label>
            <span>{t('compass.mapToCompass')}</span>
            <input value={mapIn} onChange={(e) => setMapIn(e.target.value)} inputMode="decimal" aria-label={t('compass.mapBearing')} />
            <strong className="result">
              {mapB !== null && t('compass.result', { map: bearing(mapB, unit, lang), compass: bearing(trueToMagnetic(mapB, m.decl), unit, lang) })}
            </strong>
          </label>
          <label>
            <span>{t('compass.compassToMap')}</span>
            <input value={compassIn} onChange={(e) => setCompassIn(e.target.value)} inputMode="decimal" aria-label={t('compass.compassBearing')} />
            <strong className="result">
              {compB !== null && t('compass.resultBack', { compass: bearing(compB, unit, lang), map: bearing(magneticToTrue(compB, m.decl), unit, lang) })}
            </strong>
          </label>
        </div>
      </section>

      <details className="card">
        <summary>{t('compass.details')}</summary>
        <dl className="facts">
          <dt>{t('compass.incl')}</dt>
          <dd>{num(m.incl, 2)}°</dd>
          <dt>{t('compass.inclDot')}</dt>
          <dd>
            {num(m.inclDot, 3)}° {t('compass.perYear')}
          </dd>
          <dt>{t('compass.h')}</dt>
          <dd>{nT(m.h)}</dd>
          <dt>{t('compass.x')}</dt>
          <dd>{nT(m.x)}</dd>
          <dt>{t('compass.y')}</dt>
          <dd>{nT(m.y)}</dd>
          <dt>{t('compass.z')}</dt>
          <dd>{nT(m.z)}</dd>
          <dt>{t('compass.f')}</dt>
          <dd>{nT(m.f)}</dd>
        </dl>
      </details>
      <p className="muted small">{t('compass.note')}</p>
      <p className="muted small">
        {t('compass.model', { model: WMM_NAME, date: dateLabel(start, place.zone, lang), elev: num(place.elev ?? 0, 0) })}
      </p>
    </div>
  )
}

/** True north up; the needle shows where magnetic north is. */
function CompassRose({ decl }: { decl: number }) {
  const shown = Math.max(-60, Math.min(60, decl))
  return (
    <svg viewBox="0 0 120 120" className="rose" role="img" aria-hidden="true">
      <circle cx="60" cy="60" r="54" className="rose-ring" />
      <line x1="60" y1="60" x2="60" y2="10" className="rose-true" />
      <text x="60" y="8" textAnchor="middle" className="rose-label">N</text>
      <g transform={`rotate(${shown} 60 60)`}>
        <path d="M60 14 L66 60 L60 54 L54 60 Z" className="rose-needle" />
        <text x="60" y="30" textAnchor="middle" className="rose-mag">M</text>
      </g>
    </svg>
  )
}
