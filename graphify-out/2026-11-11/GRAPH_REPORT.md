# Graph Report - Training agent  (2026-11-10)

## Corpus Check
- 83 files · ~49,194 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 4 file(s) not represented in the graph (top: (none) 2, .lock 1, .css 1)

## Summary
- 930 nodes · 2897 edges · 41 communities (33 shown, 8 thin omitted)
- Extraction: 90% EXTRACTED · 10% INFERRED · 0% AMBIGUOUS · INFERRED: 286 edges (avg confidence: 0.93)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `b9464ae6`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- test_labels_and_requests.py
- ScenarioEditor.tsx
- MemoryItem
- Prompt Assembler
- SageClient
- db.py
- World Info Activation
- LabelSet
- Frontend Dependencies
- Architecture Docs
- test_evaluation.py
- TS App Config
- App.tsx
- TS Node Config
- CRUD Router Factory
- Oxlint Rules
- Message
- TS Project References
- routes.py
- useI18n
- Out of Scope Features
- OpenRouterClient
- report.py
- conftest.py
- test_state.py
- api.ts
- Scenario
- registry.py
- orchestrator.py
- harness_of
- Harness
- i18n.ts
- RpText.tsx
- _delete_scenario_children
- confirm.ts
- seed_library.py
- training-backend

## God Nodes (most connected - your core abstractions)
1. `useI18n()` - 64 edges
2. `Message` - 47 edges
3. `StateVariable` - 37 edges
4. `LoreEntry` - 35 edges
5. `LabelSet` - 34 edges
6. `Harness` - 32 edges
7. `MemoryItem` - 30 edges
8. `Character` - 29 edges
9. `base_input()` - 29 edges
10. `SageContext` - 27 edges

## Surprising Connections (you probably didn't know these)
- `Favicon (default Vite purple lightning-bolt logo)` --conceptually_related_to--> `React + TypeScript + Vite template`  [INFERRED]
  frontend/public/favicon.svg → frontend/README.md
- `Interface (React + Vite)` --conceptually_related_to--> `index.html app shell (Roleplay Harness title, #root)`  [INFERRED]
  README.md → frontend/index.html
- `React + TypeScript + Vite template` --conceptually_related_to--> `Interface (React + Vite)`  [INFERRED]
  frontend/README.md → README.md
- `harness_of()` --uses--> `Harness`  [INFERRED]
  backend/app/api/routes.py → backend/app/harness/orchestrator.py
- `_delete_scenario_children()` --uses--> `Assignment`  [INFERRED]
  backend/app/api/routes.py → backend/app/models.py

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Memory and knowledge flow (sentence memory, known_by, veil)** — readme_sage_post_turn_batch, readme_sentence_based_memory, readme_veil_of_knowledge [EXTRACTED 1.00]
- **Per-turn harness flow** — readme_world_info_activation, readme_sage_pre_turn_batch, backend_app_prompt_assembler, readme_openrouter, readme_sage_post_turn_batch, readme_rolling_summary [EXTRACTED 1.00]
- **Sage label system (registry, labels, stability, locks, regenerate)** — backend_app_sage_registry, backend_app_sage_labels, readme_label_stability, readme_label_lock, readme_regenerate [INFERRED 0.85]

## Communities (41 total, 8 thin omitted)

### Community 0 - "test_labels_and_requests.py"
Cohesion: 0.10
Nodes (24): push(), estimate_messages(), estimate_tokens(), evaluation_view(), map_location(), QuestionSpec, specs_for(), build_post_turn() (+16 more)

### Community 1 - "ScenarioEditor.tsx"
Cohesion: 0.12
Nodes (40): Preset, CheckField(), ListField(), NumberField(), SelectField(), TextField(), TextProps, useConfirm() (+32 more)

### Community 2 - "MemoryItem"
Cohesion: 0.14
Nodes (23): add_memory(), correct_evaluation(), delete_evaluation(), delete_memory(), delete_message(), delete_session(), edit_message(), EvaluationPatch (+15 more)

### Community 3 - "Prompt Assembler"
Cohesion: 0.06
Nodes (40): authors_note_for(), GlobalRule, Persona, PromptPreset, assemble(), AssemblyInput, AssemblyOutput, _attr() (+32 more)

### Community 4 - "SageClient"
Cohesion: 0.13
Nodes (10): _detail(), _retry_wait(), SageClient, SageError, test_openrouter_error_status_raises(), test_openrouter_stream_parses_tokens_and_usage(), test_sage_402_raises_with_status(), test_sage_reasoning_only_sent_when_not_off() (+2 more)

### Community 5 - "db.py"
Cohesion: 0.17
Nodes (10): get_settings(), _add_missing_columns(), get_db(), get_engine(), init_db(), make_engine(), set_engine(), lifespan() (+2 more)

### Community 6 - "World Info Activation"
Cohesion: 0.08
Nodes (25): HarnessState, LoreEntry, normalize(), activate(), ActivationResult, apply_budget(), _compile_key(), entry_matches() (+17 more)

### Community 7 - "LabelSet"
Cohesion: 0.10
Nodes (18): Answer, apply_choice(), apply_extracted(), apply_present(), apply_state(), apply_yesno(), _carry(), Label (+10 more)

### Community 8 - "Frontend Dependencies"
Cohesion: 0.07
Nodes (29): dependencies, react, react-dom, react-router-dom, devDependencies, oxlint, @types/node, @types/react (+21 more)

### Community 9 - "Architecture Docs"
Cohesion: 0.09
Nodes (22): index.html app shell (Roleplay Harness title, #root), Favicon (default Vite purple lightning-bolt logo), Oxlint configuration (type-aware rules via oxlint-tsgolint), React + TypeScript + Vite template, @vitejs/plugin-react (Oxc) / plugin-react-swc (SWC), Backend tests (pytest, respx mocks for Sage and OpenRouter), Harness (FastAPI), Interface (React + Vite) (+14 more)

### Community 10 - "test_evaluation.py"
Cohesion: 0.07
Nodes (33): build_evaluation(), evidence_for(), _one_line(), sentence_spans(), to_evaluations(), openrouter_stream(), sse_events(), EvalSage (+25 more)

### Community 11 - "TS App Config"
Cohesion: 0.10
Nodes (19): compilerOptions, allowArbitraryExtensions, allowImportingTsExtensions, erasableSyntaxOnly, jsx, lib, module, moduleDetection (+11 more)

### Community 12 - "App.tsx"
Cohesion: 0.13
Nodes (36): api, Assignment, CompetencyResult, Profile, ProfileRole, Report, RpSession, Scenario (+28 more)

### Community 13 - "TS Node Config"
Cohesion: 0.12
Nodes (16): compilerOptions, allowImportingTsExtensions, erasableSyntaxOnly, lib, module, moduleDetection, noEmit, noFallthroughCasesInSwitch (+8 more)

### Community 14 - "CRUD Router Factory"
Cohesion: 0.22
Nodes (7): crud_router(), check(), create_item(), delete_item(), get_item(), list_items(), update_item()

### Community 15 - "Oxlint Rules"
Cohesion: 0.33
Nodes (5): plugins, rules, react/only-export-components, react/rules-of-hooks, $schema

### Community 16 - "Message"
Cohesion: 0.17
Nodes (8): load_context(), _nothing(), _prompt_public(), TurnContext, messages_to_fold(), needs_summary(), update_summary(), Message

### Community 20 - "routes.py"
Cohesion: 0.13
Nodes (20): AssignmentBase, CharacterBase, CompetencyBase, default_levels(), GlobalRuleBase, LoreEntryBase, _now(), PersonaBase (+12 more)

### Community 23 - "useI18n"
Cohesion: 0.13
Nodes (33): EndReason, Evaluation, HarnessStatePublic, Label, LabelSet, MemoryItem, Message, PostTurnReport (+25 more)

### Community 25 - "OpenRouterClient"
Cohesion: 0.16
Nodes (3): _error_text(), OpenRouterClient, OpenRouterError

### Community 26 - "report.py"
Cohesion: 0.14
Nodes (16): _refresh_if_completed(), Competency, Evaluation, TrainingSession, ScenarioCompetencyItem, scenario_competencies(), build_report(), competency_result() (+8 more)

### Community 27 - "conftest.py"
Cohesion: 0.19
Nodes (6): create_app(), client(), harness(), make_harness(), settings(), world()

### Community 28 - "test_state.py"
Cohesion: 0.13
Nodes (17): StateVariable, map_state(), state_field(), state_schema(), state_specs(), scene_text(), active(), display_value() (+9 more)

### Community 29 - "api.ts"
Cohesion: 0.11
Nodes (24): BlockConfig, Character, ChoiceOption, Competency, EvidenceSpan, GlobalRule, Health, Indicator (+16 more)

### Community 30 - "Scenario"
Cohesion: 0.18
Nodes (11): create_session(), SessionCreate, opening_message(), Assignment, Profile, Scenario, ScenarioCompetency, _scale() (+3 more)

### Community 31 - "registry.py"
Cohesion: 0.22
Nodes (14): build_question(), _known_by_tags(), _location_options(), _lore_tags(), _memory_kind_options(), _memory_tags(), _one_line(), _present_tags() (+6 more)

### Community 32 - "orchestrator.py"
Cohesion: 0.16
Nodes (9): end_reason(), initial_labels(), rank_memory(), reached_objectives(), Character, candidate_sentences(), location_schema(), split_sentences() (+1 more)

### Community 33 - "harness_of"
Cohesion: 0.21
Nodes (12): complete(), harness_of(), health(), LabelPatch, list_models(), PreviewRequest, prompt_preview(), regenerate() (+4 more)

### Community 34 - "Harness"
Cohesion: 0.18
Nodes (3): Settings, Harness, build_harness()

### Community 35 - "i18n.ts"
Cohesion: 0.24
Nodes (12): dictionaries, I18n, I18nContext, initialLang(), Lang, LANG_STORAGE_KEY, LANGUAGES, MessageKey (+4 more)

### Community 36 - "RpText.tsx"
Cohesion: 0.33
Nodes (7): CLASS, RpText(), markThoughts(), parseRp(), RpKind, RpSegment, starCount()

### Community 37 - "_delete_scenario_children"
Cohesion: 0.46
Nodes (6): _delete_scenario_children(), _delete_session_children(), _delete_where(), get_preset(), _preset(), update_preset()

### Community 38 - "confirm.ts"
Cohesion: 0.53
Nodes (4): Confirm, ConfirmContext, ConfirmOptions, Pending

## Knowledge Gaps
- **16 isolated node(s):** `training-backend`, `@types/node`, `@types/react`, `@types/react-dom`, `oxlint` (+11 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 263 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **8 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Turn pipeline (World Info -> Sage pre-turn batch -> assembler -> OpenRouter stream -> post-turn batch -> rolling summary)` connect `Architecture Docs` to `orchestrator.py`?**
  _High betweenness centrality (0.339) - this node is a cross-community bridge._
- **Are the 21 inferred relationships involving `Message` (e.g. with `create_session()` and `delete_message()`) actually correct?**
  _`Message` has 21 INFERRED edges - model-reasoned connections that need verification._
- **What connects `training-backend`, `@types/node`, `@types/react` to the rest of the system?**
  _16 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `test_labels_and_requests.py` be split into smaller, more focused modules?**
  _Cohesion score 0.1036036036036036 - nodes in this community are weakly interconnected._
- **Why does `index.html app shell (Roleplay Harness title, #root)` connect `Architecture Docs` to `App.tsx`?**
  _High betweenness centrality (0.331) - this node is a cross-community bridge._
- **Are the 21 inferred relationships involving `StateVariable` (e.g. with `create_session()` and `_delete_scenario_children()`) actually correct?**
  _`StateVariable` has 21 INFERRED edges - model-reasoned connections that need verification._
- **Should `ScenarioEditor.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.12473572938689217 - nodes in this community are weakly interconnected._