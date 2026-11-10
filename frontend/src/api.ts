// Typed client for the FastAPI backend (proxied at /api by Vite).

export type Role = 'system' | 'user' | 'assistant'

export interface Scenario {
  id: number
  title: string
  summary: string
  world: string
  themes: string[]
  scenario_rules: string
  opening_message: string
  main_prompt_override: string
  post_history_override: string
  authors_note: string
  authors_note_depth: number | null
  authors_note_frequency: number | null
  model: string
  created_at: string
}

export interface Character {
  id: number
  scenario_id: number
  name: string
  description: string
  personality: string
  speech_style: string
  first_message: string
  example_dialogues: string
  depth_note: string
  depth_note_depth: number
  post_history_addition: string
}

export interface Persona {
  id: number
  scenario_id: number | null
  name: string
  description: string
}

export interface LoreEntry {
  id: number
  scenario_id: number
  title: string
  content: string
  kind: string
  keys: string[]
  secondary_keys: string[]
  selective_logic: string
  constant: boolean
  position: string
  depth: number
  role: Role
  order: number
  probability: number
  scan_depth: number | null
  case_sensitive: boolean
  whole_words: boolean
  prevent_recursion: boolean
  sticky: number
  cooldown: number
  delay: number
  known_by: number[]
  enabled: boolean
}

export interface BlockConfig {
  id: string
  enabled: boolean
  role: Role
}

export interface Preset {
  id: number
  name: string
  main_prompt: string
  harness_legend: string
  post_history: string
  authors_note: string
  authors_note_position: string
  authors_note_depth: number
  authors_note_frequency: number
  block_order: BlockConfig[]
  block_labels: Record<string, string>
  required_blocks: string[]
  lore_budget_pct: number
  scene_note_depth: number
  model: string
  temperature: number
  max_tokens: number
  context_size: number
  sage_reasoning: string
}

export interface GlobalRule {
  id: number
  preset_id: number
  title: string
  text: string
  order: number
  enabled: boolean
}

export interface RpSession {
  id: number
  scenario_id: number
  persona_id: number | null
  title: string
  model: string
  authors_note: string | null
  authors_note_depth: number | null
  authors_note_frequency: number | null
  summary: string
  summary_upto_turn: number
  pacing_note: string
  turn_count: number
  created_at: string
}

export interface Message {
  id: number
  session_id: number
  turn_index: number
  role: 'user' | 'assistant'
  content: string
  ooc: boolean
  blocked: boolean
  harness: Record<string, unknown>
}

export interface MemoryItem {
  id: number
  session_id: number
  kind: string
  content: string
  subjects: number[]
  known_by: number[]
  importance: number
  active: boolean
  source_turn: number
  probability: number | null
}

export interface Label {
  key: string
  value: unknown
  probability: number | null
  certainty: 'high' | 'low' | 'carried'
  source: string
  turn: number
  locked: boolean
}

export interface LabelSet {
  labels: Record<string, Label>
  meta: Record<string, unknown>
}

export interface RegistryEntry {
  key: string
  kind: string
  phase: string
  null_policy: string
  renders_to: string
  threshold: number
  lockable: boolean
}

export interface HarnessStatePublic {
  labels: LabelSet
  lore: { id: number; title: string; source: string }[]
  lore_dropped: { id: number; title: string; source: string }[]
  memory: { id: number; kind: string; content: string; known_by: number[] }[]
  guard: { ooc: boolean | null; limits: boolean | null }
  guidance: string[]
  degraded: string[]
  sage: Record<string, unknown>
}

export interface PromptPublic {
  messages: { role: Role; content: string }[]
  sections: { block: string; role: string; tokens: number; depth?: number }[]
  trimmed: Record<string, number>
  tokens: number
  budget: number
  history_kept: number
}

export interface PostTurnReport {
  memory_added: { kind: string; content: string; known_by: number[] }[]
  errors: string[]
  stalling?: number
  location?: string
  summarized_upto_turn?: number
}

export interface Health {
  ok: boolean
  openrouter_configured: boolean
  sage_configured: boolean
  sage_ready: boolean
  default_model: string
  summary_model: string
}

export interface ModelInfo {
  id: string
  name: string
  context_length: number | null
  pricing: Record<string, string>
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!response.ok) {
    let detail = response.statusText
    try {
      const data = await response.json()
      detail = typeof data.detail === 'string' ? data.detail : JSON.stringify(data.detail)
    } catch {
      /* keep statusText */
    }
    throw new Error(`${response.status}: ${detail}`)
  }
  return (await response.json()) as T
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body ?? {}),
  patch: <T>(path: string, body: unknown) => request<T>('PATCH', path, body),
  put: <T>(path: string, body: unknown) => request<T>('PUT', path, body),
  del: (path: string) => request<{ ok: boolean }>('DELETE', path),

  async importCard(file: File): Promise<{ scenario: Scenario; lore_count: number }> {
    const form = new FormData()
    form.append('file', file)
    const response = await fetch('/api/import/card', { method: 'POST', body: form })
    if (!response.ok) {
      const data = await response.json().catch(() => ({ detail: response.statusText }))
      throw new Error(String(data.detail))
    }
    return response.json()
  },
}

export type TurnEvent =
  | { event: 'harness'; data: { state: HarnessStatePublic; prompt: PromptPublic | null; user_message_id?: number } }
  | { event: 'token'; data: { text: string } }
  | { event: 'done'; data: { message_id: number; user_message_id: number; usage?: Record<string, number> } }
  | { event: 'post_turn'; data: PostTurnReport }
  | { event: 'blocked'; data: { message_id: number; reason: string } }
  | { event: 'error'; data: { message: string } }

/** POST that returns Server-Sent Events; calls onEvent for each event. */
export async function streamTurn(
  path: string,
  body: unknown,
  onEvent: (event: TurnEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const response = await fetch(`/api${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify(body ?? {}),
    signal,
  })
  if (!response.ok || !response.body) {
    onEvent({ event: 'error', data: { message: `${response.status}: ${response.statusText}` } })
    return
  }
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n')
    let split = buffer.indexOf('\n\n')
    while (split !== -1) {
      const block = buffer.slice(0, split)
      buffer = buffer.slice(split + 2)
      let name = ''
      let data = ''
      for (const line of block.split('\n')) {
        if (line.startsWith('event: ')) name = line.slice(7)
        else if (line.startsWith('data: ')) data += line.slice(6)
      }
      if (name && data) {
        try {
          onEvent({ event: name, data: JSON.parse(data) } as TurnEvent)
        } catch {
          /* ignore a malformed event */
        }
      }
      split = buffer.indexOf('\n\n')
    }
  }
}
