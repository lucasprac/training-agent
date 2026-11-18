import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  api,
  type Competency,
  type CompetencyResult,
  type Evaluation,
  type Message,
  type Persona,
  type Profile,
  type Report as ReportData,
  type RpSession,
  type Scenario,
} from '../api'
import { useI18n } from '../i18n'
import { useProfile } from '../profile'
import { scoreClass } from '../training'

/** The message with every evidence span marked. Spans are sorted and do not overlap. */
function Highlight({ text, spans }: { text: string; spans?: { start: number; end: number }[] }) {
  const parts: (string | { mark: string })[] = []
  let at = 0
  for (const s of spans ?? []) {
    if (s.start < at || s.end > text.length || s.start >= s.end) continue
    parts.push(text.slice(at, s.start), { mark: text.slice(s.start, s.end) })
    at = s.end
  }
  parts.push(text.slice(at))
  return <>{parts.map((p, i) => (typeof p === 'string' ? p : <mark key={i}>{p.mark}</mark>))}</>
}

/** Feedback text: a line without "- " is a heading, a line with "- " is a point. */
function FeedbackText({ text }: { text: string }) {
  const lines = text.split('\n').map((l) => l.replace(/\*\*/g, '').trim()).filter(Boolean)
  return (
    <div className="feedback stack" style={{ gap: 4 }}>
      {lines.map((line, i) =>
        /^[-•*]\s|^\d+\.\s/.test(line)
          ? <div key={i} className="feedback-point">{line.replace(/^[-•*]\s+/, '')}</div>
          : <strong key={i} style={{ marginTop: i ? 8 : 0 }}>{line.replace(/:$/, '')}</strong>,
      )}
    </div>
  )
}

function ScoreBar({ percent }: { percent: number | null }) {
  return (
    <div className="score-bar" aria-hidden>
      <div className={scoreClass(percent)} style={{ width: `${percent ?? 0}%` }} />
    </div>
  )
}

function CompetencyCard({ result }: { result: CompetencyResult }) {
  const { t } = useI18n()
  const shown = result.indicators.filter((i) => i.polarity === 'positive' && i.count > 0)
  const missing = result.indicators.filter((i) => i.polarity === 'positive' && i.count === 0)
  const avoid = result.indicators.filter((i) => i.polarity === 'negative' && i.count > 0)
  return (
    <div className="card stack" style={{ gap: 8 }}>
      <div className="row">
        <strong style={{ flex: 1 }}>{result.name}</strong>
        {result.percent !== null ? <span className={`badge ${scoreClass(result.percent)}`}>{result.percent}%</span> : <span className="badge">{t('not observed')}</span>}
        {result.needs_review > 0 && <span className="badge warn">{t('{n} for review', { n: result.needs_review })}</span>}
      </div>
      <ScoreBar percent={result.percent} />
      {result.level_description && <div className="small">{t('Level: {level}', { level: result.level_description })}</div>}
      <div className="small muted">
        {result.status === 'not_observed'
          ? t('This simulation gave no chance to show this competency.')
          : result.status === 'review_only'
            ? t('The evaluation of this competency is waiting for the manager.')
            : t('Evaluated in {n} answers.', { n: result.observed })}
      </div>
      {(shown.length > 0 || missing.length > 0 || avoid.length > 0) && (
        <ul className="indicators">
          {shown.map((i) => <li key={i.id} className="ok">✓ {i.text}{i.count > 1 && <span className="muted"> ×{i.count}</span>}</li>)}
          {avoid.map((i) => <li key={i.id} className="bad">! {i.text}{i.count > 1 && <span className="muted"> ×{i.count}</span>}</li>)}
          {result.status === 'scored' && missing.map((i) => <li key={i.id} className="muted">○ {i.text}</li>)}
        </ul>
      )}
      {result.evidence.length > 0 && (
        <div className="stack" style={{ gap: 6 }}>
          <div className="small muted">{t('Evidence')}</div>
          {result.evidence.map((e, i) => (
            <div key={i} className="quote small">
              <span className="muted">{t('turn {n}', { n: e.turn_index })}: </span>
              <Highlight text={e.message} spans={e.spans} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ReviewRow({ row, competency, message, onDone }: { row: Evaluation; competency?: Competency; message?: Message; onDone: () => void }) {
  const { t } = useI18n()
  const levels = competency?.levels ?? []
  const [score, setScore] = useState<number>(row.score !== null ? Math.round(row.score) : (levels[0]?.level ?? 0))
  const [note, setNote] = useState(row.note)
  const [error, setError] = useState('')
  const act = async (fn: () => Promise<unknown>) => {
    try {
      await fn()
      onDone()
    } catch (e) {
      setError(String(e))
    }
  }
  return (
    <div className="card stack" style={{ gap: 6 }}>
      <div className="row small">
        <strong style={{ flex: 1 }}>{competency?.name ?? `#${row.competency_id}`} · {t('turn {n}', { n: row.turn_index })}</strong>
        {row.score !== null && <span className="badge">{t('Sage: {score}', { score: row.score.toFixed(1) })}</span>}
      </div>
      {row.review_reason && <div className="small warn-text">{row.review_reason}</div>}
      {message && <div className="quote small">{message.content}</div>}
      <div className="row" style={{ alignItems: 'flex-end' }}>
        <label className="field" style={{ minWidth: 220, flex: 1 }}>
          {t('Level')}
          <select value={score} onChange={(e) => setScore(Number(e.target.value))}>
            {levels.map((l) => <option key={l.level} value={l.level}>{l.level} · {l.description}</option>)}
          </select>
        </label>
        <label className="field" style={{ flex: 2, minWidth: 220 }}>
          {t('Note (optional)')}
          <input value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
        <button className="primary" onClick={() => act(() => api.patch(`/evaluations/${row.id}`, { score, note }))}>{t('Save level')}</button>
        <button onClick={() => act(() => api.del(`/evaluations/${row.id}`))} title={t('The message did not really show this competency')}>{t('Discard')}</button>
      </div>
      {error && <div className="error">{error}</div>}
    </div>
  )
}

export default function Report() {
  const { t, lang } = useI18n()
  const { profile } = useProfile()
  const { id } = useParams()
  const sessionId = Number(id)
  const [session, setSession] = useState<RpSession | null>(null)
  const [scenario, setScenario] = useState<Scenario | null>(null)
  const [persona, setPersona] = useState<Persona | null>(null)
  const [trainee, setTrainee] = useState<Profile | null>(null)
  const [report, setReport] = useState<ReportData | null>(null)
  const [evaluations, setEvaluations] = useState<Evaluation[]>([])
  const [messages, setMessages] = useState<Message[]>([])
  const [library, setLibrary] = useState<Competency[]>([])
  const [rebuilding, setRebuilding] = useState(false)
  const [error, setError] = useState('')
  const manager = profile?.role === 'manager'

  const load = async () => {
    try {
      const [s, r] = await Promise.all([
        api.get<RpSession>(`/sessions/${sessionId}`),
        api.get<{ report: ReportData | null }>(`/sessions/${sessionId}/report`),
      ])
      setSession(s)
      setReport(r.report)
      const [sc, lib] = await Promise.all([api.get<Scenario>(`/scenarios/${s.scenario_id}`), api.get<Competency[]>('/competencies')])
      setScenario(sc)
      setLibrary(lib)
      if (s.persona_id) setPersona(await api.get<Persona>(`/personas/${s.persona_id}`).catch(() => null))
      if (s.profile_id) setTrainee(await api.get<Profile>(`/profiles/${s.profile_id}`).catch(() => null))
      if (manager) {
        const [ev, ms] = await Promise.all([
          api.get<Evaluation[]>(`/sessions/${sessionId}/evaluations`),
          api.get<Message[]>(`/sessions/${sessionId}/messages`),
        ])
        setEvaluations(ev)
        setMessages(ms)
      }
    } catch (e) {
      setError(String(e))
    }
  }
  useEffect(() => {
    load()
  }, [sessionId, manager])

  const rebuild = async () => {
    setRebuilding(true)
    try {
      const result = await api.post<{ report: ReportData }>(`/sessions/${sessionId}/complete`)
      setReport(result.report)
    } catch (e) {
      setError(String(e))
    }
    setRebuilding(false)
  }

  if (error) return <div className="page error">{error}</div>
  if (!session || !scenario) return <div className="page muted">{t('Loading…')}</div>
  if (session.status !== 'completed' || !report) {
    return (
      <div className="page">
        <div className="page-narrow stack">
          <h1>{scenario.title}</h1>
          <p className="muted">{t('This simulation is not completed yet.')}</p>
          <div><Link to={`/play/${session.id}`}><button className="primary">{t('Continue')}</button></Link></div>
        </div>
      </div>
    )
  }

  const byId = Object.fromEntries(library.map((c) => [c.id, c]))
  const messageById = Object.fromEntries(messages.map((m) => [m.id, m]))
  const pending = evaluations.filter((e) => e.needs_review)

  return (
    <div className="page">
      <div className="page-narrow stack">
        <div className="row">
          <Link to="/">←</Link>
          <div style={{ flex: 1 }}>
            <h1 style={{ margin: 0 }}>{scenario.title}</h1>
            <div className="muted small">
              {[trainee?.name, persona?.name && t('as {name}', { name: persona.name }), session.completed_at && new Date(session.completed_at).toLocaleString(lang), t('{n} turns', { n: report.turns })]
                .filter(Boolean)
                .join(' · ')}
            </div>
          </div>
          {report.overall_percent !== null && (
            <div className="overall">
              <span className={`overall-num ${scoreClass(report.overall_percent)}`}>{report.overall_percent}%</span>
              <span className="small muted">{t('overall')}</span>
            </div>
          )}
        </div>

        {report.pending_review > 0 && (
          <p className="warn-text small">
            {manager ? t('{n} evaluations need your review. The scores below do not count them yet.', { n: report.pending_review }) : t('Some evaluations are waiting for the manager. The scores can still change.')}
          </p>
        )}

        <section className="card stack">
          <h2>{t('Feedback')}</h2>
          {report.feedback ? <FeedbackText text={report.feedback} /> : <p className="muted small">{t('No written feedback is available.')}</p>}
          {manager && report.feedback_error && <div className="small error">{report.feedback_error}</div>}
        </section>

        {report.objectives.length > 0 && (
          <section className="card stack" style={{ gap: 6 }}>
            <h2>{t('Objectives ({n} of {total})', { n: report.objectives_reached, total: report.objectives.length })}</h2>
            <ul className="indicators">
              {report.objectives.map((o) => <li key={o.id} className={o.reached ? 'ok' : 'bad'}>{o.reached ? '✓' : '✗'} {o.name}</li>)}
            </ul>
          </section>
        )}

        <h2 style={{ marginTop: 6 }}>{t('Competencies')}</h2>
        {report.competencies.length === 0 && <p className="muted">{t('This scenario evaluates no competencies.')}</p>}
        <div className="grid2">
          {report.competencies.map((c) => <CompetencyCard key={c.competency_id} result={c} />)}
        </div>

        {report.final_state.length > 0 && (
          <section className="card stack" style={{ gap: 6 }}>
            <h2>{t('At the end of the simulation')}</h2>
            <div className="kv">
              {report.final_state.map((s) => (
                <div key={s.id} style={{ display: 'contents' }}>
                  <span className="k">{s.name}</span>
                  <span>{s.value ?? '—'}</span>
                  <span />
                </div>
              ))}
            </div>
          </section>
        )}

        {manager && (
          <section className="stack">
            <div className="row">
              <h2 style={{ margin: 0, flex: 1 }}>{t('Review ({n})', { n: pending.length })}</h2>
              <button disabled={rebuilding} onClick={rebuild} title={t('Recompute the scores and write the feedback again')}>{rebuilding ? t('Building the report…') : t('Rebuild report')}</button>
            </div>
            {pending.length === 0 && <p className="muted small">{t('Nothing to review.')}</p>}
            {pending.map((row) => (
              <ReviewRow key={row.id} row={row} competency={byId[row.competency_id]} message={messageById[row.message_id]} onDone={load} />
            ))}
          </section>
        )}
      </div>
    </div>
  )
}
