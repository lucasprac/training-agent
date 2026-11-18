import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  api,
  type Assignment,
  type Character,
  type ChoiceOption,
  type Competency,
  type LoreEntry,
  type Persona,
  type Profile,
  type RubricLevel,
  type Scenario,
  type ScenarioCompetency,
  type StateKind,
  type StateVariable,
} from '../api'
import { CheckField, ListField, NumberField, SelectField, TextField } from '../components/Field'
import { LevelsEditor, OptionsEditor } from '../components/Rubric'
import { useConfirm } from '../confirm'
import { useI18n, type MessageKey } from '../i18n'
import { useProfile } from '../profile'
import { startTraining } from '../training'

/**
 * Scenario building is a guided flow: the manager follows the steps in order, but can jump to any step.
 * Required steps feed the review checklist; optional steps never block a test run.
 */
type StepId = 'premise' | 'characters' | 'persona' | 'competencies' | 'states' | 'lore' | 'opening' | 'tuning' | 'review'

const STEPS: { id: StepId; title: MessageKey; guide: MessageKey; optional?: boolean }[] = [
  { id: 'premise', title: 'Situation', guide: 'Describe the work situation: the company, the place and what is happening when the simulation starts. Then choose the context tags: they tell the simulation which context and difficulty to keep. The simulation reads this text on every turn.' },
  { id: 'characters', title: 'Counterparts', guide: 'Add the people that the simulation plays: customers, colleagues, managers. Give each one a description with their goals and limits. A personality and a speech style make the behaviour more realistic.' },
  { id: 'persona', title: 'Trainee role', guide: "Describe the role that the trainee plays (for example: customer service agent). The simulation never writes the trainee's actions or words." },
  { id: 'competencies', title: 'Competencies', guide: 'Choose the competencies from the library that this scenario trains. Sage scores every trainee message on their rubrics. A higher weight counts more in the overall score.' },
  { id: 'states', title: 'States and objectives', optional: true, guide: 'Sage tracks these variables on every turn, for example the trust of the customer. An objective is a yes/no goal of the trainee; once reached, it stays reached. Visible variables shape how the counterparts behave; hidden ones only go to the report.' },
  { id: 'lore', title: 'Knowledge base', optional: true, guide: 'Add policies, products, prices and facts. An entry goes into the prompt only when one of its keys appears in the chat, or on every turn when it is constant.' },
  { id: 'opening', title: 'Briefing and opening', guide: 'Write the briefing that the trainee reads before the simulation, the first message of the counterpart and the rules for this scenario. The rules are added after the global rules.' },
  { id: 'tuning', title: 'Fine-tuning', optional: true, guide: 'Change these settings only when the global prompt does not fit this scenario. Empty fields use the global values.' },
  { id: 'review', title: 'Review and assign', guide: 'Check the list. Test the simulation yourself, then assign it to trainees.' },
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

const STATE_KINDS: { value: StateKind; label: MessageKey }[] = [
  { value: 'scale', label: 'scale (levels)' },
  { value: 'choice', label: 'choice (options)' },
  { value: 'yesno', label: 'yes / no' },
  { value: 'extract', label: 'value from the text (Extract)' },
]
const EXTRACT_TYPES = ['text', 'integer', 'decimal', 'money', 'date', 'time', 'duration']
const MANY_COMPETENCIES = 8

const THEME_SUGGESTIONS = [
  'Customer service', 'Sales', 'Negotiation', 'Leadership', 'Feedback conversation', 'Conflict',
  'Onboarding', 'Easy', 'Medium difficulty', 'Hard',
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

interface Entities {
  characters: Character[]
  personas: Persona[]
  lore: LoreEntry[]
  links: ScenarioCompetency[]
  variables: StateVariable[]
}

/** Which steps are complete. Optional steps count as complete when they have content. */
function stepStatus(draft: Scenario, e: Entities): Record<StepId, boolean> {
  return {
    premise: Boolean(draft.title.trim() && draft.world.trim()),
    characters: e.characters.some((c) => c.name.trim() && c.description.trim()),
    persona: e.personas.some((p) => p.name.trim()),
    competencies: e.links.length > 0,
    states: e.variables.length > 0,
    lore: e.lore.length > 0,
    opening: Boolean(draft.briefing.trim() && (draft.opening_message.trim() || e.characters.some((c) => c.first_message.trim()))),
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
      <TextField label={t('Short summary (scenario card)')} value={draft.summary} onChange={(v) => set('summary', v)} />
      <TextField
        label={t('Work situation → <scenario>')}
        multiline
        rows={10}
        value={draft.world}
        placeholder={t('Example: You work in the customer service chat of an online shop. A customer received a broken product for the second time…')}
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
        label={t('Context tags → <themes> (comma-separated)')}
        value={themes}
        onChange={onChange}
        hint={t('Example: customer service, medium difficulty')}
      />
      <div className="chips" aria-label={t('Suggested tags')}>
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
        label={t('Briefing (the trainee reads it before the simulation)')}
        multiline
        rows={6}
        value={draft.briefing}
        placeholder={t('Your role, the situation, your objective and the rules that you must follow.')}
        onChange={(v) => set('briefing', v)}
      />
      <div style={{ maxWidth: 240 }}>
        <NumberField label={t('Turn limit (0 = no limit)')} value={draft.max_turns} min={0} onChange={(v) => set('max_turns', v ?? 0)} />
      </div>
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
              : t('Empty, and no counterpart has a first message: the trainee writes first.')
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
      <TextField label={t('Description, goals and limits')} multiline rows={5} value={draft.description} onChange={(v) => set('description', v)} />
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
      <TextField label={t('Role name ({{user}})')} value={draft.name} onChange={(v) => setDraft({ ...draft, name: v })} />
      <TextField label={t('Role description → <persona>')} multiline rows={6} value={draft.description} onChange={(v) => setDraft({ ...draft, description: v })} />
      <div className="row">
        <button className="primary" disabled={!dirty} onClick={() => saver.run(async () => { await api.patch(`/personas/${persona.id}`, draft); onSaved() })}>{saver.label}</button>
        <button className="danger" onClick={async () => { if (await confirm(t('Delete {name}?', { name: persona.name.trim() || t('(no name)') }), { danger: true, confirmLabel: t('Delete') })) { await api.del(`/personas/${persona.id}`); onDeleted() } }}>{t('Delete')}</button>
        {dirty && <span className="small muted">{t('Unsaved changes')}</span>}
        {saver.error && <span className="error">{saver.error}</span>}
      </div>
    </div>
  )
}

function StateForm({ item, onSaved, onDeleted, onDirtyChange }: FormProps<StateVariable>) {
  const { t } = useI18n()
  const confirm = useConfirm()
  const [draft, setDraft] = useState(item)
  const saver = useSaver()
  useEffect(() => setDraft(item), [item])
  const dirty = !same(draft, item)
  useEffect(() => onDirtyChange(dirty), [dirty])
  const set = <K extends keyof StateVariable>(key: K, value: StateVariable[K]) => setDraft({ ...draft, [key]: value })
  const setKind = (kind: StateKind) =>
    setDraft({ ...draft, kind, options: [], initial_value: null, is_objective: kind === 'yesno' ? draft.is_objective : false })
  const initialText = draft.initial_value === null || draft.initial_value === undefined ? '' : String(draft.initial_value)
  const parseInitial = (v: string) => (v.trim() === '' ? null : draft.kind === 'scale' && !Number.isNaN(Number(v)) ? Number(v) : v)
  return (
    <div className="stack">
      <div className="grid2">
        <TextField label={t('Name')} value={draft.name} onChange={(v) => set('name', v)} />
        <SelectField label={t('Kind')} value={draft.kind} options={STATE_KINDS.map((k) => ({ value: k.value, label: t(k.label) }))} onChange={(v) => setKind(v as StateKind)} />
      </div>
      <TextField
        label={draft.kind === 'extract' ? t('What to find in the text (Extract definition)') : t('Question for Sage')}
        multiline
        rows={2}
        value={draft.instructions}
        placeholder={draft.kind === 'extract' ? t('Example: the discount percentage that the trainee offers') : t('Example: How much does the customer trust the company now, after the LAST message?')}
        onChange={(v) => set('instructions', v)}
      />
      {draft.kind === 'scale' && <LevelsEditor levels={draft.options as RubricLevel[]} onChange={(v) => set('options', v)} />}
      {draft.kind === 'choice' && <OptionsEditor options={draft.options as ChoiceOption[]} onChange={(v) => set('options', v)} />}
      {draft.kind === 'extract' && (
        <SelectField label={t('Value type')} value={draft.extract_type} options={EXTRACT_TYPES} onChange={(v) => set('extract_type', v)} />
      )}
      {draft.kind === 'yesno' ? (
        <CheckField label={t('Objective of the trainee (once reached, it stays reached)')} checked={draft.is_objective} onChange={(v) => set('is_objective', v)} />
      ) : (
        <TextField label={t('Initial value (optional)')} value={initialText} onChange={(v) => set('initial_value', parseInitial(v))} />
      )}
      <div className="row">
        <CheckField label={t('Visible to the counterparts (<sim_state>)')} checked={draft.tell_narrator} onChange={(v) => set('tell_narrator', v)} />
        <CheckField label={t('Enabled')} checked={draft.enabled} onChange={(v) => set('enabled', v)} />
      </div>
      <div className="row">
        <button className="primary" disabled={!dirty} onClick={() => saver.run(async () => { await api.patch(`/state-variables/${item.id}`, draft); onSaved() })}>{saver.label}</button>
        <button className="danger" onClick={async () => { if (await confirm(t('Delete "{name}"?', { name: item.name.trim() || t('(no name)') }), { danger: true, confirmLabel: t('Delete') })) { await api.del(`/state-variables/${item.id}`); onDeleted() } }}>{t('Delete')}</button>
        {dirty && <span className="small muted">{t('Unsaved changes')}</span>}
        {saver.error && <span className="error">{saver.error}</span>}
      </div>
    </div>
  )
}

function CompetencyLinkForm({ link, onSave }: { link: ScenarioCompetency; onSave: (data: Partial<ScenarioCompetency>) => void }) {
  const { t } = useI18n()
  const [weight, setWeight] = useState<number | null>(link.weight)
  const [focus, setFocus] = useState(link.focus)
  const dirty = weight !== link.weight || focus !== link.focus
  return (
    <div className="row" style={{ alignItems: 'flex-end' }}>
      <div style={{ width: 110 }}><NumberField label={t('Weight')} value={weight} min={0.1} step={0.5} onChange={setWeight} /></div>
      <label className="field" style={{ flex: 1, minWidth: 220 }}>
        {t('What good looks like in this scenario (optional, Sage reads it)')}
        <input value={focus} onChange={(e) => setFocus(e.target.value)} />
      </label>
      <button disabled={!dirty || !weight} onClick={() => onSave({ weight: weight ?? 1, focus })}>{t('Save')}</button>
    </div>
  )
}

function CompetenciesStep({ scenarioId, library, links, onChange }: {
  scenarioId: number
  library: Competency[]
  links: ScenarioCompetency[]
  onChange: () => void
}) {
  const { t } = useI18n()
  const [error, setError] = useState('')
  const run = async (fn: () => Promise<unknown>) => {
    setError('')
    try {
      await fn()
      onChange()
    } catch (e) {
      setError(String(e))
    }
  }
  const toggle = (c: Competency, link: ScenarioCompetency | undefined) =>
    run(() => (link ? api.del(`/scenario-competencies/${link.id}`) : api.post('/scenario-competencies', { scenario_id: scenarioId, competency_id: c.id, order: links.length })))
  return (
    <div className="stack">
      {library.length === 0 && <p className="muted">{t('The competency library is empty. Add competencies on the Competencies page.')}</p>}
      {links.length > MANY_COMPETENCIES && <p className="warn-text small">{t('Many competencies make each turn slower and more expensive, and the feedback less focused.')}</p>}
      {error && <div className="error">{error}</div>}
      {library.map((c) => {
        const link = links.find((l) => l.competency_id === c.id)
        return (
          <div key={c.id} className="card stack" style={{ gap: 8, opacity: c.enabled ? 1 : 0.5 }}>
            <div className="row">
              <CheckField label={c.name} checked={Boolean(link)} onChange={() => toggle(c, link)} />
              <span className="small muted" style={{ flex: 1 }}>{c.description}</span>
            </div>
            {link && <CompetencyLinkForm key={link.id} link={link} onSave={(data) => run(() => api.patch(`/scenario-competencies/${link.id}`, data))} />}
          </div>
        )
      })}
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

function ReviewStep({ scenarioId, done, entities, onGo, onTest }: {
  scenarioId: number
  done: Record<StepId, boolean>
  entities: Entities
  onGo: (id: StepId) => void
  onTest: (personaId: number | null) => void
}) {
  const { t } = useI18n()
  const { characters, personas, lore, links, variables } = entities
  const [picked, setPicked] = useState<number | null>(null)
  const [trainees, setTrainees] = useState<Profile[]>([])
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const loadAssignments = async () => setAssignments(await api.get<Assignment[]>(`/assignments?scenario_id=${scenarioId}`))
  useEffect(() => {
    api.get<Profile[]>('/profiles').then((p) => setTrainees(p.filter((x) => x.role === 'user')))
    loadAssignments()
  }, [scenarioId])
  const toggleAssignment = async (profile: Profile) => {
    const current = assignments.find((a) => a.profile_id === profile.id)
    if (current) await api.del(`/assignments/${current.id}`)
    else await api.post('/assignments', { scenario_id: scenarioId, profile_id: profile.id })
    loadAssignments()
  }
  const personaId = personas.some((p) => p.id === picked) ? picked : (personas[0]?.id ?? null)
  const objectives = variables.filter((v) => v.is_objective).length
  const rows: { id: StepId; ok: boolean; optional?: boolean; text: string }[] = [
    { id: 'premise', ok: done.premise, text: t('The situation has a title and a description.') },
    { id: 'characters', ok: done.characters, text: t('At least one counterpart has a name and a description ({n} counterparts).', { n: characters.length }) },
    { id: 'persona', ok: done.persona, text: t('The trainee has a role ({n} roles).', { n: personas.length }) },
    { id: 'competencies', ok: done.competencies, text: t('{n} competencies are evaluated.', { n: links.length }) },
    { id: 'states', ok: done.states, optional: true, text: t('{n} state variables, {m} objectives.', { n: variables.length, m: objectives }) },
    { id: 'lore', ok: done.lore, optional: true, text: t('{n} knowledge entries.', { n: lore.length }) },
    { id: 'opening', ok: done.opening, text: t('The trainee has a briefing, and the simulation has an opening.') },
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
        {ready ? t('Everything is ready.') : t('Some required steps are not complete. You can test, but the simulation or the evaluation can be weak.')}
      </p>
      <div className="row" style={{ alignItems: 'flex-end' }}>
        {personas.length > 1 && (
          <label className="field" style={{ width: 240 }}>
            {t('Trainee role')}
            <select value={personaId ?? ''} onChange={(e) => setPicked(e.target.value ? Number(e.target.value) : null)}>
              {personas.map((p) => (
                <option key={p.id} value={p.id}>{p.name.trim() || t('(no name)')}</option>
              ))}
            </select>
          </label>
        )}
        <button className="primary" onClick={() => onTest(personaId)}>{t('Test the simulation')}</button>
      </div>
      <div className="card stack" style={{ gap: 6 }}>
        <h3>{t('Assigned to')}</h3>
        {trainees.length === 0 && <p className="small muted">{t('No trainees yet. Add people on the Team page.')}</p>}
        <div className="row">
          {trainees.map((p) => (
            <CheckField key={p.id} label={p.name} checked={assignments.some((a) => a.profile_id === p.id)} onChange={() => toggleAssignment(p)} />
          ))}
        </div>
      </div>
    </div>
  )
}

export default function ScenarioEditor() {
  const { t } = useI18n()
  const confirm = useConfirm()
  const { profile } = useProfile()
  const { id } = useParams()
  const scenarioId = Number(id)
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [scenario, setScenario] = useState<Scenario | null>(null)
  const [draft, setDraft] = useState<Scenario | null>(null)
  const [entities, setEntities] = useState<Entities>({ characters: [], personas: [], lore: [], links: [], variables: [] })
  const [library, setLibrary] = useState<Competency[]>([])
  const [selected, setSelected] = useState<number | null>(null)
  const [error, setError] = useState('')
  const formDirty = useRef(false)
  const saver = useSaver()

  const loadEntities = async (): Promise<Entities> => {
    const [characters, personas, lore, links, variables, lib] = await Promise.all([
      api.get<Character[]>(`/characters?scenario_id=${scenarioId}`),
      api.get<Persona[]>(`/personas?scenario_id=${scenarioId}`),
      api.get<LoreEntry[]>(`/lore?scenario_id=${scenarioId}`),
      api.get<ScenarioCompetency[]>(`/scenario-competencies?scenario_id=${scenarioId}`),
      api.get<StateVariable[]>(`/state-variables?scenario_id=${scenarioId}`),
      api.get<Competency[]>('/competencies'),
    ])
    const next = { characters, personas, lore, links, variables }
    setEntities(next)
    setLibrary(lib)
    return next
  }

  useEffect(() => {
    ;(async () => {
      try {
        const s = await api.get<Scenario>(`/scenarios/${scenarioId}`)
        const loaded = await loadEntities()
        setScenario(s)
        setDraft(s)
        if (!isStepId(params.get('step'))) {
          // Open the first required step that is not complete, or the review when all are complete.
          const done = stepStatus(s, loaded)
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

  const { characters, personas, lore, variables } = entities
  const stepParam = params.get('step')
  const step: StepId = isStepId(stepParam) ? stepParam : 'premise'
  const index = STEPS.findIndex((s) => s.id === step)
  const meta = STEPS[index]
  const done = stepStatus(draft, entities)

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

  /** Leaving a step saves the scenario fields and asks before it drops an unsaved form. */
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
    if (!profile || !(await confirmDiscard()) || !(await saveScenario())) return
    try {
      const session = await startTraining(scenarioId, profile.id, personaId)
      navigate(`/play/${session.id}`)
    } catch (e) {
      setError(String(e))
    }
  }

  const add = async (path: string, body: Record<string, unknown>) => {
    if (!(await confirmDiscard())) return
    const item = await api.post<{ id: number }>(path, { scenario_id: scenarioId, ...body })
    await loadEntities()
    setSelected(item.id)
  }
  const addItem = () =>
    step === 'characters' ? add('/characters', { name: t('New counterpart') })
      : step === 'persona' ? add('/personas', { name: t('New role') })
        : step === 'states' ? add('/state-variables', { name: t('New variable'), kind: 'yesno', order: variables.length })
          : add('/lore', { title: t('New entry') })
  const afterDelete = () => {
    formDirty.current = false
    setSelected(null)
    loadEntities()
  }
  const onDirtyChange = (dirty: boolean) => { formDirty.current = dirty }

  const listSteps: StepId[] = ['characters', 'persona', 'lore', 'states']
  const items: (Character | Persona | LoreEntry | StateVariable)[] =
    step === 'characters' ? characters : step === 'persona' ? personas : step === 'lore' ? lore : step === 'states' ? variables : []
  const current = items.find((i) => i.id === selected) ?? items[0]
  const editsScenario = step === 'premise' || step === 'opening' || step === 'tuning'
  const prev = STEPS[index - 1]
  const next = STEPS[index + 1]
  const addLabel = step === 'lore' ? t('+ Add entry') : step === 'states' ? t('+ Add variable') : step === 'persona' ? t('+ Add role') : t('+ Add counterpart')
  const emptyText = step === 'lore' ? t('No knowledge entries yet. You can skip this step.') : step === 'states' ? t('No variables yet. You can skip this step.') : t('Nothing here yet. Add the first one.')

  return (
    <div className="page">
      <div className="page-narrow">
        <div className="row" style={{ marginBottom: 14 }}>
          <button className="ghost" onClick={async () => { if ((await confirmDiscard()) && (await saveScenario())) navigate('/') }}>← {t('Scenarios')}</button>
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
          {step === 'competencies' && <CompetenciesStep scenarioId={scenarioId} library={library} links={entities.links} onChange={loadEntities} />}
          {step === 'review' && <ReviewStep scenarioId={scenarioId} done={done} entities={entities} onGo={goTo} onTest={startSession} />}

          {listSteps.includes(step) && (
            <div className="split">
              <div className="stack" style={{ gap: 6 }}>
                <button onClick={addItem}>{addLabel}</button>
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
                {step === 'states' &&
                  variables.map((v) => (
                    <button key={v.id} className={`list-item ${current?.id === v.id ? 'selected' : ''}`} style={{ opacity: v.enabled ? 1 : 0.5 }} onClick={() => select(v.id)}>
                      <span style={{ flex: 1 }}>{v.name.trim() || <em className="muted">{t('(no name)')}</em>}</span>
                      {v.is_objective && <span className="badge accent">{t('objective')}</span>}
                      {!v.tell_narrator && <span className="badge">{t('hidden')}</span>}
                    </button>
                  ))}
              </div>
              <div className="card">
                {!current && <p className="muted">{emptyText}</p>}
                {current && step === 'characters' && (
                  <CharacterForm key={current.id} item={current as Character} onSaved={loadEntities} onDeleted={afterDelete} onDirtyChange={onDirtyChange} />
                )}
                {current && step === 'persona' && (
                  <PersonaForm key={current.id} item={current as Persona} onSaved={loadEntities} onDeleted={afterDelete} onDirtyChange={onDirtyChange} />
                )}
                {current && step === 'lore' && (
                  <LoreForm key={current.id} item={current as LoreEntry} characters={characters} onSaved={loadEntities} onDeleted={afterDelete} onDirtyChange={onDirtyChange} />
                )}
                {current && step === 'states' && (
                  <StateForm key={current.id} item={current as StateVariable} onSaved={loadEntities} onDeleted={afterDelete} onDirtyChange={onDirtyChange} />
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
