import { useEffect, useMemo, useState } from 'react'
import { api, type Health, type ModelInfo, type Preset } from '../api'
import { NumberField, SelectField } from '../components/Field'
import { useI18n, withNode } from '../i18n'

export default function Settings() {
  const { t, lang } = useI18n()
  const [preset, setPreset] = useState<Preset | null>(null)
  const [health, setHealth] = useState<Health | null>(null)
  const [models, setModels] = useState<ModelInfo[]>([])
  const [modelError, setModelError] = useState('')
  const [filter, setFilter] = useState('')
  const [status, setStatus] = useState('')

  useEffect(() => {
    api.get<Preset>('/preset').then(setPreset)
    api.get<Health>('/health').then(setHealth).catch(() => setHealth(null))
    api.get<ModelInfo[]>('/models').then(setModels).catch((e) => setModelError(String(e)))
  }, [])

  const filtered = useMemo(() => {
    const f = filter.toLowerCase()
    return models.filter((m) => !f || m.id.toLowerCase().includes(f) || m.name.toLowerCase().includes(f)).slice(0, 80)
  }, [models, filter])

  if (!preset) return <div className="page muted">{t('Loading…')}</div>
  const set = <K extends keyof Preset>(key: K, value: Preset[K]) => setPreset({ ...preset, [key]: value })
  const currentModel = preset.model || health?.default_model || ''
  const selectedInfo = models.find((m) => m.id === currentModel)

  return (
    <div className="page">
      <div className="page-narrow stack">
        <h1>{t('Settings')}</h1>

        <section className="card stack">
          <h2>{t('Connections')}</h2>
          {health ? (
            <div className="kv">
              <span className="k">OpenRouter</span><span>{health.openrouter_configured ? t('API key set') : t('OPENROUTER_API_KEY missing in .env')}</span><span className={`badge ${health.openrouter_configured ? 'ok' : 'bad'}`}>{health.openrouter_configured ? t('ok') : t('off')}</span>
              <span className="k">Sage</span><span>{health.sage_configured ? (health.sage_ready ? t('API key set, /ready = 200') : t('API key set, service not ready')) : t('SAGE_API_KEY missing — turns run in degraded mode')}</span><span className={`badge ${health.sage_configured && health.sage_ready ? 'ok' : 'warn'}`}>{health.sage_configured && health.sage_ready ? t('ok') : t('degraded')}</span>
              <span className="k">{t('Summary model')}</span><span>{health.summary_model}</span><span />
            </div>
          ) : (
            <p className="error">{t('Backend not reachable.')}</p>
          )}
          <p className="muted small">{withNode(t('Keys are read from the {file} file in the project folder. They are never sent to the browser.'), 'file', <code>.env</code>)}</p>
        </section>

        <section className="card stack">
          <h2>{t('Narrator model (global)')}</h2>
          <div className="row">
            <span>{t('Current:')} <strong>{currentModel || '—'}</strong></span>
            {selectedInfo?.context_length && <span className="badge">{t('{n} ctx', { n: selectedInfo.context_length.toLocaleString(lang) })}</span>}
            {preset.model && <button className="small" onClick={() => set('model', '')}>{t('Use .env default')}</button>}
          </div>
          <input placeholder={t('Search OpenRouter models…')} value={filter} onChange={(e) => setFilter(e.target.value)} />
          {modelError && <div className="error">{modelError}</div>}
          <div style={{ maxHeight: 260, overflowY: 'auto' }} className="stack">
            {filtered.map((m) => (
              <div key={m.id} className={`list-item ${m.id === currentModel ? 'selected' : ''}`} style={{ padding: '5px 10px', cursor: 'pointer' }} onClick={() => set('model', m.id)}>
                <span style={{ flex: 1 }}>{m.name}</span>
                <span className="badge">{m.id}</span>
              </div>
            ))}
          </div>
          <div className="grid3">
            <NumberField label={t('Temperature')} value={preset.temperature} step={0.05} min={0} max={2} onChange={(v) => set('temperature', v ?? 0.9)} />
            <NumberField label={t('Max response tokens')} value={preset.max_tokens} min={64} onChange={(v) => set('max_tokens', v ?? 800)} />
            <NumberField label={t('Context size (tokens)')} value={preset.context_size} min={2000} onChange={(v) => set('context_size', v ?? 32000)} />
            <SelectField
              label={t('Sage reasoning')}
              value={preset.sage_reasoning}
              options={[{ value: 'off', label: t('off (fast)') }, { value: 'auto', label: t('auto') }, { value: 'on', label: t('on (slow)') }]}
              onChange={(v) => set('sage_reasoning', v)}
            />
          </div>
        </section>

        <div className="row">
          <button
            className="primary"
            onClick={async () => {
              try {
                setPreset(await api.put<Preset>('/preset', preset))
                setStatus(t('Saved'))
              } catch (e) {
                setStatus(String(e))
              }
              setTimeout(() => setStatus(''), 2000)
            }}
          >
            {t('Save settings')}
          </button>
          <span className="muted">{status}</span>
        </div>
      </div>
    </div>
  )
}
