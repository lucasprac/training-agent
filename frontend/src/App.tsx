import { useEffect, useState } from 'react'
import { BrowserRouter, NavLink, Route, Routes } from 'react-router-dom'
import { api, type Health } from './api'
import { LANGUAGES, useI18n, type Lang } from './i18n'
import I18nProvider from './I18nProvider'
import ConfirmProvider from './ConfirmProvider'
import Library from './pages/Library'
import ScenarioEditor from './pages/ScenarioEditor'
import PromptManager from './pages/PromptManager'
import Play from './pages/Play'
import Settings from './pages/Settings'

function StatusBar() {
  const { t } = useI18n()
  const [health, setHealth] = useState<Health | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    api.get<Health>('/health').then(setHealth).catch(() => setFailed(true))
  }, [])
  if (failed) return <div className="status"><span><span className="dot" />{t('backend offline')}</span></div>
  if (!health) return null
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

function Shell() {
  const { t } = useI18n()
  return (
    <BrowserRouter>
      <div className="app">
        <header className="topbar">
          <div className="brand">Roleplay <span>Harness</span></div>
          <nav>
            <NavLink to="/" end>{t('Library')}</NavLink>
            <NavLink to="/prompt">{t('Prompt Manager')}</NavLink>
            <NavLink to="/settings">{t('Settings')}</NavLink>
          </nav>
          <StatusBar />
          <LanguageSelect />
        </header>
        <main style={{ minHeight: 0 }}>
          <Routes>
            <Route path="/" element={<Library />} />
            <Route path="/scenarios/:id" element={<ScenarioEditor />} />
            <Route path="/prompt" element={<PromptManager />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/play/:id" element={<Play />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}

export default function App() {
  return (
    <I18nProvider>
      <ConfirmProvider>
        <Shell />
      </ConfirmProvider>
    </I18nProvider>
  )
}
