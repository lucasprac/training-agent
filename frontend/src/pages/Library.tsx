import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, type Profile, type RpSession, type Scenario } from '../api'
import { useConfirm } from '../confirm'
import { useI18n } from '../i18n'
import { useProfile } from '../profile'
import { scoreClass, startTraining } from '../training'

/** The manager's home: scenarios and every training session. */
export default function Library() {
  const { t, lang } = useI18n()
  const confirm = useConfirm()
  const navigate = useNavigate()
  const { profile } = useProfile()
  const [scenarios, setScenarios] = useState<Scenario[]>([])
  const [sessions, setSessions] = useState<(RpSession & { report?: { overall_percent?: number | null } })[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [error, setError] = useState('')

  const load = async () => {
    try {
      const [sc, se, pr] = await Promise.all([
        api.get<Scenario[]>('/scenarios'),
        api.get<RpSession[]>('/sessions'),
        api.get<Profile[]>('/profiles'),
      ])
      setScenarios(sc)
      setSessions(se)
      setProfiles(pr)
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

  const test = async (scenario: Scenario) => {
    if (!profile) return
    try {
      const session = await startTraining(scenario.id, profile.id)
      navigate(`/play/${session.id}`)
    } catch (e) {
      setError(String(e))
    }
  }

  const remove = async (path: string, question: string) => {
    if (!(await confirm(question, { danger: true, confirmLabel: t('Delete') }))) return
    await api.del(path)
    await load()
  }

  const scenarioTitle = (id: number) => scenarios.find((s) => s.id === id)?.title ?? `#${id}`
  const profileName = (id: number | null) => profiles.find((p) => p.id === id)?.name ?? t('(no profile)')

  return (
    <div className="page">
      <div className="page-narrow stack">
        <div className="row">
          <h1>{t('Scenarios')}</h1>
          <span className="spacer" />
          <button className="primary" onClick={createScenario}>{t('New scenario')}</button>
        </div>
        {error && <div className="error">{error}</div>}

        {scenarios.length === 0 && <p className="muted">{t('No scenarios yet. Create the first training scenario.')}</p>}
        {scenarios.map((s) => (
          <div key={s.id} className="list-item">
            <div style={{ flex: 1 }}>
              <div><strong>{s.title}</strong></div>
              <div className="muted small">{s.summary || s.world.slice(0, 140) || t('No description')}</div>
            </div>
            <Link to={`/scenarios/${s.id}`}><button>{t('Edit')}</button></Link>
            <button onClick={() => test(s)} title={t('Run the simulation yourself, with the inspector')}>{t('Test')}</button>
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
        {sessions.map((s) => {
          const percent = s.report?.overall_percent
          return (
            <div key={s.id} className="list-item">
              <div style={{ flex: 1 }}>
                <div>
                  <strong>{profileName(s.profile_id)}</strong> · {s.title || scenarioTitle(s.scenario_id)}{' '}
                  <span className="badge">{t('turn {n}', { n: s.turn_count })}</span>{' '}
                  {s.status === 'completed' ? <span className="badge ok">{t('completed')}</span> : <span className="badge">{t('in progress')}</span>}
                  {percent != null && <> <span className={`badge ${scoreClass(percent)}`}>{percent}%</span></>}
                </div>
                <div className="muted small">{new Date(s.created_at).toLocaleString(lang)}</div>
              </div>
              {s.status === 'completed' ? (
                <Link to={`/report/${s.id}`}><button className="primary">{t('Report')}</button></Link>
              ) : (
                <Link to={`/play/${s.id}`}><button>{t('Open')}</button></Link>
              )}
              <button className="ghost danger" title={t('Delete session')} onClick={() => remove(`/sessions/${s.id}`, t('Delete this session? This cannot be undone.'))}>✕</button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
