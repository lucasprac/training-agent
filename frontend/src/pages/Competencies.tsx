import { useEffect, useState } from 'react'
import { api, type Competency, type RubricLevel } from '../api'
import { CheckField, TextField } from '../components/Field'
import { IndicatorsEditor, LevelsEditor } from '../components/Rubric'
import { useConfirm } from '../confirm'
import { useI18n } from '../i18n'

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

function CompetencyForm({ item, onSaved, onDeleted }: { item: Competency; onSaved: () => void; onDeleted: () => void }) {
  const { t } = useI18n()
  const confirm = useConfirm()
  const [draft, setDraft] = useState(item)
  const [status, setStatus] = useState('')
  useEffect(() => setDraft(item), [item])
  const dirty = !same(draft, item)
  const set = <K extends keyof Competency>(key: K, value: Competency[K]) => setDraft({ ...draft, [key]: value })
  const save = async () => {
    try {
      await api.patch(`/competencies/${item.id}`, draft)
      setStatus(t('Saved'))
      onSaved()
    } catch (e) {
      setStatus(String(e))
    }
    setTimeout(() => setStatus(''), 2500)
  }
  return (
    <div className="stack">
      <TextField label={t('Name')} value={draft.name} onChange={(v) => set('name', v)} />
      <TextField label={t('Description (Sage reads it to judge the competency)')} multiline rows={2} value={draft.description} onChange={(v) => set('description', v)} />
      <CheckField label={t('Enabled')} checked={draft.enabled} onChange={(v) => set('enabled', v)} />
      <div>
        <h3>{t('Observable behaviours')}</h3>
        <p className="small muted">{t('Sage tags each behaviour that a trainee message shows. The report counts them.')}</p>
        <IndicatorsEditor indicators={draft.indicators} onChange={(v) => set('indicators', v)} />
      </div>
      <div>
        <h3>{t('Rubric')}</h3>
        <p className="small muted">{t('Sage scores each message on these levels. Describe what each level looks like in a message.')}</p>
        <LevelsEditor levels={draft.levels} onChange={(v) => set('levels', v)} />
      </div>
      <div className="row">
        <button className="primary" disabled={!dirty} onClick={save}>{t('Save')}</button>
        <button className="danger" onClick={async () => {
          if (await confirm(t('Delete "{name}"? The scenarios that use it lose it.', { name: item.name || t('(no name)') }), { danger: true, confirmLabel: t('Delete') })) {
            await api.del(`/competencies/${item.id}`)
            onDeleted()
          }
        }}>{t('Delete')}</button>
        {dirty && <span className="small muted">{t('Unsaved changes')}</span>}
        {status && <span className={status === t('Saved') ? 'small ok-text' : 'error'}>{status}</span>}
      </div>
    </div>
  )
}

/** The company's competency library. Scenarios pick competencies from it. */
export default function Competencies() {
  const { t } = useI18n()
  const [items, setItems] = useState<Competency[]>([])
  const [selected, setSelected] = useState<number | null>(null)
  const load = async () => setItems(await api.get<Competency[]>('/competencies'))
  useEffect(() => {
    load()
  }, [])

  const defaultLevels: RubricLevel[] = [t('Not shown'), t('Weak'), t('Partial'), t('Good'), t('Excellent')].map((description, level) => ({ level, description }))
  const add = async () => {
    const c = await api.post<Competency>('/competencies', { name: t('New competency'), levels: defaultLevels })
    await load()
    setSelected(c.id)
  }
  const current = items.find((c) => c.id === selected) ?? items[0]

  return (
    <div className="page">
      <div className="page-narrow stack">
        <h1>{t('Competencies')}</h1>
        <p className="muted">{t('The company library. Each scenario chooses the competencies that it trains. The same competency in several scenarios lets you compare results.')}</p>
        <div className="split">
          <div className="stack" style={{ gap: 6 }}>
            <button onClick={add}>{t('+ Add competency')}</button>
            {items.map((c) => (
              <button key={c.id} className={`list-item ${current?.id === c.id ? 'selected' : ''}`} style={{ opacity: c.enabled ? 1 : 0.5 }} onClick={() => setSelected(c.id)}>
                <span style={{ flex: 1 }}>{c.name || <em className="muted">{t('(no name)')}</em>}</span>
                <span className="badge">{c.levels.length}</span>
              </button>
            ))}
          </div>
          <div className="card">
            {current ? (
              <CompetencyForm key={current.id} item={current} onSaved={load} onDeleted={() => { setSelected(null); load() }} />
            ) : (
              <p className="muted">{t('No competencies yet.')}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
