import { api, type Persona, type RpSession } from './api'

/** Starts a session of the scenario for a profile, in the scenario's first trainee role. */
export async function startTraining(scenarioId: number, profileId: number, personaId?: number | null): Promise<RpSession> {
  let persona = personaId ?? null
  if (persona === null) {
    const personas = await api.get<Persona[]>(`/personas?scenario_id=${scenarioId}`)
    persona = personas[0]?.id ?? null
  }
  return api.post<RpSession>('/sessions', { scenario_id: scenarioId, persona_id: persona, profile_id: profileId })
}

/** CSS class for a 0-100 score: good, partial, weak. */
export function scoreClass(percent: number | null | undefined): string {
  if (percent === null || percent === undefined) return ''
  return percent >= 70 ? 'ok' : percent >= 40 ? 'warn' : 'bad'
}
