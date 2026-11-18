import { useEffect, useState } from 'react'
import { api, type Assignment, type Profile, type ProfileRole, type Scenario } from '../api'
import { useConfirm } from '../confirm'
import { useI18n } from '../i18n'
import { useProfile } from '../profile'

function AssignForm({ profile, scenarios, onAdded }: { profile: Profile; scenarios: Scenario[]; onAdded: () => void }) {
  const { t } = useI18n()
  const [scenarioId, setScenarioId] = useState<number | ''>('')
  const [due, setDue] = useState('')
  const [error, setError] = useState('')
  const add = async () => {
    if (scenarioId === '') return
    try {
      await api.post('/assignments', { scenario_id: scenarioId, profile_id: profile.id, due_date: due || null })
      setScenarioId('')
      setDue('')
      onAdded()
    } catch (e) {
      setError(String(e))
    }
  }
  return (
    <div className="row small" style={{ alignItems: 'flex-end' }}>
      <label className="field" style={{ flex: 1, minWidth: 200 }}>
        {t('Scenario')}
        <select value={scenarioId} onChange={(e) => setScenarioId(e.target.value ? Number(e.target.value) : '')}>
          <option value="">{t('Choose a scenario')}</option>
          {scenarios.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
        </select>
      </label>
      <label className="field" style={{ width: 160 }}>
        {t('Due date (optional)')}
        <input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
      </label>
      <button disabled={scenarioId === ''} onClick={add}>{t('Assign')}</button>
      {error && <span className="error">{error}</span>}
    </div>
  )
}

/** Profiles and the scenarios assigned to each trainee. */
export default function Team() {
  const { t, lang } = useI18n()
  const confirm = useConfirm()
  const { profile: me, reload: reloadProfiles } = useProfile()
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [scenarios, setScenarios] = useState<Scenario[]>([])
  const [name, setName] = useState('')
  const [role, setRole] = useState<ProfileRole>('user')

  const load = async () => {
    const [p, a, s] = await Promise.all([
      api.get<Profile[]>('/profiles'),
      api.get<Assignment[]>('/assignments'),
      api.get<Scenario[]>('/scenarios'),
    ])
    setProfiles(p)
    setAssignments(a)
    setScenarios(s)
  }
  useEffect(() => {
    load()
  }, [])

  const create = async () => {
    if (!name.trim()) return
    await api.post('/profiles', { name: name.trim(), role })
    setName('')
    await Promise.all([load(), reloadProfiles()])
  }
  const remove = async (p: Profile) => {
    if (!(await confirm(t('Delete {name}? Their assignments are removed; their sessions stay.', { name: p.name }), { danger: true, confirmLabel: t('Delete') }))) return
    await api.del(`/profiles/${p.id}`)
    await Promise.all([load(), reloadProfiles()])
  }
  const title = (id: number) => scenarios.find((s) => s.id === id)?.title ?? `#${id}`

  return (
    <div className="page">
      <div className="page-narrow stack">
        <h1>{t('Team')}</h1>
        <div className="card row" style={{ alignItems: 'flex-end' }}>
          <label className="field" style={{ flex: 1 }}>
            {t('Name')}
            <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && create()} />
          </label>
          <label className="field" style={{ width: 170 }}>
            {t('Role')}
            <select value={role} onChange={(e) => setRole(e.target.value as ProfileRole)}>
              <option value="user">{t('trainee')}</option>
              <option value="manager">{t('manager')}</option>
            </select>
          </label>
          <button className="primary" disabled={!name.trim()} onClick={create}>{t('+ Add person')}</button>
        </div>

        {profiles.map((p) => {
          const own = assignments.filter((a) => a.profile_id === p.id)
          return (
            <div key={p.id} className="card stack" style={{ gap: 8 }}>
              <div className="row">
                <strong style={{ flex: 1 }}>{p.name || t('(no name)')}</strong>
                <span className={`badge ${p.role === 'manager' ? 'accent' : ''}`}>{p.role === 'manager' ? t('manager') : t('trainee')}</span>
                {p.id !== me?.id && <button className="ghost small danger" title={t('Delete')} onClick={() => remove(p)}>✕</button>}
              </div>
              {p.role === 'user' && (
                <>
                  {own.length === 0 && <div className="small muted">{t('No assigned scenarios.')}</div>}
                  {own.map((a) => (
                    <div key={a.id} className="row small">
                      <span style={{ flex: 1 }}>{title(a.scenario_id)}</span>
                      {a.due_date && <span className="badge warn">{t('due {date}', { date: new Date(`${a.due_date}T00:00`).toLocaleDateString(lang) })}</span>}
                      <button className="ghost small danger" title={t('Remove assignment')} onClick={async () => { await api.del(`/assignments/${a.id}`); load() }}>✕</button>
                    </div>
                  ))}
                  <AssignForm profile={p} scenarios={scenarios.filter((s) => !own.some((a) => a.scenario_id === s.id))} onAdded={load} />
                </>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
