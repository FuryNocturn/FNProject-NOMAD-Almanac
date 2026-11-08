import { useEffect, useMemo, useState } from 'react'
import { LANGUAGES, type Lang, useI18n } from './i18n'
import { toDms } from './lib/coords'
import { type SavedPlace, placeFromUrl, todayIn } from './lib/place'
import { usePersistentState } from './lib/storage'
import { localDay } from './lib/tz'
import Compass from './views/Compass'
import PlaceEditor from './views/PlaceEditor'
import Sky from './views/Sky'
import Sources from './views/Sources'

const TABS = ['sky', 'compass', 'sources'] as const
type TabId = (typeof TABS)[number]

/** Hash routing (#/compass), so the static site needs no server rewrites and the back button works. */
function useRoute(): string {
  const read = () => location.hash.replace(/^#\/?/, '')
  const [route, setRoute] = useState(read)
  useEffect(() => {
    const onChange = () => setRoute(read())
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return route
}

const validPlace = (p: unknown): p is SavedPlace =>
  !!p && typeof p === 'object' && Number.isFinite((p as SavedPlace).lat) && Number.isFinite((p as SavedPlace).lon) && typeof (p as SavedPlace).zone === 'string'

export default function App() {
  const { t, lang, setLang } = useI18n()
  const route = useRoute()
  const tab: TabId = (TABS as readonly string[]).includes(route) ? (route as TabId) : 'sky'
  const [stored, setPlace] = usePersistentState<SavedPlace | null>('place', () => placeFromUrl(location.search))
  const [saved, setSaved] = usePersistentState<SavedPlace[]>('saved', () => [])
  const place = validPlace(stored) ? stored : null
  const [editing, setEditing] = useState(false)
  const [date, setDate] = useState('')

  // A place in the address wins over the remembered one, once.
  useEffect(() => {
    const p = placeFromUrl(location.search)
    if (p) setPlace(p)
  }, [setPlace])

  const day = date || (place ? todayIn(place.zone) : '')
  const range = useMemo(() => {
    if (!place || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return null
    const [y, m, d] = day.split('-').map(Number)
    return localDay(y, m, d, place.zone)
  }, [place, day])

  useEffect(() => {
    document.title = `${t(`tab.${tab}`)} · ${t('app.name')}`
  }, [tab, t])

  const use = (p: SavedPlace) => {
    setPlace(p)
    setEditing(false)
    setDate('')
  }

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <h1>{t('app.name')}</h1>
          <p>{t('app.subtitle')}</p>
        </div>
        <label className="lang">
          <span>{t('app.language')}</span>
          <select value={lang} onChange={(e) => setLang(e.target.value as Lang)}>
            {Object.entries(LANGUAGES).map(([code, name]) => (
              <option key={code} value={code}>
                {name}
              </option>
            ))}
          </select>
        </label>
      </header>

      {place && !editing ? (
        <section className="placebar card">
          <div>
            <strong>{place.name || t('place.unnamed')}</strong>
            <div className="muted small">
              {toDms(place.lat, 'lat')} {toDms(place.lon, 'lon')} · {place.lat.toFixed(4)}, {place.lon.toFixed(4)}
              {place.elev ? ` · ${place.elev} m` : ''}
            </div>
            <div className="muted small">{t('place.clock', { zone: place.zone })}</div>
          </div>
          <div className="row">
            <label className="inline">
              <span>{t('place.date')}</span>
              <input type="date" value={day} onChange={(e) => setDate(e.target.value)} />
            </label>
            {date && <button onClick={() => setDate('')}>{t('place.today')}</button>}
            <button onClick={() => setEditing(true)}>{t('place.change')}</button>
          </div>
        </section>
      ) : (
        <>
          {!place && <p className="lead">{t('place.none')}</p>}
          <PlaceEditor
            initial={place}
            saved={saved}
            onUse={use}
            onSave={(p) => (setSaved([...saved, p].slice(-50)), use(p))}
            onRemove={(i) => setSaved(saved.filter((_, j) => j !== i))}
            onClose={place ? () => setEditing(false) : undefined}
          />
        </>
      )}

      <nav className="tabs" aria-label={t('app.sections')}>
        {TABS.map((x) => (
          <a key={x} href={`#/${x}`} aria-current={x === tab ? 'page' : undefined}>
            {t(`tab.${x}`)}
          </a>
        ))}
      </nav>
      <main>
        {tab === 'sources' && <Sources />}
        {tab !== 'sources' && place && range && (tab === 'sky' ? <Sky place={place} start={range[0]} end={range[1]} /> : <Compass place={place} start={range[0]} />)}
      </main>
    </div>
  )
}
