import { useEffect, useState } from 'react'
import { api, type BlockConfig, type GlobalRule, type Preset } from '../api'
import { CheckField, NumberField, SelectField, TextField } from '../components/Field'
import { useConfirm } from '../confirm'
import { useI18n, withNode } from '../i18n'

function RuleRow({ rule, first, last, onMove, onChange }: {
  rule: GlobalRule
  first: boolean
  last: boolean
  onMove: (dir: -1 | 1) => void
  onChange: () => void
}) {
  const { t } = useI18n()
  const [draft, setDraft] = useState(rule)
  const confirm = useConfirm()
  const dirty = draft.title !== rule.title || draft.text !== rule.text
  useEffect(() => setDraft(rule), [rule])
  const save = async (patch: Partial<GlobalRule>) => {
    await api.patch(`/rules/${rule.id}`, { ...draft, ...patch })
    onChange()
  }
  return (
    <div className="list-item" style={{ alignItems: 'flex-start', opacity: rule.enabled ? 1 : 0.55 }}>
      <div className="stack" style={{ gap: 2 }}>
        <button className="ghost small" disabled={first} onClick={() => onMove(-1)} title={t('Move up')}>▲</button>
        <button className="ghost small" disabled={last} onClick={() => onMove(1)} title={t('Move down')}>▼</button>
      </div>
      <div className="stack" style={{ flex: 1, gap: 6 }}>
        <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} style={{ fontWeight: 600 }} />
        <textarea rows={2} value={draft.text} onChange={(e) => setDraft({ ...draft, text: e.target.value })} />
      </div>
      <div className="stack" style={{ gap: 6 }}>
        <CheckField label={t('On')} checked={rule.enabled} onChange={(v) => save({ enabled: v })} />
        <button className="small primary" disabled={!dirty} onClick={() => save({})}>{t('Save')}</button>
        <button className="small danger" onClick={async () => { if (await confirm(t('Delete rule "{title}"?', { title: rule.title }), { danger: true, confirmLabel: t('Delete') })) { await api.del(`/rules/${rule.id}`); onChange() } }}>{t('Delete')}</button>
      </div>
    </div>
  )
}

export default function PromptManager() {
  const { t } = useI18n()
  const [preset, setPreset] = useState<Preset | null>(null)
  const [rules, setRules] = useState<GlobalRule[]>([])
  const [status, setStatus] = useState('')

  const loadRules = () => api.get<GlobalRule[]>('/rules').then((r) => setRules([...r].sort((a, b) => a.order - b.order)))
  useEffect(() => {
    api.get<Preset>('/preset').then(setPreset)
    loadRules()
  }, [])

  if (!preset) return <div className="page muted">{t('Loading…')}</div>
  const set = <K extends keyof Preset>(key: K, value: Preset[K]) => setPreset({ ...preset, [key]: value })

  const savePreset = async () => {
    try {
      setPreset(await api.put<Preset>('/preset', preset))
      setStatus(t('Saved'))
    } catch (e) {
      setStatus(String(e))
    }
    setTimeout(() => setStatus(''), 2000)
  }

  const moveRule = async (index: number, dir: -1 | 1) => {
    const next = [...rules]
    const [moved] = next.splice(index, 1)
    next.splice(index + dir, 0, moved)
    await Promise.all(next.map((r, i) => (r.order === i ? null : api.patch(`/rules/${r.id}`, { order: i }))))
    loadRules()
  }

  const blocks = preset.block_order
  const moveBlock = (index: number, dir: -1 | 1) => {
    const next = [...blocks]
    const [moved] = next.splice(index, 1)
    next.splice(index + dir, 0, moved)
    set('block_order', next)
  }
  const updateBlock = (index: number, patch: Partial<BlockConfig>) =>
    set('block_order', blocks.map((b, i) => (i === index ? { ...b, ...patch } : b)))

  return (
    <div className="page">
      <div className="page-narrow stack">
        <h1>{t('Prompt Manager')}</h1>
        <p className="muted small">
          {withNode(
            t('The global preset applies to every roleplay. Scenarios can override the main prompt and the post-history instructions (with {original}) and add scenario rules, but they cannot remove the global rules.'),
            'original',
            <code>{'{{original}}'}</code>,
          )}
        </p>

        <section className="card stack">
          <div className="row">
            <h2 style={{ margin: 0 }}>{t('Global rules')}</h2>
            <span className="spacer" />
            <button onClick={async () => { await api.post('/rules', { preset_id: preset.id, title: t('New rule'), text: '', order: rules.length }); loadRules() }}>{t('+ Add rule')}</button>
          </div>
          {rules.map((rule, i) => (
            <RuleRow key={rule.id} rule={rule} first={i === 0} last={i === rules.length - 1} onMove={(d) => moveRule(i, d)} onChange={loadRules} />
          ))}
        </section>

        <section className="card stack">
          <h2>{t('Prompts')}</h2>
          <TextField label={t('Main prompt → <main_prompt>')} multiline rows={6} code value={preset.main_prompt} onChange={(v) => set('main_prompt', v)} />
          <TextField label={t('Harness legend → <harness_legend> (explains the tags and their authority)')} multiline rows={8} code value={preset.harness_legend} onChange={(v) => set('harness_legend', v)} />
          <TextField label={t('Post-history instructions → <post_history> (sent last)')} multiline rows={4} code value={preset.post_history} onChange={(v) => set('post_history', v)} />
        </section>

        <section className="card stack">
          <h2>{t("Author's Note (default)")}</h2>
          <TextField label={t('Text')} multiline rows={2} value={preset.authors_note} onChange={(v) => set('authors_note', v)} />
          <div className="grid3">
            <SelectField
              label={t('Position')}
              value={preset.authors_note_position}
              options={[{ value: 'in_chat', label: t('In chat @ depth') }, { value: 'after_scenario', label: t('After scenario') }]}
              onChange={(v) => set('authors_note_position', v)}
            />
            <NumberField label={t('Depth')} value={preset.authors_note_depth} min={0} onChange={(v) => set('authors_note_depth', v ?? 4)} />
            <NumberField label={t('Frequency (0 = never, 1 = every message)')} value={preset.authors_note_frequency} min={0} onChange={(v) => set('authors_note_frequency', v ?? 1)} />
          </div>
        </section>

        <section className="card stack">
          <h2>{t('Block order')}</h2>
          <p className="muted small">{t("Blocks above Chat History form the system prompt, in this order. In-chat injections (Author's Note, @depth lore, character notes, scene note) are placed inside the history by depth. Required blocks cannot be turned off.")}</p>
          {blocks.map((b, i) => {
            const required = preset.required_blocks.includes(b.id)
            const fixedLast = b.id === 'post_history'
            return (
              <div key={b.id} className="list-item" style={{ padding: '6px 10px', opacity: b.enabled ? 1 : 0.5 }}>
                <button className="ghost small" disabled={i === 0 || fixedLast} onClick={() => moveBlock(i, -1)}>▲</button>
                <button className="ghost small" disabled={i >= blocks.length - 2 || fixedLast} onClick={() => moveBlock(i, 1)}>▼</button>
                <span style={{ flex: 1 }}>{preset.block_labels[b.id] ?? b.id} <span className="badge">{b.id}</span></span>
                {b.id !== 'chat_history' && !fixedLast && (
                  <select style={{ width: 120 }} value={b.role} onChange={(e) => updateBlock(i, { role: e.target.value as BlockConfig['role'] })}>
                    <option value="system">system</option>
                    <option value="user">user</option>
                    <option value="assistant">assistant</option>
                  </select>
                )}
                <CheckField label={required ? t('required') : t('on')} checked={b.enabled || required} disabled={required} onChange={(v) => updateBlock(i, { enabled: v })} />
              </div>
            )
          })}
          <div className="grid3">
            <NumberField label={t('Scene note depth')} value={preset.scene_note_depth} min={0} onChange={(v) => set('scene_note_depth', v ?? 1)} />
            <NumberField label={t('Lore budget (% of context)')} value={preset.lore_budget_pct} min={1} max={90} onChange={(v) => set('lore_budget_pct', v ?? 25)} />
          </div>
        </section>

        <div className="row" style={{ position: 'sticky', bottom: 0, background: 'var(--bg)', padding: '10px 0' }}>
          <button className="primary" onClick={savePreset}>{t('Save preset')}</button>
          <span className="muted">{status}</span>
        </div>
      </div>
    </div>
  )
}
