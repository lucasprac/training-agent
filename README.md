# Roleplay Harness

A local, single-user roleplay platform. It has two parts:

- **Interface** (React + Vite): build scenarios step by step (world and themes, characters, your own character, lorebook), then play.
- **Harness** (FastAPI): prepares the context, resources and memory for the narrator agent on every turn.

The harness is hybrid. **Levanto Sage 2** (Decide + Extract) does the structured work. An **OpenRouter** model writes the story. The prompt follows the **SillyTavern** model (Prompt Manager order, World Info, Author's Note, Post-History Instructions, macros). Every block is a tagged section, so the narrator can tell rules, lore, memory and scene apart.

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

4. Open http://localhost:5173. The SQLite database is created at `backend/data/roleplay.db` with a default prompt preset and the global rules. Each scenario has its own personas (the character you play).

Without `SAGE_API_KEY` the platform still works in **degraded mode** (keyword-only lore, no scene labels, no memory extraction). Without `OPENROUTER_API_KEY` no reply can be written.

## How a turn works

```
user message
  → World Info keyword pass (keys, secondary logic, regex, recursion, sticky/cooldown/delay, trigger %)
  → ONE Sage /decide/batch (pre-turn): guard.ooc, guard.limits, scene.location/type/mood,
    scene.present, select.lore, select.memory  → typed LabelSet
  → prompt assembler (SillyTavern order, tagged blocks, veil of knowledge, budget + trimming)
  → OpenRouter streaming reply  (SSE to the browser)
  → post-turn: ONE Sage /decide/batch: each sentence of the turn → memory.kind + veil.known_by,
    plus pacing.stalling; Sage /v1/extract names a new place when the scene left the lorebook map
  → rolling summary (summary model) when the history gets long
```

SSE events: `harness` (labels, lore, memory, prompt) → `token`… → `done` → `post_turn` (new memory, pacing). A blocked message ends with `blocked`.

### Sage ↔ prompt contract

- Every Sage question is declared once in `backend/app/sage/registry.py` (label key, kind, null policy, threshold, where it renders).
- Sage answers become **labels** (`backend/app/sage/labels.py`). The assembler reads only labels, never raw Sage JSON, and never shows probabilities to the narrator.
- Stability: a scene label changes only on a confident answer (≥ 0.7), else the old value is carried and rendered `certainty="tentative"`. A character leaves the scene after two "not present" answers in a row, or at once on a location change.
- You can **lock** a label in the Play view (Labels tab). Locked labels are not asked and not changed.
- **Regenerate** reuses the stored labels: no new Sage call, same context.

### Why memory is sentence-based

Sage Extract is extractive: it returns spans of the text. It finds names and short phrases well (items, places), but it cannot write a whole fact. So each sentence of the turn is a memory candidate. Sage classifies it (fact, relationship, item, goal, event or none) and tags which present characters witnessed it (`known_by`). The veil of knowledge then puts private memory only inside the `<knows>` block of the characters who know it.

### Prompt layers

| Layer | Scope | Contents |
|---|---|---|
| Global preset | all roleplays | main prompt, harness legend, **global rules**, post-history instructions, default Author's Note, block order, budgets |
| Scenario | one scenario | world, scenario rules (added to the global rules, never replacing them), opening message, main prompt / PHI override with `{{original}}` |
| Character | one character | description, personality, speech style, first message, examples, depth note, PHI addition |
| Persona | belongs to one scenario, picked per session | `{{user}}` name and description |
| Lorebook | one scenario | World Info entries with SillyTavern fields + `known_by` |
| Session | one playthrough | Author's Note, memory, summary, labels |

Macros: `{{user}}`, `{{char}}`, `{{persona}}`, `{{scenario}}`, `{{original}}`, `{{location}}`, `{{mood}}`, `{{scene_type}}`, `{{present}}`, `{{time}}`, `{{date}}`, `{{roll::2d6}}`.

Timed lore effects (sticky, cooldown) count in **turns** (one message + one reply). Delay counts messages.

## Tests

```bash
cd backend && uv run pytest
```

```bash
cd frontend && npm run build
```

The backend tests mock Sage and OpenRouter with `respx`. They cover the clients, World Info activation, labels and stability, request building and limits, the assembler (order, depth injections, veil, overrides, trimming), and full turns over SSE (memory, regenerate, blocked, OOC, degraded mode, label locks, card import).

## Project layout

```
backend/app/
  clients/      sage.py, openrouter.py
  sage/         registry.py, labels.py, request.py, extract.py
  worldinfo/    activation.py
  prompt/       blocks.py, assembler.py, macros.py, budget.py
  harness/      orchestrator.py, state.py, summarizer.py
  api/          routes.py, crud.py
  importers/    sillytavern.py  (V2/V3 JSON or PNG card, character_book → lorebook)
frontend/src/
  pages/        Library, ScenarioEditor, PromptManager, Play, Settings
  components/   Field, Inspector (harness, prompt, memory, labels, Author's Note panels)
```

## Not included yet

Embeddings/vector lore matching, lore inclusion groups, group-chat turn order, multi-user auth, image generation, and the Sage streaming endpoint.
