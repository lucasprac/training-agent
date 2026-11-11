import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  api,
  streamTurn,
  type Character,
  type Competency,
  type EndReason,
  type HarnessStatePublic,
  type LabelSet,
  type MemoryItem,
  type Message,
  type Persona,
  type PostTurnReport,
  type PromptPublic,
  type RegistryEntry,
  type RpSession,
  type Scenario,
  type StateVariable,
  type TurnEvent,
} from '../api'
import RpText from '../components/RpText'
import { AuthorsNotePanel, EvaluationPanel, HarnessPanel, LabelsPanel, MemoryPanel, PromptPanel, StatePanel } from '../components/Inspector'
import { useConfirm } from '../confirm'
import { useI18n, type MessageKey } from '../i18n'
import { useProfile } from '../profile'

type SideTab = 'harness' | 'state' | 'evaluation' | 'prompt' | 'memory' | 'labels' | 'note'

export default function Play() {
  const { t } = useI18n()
  const confirm = useConfirm()
  const navigate = useNavigate()
  const { profile } = useProfile()
  const { id } = useParams()
  const sessionId = Number(id)
  const [session, setSession] = useState<RpSession | null>(null)
  const [scenario, setScenario] = useState<Scenario | null>(null)
  const [persona, setPersona] = useState<Persona | null>(null)
  const [characters, setCharacters] = useState<Character[]>([])
  const [competencies, setCompetencies] = useState<Competency[]>([])
  const [messages, setMessages] = useState<Message[]>([])
  const [memory, setMemory] = useState<MemoryItem[]>([])
  const [labels, setLabels] = useState<LabelSet | null>(null)
  const [registry, setRegistry] = useState<RegistryEntry[]>([])
  const [stateVariables, setStateVariables] = useState<StateVariable[]>([])
  const [harness, setHarness] = useState<HarnessStatePublic | null>(null)
  const [prompt, setPrompt] = useState<PromptPublic | null>(null)
  const [report, setReport] = useState<PostTurnReport | null>(null)
  const [input, setInput] = useState('')
  const [pendingUser, setPendingUser] = useState<string | null>(null)
  const [streaming, setStreaming] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // The reply is saved ("done"): Stop no longer applies, the evaluation finishes on the server.
  const [answered, setAnswered] = useState(false)
  const [ending, setEnding] = useState(false)
  const [phase, setPhase] = useState<MessageKey | ''>('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [endReason, setEndReason] = useState<EndReason>(null)
  const [tab, setTab] = useState<SideTab>('harness')
  const [evaluationKey, setEvaluationKey] = useState(0)
  const [editing, setEditing] = useState<{ id: number; text: string } | null>(null)
  const bottom = useRef<HTMLDivElement>(null)
  const abort = useRef<AbortController | null>(null)

  const inspector = profile?.role === 'manager'
  const names = useMemo(() => Object.fromEntries(characters.map((c) => [c.id, c.name])), [characters])

  const loadMessages = async () => setMessages(await api.get<Message[]>(`/sessions/${sessionId}/messages`))
  const loadMemory = async () => setMemory(await api.get<MemoryItem[]>(`/sessions/${sessionId}/memory`))
  const loadLabels = async () => {
    const data = await api.get<{ labels: LabelSet; registry: RegistryEntry[]; state_variables: StateVariable[] }>(`/sessions/${sessionId}/labels`)
    setLabels(data.labels)
    setRegistry(data.registry)
    setStateVariables(data.state_variables)
  }

  useEffect(() => {
    ;(async () => {
      try {
        const s = await api.get<RpSession>(`/sessions/${sessionId}`)
        setSession(s)
        const [sc, chars, comps] = await Promise.all([
          api.get<Scenario>(`/scenarios/${s.scenario_id}`),
          api.get<Character[]>(`/characters?scenario_id=${s.scenario_id}`),
          api.get<Competency[]>('/competencies'),
        ])
        setScenario(sc)
        setCharacters(chars)
        setCompetencies(comps)
        if (s.persona_id) setPersona(await api.get<Persona>(`/personas/${s.persona_id}`).catch(() => null))
        await Promise.all([loadMessages(), loadMemory(), loadLabels()])
        const traces = await api.get<{ data: { harness: HarnessStatePublic; prompt: PromptPublic; post_turn?: PostTurnReport } }[]>(`/sessions/${sessionId}/traces?limit=1`)
        if (traces[0]) {
          setPrompt(traces[0].data.prompt)
          setReport(traces[0].data.post_turn ?? null)
        }
      } catch (e) {
        setError(String(e))
      }
    })()
  }, [sessionId])

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages.length, streaming, pendingUser])

  // Show the stored harness snapshot of the last user message when the page opens.
  useEffect(() => {
    if (harness) return
    const lastUser = [...messages].reverse().find((m) => m.role === 'user' && m.harness && Object.keys(m.harness).length)
    if (lastUser) {
      const h = lastUser.harness as unknown as HarnessStatePublic & { memory: unknown[] }
      const memoryById = Object.fromEntries(memory.map((m) => [m.id, m]))
      setHarness({
        ...h,
        memory: (h.memory as (number | MemoryItem)[]).map((m) => (typeof m === 'number' ? memoryById[m] : m)).filter(Boolean) as HarnessStatePublic['memory'],
      })
    }
  }, [messages, memory])

  const handleEvent = (event: TurnEvent) => {
    switch (event.event) {
      case 'harness':
        setHarness(event.data.state)
        if (event.data.prompt) setPrompt(event.data.prompt)
        setPhase('The counterpart is answering…')
        setStreaming('')
        break
      case 'token':
        setStreaming((s) => (s ?? '') + event.data.text)
        break
      case 'done':
        setAnswered(true)
        setPhase('Sage is updating the state and the evaluation…')
        setEndReason(event.data.end_reason)
        loadMessages().then(() => {
          setStreaming(null)
          setPendingUser(null)
          setSession((s) => (s ? { ...s, turn_count: event.data.turn_count } : s))
        })
        break
      case 'post_turn':
        setReport(event.data)
        loadMemory()
        loadLabels()
        setEvaluationKey((k) => k + 1)
        api.get<RpSession>(`/sessions/${sessionId}`).then(setSession)
        break
      case 'blocked':
        setNotice(event.data.reason)
        break
      case 'error':
        setError(event.data.message)
        break
    }
  }

  /** Runs one turn. Returns true when the counterpart reply was saved. */
  const run = async (path: string, body: unknown): Promise<boolean> => {
    let saved = false
    setBusy(true)
    setAnswered(false)
    setError('')
    setNotice('')
    setReport(null)
    setPhase('Sage is reading the conversation…')
    abort.current = new AbortController()
    try {
      await streamTurn(path, body, (event) => {
        if (event.event === 'done') saved = true
        handleEvent(event)
      }, abort.current.signal)
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError(String(e))
    } finally {
      // A failed or stopped turn is undone on the server; reload what is really saved.
      await Promise.all([loadMessages(), api.get<RpSession>(`/sessions/${sessionId}`).then(setSession).catch(() => undefined)])
      setStreaming(null)
      setPendingUser(null)
      setBusy(false)
      setAnswered(false)
      setPhase('')
    }
    return saved
  }

  const send = async () => {
    const text = input.trim()
    if (!text || busy) return
    setInput('')
    setPendingUser(text)
    const saved = await run(`/sessions/${sessionId}/turn`, { text })
    // Not counted (error, empty reply, Stop, blocked): give the text back to change or send again.
    if (!saved) setInput((current) => current || text)
  }

  const regenerate = () => run(`/sessions/${sessionId}/regenerate`, {})

  const preview = async () => {
    const data = await api.post<{ state: HarnessStatePublic; prompt: PromptPublic }>(`/sessions/${sessionId}/prompt-preview`, { text: input })
    setPrompt(data.prompt)
    setTab('prompt')
  }

  const endSimulation = async () => {
    if (!(await confirm(t('End the simulation and see the report? You cannot continue it later.'), { confirmLabel: t('End simulation') }))) return
    setEnding(true)
    setError('')
    try {
      await api.post(`/sessions/${sessionId}/complete`)
      navigate(`/report/${sessionId}`)
    } catch (e) {
      setError(String(e))
      setEnding(false)
    }
  }

  const saveEdit = async () => {
    if (!editing) return
    await api.patch(`/messages/${editing.id}`, { content: editing.text })
    setEditing(null)
    await loadMessages()
  }

  const deleteMessage = async (message: Message) => {
    if (!(await confirm(t('Delete this message?'), { danger: true, confirmLabel: t('Delete') }))) return
    await api.del(`/messages/${message.id}`)
    await loadMessages()
  }

  if (error && !session) return <div className="page error">{error}</div>
  if (!session || !scenario) return <div className="page muted">{t('Loading…')}</div>

  const completed = session.status === 'completed'
  const userName = persona?.name ?? t('You')
  const last = messages[messages.length - 1]
  const canRegenerate = inspector && !busy && !completed && messages.some((m) => m.role === 'user' && !m.blocked)
  const turnsLeft = scenario.max_turns ? Math.max(scenario.max_turns - session.turn_count, 0) : null

  return (
    <div className={`play ${inspector ? '' : 'solo'}`}>
      <section className="chat">
        <div className="chat-head">
          <Link to="/">←</Link>
          <strong>{session.title || scenario.title}</strong>
          <span className="badge">{t('turn {n}', { n: session.turn_count })}</span>
          {turnsLeft !== null && !completed && <span className="badge">{t('{n} turns left', { n: turnsLeft })}</span>}
          {persona && <span className="muted small">{t('as {name}', { name: persona.name })}</span>}
          {inspector && <span className="badge accent">{t('test mode')}</span>}
          <span className="spacer" />
          {inspector && <Link to={`/scenarios/${scenario.id}`} className="small">{t('Edit scenario')}</Link>}
          {completed ? (
            <Link to={`/report/${session.id}`}><button className="primary small">{t('Report')}</button></Link>
          ) : (
            <button className="primary small" disabled={busy || ending} onClick={endSimulation}>{ending ? t('Building the report…') : t('End simulation')}</button>
          )}
        </div>

        <div className="messages">
          {scenario.briefing.trim() && (
            <details className="msg briefing" open={session.turn_count === 0}>
              <summary>{t('Briefing')}</summary>
              <div className="body">{scenario.briefing}</div>
            </details>
          )}
          {messages.map((m) => (
            <div key={m.id} className={`msg ${m.role} ${m.blocked ? 'blocked' : ''}`}>
              <div className="who">
                {m.role === 'user' ? userName : t('Simulation')}
                {m.ooc && <span className="badge warn">OOC</span>}
                {m.blocked && <span className="badge bad">{t('blocked')}</span>}
                {inspector && !completed && (
                  <span className="tools">
                    <button className="ghost small" onClick={() => setEditing({ id: m.id, text: m.content })}>{t('edit')}</button>
                    {m.id === last?.id && <button className="ghost small danger" onClick={() => deleteMessage(m)}>{t('delete')}</button>}
                  </span>
                )}
              </div>
              {editing?.id === m.id ? (
                <div className="stack">
                  <textarea rows={5} value={editing.text} onChange={(e) => setEditing({ ...editing, text: e.target.value })} />
                  <div className="row">
                    <button className="primary small" onClick={saveEdit}>{t('Save')}</button>
                    <button className="small" onClick={() => setEditing(null)}>{t('Cancel')}</button>
                  </div>
                </div>
              ) : (
                <div className="body"><RpText text={m.content} /></div>
              )}
            </div>
          ))}
          {pendingUser && !messages.some((m) => m.role === 'user' && m.content === pendingUser && m.turn_index === session.turn_count + 1) && (
            <div className="msg user">
              <div className="who">{userName}</div>
              <div className="body"><RpText text={pendingUser} /></div>
            </div>
          )}
          {streaming !== null && (
            <div className="msg assistant">
              <div className="who">{t('Simulation')}</div>
              <div className="body">{streaming ? <RpText text={streaming} /> : '…'}</div>
            </div>
          )}
          {(phase || notice || error || endReason || completed) && (
            <div className="msg">
              {phase && <div className="small muted">{t(phase)}</div>}
              {notice && <div className="small" style={{ color: 'var(--warn)' }}>{notice}</div>}
              {error && <div className="error">{error}</div>}
              {!busy && !completed && endReason === 'objectives' && <div className="small ok-text">{t('You reached the objectives. You can end the simulation now.')}</div>}
              {!busy && !completed && endReason === 'max_turns' && <div className="small warn-text">{t('This was the last turn. End the simulation to see the report.')}</div>}
              {completed && <div className="small muted">{t('This simulation is completed.')} <Link to={`/report/${session.id}`}>{t('See the report')}</Link></div>}
            </div>
          )}
          <div ref={bottom} />
        </div>

        <div className="composer">
          <textarea
            disabled={completed}
            placeholder={t('What does {name} say or do? Speech as plain text, *action* in asterisks. Enter sends, Shift+Enter adds a line, (( )) asks the simulation a question.', { name: userName })}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                send()
              }
            }}
          />
          <div className="stack" style={{ gap: 6 }}>
            {busy ? (
              <button disabled={answered} onClick={() => abort.current?.abort()}>{t('Stop')}</button>
            ) : (
              <button className="primary" onClick={send} disabled={!input.trim() || completed}>{t('Send')}</button>
            )}
            {inspector && <button onClick={regenerate} disabled={!canRegenerate} title={t('Write the last reply again with the same harness context')}>{t('Regenerate')}</button>}
          </div>
        </div>
      </section>

      {inspector && (
        <aside className="side">
          <div className="tabs">
            {([
              ['harness', t('Harness')],
              ['state', t('State')],
              ['evaluation', t('Evaluation')],
              ['prompt', t('Prompt')],
              ['memory', t('Memory ({n})', { n: memory.filter((m) => m.active).length })],
              ['labels', t('Labels')],
              ['note', t("Author's Note")],
            ] as [SideTab, string][]).map(([key, label]) => (
              <button key={key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>{label}</button>
            ))}
          </div>
          {tab === 'harness' && <HarnessPanel state={harness} report={report} names={names} />}
          {tab === 'state' && <StatePanel sessionId={sessionId} variables={stateVariables} labels={labels} onChange={loadLabels} />}
          {tab === 'evaluation' && <EvaluationPanel sessionId={sessionId} competencies={competencies} refreshKey={evaluationKey} />}
          {tab === 'prompt' && <PromptPanel prompt={prompt} onPreview={preview} />}
          {tab === 'memory' && <MemoryPanel sessionId={sessionId} memory={memory} characters={characters} onChange={loadMemory} />}
          {tab === 'labels' && <LabelsPanel sessionId={sessionId} labels={labels} registry={registry} characters={characters} onChange={loadLabels} />}
          {tab === 'note' && <AuthorsNotePanel session={session} onSaved={setSession} />}
        </aside>
      )}
    </div>
  )
}
