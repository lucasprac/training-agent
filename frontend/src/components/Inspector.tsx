import { useEffect, useState } from 'react'
import {
  api,
  type Character,
  type HarnessStatePublic,
  type Label,
  type LabelSet,
  type MemoryItem,
  type PostTurnReport,
  type PromptPublic,
  type RegistryEntry,
  type RpSession,
} from '../api'
import { CheckField, NumberField, TextField } from './Field'
import { useI18n, type MessageKey } from '../i18n'

type Names = Record<number, string>

type Translate = (key: MessageKey) => string

function fmt(value: unknown, names: Names, t: Translate): string {
  if (value === null || value === undefined) return '—'
  if (Array.isArray(value)) return value.map((v) => (typeof v === 'number' ? names[v] ?? `#${v}` : String(v))).join(', ') || '—'
  if (typeof value === 'boolean') return value ? t('yes') : t('no')
  return String(value)
}

const CERTAINTY: Record<string, MessageKey> = { high: 'high', low: 'low', carried: 'carried' }

function CertaintyBadge({ label }: { label: Label }) {
  const { t } = useI18n()
  const cls = label.locked ? 'accent' : label.certainty === 'high' ? 'ok' : label.certainty === 'carried' ? 'warn' : 'bad'
  const known = CERTAINTY[label.certainty]
  return <span className={`badge ${cls}`}>{label.locked ? t('locked') : known ? t(known) : label.certainty}</span>
}

const SOURCE_CLASS: Record<string, string> = { constant: 'accent', sticky: 'accent', 'keyword+sage': 'ok', keyword: 'warn', sage: 'ok' }

export function HarnessPanel({ state, report, names }: { state: HarnessStatePublic | null; report: PostTurnReport | null; names: Names }) {
  const { t } = useI18n()
  if (!state) return <p className="muted small">{t('Send a message to see what the harness decided for the turn.')}</p>
  const labels = state.labels?.labels ?? {}
  const sage = state.sage as { questions?: number; latency_ms?: number; reused?: boolean; errors?: Record<string, string> }
  return (
    <div className="stack">
      {state.degraded.length > 0 && (
        <div className="card" style={{ borderColor: 'var(--warn)' }}>
          <strong className="small">{t('Degraded mode')}</strong>
          {state.degraded.map((d) => <div key={d} className="small muted">{d}</div>)}
        </div>
      )}
      <div>
        <h3>Sage</h3>
        <div className="row small">
          <span className="badge">{t('{n} questions', { n: sage.questions ?? 0 })}</span>
          {sage.latency_ms !== undefined && <span className="badge">{sage.latency_ms} ms</span>}
          {sage.reused && <span className="badge accent">{t('reused (regenerate)')}</span>}
          {state.guard.ooc && <span className="badge warn">OOC</span>}
          {state.guard.limits === null && state.degraded.length === 0 && <span className="badge warn">{t('guard unsure')}</span>}
        </div>
        {sage.errors && <pre className="small error">{JSON.stringify(sage.errors, null, 1)}</pre>}
      </div>
      <div>
        <h3>{t('Labels')}</h3>
        <div className="kv">
          {Object.values(labels).map((l) => (
            <div key={l.key} style={{ display: 'contents' }}>
              <span className="k">{l.key}</span>
              <span>{fmt(l.value, names, t)} {l.probability !== null && <span className="muted small">p={l.probability.toFixed(2)}</span>}</span>
              <CertaintyBadge label={l} />
            </div>
          ))}
        </div>
      </div>
      <div>
        <h3>{t('Lore ({n})', { n: state.lore.length })}</h3>
        {state.lore.map((l) => (
          <div key={l.id} className="row small" style={{ marginBottom: 3 }}>
            <span style={{ flex: 1 }}>{l.title}</span>
            <span className={`badge ${SOURCE_CLASS[l.source] ?? ''}`}>{l.source}</span>
          </div>
        ))}
        {state.lore_dropped.length > 0 && <div className="small muted">{t('Over budget: {titles}', { titles: state.lore_dropped.map((l) => l.title).join(', ') })}</div>}
      </div>
      <div>
        <h3>{t('Memory in context ({n})', { n: state.memory.length })}</h3>
        {state.memory.map((m) => (
          <div key={m.id} className="small" style={{ marginBottom: 4 }}>
            <span className="badge">{m.kind}</span> {m.content}{' '}
            {m.known_by.length > 0 && <span className="badge warn">{t('known by {names}', { names: fmt(m.known_by, names, t) })}</span>}
          </div>
        ))}
      </div>
      {state.guidance.length > 0 && (
        <div>
          <h3>{t('Guidance')}</h3>
          {state.guidance.map((g) => <div key={g} className="small">{g}</div>)}
        </div>
      )}
      {report && (
        <div>
          <h3>{t('After the reply')}</h3>
          {report.memory_added.length === 0 && <div className="small muted">{t('No new memory.')}</div>}
          {report.memory_added.map((m, i) => (
            <div key={i} className="small" style={{ marginBottom: 4 }}>
              <span className="badge ok">+{m.kind}</span> {m.content}{' '}
              {m.known_by.length > 0 ? <span className="badge warn">{t('known by {names}', { names: fmt(m.known_by, names, t) })}</span> : <span className="badge">{t('shared')}</span>}
            </div>
          ))}
          {report.stalling !== undefined && <div className="small">{t('Stalling: {n} / 4', { n: report.stalling })}</div>}
          {report.location && <div className="small">{t('Location from extract: {location}', { location: report.location })}</div>}
          {report.summarized_upto_turn !== undefined && <div className="small">{t('Summary updated up to turn {n}', { n: report.summarized_upto_turn })}</div>}
          {report.errors.map((e) => <div key={e} className="small error">{e}</div>)}
        </div>
      )}
    </div>
  )
}

export function PromptPanel({ prompt, onPreview }: { prompt: PromptPublic | null; onPreview: () => void }) {
  const { t, lang } = useI18n()
  return (
    <div className="stack">
      <div className="row">
        <button className="small" onClick={onPreview}>{t('Preview next prompt')}</button>
        {prompt && <span className="small muted">{t('{tokens} / {budget} tokens · {n} chat messages', { tokens: prompt.tokens.toLocaleString(lang), budget: prompt.budget.toLocaleString(lang), n: prompt.history_kept })}</span>}
      </div>
      {!prompt && <p className="muted small">{t('The assembled prompt of the last turn appears here.')}</p>}
      {prompt && (
        <>
          <div className="section-bar" title={t('Token share per block')}>
            {prompt.sections.filter((s) => s.tokens > 0).map((s, i) => (
              <div key={i} title={`${s.block}: ${s.tokens}`} style={{ width: `${(100 * s.tokens) / Math.max(prompt.tokens, 1)}%` }} />
            ))}
          </div>
          <div className="row small">
            {Object.entries(prompt.trimmed).filter(([, n]) => n > 0).map(([k, n]) => <span key={k} className="badge warn">{t('trimmed {block}: {n}', { block: k, n })}</span>)}
          </div>
          {prompt.messages.map((m, i) => (
            <div key={i} className="prompt-msg">
              <div className="role">#{i} {m.role}</div>
              <pre>{m.content}</pre>
            </div>
          ))}
        </>
      )}
    </div>
  )
}

function MemoryRow({ item, characters, onChange }: { item: MemoryItem; characters: Character[]; onChange: () => void }) {
  const { t } = useI18n()
  const [content, setContent] = useState(item.content)
  useEffect(() => setContent(item.content), [item.content])
  const patch = async (data: Partial<MemoryItem>) => {
    await api.patch(`/memory/${item.id}`, data)
    onChange()
  }
  return (
    <div className="card stack" style={{ padding: 10, gap: 6, opacity: item.active ? 1 : 0.5 }}>
      <div className="row small">
        <span className="badge">{item.kind}</span>
        <span className="muted">{t('turn {n}', { n: item.source_turn })}</span>
        <span className="spacer" />
        <CheckField label={t('active')} checked={item.active} onChange={(v) => patch({ active: v })} />
        <button className="ghost small danger" onClick={async () => { await api.del(`/memory/${item.id}`); onChange() }}>✕</button>
      </div>
      <textarea rows={2} value={content} onChange={(e) => setContent(e.target.value)} onBlur={() => content !== item.content && patch({ content })} />
      <div className="row small">
        <span className="muted">{t('known by:')}</span>
        {characters.map((c) => (
          <CheckField
            key={c.id}
            label={c.name}
            checked={item.known_by.includes(c.id)}
            onChange={(v) => patch({ known_by: v ? [...item.known_by, c.id] : item.known_by.filter((k) => k !== c.id) })}
          />
        ))}
        {item.known_by.length === 0 && <span className="badge">{t('shared')}</span>}
      </div>
    </div>
  )
}

export function MemoryPanel({ sessionId, memory, characters, onChange }: { sessionId: number; memory: MemoryItem[]; characters: Character[]; onChange: () => void }) {
  const { t } = useI18n()
  return (
    <div className="stack">
      <div className="row">
        <span className="small muted">{t('{n} active items', { n: memory.filter((m) => m.active).length })}</span>
        <span className="spacer" />
        <button className="small" onClick={async () => { await api.post(`/sessions/${sessionId}/memory`, { kind: 'fact', content: t('New fact') }); onChange() }}>{t('+ Add')}</button>
      </div>
      {memory.map((m) => <MemoryRow key={m.id} item={m} characters={characters} onChange={onChange} />)}
    </div>
  )
}

export function LabelsPanel({ sessionId, labels, registry, characters, onChange }: {
  sessionId: number
  labels: LabelSet | null
  registry: RegistryEntry[]
  characters: Character[]
  onChange: () => void
}) {
  const { t } = useI18n()
  const names: Names = Object.fromEntries(characters.map((c) => [c.id, c.name]))
  const lock = async (key: string, value: unknown) => {
    await api.patch(`/sessions/${sessionId}/labels`, { key, value, locked: true })
    onChange()
  }
  const unlock = async (key: string) => {
    await api.patch(`/sessions/${sessionId}/labels`, { key, locked: false })
    onChange()
  }
  return (
    <div className="stack">
      <p className="small muted">{t('Labels are Sage answers in typed form. The narrator sees them as tag attributes, never as numbers. Lock a label to override Sage: a locked label is not asked and not changed.')}</p>
      {registry.map((spec) => {
        const label = labels?.labels[spec.key]
        return (
          <div key={spec.key} className="card stack" style={{ padding: 10, gap: 6 }}>
            <div className="row small">
              <strong style={{ fontFamily: 'var(--mono)' }}>{spec.key}</strong>
              <span className="badge">{spec.kind}</span>
              <span className="badge">{spec.phase}</span>
              <span className="spacer" />
              {label && <CertaintyBadge label={label} />}
            </div>
            <div className="small">{t('Value: {value}', { value: fmt(label?.value, names, t) })} {label && <span className="muted">{t('· source {source} · turn {n}', { source: label.source, n: label.turn })}</span>}</div>
            <div className="small muted">{t('null → {policy} · renders to {target}', { policy: spec.null_policy, target: spec.renders_to })}</div>
            {spec.lockable && (
              <LabelEditor spec={spec} label={label} characters={characters} onLock={(v) => lock(spec.key, v)} onUnlock={() => unlock(spec.key)} />
            )}
          </div>
        )
      })}
    </div>
  )
}

function LabelEditor({ spec, label, characters, onLock, onUnlock }: {
  spec: RegistryEntry
  label: Label | undefined
  characters: Character[]
  onLock: (value: unknown) => void
  onUnlock: () => void
}) {
  const { t } = useI18n()
  const [text, setText] = useState(label?.value == null ? '' : String(label.value))
  const [present, setPresent] = useState<number[]>(Array.isArray(label?.value) ? (label?.value as number[]) : [])
  useEffect(() => {
    setText(label?.value == null || Array.isArray(label?.value) ? '' : String(label.value))
    setPresent(Array.isArray(label?.value) ? (label.value as number[]) : [])
  }, [label?.value])
  if (label?.locked) return <div><button className="small" onClick={onUnlock}>{t('Unlock')}</button></div>
  if (spec.key === 'scene.present') {
    return (
      <div className="row small">
        {characters.map((c) => (
          <CheckField key={c.id} label={c.name} checked={present.includes(c.id)} onChange={(v) => setPresent(v ? [...present, c.id] : present.filter((p) => p !== c.id))} />
        ))}
        <button className="small" onClick={() => onLock(present)}>{t('Lock')}</button>
      </div>
    )
  }
  if (spec.kind === 'yesno') {
    return (
      <div className="row small">
        <button className="small" onClick={() => onLock(true)}>{t('Lock yes')}</button>
        <button className="small" onClick={() => onLock(false)}>{t('Lock no')}</button>
      </div>
    )
  }
  return (
    <div className="row small">
      <input style={{ flex: 1 }} value={text} onChange={(e) => setText(e.target.value)} placeholder={t('value')} />
      <button className="small" disabled={!text.trim()} onClick={() => onLock(text.trim())}>{t('Lock')}</button>
    </div>
  )
}

export function AuthorsNotePanel({ session, onSaved }: { session: RpSession; onSaved: (s: RpSession) => void }) {
  const [text, setText] = useState(session.authors_note ?? '')
  const [depth, setDepth] = useState<number | null>(session.authors_note_depth)
  const [freq, setFreq] = useState<number | null>(session.authors_note_frequency)
  const { t } = useI18n()
  const [saved, setSaved] = useState(false)
  return (
    <div className="stack">
      <p className="small muted">{t("The session Author's Note replaces the scenario and global default. Leave the text empty and save to use the default again.")}</p>
      <TextField label={t("Author's Note")} multiline rows={4} value={text} onChange={setText} />
      <div className="grid2">
        <NumberField label={t('Depth (empty = default)')} value={depth} min={0} onChange={setDepth} />
        <NumberField label={t('Frequency (empty = default)')} value={freq} min={0} onChange={setFreq} />
      </div>
      <TextField label={t('Story summary (rolling, editable)')} multiline rows={6} value={session.summary} onChange={(v) => onSaved({ ...session, summary: v })} />
      <div className="row">
        <button
          className="primary"
          onClick={async () => {
            const updated = await api.patch<RpSession>(`/sessions/${session.id}`, {
              authors_note: text.trim() ? text : null,
              authors_note_depth: depth,
              authors_note_frequency: freq,
              summary: session.summary,
            })
            onSaved(updated)
            setSaved(true)
            setTimeout(() => setSaved(false), 1500)
          }}
        >
          {saved ? t('Saved') : t('Save')}
        </button>
      </div>
    </div>
  )
}
