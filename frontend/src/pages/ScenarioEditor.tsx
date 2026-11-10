import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { api, type Character, type LoreEntry, type Persona, type Scenario } from '../api'
import { CheckField, ListField, NumberField, SelectField, TextField } from '../components/Field'
import { useConfirm } from '../confirm'
import { useI18n, type MessageKey } from '../i18n'

/**
 * World building is a guided flow: the user follows the steps in order, but can jump to any step.
 * Required steps feed the review checklist; optional steps never block play.
 */
type StepId = 'premise' | 'characters' | 'persona' | 'lore' | 'opening' | 'tuning' | 'review'

const STEPS: { id: StepId; title: MessageKey; guide: MessageKey; optional?: boolean }[] = [
  { id: 'premise', title: 'Premise', guide: 'Start with the world. Describe the place, the time and the situation at the start of the story. Then choose the themes: they tell the narrator which genres and tones to keep. The narrator reads this text on every turn.' },
  { id: 'characters', title: 'Characters', guide: 'Add the characters that the narrator plays. Give each character a description. A personality and a speech style make the voice more consistent. Your own character goes in the next step.' },
  { id: 'persona', title: 'Your character', guide: "Create the character that you play in this roleplay. You can create more than one and choose one when you start a session. The narrator never writes your character's actions, words or thoughts." },
  { id: 'lore', title: 'Lorebook', optional: true, guide: 'Add places, factions, items and secrets. An entry goes into the prompt only when one of its keys appears in the chat, or on every turn when it is constant. Location entries let the harness track the current scene.' },
  { id: 'opening', title: 'Opening', guide: 'Write the first message of the story and the rules for this scenario. The rules are added after the global rules.' },
  { id: 'tuning', title: 'Fine-tuning', optional: true, guide: 'Change these settings only when the global prompt does not fit this scenario. Empty fields use the global values.' },
  { id: 'review', title: 'Review and play', guide: 'Check the list. Then choose your character and start a session.' },
]
const isStepId = (value: string | null): value is StepId => STEPS.some((s) => s.id === value)

const POSITIONS: { value: string; label: MessageKey }[] = [
  { value: 'before_char', label: 'Before char defs' },
  { value: 'after_char', label: 'After char defs' },
  { value: 'an_top', label: "Top of Author's Note" },
  { value: 'an_bottom', label: "Bottom of Author's Note" },
  { value: 'at_depth', label: '@ Depth (in chat)' },
]
const LOGIC = [
  { value: 'and_any', label: 'AND ANY' },
  { value: 'and_all', label: 'AND ALL' },
  { value: 'not_any', label: 'NOT ANY' },
  { value: 'not_all', label: 'NOT ALL' },
]
const KINDS = ['location', 'faction', 'item', 'concept', 'character', 'other'] as const satisfies readonly MessageKey[]
const isKnownKind = (kind: string): kind is (typeof KINDS)[number] => (KINDS as readonly string[]).includes(kind)

const THEME_SUGGESTIONS = [
  'Fantasy', 'Science fiction', 'Horror', 'Mystery', 'Romance', 'Adventure', 'Drama', 'Comedy',
  'Noir', 'Political intrigue', 'Survival', 'Historical', 'Post-apocalyptic', 'Slice of life',
] as const satisfies readonly MessageKey[]

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

function useSaver() {
  const { t } = useI18n()
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | string>('idle')
  const run = async (fn: () => Promise<unknown>) => {
    setState('saving')
    try {
      await fn()
      setState('saved')
      setTimeout(() => setState('idle'), 1500)
      return true
    } catch (e) {
      setState(String(e))
      return false
    }
  }
  const label = state === 'saving' ? t('Saving…') : state === 'saved' ? t('Saved') : t('Save')
  const error = !['idle', 'saving', 'saved'].includes(state) ? state : ''
  return { run, label, error }
}

/** Which steps are complete. Optional steps count as complete when they have content. */
function stepStatus(draft: Scenario, characters: Character[], personas: Persona[], lore: LoreEntry[]): Record<StepId, boolean> {
  return {
    premise: Boolean(draft.title.trim() && draft.world.trim()),
    characters: characters.some((c) => c.name.trim() && c.description.trim()),
    persona: personas.some((p) => p.name.trim()),
    lore: lore.length > 0,
    opening: Boolean(draft.opening_message.trim() || characters.some((c) => c.first_message.trim())),
    tuning: Boolean(
      draft.model.trim() || draft.main_prompt_override.trim() || draft.post_history_override.trim() || draft.authors_note.trim() ||
        draft.authors_note_depth != null || draft.authors_note_frequency != null,
    ),
    review: false,
  }
}

type SetField = <K extends keyof Scenario>(key: K, value: Scenario[K]) => void

function PremiseStep({ draft, set }: { draft: Scenario; set: SetField }) {
  const { t } = useI18n()
  return (
    <div className="stack">
      <TextField label={t('Title')} value={draft.title} onChange={(v) => set('title', v)} />
      <TextField label={t('Short summary (library card)')} value={draft.summary} onChange={(v) => set('summary', v)} />
      <TextField
        label={t('World and situation → <scenario>')}
        multiline
        rows={10}
        value={draft.world}
        placeholder={t('Example: A port city in 1720. Pirates control the harbor. The governor has just been murdered…')}
        onChange={(v) => set('world', v)}
      />
      <ThemesField themes={draft.themes} onChange={(v) => set('themes', v)} />
    </div>
  )
}

function ThemesField({ themes, onChange }: { themes: string[]; onChange: (themes: string[]) => void }) {
  const { t } = useI18n()
  const has = (theme: string) => themes.some((x) => x.toLowerCase() === theme.toLowerCase())
  const toggle = (theme: string) => onChange(has(theme) ? themes.filter((x) => x.toLowerCase() !== theme.toLowerCase()) : [...themes, theme])
  return (
    <div className="stack" style={{ gap: 6 }}>
      <ListField
        label={t('Themes → <themes> (comma-separated genres and tones)')}
        value={themes}
        onChange={onChange}
        hint={t('Example: dark fantasy, political intrigue, slow-burn romance')}
      />
      <div className="chips" aria-label={t('Suggested themes')}>
        {THEME_SUGGESTIONS.map((key) => {
          const label = t(key)
          return (
            <button key={key} type="button" className={`chip ${has(label) ? 'on' : ''}`} aria-pressed={has(label)} onClick={() => toggle(label)}>
              {has(label) ? '✓ ' : '+ '}{label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function OpeningStep({ draft, set, characters }: { draft: Scenario; set: SetField; characters: Character[] }) {
  const { t } = useI18n()
  const fallback = characters.find((c) => c.first_message.trim())
  return (
    <div className="stack">
      <TextField
        label={t('Opening message (macros allowed: {{user}}, {{char}})')}
        multiline
        rows={6}
        value={draft.opening_message}
        onChange={(v) => set('opening_message', v)}
        hint={
          draft.opening_message.trim()
            ? undefined
            : fallback
              ? t('Empty: the session starts with the first message of {name}.', { name: fallback.name })
              : t('Empty, and no character has a first message: the session starts without a narrator message.')
        }
      />
      <TextField
        label={t('Scenario rules → <scenario_rules> (added after the global rules; cannot remove them)')}
        multiline
        value={draft.scenario_rules}
        onChange={(v) => set('scenario_rules', v)}
      />
    </div>
  )
}

function TuningStep({ draft, set }: { draft: Scenario; set: SetField }) {
  const { t } = useI18n()
  return (
    <div className="stack">
      <TextField label={t('Model override (OpenRouter id, empty = global)')} value={draft.model} onChange={(v) => set('model', v)} />
      <h3>{t('Overrides')}</h3>
      <TextField
        label={t('Main prompt override — use {{original}} to keep the global main prompt')}
        multiline
        code
        value={draft.main_prompt_override}
        onChange={(v) => set('main_prompt_override', v)}
      />
      <TextField
        label={t('Post-history instructions override — use {{original}} to keep the global text')}
        multiline
        code
        value={draft.post_history_override}
        onChange={(v) => set('post_history_override', v)}
      />
      <h3>{t("Author's Note default")}</h3>
      <TextField label={t('Text (empty = global default)')} multiline rows={2} value={draft.authors_note} onChange={(v) => set('authors_note', v)} />
      <div className="grid3">
        <NumberField label={t('Depth (empty = global)')} value={draft.authors_note_depth} min={0} onChange={(v) => set('authors_note_depth', v)} />
        <NumberField label={t('Frequency (empty = global)')} value={draft.authors_note_frequency} min={0} onChange={(v) => set('authors_note_frequency', v)} />
      </div>
    </div>
  )
}

interface FormProps<T> {
  onSaved: () => void
  onDeleted: () => void
  onDirtyChange: (dirty: boolean) => void
  item: T
}

function CharacterForm({ item: character, onSaved, onDeleted, onDirtyChange }: FormProps<Character>) {
  const { t } = useI18n()
  const confirm = useConfirm()
  const [draft, setDraft] = useState(character)
  const saver = useSaver()
  useEffect(() => setDraft(character), [character])
  const dirty = !same(draft, character)
  useEffect(() => onDirtyChange(dirty), [dirty])
  const set = <K extends keyof Character>(key: K, value: Character[K]) => setDraft({ ...draft, [key]: value })
  return (
    <div className="stack">
      <TextField label={t('Name')} value={draft.name} onChange={(v) => set('name', v)} />
      <TextField label={t('Description')} multiline rows={5} value={draft.description} onChange={(v) => set('description', v)} />
      <div className="grid2">
        <TextField label={t('Personality')} multiline rows={3} value={draft.personality} onChange={(v) => set('personality', v)} />
        <TextField label={t('Speech style')} multiline rows={3} value={draft.speech_style} onChange={(v) => set('speech_style', v)} />
      </div>
      <TextField label={t('First message (used when the scenario has no opening message)')} multiline rows={3} value={draft.first_message} onChange={(v) => set('first_message', v)} />
      <details className="advanced">
        <summary>{t('Advanced')}</summary>
        <div className="stack">
          <TextField label={t('Example dialogues → <examples>')} multiline rows={4} code value={draft.example_dialogues} onChange={(v) => set('example_dialogues', v)} />
          <div className="grid2">
            <TextField label={t('Character depth note (in chat, when present)')} multiline rows={2} value={draft.depth_note} onChange={(v) => set('depth_note', v)} />
            <NumberField label={t('Depth note depth')} value={draft.depth_note_depth} min={0} onChange={(v) => set('depth_note_depth', v ?? 4)} />
          </div>
          <TextField label={t('Post-history addition (when present)')} multiline rows={2} value={draft.post_history_addition} onChange={(v) => set('post_history_addition', v)} />
        </div>
      </details>
      <div className="row">
        <button className="primary" disabled={!dirty} onClick={() => saver.run(async () => { await api.patch(`/characters/${character.id}`, draft); onSaved() })}>{saver.label}</button>
        <button className="danger" onClick={async () => { if (await confirm(t('Delete {name}?', { name: character.name.trim() || t('(no name)') }), { danger: true, confirmLabel: t('Delete') })) { await api.del(`/characters/${character.id}`); onDeleted() } }}>{t('Delete')}</button>
        {dirty && <span className="small muted">{t('Unsaved changes')}</span>}
        {saver.error && <span className="error">{saver.error}</span>}
      </div>
    </div>
  )
}

function LoreForm({ item: entry, characters, onSaved, onDeleted, onDirtyChange }: FormProps<LoreEntry> & { characters: Character[] }) {
  const { t } = useI18n()
  const confirm = useConfirm()
  const [draft, setDraft] = useState(entry)
  const saver = useSaver()
  useEffect(() => setDraft(entry), [entry])
  const dirty = !same(draft, entry)
  useEffect(() => onDirtyChange(dirty), [dirty])
  const set = <K extends keyof LoreEntry>(key: K, value: LoreEntry[K]) => setDraft({ ...draft, [key]: value })
  const toggleKnower = (id: number) =>
    set('known_by', draft.known_by.includes(id) ? draft.known_by.filter((k) => k !== id) : [...draft.known_by, id])
  const kindOptions = KINDS.map((k) => ({ value: k, label: t(k) }))
  const positionOptions = POSITIONS.map((p) => ({ value: p.value, label: t(p.label) }))
  return (
    <div className="stack">
      <div className="grid2">
        <TextField label={t('Title (shown to Sage, not inserted)')} value={draft.title} onChange={(v) => set('title', v)} />
        <SelectField label={t('Kind (location entries feed the scene.location choice)')} value={draft.kind} options={kindOptions} onChange={(v) => set('kind', v)} />
      </div>
      <TextField label={t('Content (inserted into the prompt)')} multiline rows={5} value={draft.content} onChange={(v) => set('content', v)} />
      <ListField label={t('Keys (comma-separated, /regex/i allowed)')} value={draft.keys} onChange={(v) => set('keys', v)} />
      <div className="row">
        <CheckField label={t('Enabled')} checked={draft.enabled} onChange={(v) => set('enabled', v)} />
        <CheckField label={t('Constant (always on, skips Sage)')} checked={draft.constant} onChange={(v) => set('constant', v)} />
      </div>
      {characters.length > 0 && (
        <div>
          <div className="small muted">{t('Known by (veil of knowledge — empty = common knowledge; others see it as secret_from)')}</div>
          <div className="row">
            {characters.map((c) => (
              <CheckField key={c.id} label={c.name} checked={draft.known_by.includes(c.id)} onChange={() => toggleKnower(c.id)} />
            ))}
          </div>
        </div>
      )}
      <details className="advanced">
        <summary>{t('Advanced')}</summary>
        <div className="stack">
          <ListField label={t('Optional filter (secondary keys)')} value={draft.secondary_keys} onChange={(v) => set('secondary_keys', v)} />
          <div className="grid3">
            <SelectField label={t('Secondary logic')} value={draft.selective_logic} options={LOGIC} onChange={(v) => set('selective_logic', v)} />
            <SelectField label={t('Position')} value={draft.position} options={positionOptions} onChange={(v) => set('position', v)} />
            <NumberField label={t('Order (higher = later / closer to the end)')} value={draft.order} onChange={(v) => set('order', v ?? 100)} />
            <NumberField label={t('Depth (@ Depth only)')} value={draft.depth} min={0} onChange={(v) => set('depth', v ?? 4)} />
            <SelectField label={t('Role (@ Depth only)')} value={draft.role} options={['system', 'user', 'assistant']} onChange={(v) => set('role', v as LoreEntry['role'])} />
            <NumberField label={t('Trigger %')} value={draft.probability} min={0} max={100} onChange={(v) => set('probability', v ?? 100)} />
            <NumberField label={t('Scan depth (empty = 4)')} value={draft.scan_depth} min={0} onChange={(v) => set('scan_depth', v)} />
            <NumberField label={t('Sticky (turns)')} value={draft.sticky} min={0} onChange={(v) => set('sticky', v ?? 0)} />
            <NumberField label={t('Cooldown (turns)')} value={draft.cooldown} min={0} onChange={(v) => set('cooldown', v ?? 0)} />
            <NumberField label={t('Delay (min. messages)')} value={draft.delay} min={0} onChange={(v) => set('delay', v ?? 0)} />
          </div>
          <div className="row">
            <CheckField label={t('Case-sensitive')} checked={draft.case_sensitive} onChange={(v) => set('case_sensitive', v)} />
            <CheckField label={t('Whole words')} checked={draft.whole_words} onChange={(v) => set('whole_words', v)} />
            <CheckField label={t('Prevent further recursion')} checked={draft.prevent_recursion} onChange={(v) => set('prevent_recursion', v)} />
          </div>
        </div>
      </details>
      <div className="row">
        <button className="primary" disabled={!dirty} onClick={() => saver.run(async () => { await api.patch(`/lore/${entry.id}`, draft); onSaved() })}>{saver.label}</button>
        <button className="danger" onClick={async () => { if (await confirm(t('Delete "{name}"?', { name: entry.title.trim() || t('(no name)') }), { danger: true, confirmLabel: t('Delete') })) { await api.del(`/lore/${entry.id}`); onDeleted() } }}>{t('Delete')}</button>
        {dirty && <span className="small muted">{t('Unsaved changes')}</span>}
        {saver.error && <span className="error">{saver.error}</span>}
      </div>
    </div>
  )
}

function PersonaForm({ item: persona, onSaved, onDeleted, onDirtyChange }: FormProps<Persona>) {
  const { t } = useI18n()
  const confirm = useConfirm()
  const [draft, setDraft] = useState(persona)
  const saver = useSaver()
  useEffect(() => setDraft(persona), [persona])
  const dirty = !same(draft, persona)
  useEffect(() => onDirtyChange(dirty), [dirty])
  return (
    <div className="stack">
      <TextField label={t('Name ({{user}})')} value={draft.name} onChange={(v) => setDraft({ ...draft, name: v })} />
      <TextField label={t('Description → <persona>')} multiline rows={6} value={draft.description} onChange={(v) => setDraft({ ...draft, description: v })} />
      <div className="row">
        <button className="primary" disabled={!dirty} onClick={() => saver.run(async () => { await api.patch(`/personas/${persona.id}`, draft); onSaved() })}>{saver.label}</button>
        <button className="danger" onClick={async () => { if (await confirm(t('Delete {name}?', { name: persona.name.trim() || t('(no name)') }), { danger: true, confirmLabel: t('Delete') })) { await api.del(`/personas/${persona.id}`); onDeleted() } }}>{t('Delete')}</button>
        {dirty && <span className="small muted">{t('Unsaved changes')}</span>}
        {saver.error && <span className="error">{saver.error}</span>}
      </div>
    </div>
  )
}

function Stepper({ step, done, onSelect }: { step: StepId; done: Record<StepId, boolean>; onSelect: (id: StepId) => void }) {
  const { t } = useI18n()
  return (
    <ol className="stepper" aria-label={t('Steps')}>
      {STEPS.map((s, i) => {
        const state = s.id === step ? 'current' : done[s.id] ? 'done' : 'todo'
        return (
          <li key={s.id}>
            <button className={`step ${state}`} aria-current={s.id === step ? 'step' : undefined} onClick={() => onSelect(s.id)}>
              <span className="step-num" title={done[s.id] ? t('Done') : undefined}>{done[s.id] && s.id !== step ? '✓' : i + 1}</span>
              <span className="step-text">
                <span>{t(s.title)}</span>
                {s.optional && <span className="step-opt">{t('Optional')}</span>}
              </span>
            </button>
          </li>
        )
      })}
    </ol>
  )
}

function ReviewStep({ done, characters, personas, lore, onGo, onPlay }: {
  done: Record<StepId, boolean>
  characters: Character[]
  personas: Persona[]
  lore: LoreEntry[]
  onGo: (id: StepId) => void
  onPlay: (personaId: number | null) => void
}) {
  const { t } = useI18n()
  const [picked, setPicked] = useState<number | null>(null)
  const personaId = personas.some((p) => p.id === picked) ? picked : (personas[0]?.id ?? null)
  const rows: { id: StepId; ok: boolean; optional?: boolean; text: string }[] = [
    { id: 'premise', ok: done.premise, text: t('The world has a title and a description.') },
    { id: 'characters', ok: done.characters, text: t('At least one character has a name and a description ({n} characters).', { n: characters.length }) },
    { id: 'persona', ok: done.persona, text: t('You have a character to play ({n} characters).', { n: personas.length }) },
    { id: 'lore', ok: done.lore, optional: true, text: t('{n} lore entries.', { n: lore.length }) },
    { id: 'opening', ok: done.opening, text: t('The story has an opening message.') },
    { id: 'tuning', ok: done.tuning, optional: true, text: done.tuning ? t('Changes some global prompt settings.') : t('Uses the global prompt settings.') },
  ]
  const ready = rows.every((r) => r.ok || r.optional)
  return (
    <div className="stack">
      <ul className="checklist">
        {rows.map((r) => (
          <li key={r.id} className={r.ok ? 'ok' : r.optional ? 'opt' : 'missing'}>
            <span className="check-icon" aria-hidden>{r.ok ? '✓' : r.optional ? '–' : '!'}</span>
            <span style={{ flex: 1 }}>{r.text}{r.optional && <span className="muted small"> · {t('Optional')}</span>}</span>
            <button className="small" onClick={() => onGo(r.id)}>{t('Edit')}</button>
          </li>
        ))}
      </ul>
      <p className={ready ? 'ok-text' : 'warn-text'}>
        {ready ? t('Everything is ready.') : t('Some required steps are not complete. You can play, but the story can be weak.')}
      </p>
      <div className="row" style={{ alignItems: 'flex-end' }}>
        <label className="field" style={{ width: 240 }}>
          {t('Play as')}
          <select value={personaId ?? ''} onChange={(e) => setPicked(e.target.value ? Number(e.target.value) : null)}>
            {personas.length === 0 && <option value="">{t('No character')}</option>}
            {personas.map((p) => (
              <option key={p.id} value={p.id}>{p.name.trim() || t('(no name)')}</option>
            ))}
          </select>
        </label>
        <button className="primary" onClick={() => onPlay(personaId)}>{t('Start session')}</button>
      </div>
    </div>
  )
}

export default function ScenarioEditor() {
  const { t } = useI18n()
  const confirm = useConfirm()
  const { id } = useParams()
  const scenarioId = Number(id)
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [scenario, setScenario] = useState<Scenario | null>(null)
  const [draft, setDraft] = useState<Scenario | null>(null)
  const [characters, setCharacters] = useState<Character[]>([])
  const [personas, setPersonas] = useState<Persona[]>([])
  const [lore, setLore] = useState<LoreEntry[]>([])
  const [selected, setSelected] = useState<number | null>(null)
  const [error, setError] = useState('')
  const formDirty = useRef(false)
  const saver = useSaver()

  const loadEntities = async () => {
    const [c, p, l] = await Promise.all([
      api.get<Character[]>(`/characters?scenario_id=${scenarioId}`),
      api.get<Persona[]>(`/personas?scenario_id=${scenarioId}`),
      api.get<LoreEntry[]>(`/lore?scenario_id=${scenarioId}`),
    ])
    setCharacters(c)
    setPersonas(p)
    setLore(l)
    return { c, p, l }
  }

  useEffect(() => {
    ;(async () => {
      try {
        const s = await api.get<Scenario>(`/scenarios/${scenarioId}`)
        const { c, p, l } = await loadEntities()
        setScenario(s)
        setDraft(s)
        if (!isStepId(params.get('step'))) {
          // Open the first required step that is not complete, or the review when all are complete.
          const done = stepStatus(s, c, p, l)
          const first = STEPS.find((st) => !st.optional && st.id !== 'review' && !done[st.id])
          setParams({ step: first?.id ?? 'review' }, { replace: true })
        }
      } catch (e) {
        setError(String(e))
      }
    })()
  }, [scenarioId])

  const scenarioDirty = Boolean(scenario && draft && !same(scenario, draft))
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (scenarioDirty || formDirty.current) e.preventDefault()
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [scenarioDirty])

  if (error) return <div className="page error">{error}</div>
  if (!scenario || !draft) return <div className="page muted">{t('Loading…')}</div>

  const stepParam = params.get('step')
  const step: StepId = isStepId(stepParam) ? stepParam : 'premise'
  const index = STEPS.findIndex((s) => s.id === step)
  const meta = STEPS[index]
  const done = stepStatus(draft, characters, personas, lore)

  const set: SetField = (key, value) => setDraft({ ...draft, [key]: value })
  const saveScenario = () =>
    scenarioDirty
      ? saver.run(async () => {
          const s = await api.patch<Scenario>(`/scenarios/${scenario.id}`, draft)
          setScenario(s)
          setDraft(s)
        })
      : Promise.resolve(true)

  const confirmDiscard = async () => {
    if (!formDirty.current) return true
    if (!(await confirm(t('Unsaved changes in this form will be lost. Continue?')))) return false
    formDirty.current = false
    return true
  }

  /** Leaving a step saves the scenario fields and asks before it drops an unsaved character or lore form. */
  const goTo = async (next: StepId) => {
    if (next === step || !(await confirmDiscard())) return
    if (!(await saveScenario())) return
    setSelected(null)
    setParams({ step: next })
    window.scrollTo({ top: 0 })
  }

  const select = async (itemId: number) => {
    if (itemId !== current?.id && (await confirmDiscard())) setSelected(itemId)
  }

  const startSession = async (personaId: number | null) => {
    if (!(await confirmDiscard()) || !(await saveScenario())) return
    try {
      const session = await api.post<{ id: number }>('/sessions', { scenario_id: scenarioId, persona_id: personaId })
      navigate(`/play/${session.id}`)
    } catch (e) {
      setError(String(e))
    }
  }

  const addCharacter = async () => {
    if (!(await confirmDiscard())) return
    const c = await api.post<Character>('/characters', { scenario_id: scenarioId, name: t('New character') })
    await loadEntities()
    setSelected(c.id)
  }
  const addPersona = async () => {
    if (!(await confirmDiscard())) return
    const p = await api.post<Persona>('/personas', { scenario_id: scenarioId, name: t('New character') })
    await loadEntities()
    setSelected(p.id)
  }
  const addLore = async () => {
    if (!(await confirmDiscard())) return
    const l = await api.post<LoreEntry>('/lore', { scenario_id: scenarioId, title: t('New entry') })
    await loadEntities()
    setSelected(l.id)
  }
  const afterDelete = () => {
    formDirty.current = false
    setSelected(null)
    loadEntities()
  }
  const onDirtyChange = (dirty: boolean) => { formDirty.current = dirty }

  const items: (Character | Persona | LoreEntry)[] = step === 'characters' ? characters : step === 'persona' ? personas : step === 'lore' ? lore : []
  const current = items.find((i) => i.id === selected) ?? items[0]
  const editsScenario = step === 'premise' || step === 'opening' || step === 'tuning'
  const prev = STEPS[index - 1]
  const next = STEPS[index + 1]

  return (
    <div className="page">
      <div className="page-narrow">
        <div className="row" style={{ marginBottom: 14 }}>
          <button className="ghost" onClick={async () => { if ((await confirmDiscard()) && (await saveScenario())) navigate('/') }}>← {t('Library')}</button>
          <h1 style={{ margin: 0 }}>{draft.title || t('Untitled scenario')}</h1>
        </div>

        <Stepper step={step} done={done} onSelect={goTo} />

        <section className="step-panel">
          <div className="step-head">
            <div className="small muted">{t('Step {n} of {total}', { n: index + 1, total: STEPS.length })}{meta.optional && ` · ${t('Optional')}`}</div>
            <h2>{t(meta.title)}</h2>
            <p className="guide">{t(meta.guide)}</p>
          </div>

          {step === 'premise' && <PremiseStep draft={draft} set={set} />}
          {step === 'opening' && <OpeningStep draft={draft} set={set} characters={characters} />}
          {step === 'tuning' && <TuningStep draft={draft} set={set} />}
          {step === 'review' && <ReviewStep done={done} characters={characters} personas={personas} lore={lore} onGo={goTo} onPlay={startSession} />}

          {(step === 'characters' || step === 'persona' || step === 'lore') && (
            <div className="split">
              <div className="stack" style={{ gap: 6 }}>
                <button onClick={step === 'characters' ? addCharacter : step === 'persona' ? addPersona : addLore}>
                  {step === 'lore' ? t('+ Add entry') : t('+ Add character')}
                </button>
                {step === 'characters' &&
                  characters.map((c) => (
                    <button key={c.id} className={`list-item ${current?.id === c.id ? 'selected' : ''}`} onClick={() => select(c.id)}>
                      <span style={{ flex: 1 }}>{c.name.trim() || <em className="muted">{t('(no name)')}</em>}</span>
                      {!c.description.trim() && <span className="badge warn">{t('no description')}</span>}
                    </button>
                  ))}
                {step === 'persona' &&
                  personas.map((p) => (
                    <button key={p.id} className={`list-item ${current?.id === p.id ? 'selected' : ''}`} onClick={() => select(p.id)}>
                      <span style={{ flex: 1 }}>{p.name.trim() || <em className="muted">{t('(no name)')}</em>}</span>
                      {!p.description.trim() && <span className="badge warn">{t('no description')}</span>}
                    </button>
                  ))}
                {step === 'lore' &&
                  lore.map((l) => (
                    <button key={l.id} className={`list-item ${current?.id === l.id ? 'selected' : ''}`} style={{ opacity: l.enabled ? 1 : 0.5 }} onClick={() => select(l.id)}>
                      <span style={{ flex: 1 }}>{l.title.trim() || <em className="muted">{t('(no name)')}</em>}</span>
                      {l.constant && <span className="badge accent">{t('const')}</span>}
                      {l.known_by.length > 0 && <span className="badge warn">{t('secret')}</span>}
                      <span className="badge">{isKnownKind(l.kind) ? t(l.kind) : l.kind}</span>
                    </button>
                  ))}
              </div>
              <div className="card">
                {!current && <p className="muted">{step === 'lore' ? t('No lore entries yet. You can skip this step.') : t('No characters yet. Add the first character.')}</p>}
                {current && step === 'characters' && (
                  <CharacterForm key={current.id} item={current as Character} onSaved={loadEntities} onDeleted={afterDelete} onDirtyChange={onDirtyChange} />
                )}
                {current && step === 'persona' && (
                  <PersonaForm key={current.id} item={current as Persona} onSaved={loadEntities} onDeleted={afterDelete} onDirtyChange={onDirtyChange} />
                )}
                {current && step === 'lore' && (
                  <LoreForm key={current.id} item={current as LoreEntry} characters={characters} onSaved={loadEntities} onDeleted={afterDelete} onDirtyChange={onDirtyChange} />
                )}
              </div>
            </div>
          )}

          <div className="step-nav">
            {prev ? <button onClick={() => goTo(prev.id)}>← {t(prev.title)}</button> : <span />}
            <span className="spacer" />
            {editsScenario && scenarioDirty && <span className="small muted">{t('Unsaved changes')}</span>}
            {saver.error && <span className="error">{saver.error}</span>}
            {editsScenario && <button disabled={!scenarioDirty} onClick={saveScenario}>{saver.label}</button>}
            {next && (
              <button className="primary" onClick={() => goTo(next.id)}>
                {meta.optional && !done[step] ? t('Skip') : t('Next')}: {t(next.title)} →
              </button>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
