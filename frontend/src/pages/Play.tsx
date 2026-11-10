import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  api,
  streamTurn,
  type Character,
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
  type TurnEvent,
} from '../api'
import RpText from '../components/RpText'
import { AuthorsNotePanel, HarnessPanel, LabelsPanel, MemoryPanel, PromptPanel } from '../components/Inspector'
import { useConfirm } from '../confirm'
import { useI18n, type MessageKey } from '../i18n'

type SideTab = 'harness' | 'prompt' | 'memory' | 'labels' | 'note'

export default function Play() {
  const { t } = useI18n()
  const confirm = useConfirm()
  const { id } = useParams()
  const sessionId = Number(id)
  const [session, setSession] = useState<RpSession | null>(null)
  const [scenario, setScenario] = useState<Scenario | null>(null)
  const [persona, setPersona] = useState<Persona | null>(null)
  const [characters, setCharacters] = useState<Character[]>([])
  const [messages, setMessages] = useState<Message[]>([])
  const [memory, setMemory] = useState<MemoryItem[]>([])
  const [labels, setLabels] = useState<LabelSet | null>(null)
  const [registry, setRegistry] = useState<RegistryEntry[]>([])
  const [harness, setHarness] = useState<HarnessStatePublic | null>(null)
  const [prompt, setPrompt] = useState<PromptPublic | null>(null)
  const [report, setReport] = useState<PostTurnReport | null>(null)
  const [input, setInput] = useState('')
  const [pendingUser, setPendingUser] = useState<string | null>(null)
  const [streaming, setStreaming] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [phase, setPhase] = useState<MessageKey | ''>('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [tab, setTab] = useState<SideTab>('harness')
  const [editing, setEditing] = useState<{ id: number; text: string } | null>(null)
  const bottom = useRef<HTMLDivElement>(null)
  const abort = useRef<AbortController | null>(null)

  const names = useMemo(() => Object.fromEntries(characters.map((c) => [c.id, c.name])), [characters])

  const loadMessages = async () => setMessages(await api.get<Message[]>(`/sessions/${sessionId}/messages`))
  const loadMemory = async () => setMemory(await api.get<MemoryItem[]>(`/sessions/${sessionId}/memory`))
  const loadLabels = async () => {
    const data = await api.get<{ labels: LabelSet; registry: RegistryEntry[] }>(`/sessions/${sessionId}/labels`)
    setLabels(data.labels)
    setRegistry(data.registry)
  }

  useEffect(() => {
    ;(async () => {
      try {
        const s = await api.get<RpSession>(`/sessions/${sessionId}`)
        setSession(s)
        const [sc, chars] = await Promise.all([
          api.get<Scenario>(`/scenarios/${s.scenario_id}`),
          api.get<Character[]>(`/characters?scenario_id=${s.scenario_id}`),
        ])
        setScenario(sc)
        setCharacters(chars)
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
        setPhase('Narrating…')
        setStreaming('')
        break
      case 'token':
        setStreaming((s) => (s ?? '') + event.data.text)
        break
      case 'done':
        setPhase('Updating memory…')
        loadMessages().then(() => {
          setStreaming(null)
          setPendingUser(null)
        })
        break
      case 'post_turn':
        setReport(event.data)
        loadMemory()
        loadLabels()
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

  const run = async (path: string, body: unknown) => {
    setBusy(true)
    setError('')
    setNotice('')
    setReport(null)
    setPhase('Sage is reading the scene…')
    abort.current = new AbortController()
    try {
      await streamTurn(path, body, handleEvent, abort.current.signal)
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError(String(e))
    } finally {
      await loadMessages()
      setStreaming(null)
      setPendingUser(null)
      setBusy(false)
      setPhase('')
    }
  }

  const send = async () => {
    const text = input.trim()
    if (!text || busy) return
    setInput('')
    setPendingUser(text)
    await run(`/sessions/${sessionId}/turn`, { text })
  }

  const regenerate = () => run(`/sessions/${sessionId}/regenerate`, {})

  const preview = async () => {
    const data = await api.post<{ state: HarnessStatePublic; prompt: PromptPublic }>(`/sessions/${sessionId}/prompt-preview`, { text: input })
    setPrompt(data.prompt)
    setTab('prompt')
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

  const userName = persona?.name ?? t('You')
  const last = messages[messages.length - 1]
  const canRegenerate = !busy && messages.some((m) => m.role === 'user' && !m.blocked)

  return (
    <div className="play">
      <section className="chat">
        <div className="chat-head">
          <Link to="/">←</Link>
          <strong>{session.title || scenario.title}</strong>
          <span className="badge">{t('turn {n}', { n: session.turn_count })}</span>
          {persona && <span className="muted small">{t('as {name}', { name: persona.name })}</span>}
          <span className="spacer" />
          <Link to={`/scenarios/${scenario.id}`} className="small">{t('Edit scenario')}</Link>
        </div>

        <div className="messages">
          {messages.map((m) => (
            <div key={m.id} className={`msg ${m.role} ${m.blocked ? 'blocked' : ''}`}>
              <div className="who">
                {m.role === 'user' ? userName : t('Narrator')}
                {m.ooc && <span className="badge warn">OOC</span>}
                {m.blocked && <span className="badge bad">{t('blocked')}</span>}
                <span className="tools">
                  <button className="ghost small" onClick={() => setEditing({ id: m.id, text: m.content })}>{t('edit')}</button>
                  {m.id === last?.id && <button className="ghost small danger" onClick={() => deleteMessage(m)}>{t('delete')}</button>}
                </span>
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
              <div className="who">{t('Narrator')}</div>
              <div className="body">{streaming ? <RpText text={streaming} /> : '…'}</div>
            </div>
          )}
          {(phase || notice || error) && (
            <div className="msg">
              {phase && <div className="small muted">{t(phase)}</div>}
              {notice && <div className="small" style={{ color: 'var(--warn)' }}>{notice}</div>}
              {error && <div className="error">{error}</div>}
            </div>
          )}
          <div ref={bottom} />
        </div>

        <div className="composer">
          <textarea
            placeholder={t('What does {name} do? *action or context*, (thought), speech as plain text. Enter sends, Shift+Enter adds a line, (( )) is out of character.', { name: userName })}
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
              <button onClick={() => abort.current?.abort()}>{t('Stop')}</button>
            ) : (
              <button className="primary" onClick={send} disabled={!input.trim()}>{t('Send')}</button>
            )}
            <button onClick={regenerate} disabled={!canRegenerate} title={t('Write the last reply again with the same harness context')}>{t('Regenerate')}</button>
          </div>
        </div>
      </section>

      <aside className="side">
        <div className="tabs">
          {([
            ['harness', t('Harness')],
            ['prompt', t('Prompt')],
            ['memory', t('Memory ({n})', { n: memory.filter((m) => m.active).length })],
            ['labels', t('Labels')],
            ['note', t("Author's Note")],
          ] as [SideTab, string][]).map(([key, label]) => (
            <button key={key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>{label}</button>
          ))}
        </div>
        {tab === 'harness' && <HarnessPanel state={harness} report={report} names={names} />}
        {tab === 'prompt' && <PromptPanel prompt={prompt} onPreview={preview} />}
        {tab === 'memory' && <MemoryPanel sessionId={sessionId} memory={memory} characters={characters} onChange={loadMemory} />}
        {tab === 'labels' && <LabelsPanel sessionId={sessionId} labels={labels} registry={registry} characters={characters} onChange={loadLabels} />}
        {tab === 'note' && <AuthorsNotePanel session={session} onSaved={setSession} />}
      </aside>
    </div>
  )
}
