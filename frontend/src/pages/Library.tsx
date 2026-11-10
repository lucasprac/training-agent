import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, type Persona, type RpSession, type Scenario } from '../api'
import { useConfirm } from '../confirm'
import { useI18n } from '../i18n'

export default function Library() {
  const { t, lang } = useI18n()
  const confirm = useConfirm()
  const navigate = useNavigate()
  const [scenarios, setScenarios] = useState<Scenario[]>([])
  const [sessions, setSessions] = useState<RpSession[]>([])
  const [error, setError] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)

  const load = async () => {
    try {
      const [sc, se] = await Promise.all([api.get<Scenario[]>('/scenarios'), api.get<RpSession[]>('/sessions')])
      setScenarios(sc)
      setSessions(se)
    } catch (e) {
      setError(String(e))
    }
  }
  useEffect(() => {
    load()
  }, [])

  const createScenario = async () => {
    const scenario = await api.post<Scenario>('/scenarios', { title: t('New scenario') })
    navigate(`/scenarios/${scenario.id}`)
  }

  /** Each scenario has its own playable characters. With more than one, the review step lets the user choose. */
  const startSession = async (scenario: Scenario) => {
    try {
      const personas = await api.get<Persona[]>(`/personas?scenario_id=${scenario.id}`)
      if (personas.length > 1) {
        navigate(`/scenarios/${scenario.id}?step=review`)
        return
      }
      const session = await api.post<RpSession>('/sessions', { scenario_id: scenario.id, persona_id: personas[0]?.id ?? null })
      navigate(`/play/${session.id}`)
    } catch (e) {
      setError(String(e))
    }
  }

  const importCard = async (file: File) => {
    try {
      const result = await api.importCard(file)
      await load()
      navigate(`/scenarios/${result.scenario.id}`)
    } catch (e) {
      setError(t('Import failed: {error}', { error: String(e) }))
    }
  }

  const remove = async (path: string, question: string) => {
    if (!(await confirm(question, { danger: true, confirmLabel: t('Delete') }))) return
    await api.del(path)
    await load()
  }

  const scenarioTitle = (id: number) => scenarios.find((s) => s.id === id)?.title ?? `#${id}`

  return (
    <div className="page">
      <div className="page-narrow stack">
        <div className="row">
          <h1>{t('Library')}</h1>
          <span className="spacer" />
          <button onClick={() => fileInput.current?.click()}>{t('Import card')}</button>
          <input
            ref={fileInput}
            type="file"
            accept=".json,.png"
            hidden
            onChange={(e) => e.target.files?.[0] && importCard(e.target.files[0])}
          />
          <button className="primary" onClick={createScenario}>{t('New scenario')}</button>
        </div>
        {error && <div className="error">{error}</div>}

        <h3>{t('Scenarios')}</h3>
        {scenarios.length === 0 && <p className="muted">{t('No scenarios yet. Create one or import a SillyTavern card (JSON or PNG).')}</p>}
        {scenarios.map((s) => (
          <div key={s.id} className="list-item">
            <div style={{ flex: 1 }}>
              <div><strong>{s.title}</strong></div>
              <div className="muted small">{s.summary || s.world.slice(0, 140) || t('No description')}</div>
            </div>
            <Link to={`/scenarios/${s.id}`}><button>{t('Edit')}</button></Link>
            <button className="primary" onClick={() => startSession(s)}>{t('Play')}</button>
            <button
              className="ghost danger"
              title={t('Delete scenario')}
              onClick={() => remove(`/scenarios/${s.id}`, t('Delete "{title}" and all its sessions? This cannot be undone.', { title: s.title }))}
            >
              ✕
            </button>
          </div>
        ))}

        <h3 style={{ marginTop: 16 }}>{t('Sessions')}</h3>
        {sessions.length === 0 && <p className="muted">{t('No sessions yet.')}</p>}
        {sessions.map((s) => (
          <div key={s.id} className="list-item">
            <div style={{ flex: 1 }}>
              <div><strong>{s.title || scenarioTitle(s.scenario_id)}</strong> <span className="badge">{t('turn {n}', { n: s.turn_count })}</span></div>
              <div className="muted small">{scenarioTitle(s.scenario_id)} · {new Date(s.created_at).toLocaleString(lang)}</div>
            </div>
            <Link to={`/play/${s.id}`}><button className="primary">{t('Continue')}</button></Link>
            <button className="ghost danger" title={t('Delete session')} onClick={() => remove(`/sessions/${s.id}`, t('Delete this session? This cannot be undone.'))}>✕</button>
          </div>
        ))}
      </div>
    </div>
  )
}
