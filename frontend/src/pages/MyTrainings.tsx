import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, type Assignment, type RpSession, type Scenario } from '../api'
import { useI18n } from '../i18n'
import { useProfile } from '../profile'
import { scoreClass, startTraining } from '../training'

/** The trainee's home: assigned scenarios and their own sessions. */
export default function MyTrainings() {
  const { t, lang } = useI18n()
  const navigate = useNavigate()
  const { profile } = useProfile()
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [scenarios, setScenarios] = useState<Record<number, Scenario>>({})
  const [sessions, setSessions] = useState<(RpSession & { report?: { overall_percent?: number | null } })[]>([])
  const [error, setError] = useState('')
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!profile) return
    ;(async () => {
      try {
        const [a, sc, se] = await Promise.all([
          api.get<Assignment[]>(`/assignments?profile_id=${profile.id}`),
          api.get<Scenario[]>('/scenarios'),
          api.get<RpSession[]>(`/sessions?profile_id=${profile.id}`),
        ])
        setAssignments(a)
        setScenarios(Object.fromEntries(sc.map((s) => [s.id, s])))
        setSessions(se)
      } catch (e) {
        setError(String(e))
      }
      setLoaded(true)
    })()
  }, [profile?.id])

  if (!profile) return null
  if (!loaded) return <div className="page muted">{t('Loading…')}</div>

  const start = async (scenarioId: number) => {
    try {
      const session = await startTraining(scenarioId, profile.id)
      navigate(`/play/${session.id}`)
    } catch (e) {
      setError(String(e))
    }
  }

  return (
    <div className="page">
      <div className="page-narrow stack">
        <h1>{t('My trainings')}</h1>
        {error && <div className="error">{error}</div>}
        {assignments.length === 0 && <p className="muted">{t('No training is assigned to you yet.')}</p>}
        {assignments.map((a) => {
          const scenario = scenarios[a.scenario_id]
          if (!scenario) return null
          const done = sessions.filter((s) => s.scenario_id === a.scenario_id && s.status === 'completed').length
          const active = sessions.find((s) => s.scenario_id === a.scenario_id && s.status === 'active')
          return (
            <div key={a.id} className="card stack" style={{ gap: 8 }}>
              <div className="row">
                <strong style={{ flex: 1 }}>{scenario.title}</strong>
                {a.due_date && <span className="badge warn">{t('due {date}', { date: new Date(`${a.due_date}T00:00`).toLocaleDateString(lang) })}</span>}
                {done > 0 && <span className="badge ok">{t('{n} completed', { n: done })}</span>}
              </div>
              {scenario.summary && <div className="muted">{scenario.summary}</div>}
              {a.note && <div className="small">{a.note}</div>}
              <div className="row">
                {active ? (
                  <Link to={`/play/${active.id}`}><button className="primary">{t('Continue')}</button></Link>
                ) : (
                  <button className="primary" onClick={() => start(a.scenario_id)}>{done ? t('Practise again') : t('Start')}</button>
                )}
              </div>
            </div>
          )
        })}

        <h3 style={{ marginTop: 16 }}>{t('My sessions')}</h3>
        {sessions.length === 0 && <p className="muted">{t('No sessions yet.')}</p>}
        {sessions.map((s) => {
          const percent = s.report?.overall_percent
          return (
            <div key={s.id} className="list-item">
              <div style={{ flex: 1 }}>
                <div>
                  <strong>{s.title || scenarios[s.scenario_id]?.title}</strong>{' '}
                  {s.status === 'completed' ? <span className="badge ok">{t('completed')}</span> : <span className="badge">{t('in progress')}</span>}
                  {percent != null && <> <span className={`badge ${scoreClass(percent)}`}>{percent}%</span></>}
                </div>
                <div className="muted small">{new Date(s.created_at).toLocaleString(lang)}</div>
              </div>
              {s.status === 'completed' ? (
                <Link to={`/report/${s.id}`}><button className="primary">{t('Report')}</button></Link>
              ) : (
                <Link to={`/play/${s.id}`}><button>{t('Continue')}</button></Link>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
