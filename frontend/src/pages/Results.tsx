import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, type Profile, type ResultsTable, type RpSession, type Scenario } from '../api'
import { useI18n } from '../i18n'
import { scoreClass } from '../training'

/** Average scores of completed sessions, per trainee and competency. */
export default function Results() {
  const { t, lang } = useI18n()
  const [scenarios, setScenarios] = useState<Scenario[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [scenarioId, setScenarioId] = useState<number | ''>('')
  const [table, setTable] = useState<ResultsTable | null>(null)
  const [sessions, setSessions] = useState<(RpSession & { report?: { overall_percent?: number | null } })[]>([])

  useEffect(() => {
    api.get<Scenario[]>('/scenarios').then(setScenarios)
    api.get<Profile[]>('/profiles').then(setProfiles)
  }, [])
  useEffect(() => {
    const query = scenarioId === '' ? '' : `scenario_id=${scenarioId}`
    api.get<ResultsTable>(`/results?${query}`).then(setTable)
    api.get<RpSession[]>(`/sessions?status=completed${query ? `&${query}` : ''}`).then(setSessions)
  }, [scenarioId])

  const cell = (value: number | null | undefined) =>
    value === null || value === undefined ? <span className="muted">—</span> : <span className={`badge ${scoreClass(value)}`}>{value}%</span>
  const scenarioTitle = (id: number) => scenarios.find((s) => s.id === id)?.title ?? `#${id}`
  const profileName = (id: number | null) => profiles.find((p) => p.id === id)?.name ?? t('(no profile)')

  return (
    <div className="page">
      <div className="page-narrow stack">
        <div className="row">
          <h1 style={{ margin: 0, flex: 1 }}>{t('Results')}</h1>
          <select style={{ width: 'auto', minWidth: 240 }} value={scenarioId} onChange={(e) => setScenarioId(e.target.value ? Number(e.target.value) : '')}>
            <option value="">{t('All scenarios')}</option>
            {scenarios.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
          </select>
        </div>
        <p className="muted small">{t('The average of the completed sessions. A competency that a session did not observe does not count in its average.')}</p>
        {table && table.rows.length === 0 && <p className="muted">{t('No completed sessions yet.')}</p>}
        {table && table.rows.length > 0 && (
          <div className="table-wrap">
            <table className="results">
              <thead>
                <tr>
                  <th>{t('Trainee')}</th>
                  <th>{t('Sessions')}</th>
                  <th>{t('overall')}</th>
                  {table.competencies.map((c) => <th key={c.id}>{c.name}</th>)}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((r) => (
                  <tr key={r.profile_id ?? 'none'}>
                    <td>{r.name ?? t('(no profile)')}</td>
                    <td>{r.sessions}</td>
                    <td>{cell(r.overall_percent)}</td>
                    {table.competencies.map((c) => <td key={c.id}>{cell(r.competencies[String(c.id)])}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <h3 style={{ marginTop: 16 }}>{t('Completed sessions')}</h3>
        {sessions.map((s) => (
          <div key={s.id} className="list-item">
            <div style={{ flex: 1 }}>
              <div><strong>{profileName(s.profile_id)}</strong> · {scenarioTitle(s.scenario_id)} {cell(s.report?.overall_percent)}</div>
              <div className="muted small">{s.completed_at && new Date(s.completed_at).toLocaleString(lang)}</div>
            </div>
            <Link to={`/report/${s.id}`}><button>{t('Report')}</button></Link>
          </div>
        ))}
      </div>
    </div>
  )
}
