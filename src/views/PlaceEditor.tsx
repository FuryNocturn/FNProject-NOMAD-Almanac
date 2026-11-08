import { useMemo, useState } from 'react'
import { type Key, useI18n } from '../i18n'
import { parseCoords } from '../lib/coords'
import type { SavedPlace } from '../lib/place'
import { browserZone, fixedOffset, formatFixed, isValidZone, nauticalZone, zoneList } from '../lib/tz'

interface Props {
  initial: SavedPlace | null
  saved: SavedPlace[]
  onUse: (p: SavedPlace) => void
  onSave: (p: SavedPlace) => void
  onRemove: (i: number) => void
  onClose?: () => void
}

type ZoneMode = 'browser' | 'list' | 'offset' | 'nautical'

/** "+5:30", "-3", "5" → minutes, or null. */
function parseOffset(s: string): number | null {
  const m = /^\s*([+-]?)(\d{1,2})(?:[:.,h]?(\d{2}))?\s*$/.exec(s)
  if (!m || Number(m[2]) > 14 || Number(m[3] ?? 0) > 59) return null
  return (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] ?? 0))
}

export default function PlaceEditor({ initial, saved, onUse, onSave, onRemove, onClose }: Props) {
  const { t } = useI18n()
  const bz = browserZone()
  const zones = useMemo(zoneList, [])
  const [name, setName] = useState(initial?.name ?? '')
  const [coords, setCoords] = useState(initial ? `${initial.lat}, ${initial.lon}` : '')
  const [elev, setElev] = useState(String(initial?.elev ?? 0))
  const initZone = initial?.zone ?? bz
  const initFixed = fixedOffset(initZone)
  const [mode, setMode] = useState<ZoneMode>(initZone === bz ? 'browser' : initFixed !== null ? 'offset' : 'list')
  const [zone, setZone] = useState(initFixed === null ? initZone : bz)
  const [offset, setOffset] = useState(initFixed !== null ? formatFixed(initFixed).replace('UTC', '') || '0' : '')
  const [error, setError] = useState<string | null>(null)

  const parsed = parseCoords(coords)
  const lon = typeof parsed === 'object' ? parsed.lon : 0

  const build = (): SavedPlace | null => {
    if (typeof parsed !== 'object') {
      setError(t(`place.err.${parsed}` as Key))
      return null
    }
    let z = bz
    if (mode === 'list') z = zone
    if (mode === 'nautical') z = nauticalZone(parsed.lon)
    if (mode === 'offset') {
      const o = parseOffset(offset)
      if (o === null) {
        setError(t('place.err.zone'))
        return null
      }
      z = formatFixed(o)
    }
    if (!isValidZone(z)) {
      setError(t('place.err.zone'))
      return null
    }
    setError(null)
    return { name: name.trim().slice(0, 80), lat: parsed.lat, lon: parsed.lon, elev: Math.max(-500, Math.min(9000, Number(elev.replace(',', '.')) || 0)), zone: z }
  }

  return (
    <section className="card editor" aria-label={t('place.title')}>
      <div className="editor-grid">
        <label>
          <span>{t('place.coords')}</span>
          <input value={coords} onChange={(e) => setCoords(e.target.value)} placeholder="40,4168 -3,7038" inputMode="text" autoFocus={!initial} />
          <small className="muted">{t('place.coordsHelp')}</small>
        </label>
        <label>
          <span>{t('place.name')}</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
        </label>
        <label>
          <span>{t('place.elev')}</span>
          <input value={elev} onChange={(e) => setElev(e.target.value)} inputMode="decimal" />
        </label>
        <fieldset className="zone">
          <legend>{t('place.zone')}</legend>
          <label className="radio">
            <input type="radio" checked={mode === 'browser'} onChange={() => setMode('browser')} />
            {t('place.zoneBrowser', { zone: bz })}
          </label>
          <label className="radio">
            <input type="radio" checked={mode === 'list'} onChange={() => setMode('list')} />
            <select value={zone} onChange={(e) => (setZone(e.target.value), setMode('list'))} aria-label={t('place.zone')}>
              {zones.map((z) => (
                <option key={z}>{z}</option>
              ))}
            </select>
          </label>
          <label className="radio">
            <input type="radio" checked={mode === 'offset'} onChange={() => setMode('offset')} />
            {t('place.zoneOffset')}
            <input className="short" value={offset} onChange={(e) => (setOffset(e.target.value), setMode('offset'))} placeholder={t('place.offsetHelp')} />
          </label>
          <label className="radio">
            <input type="radio" checked={mode === 'nautical'} onChange={() => setMode('nautical')} />
            {t('place.zoneNautical', { zone: nauticalZone(lon) })}
          </label>
        </fieldset>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="row">
        <button className="primary" onClick={() => { const p = build(); if (p) onUse(p) }}>
          {t('place.save')}
        </button>
        <button onClick={() => { const p = build(); if (p) onSave(p) }}>{t('place.saveAs')}</button>
        {onClose && <button onClick={onClose}>{t('place.close')}</button>}
      </div>
      <p className="muted small">{t('place.noGeo')}</p>
      {saved.length > 0 && (
        <>
          <h3>{t('place.saved')}</h3>
          <ul className="saved">
            {saved.map((p, i) => (
              <li key={`${p.name}-${p.lat}-${p.lon}-${i}`}>
                <button className="link" onClick={() => onUse(p)}>
                  {p.name || t('place.unnamed')}
                </button>
                <span className="muted small">
                  {p.lat.toFixed(4)}, {p.lon.toFixed(4)} · {p.zone}
                </span>
                <button className="small-btn" onClick={() => onRemove(i)} aria-label={`${t('place.remove')} ${p.name}`}>
                  {t('place.remove')}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}
