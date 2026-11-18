import { useState } from 'react'
import { api, type Profile, type ProfileRole } from '../api'
import { useI18n } from '../i18n'
import { useProfile } from '../profile'

/** Choose who uses the platform now. There is no password: this is a prototype without login. */
export default function ProfilePicker() {
  const { t } = useI18n()
  const { profiles, select, reload } = useProfile()
  const [name, setName] = useState('')
  const [role, setRole] = useState<ProfileRole>('user')
  const [error, setError] = useState('')

  const create = async () => {
    if (!name.trim()) return
    try {
      const profile = await api.post<Profile>('/profiles', { name: name.trim(), role })
      await reload()
      select(profile)
    } catch (e) {
      setError(String(e))
    }
  }

  const managers = profiles.filter((p) => p.role === 'manager')
  const users = profiles.filter((p) => p.role === 'user')

  return (
    <div className="page">
      <div className="page-narrow stack" style={{ maxWidth: 560 }}>
        <h1>{t('Who are you?')}</h1>
        <p className="muted">{t('Choose a profile. There is no login: anyone on this computer can switch profiles.')}</p>
        {[{ title: t('Managers'), items: managers }, { title: t('Trainees'), items: users }].map((group) =>
          group.items.length > 0 && (
            <div key={group.title} className="stack" style={{ gap: 6 }}>
              <h3>{group.title}</h3>
              {group.items.map((p) => (
                <button key={p.id} className="list-item" onClick={() => select(p)}>
                  <span style={{ flex: 1 }}><strong>{p.name || t('(no name)')}</strong></span>
                  <span className={`badge ${p.role === 'manager' ? 'accent' : ''}`}>{p.role === 'manager' ? t('manager') : t('trainee')}</span>
                </button>
              ))}
            </div>
          ),
        )}
        <div className="card stack">
          <h2>{t('New profile')}</h2>
          <div className="row" style={{ alignItems: 'flex-end' }}>
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
            <button className="primary" disabled={!name.trim()} onClick={create}>{t('Create')}</button>
          </div>
          {error && <div className="error">{error}</div>}
        </div>
      </div>
    </div>
  )
}
