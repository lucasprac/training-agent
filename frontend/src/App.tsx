import { useEffect, useState, type ReactNode } from 'react'
import { BrowserRouter, Navigate, NavLink, Route, Routes } from 'react-router-dom'
import { api, type Health } from './api'
import { LANGUAGES, useI18n, type Lang } from './i18n'
import I18nProvider from './I18nProvider'
import ConfirmProvider from './ConfirmProvider'
import ProfileProvider from './ProfileProvider'
import { useProfile } from './profile'
import Library from './pages/Library'
import MyTrainings from './pages/MyTrainings'
import ScenarioEditor from './pages/ScenarioEditor'
import Competencies from './pages/Competencies'
import Team from './pages/Team'
import Results from './pages/Results'
import PromptManager from './pages/PromptManager'
import Play from './pages/Play'
import Report from './pages/Report'
import Settings from './pages/Settings'
import ProfilePicker from './pages/ProfilePicker'

function StatusBar() {
  const { t } = useI18n()
  const [health, setHealth] = useState<Health | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    api.get<Health>('/health').then(setHealth).catch(() => setFailed(true))
  }, [])
  if (failed) return <div className="status"><span><span className="dot" />{t('backend offline')}</span></div>
  if (!health) return <div className="status" />
  return (
    <div className="status">
      <span title={t('OpenRouter API key')}><span className={`dot ${health.openrouter_configured ? 'on' : ''}`} />OpenRouter</span>
      <span title={t('Sage API key and /ready')}><span className={`dot ${health.sage_configured && health.sage_ready ? 'on' : ''}`} />Sage</span>
    </div>
  )
}

function LanguageSelect() {
  const { lang, setLang, t } = useI18n()
  return (
    <select aria-label={t('Language')} title={t('Language')} style={{ width: 'auto' }} value={lang} onChange={(e) => setLang(e.target.value as Lang)}>
      {LANGUAGES.map((l) => (
        <option key={l.value} value={l.value}>{l.label}</option>
      ))}
    </select>
  )
}

function ProfileBadge() {
  const { t } = useI18n()
  const { profile, select } = useProfile()
  if (!profile) return null
  return (
    <span className="row small" style={{ gap: 6 }}>
      <strong>{profile.name}</strong>
      <span className={`badge ${profile.role === 'manager' ? 'accent' : ''}`}>{profile.role === 'manager' ? t('manager') : t('trainee')}</span>
      <button className="ghost small" onClick={() => select(null)}>{t('Switch profile')}</button>
    </span>
  )
}

/** Manager-only pages send a trainee back to their trainings. */
function ManagerOnly({ children }: { children: ReactNode }) {
  const { profile } = useProfile()
  return profile?.role === 'manager' ? <>{children}</> : <Navigate to="/" replace />
}

function Shell() {
  const { t } = useI18n()
  const { profile, loading } = useProfile()
  const manager = profile?.role === 'manager'
  return (
    <BrowserRouter>
      <div className="app">
        <header className="topbar">
          <div className="brand">Training <span>Agent</span></div>
          {profile && (
            <nav>
              {manager ? (
                <>
                  <NavLink to="/" end>{t('Scenarios')}</NavLink>
                  <NavLink to="/competencies">{t('Competencies')}</NavLink>
                  <NavLink to="/team">{t('Team')}</NavLink>
                  <NavLink to="/results">{t('Results')}</NavLink>
                  <NavLink to="/prompt">{t('Prompt Manager')}</NavLink>
                  <NavLink to="/settings">{t('Settings')}</NavLink>
                </>
              ) : (
                <NavLink to="/" end>{t('My trainings')}</NavLink>
              )}
            </nav>
          )}
          <StatusBar />
          <ProfileBadge />
          <LanguageSelect />
        </header>
        <main style={{ minHeight: 0 }}>
          {loading ? (
            <div className="page muted">{t('Loading…')}</div>
          ) : !profile ? (
            <ProfilePicker />
          ) : (
            <Routes>
              <Route path="/" element={manager ? <Library /> : <MyTrainings />} />
              <Route path="/scenarios/:id" element={<ManagerOnly><ScenarioEditor /></ManagerOnly>} />
              <Route path="/competencies" element={<ManagerOnly><Competencies /></ManagerOnly>} />
              <Route path="/team" element={<ManagerOnly><Team /></ManagerOnly>} />
              <Route path="/results" element={<ManagerOnly><Results /></ManagerOnly>} />
              <Route path="/prompt" element={<ManagerOnly><PromptManager /></ManagerOnly>} />
              <Route path="/settings" element={<ManagerOnly><Settings /></ManagerOnly>} />
              <Route path="/play/:id" element={<Play />} />
              <Route path="/report/:id" element={<Report />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          )}
        </main>
      </div>
    </BrowserRouter>
  )
}

export default function App() {
  return (
    <I18nProvider>
      <ConfirmProvider>
        <ProfileProvider>
          <Shell />
        </ProfileProvider>
      </ConfirmProvider>
    </I18nProvider>
  )
}
