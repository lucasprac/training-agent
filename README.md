# Training Agent

A simulation environment for competency training. A company (the **manager**) builds work scenarios. Employees (the **trainees**) practise them in a chat simulation. **Levanto Sage 2** tracks the state of each simulation and evaluates every trainee message against the company's competency rubrics, with evidence. At the end, the trainee gets a report; the manager sees the results of the team.

It has two parts:

- **Interface** (React + Vite): scenario editor, competency library, team and assignments, the simulation, the report and the results table.
- **Harness** (FastAPI): prepares the context for the simulation model on every turn, asks Sage for the state and the evaluation, and builds the report.

The harness is hybrid. **Sage** (Decide + Extract) does all the structured work: guards, scene, state variables, objectives, competency scores and evidence. An **OpenRouter** model plays the counterparts (customers, colleagues, managers) and writes the final feedback text. The model never sees scores, and it never changes them.

## Setup

Requirements: Python 3.12 + [uv](https://docs.astral.sh/uv/), Node 22+.

1. Copy `.env.example` to `.env` and set `OPENROUTER_API_KEY` and `SAGE_API_KEY`. Environment variables with the same names also work.
2. Install:

   ```bash
   cd backend && uv sync
   ```

   ```bash
   cd frontend && npm install
   ```

3. Run the backend (port 8000) and the frontend (port 5173) in two terminals:

   ```bash
   cd backend && uv run uvicorn app.main:app --port 8000 --reload
   ```

   ```bash
   cd frontend && npm run dev
   ```

4. Open http://localhost:5173 and choose a profile. The SQLite database is created at `backend/data/training.db` with the global prompt preset, the global rules and a starter competency library (pt-BR). With `SAMPLE_DATA=true` (the default) a new database also gets a manager, a trainee and one ready scenario ("Cliente insatisfeita: entrega com defeito") assigned to the trainee.

**Profiles have no login.** The chosen profile is stored in the browser, and anyone can switch profiles. This is for prototypes and demos only.

Without `SAGE_API_KEY` the simulation still runs in **degraded mode** (keyword-only lore, no state, no evaluation). Without `OPENROUTER_API_KEY` no reply and no written feedback can be produced.

## Roles

| Manager | Trainee |
|---|---|
| Builds scenarios (situation, counterparts, trainee role, competencies, states and objectives, knowledge base, briefing) | Sees the trainings assigned to them |
| Keeps the competency library (indicators and rubric levels) | Reads the briefing and runs the simulation |
| Assigns scenarios to trainees, with an optional due date | Ends the simulation and reads the report |
| Tests a scenario with the inspector (harness, state, evaluation, prompt, memory, labels) | Sees scores only in the final report |
| Reviews evaluations that Sage could not decide, and sees the results table | |

## How a turn works

```
trainee message
  → World Info keyword pass (the scenario knowledge base)
  → pre-turn, in parallel:
      Sage /decide/batch: guard.ooc, guard.limits, scene.location/stage/tone, scene.present,
                          select.lore, select.memory, one question per state variable (state.<id>)
      Sage /v1/extract:   typed state variables (for example "discount offered" = 15)
  → prompt assembler (tagged blocks; <sim_state> shows only the variables visible to the counterparts)
  → OpenRouter streaming reply (SSE to the browser)
  → post-turn, in parallel:
      Sage /decide/batch: memory.kind + veil.known_by per sentence, pacing.stalling
      Sage /decide/batch: competency evaluation of the trainee message (see below)
  → rolling summary (summary model) when the history gets long
```

SSE events: `harness` → `token`… → `done` (with `end_reason`: `objectives` or `max_turns`) → `post_turn` (memory, pacing and evaluation counts, never scores). A blocked message ends with `blocked`.

### Competency evaluation

For each trainee message, one Sage batch over a compact view (recent conversation + the message) asks:

| Question | Kind | Result |
|---|---|---|
| `competency.exercised` | tags | which scenario competencies this moment calls for (also when the message handles them badly) |
| `competency.score:<id>` | scale | the rubric level, with Sage's confidence |
| `competency.indicators:<id>` | tags | which observable behaviours (to show / to avoid) the message shows |
| `competency.evidence:<id>` | tags | which sentences of the message the level rests on (exact offsets) |

A `null` answer is never a low score: the row is marked **for review**, and the manager sets the level on the report page. Evidence uses sentence tags, not Extract: Extract finds passages that show a competency, but it cannot quote a weak answer, and a weak answer needs evidence too.

### Report

Ending the simulation builds the report: per competency, the confidence-weighted average of the rubric levels (rows in review are left out), the level description, behaviour counts and evidence quotes; the objectives reached; the final state; and the overall score (weighted by the scenario's competency weights). The summary model then writes short feedback from these facts only. A manager correction recomputes the numbers and keeps the feedback text; "Rebuild report" writes it again.

### State variables and objectives

A scenario can define variables that Sage tracks every turn: `scale` (levels), `choice` (options), `yesno` or `extract` (a typed value from the text). A `null` answer keeps the previous value. A yes/no variable can be an **objective** of the trainee: once reached, it stays reached and is not asked again. When every objective is reached, or the turn limit is reached, the simulation suggests that the trainee ends it.

### Sage ↔ prompt contract

- Every fixed Sage question is declared once in `backend/app/sage/registry.py`. State questions are built from the scenario's variables (`state_specs`).
- Sage answers become **labels** (`backend/app/sage/labels.py`). The assembler reads only labels, never raw Sage JSON, and never shows probabilities or scores to the simulation model.
- Stability: a scene label changes only on a confident answer (≥ 0.7). A counterpart leaves the scene after two "not present" answers in a row.
- A manager can **lock** a label or a state variable while testing.

## Prompt layers

| Layer | Scope | Contents |
|---|---|---|
| Global preset | all simulations | main prompt, harness legend, **global rules** (realism, veil of knowledge, trainee agency, no coaching), post-history instructions, block order, budgets |
| Scenario | one scenario | situation, context tags, scenario rules, briefing, opening message, overrides |
| Counterpart | one counterpart | description with goals and limits, personality, speech style |
| Trainee role | one scenario | `{{user}}` name and description |
| Knowledge base | one scenario | World Info entries (policies, products, facts) |
| Session | one run | memory, summary, labels, state |

Macros: `{{user}}`, `{{char}}`, `{{persona}}`, `{{scenario}}`, `{{original}}`, `{{location}}`, `{{stage}}`, `{{tone}}`, `{{present}}`, `{{time}}`, `{{date}}`, `{{roll::2d6}}`.

## Tests

```bash
cd backend && uv run pytest
```

```bash
cd frontend && npm run build
```

The backend tests mock Sage and OpenRouter with `respx`. They cover the clients, World Info, labels and stability, request building and limits, the assembler, full turns over SSE, state variables (questions, stability, Extract values, `<sim_state>`), the competency evaluation (questions, evidence sentences, review rules, regenerate), completion and the report, the results table, and the CRUD validation of the Sage limits.

## Project layout

```
backend/app/
  clients/      sage.py, openrouter.py
  sage/         registry.py, labels.py, request.py, extract.py, evaluation.py
  training/     state.py, competencies.py, report.py, validation.py
  worldinfo/    activation.py
  prompt/       blocks.py, assembler.py, macros.py, budget.py
  harness/      orchestrator.py, state.py, summarizer.py
  api/          routes.py, crud.py
  seed.py, seed_library.py, seed_sample.py
frontend/src/
  pages/        Library, MyTrainings, ScenarioEditor, Competencies, Team, Results, Play, Report,
                PromptManager, Settings, ProfilePicker
  components/   Field, Rubric, Inspector (harness, state, evaluation, prompt, memory, labels, Author's Note)
```

## Not included yet

Login and access control, several companies in one installation, embeddings for lore matching, group conversations with turn order, and the Sage streaming endpoint.
