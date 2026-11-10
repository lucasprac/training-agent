# Graph Report - Roleplay  (2026-11-04)

## Corpus Check
- 59 files · ~29,913 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 4 file(s) not represented in the graph (top: (none) 2, .lock 1, .css 1)

## Summary
- 688 nodes · 1886 edges · 29 communities (20 shown, 9 thin omitted)
- Extraction: 90% EXTRACTED · 10% INFERRED · 0% AMBIGUOUS · INFERRED: 186 edges (avg confidence: 0.93)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- test_labels_and_requests.py
- Frontend API Types
- HTTP Routes
- Prompt Assembler
- SageClient
- main.py
- World Info Activation
- LabelSet
- Frontend Dependencies
- Architecture Docs
- test_turn.py
- TS App Config
- SillyTavern Card Import
- TS Node Config
- CRUD Router Factory
- Oxlint Rules
- routes.py
- TS Project References
- Backend Project
- Out of Scope Features
- OpenRouterClient
- test_clients.py
- conftest.py

## God Nodes (most connected - your core abstractions)
1. `useI18n()` - 36 edges
2. `LoreEntry` - 34 edges
3. `Message` - 34 edges
4. `Harness` - 30 edges
5. `MemoryItem` - 30 edges
6. `Character` - 28 edges
7. `LabelSet` - 25 edges
8. `SageContext` - 24 edges
9. `base_input()` - 24 edges
10. `OpenRouterClient` - 21 edges

## Surprising Connections (you probably didn't know these)
- `Favicon (default Vite purple lightning-bolt logo)` --conceptually_related_to--> `React + TypeScript + Vite template`  [INFERRED]
  frontend/public/favicon.svg → frontend/README.md
- `Interface (React + Vite)` --conceptually_related_to--> `index.html app shell (Roleplay Harness title, #root)`  [INFERRED]
  README.md → frontend/index.html
- `React + TypeScript + Vite template` --conceptually_related_to--> `Interface (React + Vite)`  [INFERRED]
  frontend/README.md → README.md
- `harness_of()` --uses--> `Harness`  [INFERRED]
  backend/app/api/routes.py → backend/app/harness/orchestrator.py
- `_delete_scenario_children()` --uses--> `LoreEntry`  [INFERRED]
  backend/app/api/routes.py → backend/app/models.py

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Memory and knowledge flow (sentence memory, known_by, veil)** — readme_sage_post_turn_batch, readme_sentence_based_memory, readme_veil_of_knowledge [EXTRACTED 1.00]
- **Per-turn harness flow** — readme_world_info_activation, readme_sage_pre_turn_batch, backend_app_prompt_assembler, readme_openrouter, readme_sage_post_turn_batch, readme_rolling_summary [EXTRACTED 1.00]
- **Sage label system (registry, labels, stability, locks, regenerate)** — backend_app_sage_registry, backend_app_sage_labels, readme_label_stability, readme_label_lock, readme_regenerate [INFERRED 0.85]

## Communities (29 total, 9 thin omitted)

### Community 0 - "test_labels_and_requests.py"
Cohesion: 0.09
Nodes (30): candidate_sentences(), location_schema(), map_location(), normalize(), split_sentences(), build_question(), _known_by_tags(), _location_options() (+22 more)

### Community 1 - "Frontend API Types"
Cohesion: 0.06
Nodes (90): api, BlockConfig, Character, GlobalRule, HarnessStatePublic, Health, Label, LabelSet (+82 more)

### Community 2 - "HTTP Routes"
Cohesion: 0.11
Nodes (27): add_memory(), edit_message(), get_labels(), get_preset(), get_session(), harness_of(), health(), LabelPatch (+19 more)

### Community 3 - "Prompt Assembler"
Cohesion: 0.07
Nodes (32): assemble(), _attr(), AuthorsNote, _first_sentence(), macro_values(), present_ids(), _render(), push() (+24 more)

### Community 4 - "SageClient"
Cohesion: 0.17
Nodes (5): _detail(), _retry_wait(), SageClient, test_sage_reasoning_only_sent_when_not_off(), test_sage_retries_429_then_succeeds()

### Community 5 - "main.py"
Cohesion: 0.15
Nodes (9): get_settings(), Settings, get_db(), get_engine(), init_db(), make_engine(), build_harness(), create_app() (+1 more)

### Community 6 - "World Info Activation"
Cohesion: 0.12
Nodes (23): LoreEntry, activate(), ActivationResult, apply_budget(), _compile_key(), entry_matches(), hit(), finalize() (+15 more)

### Community 7 - "LabelSet"
Cohesion: 0.10
Nodes (15): Answer, apply_choice(), apply_present(), apply_yesno(), Label, LabelSet, mark_fallback(), parse_answer() (+7 more)

### Community 8 - "Frontend Dependencies"
Cohesion: 0.07
Nodes (28): dependencies, react, react-dom, react-router-dom, devDependencies, oxlint, @types/node, @types/react (+20 more)

### Community 9 - "Architecture Docs"
Cohesion: 0.09
Nodes (22): index.html app shell (Roleplay Harness title, #root), Favicon (default Vite purple lightning-bolt logo), Oxlint configuration (type-aware rules via oxlint-tsgolint), React + TypeScript + Vite template, @vitejs/plugin-react (Oxc) / plugin-react-swc (SWC), Backend tests (pytest, respx mocks for Sage and OpenRouter), Harness (FastAPI), Interface (React + Vite) (+14 more)

### Community 10 - "test_turn.py"
Cohesion: 0.23
Nodes (13): make_harness(), sse_events(), FakeSage, mock_openrouter(), start_session(), test_blocked_message_does_not_call_narrator(), test_degraded_mode_when_sage_fails(), test_degraded_mode_without_sage_key() (+5 more)

### Community 11 - "TS App Config"
Cohesion: 0.10
Nodes (19): compilerOptions, allowArbitraryExtensions, allowImportingTsExtensions, erasableSyntaxOnly, jsx, lib, module, moduleDetection (+11 more)

### Community 12 - "SillyTavern Card Import"
Cohesion: 0.20
Nodes (7): import_card(), card_to_entities(), CardError, _logic(), parse_card_bytes(), _png_text_chunks(), _position()

### Community 13 - "TS Node Config"
Cohesion: 0.12
Nodes (16): compilerOptions, allowImportingTsExtensions, erasableSyntaxOnly, lib, module, moduleDetection, noEmit, noFallthroughCasesInSwitch (+8 more)

### Community 14 - "CRUD Router Factory"
Cohesion: 0.21
Nodes (5): crud_router(), delete_item(), get_item(), list_items(), update_item()

### Community 15 - "Oxlint Rules"
Cohesion: 0.33
Nodes (5): plugins, rules, react/only-export-components, react/rules-of-hooks, $schema

### Community 16 - "routes.py"
Cohesion: 0.07
Nodes (47): create_session(), delete_memory(), delete_message(), _delete_scenario_children(), delete_session(), _delete_session_children(), SessionCreate, authors_note_for() (+39 more)

### Community 25 - "OpenRouterClient"
Cohesion: 0.14
Nodes (4): _error_text(), OpenRouterClient, OpenRouterError, update_summary()

### Community 26 - "test_clients.py"
Cohesion: 0.17
Nodes (6): SageError, openrouter_stream(), test_openrouter_error_status_raises(), test_openrouter_stream_parses_tokens_and_usage(), test_sage_402_raises_with_status(), test_sage_without_key_raises_before_http()

### Community 27 - "conftest.py"
Cohesion: 0.24
Nodes (5): set_engine(), client(), engine(), harness(), settings()

## Knowledge Gaps
- **15 isolated node(s):** `roleplay-backend`, `@types/node`, `@types/react`, `@types/react-dom`, `oxlint` (+10 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 209 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **9 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Turn pipeline (World Info -> Sage pre-turn batch -> assembler -> OpenRouter stream -> post-turn batch -> rolling summary)` connect `Architecture Docs` to `routes.py`?**
  _High betweenness centrality (0.298) - this node is a cross-community bridge._
- **Are the 16 inferred relationships involving `LoreEntry` (e.g. with `_delete_scenario_children()` and `import_card()`) actually correct?**
  _`LoreEntry` has 16 INFERRED edges - model-reasoned connections that need verification._
- **What connects `roleplay-backend`, `@types/node`, `@types/react` to the rest of the system?**
  _15 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `test_labels_and_requests.py` be split into smaller, more focused modules?**
  _Cohesion score 0.08979591836734693 - nodes in this community are weakly interconnected._
- **Why does `index.html app shell (Roleplay Harness title, #root)` connect `Architecture Docs` to `Frontend API Types`?**
  _High betweenness centrality (0.287) - this node is a cross-community bridge._
- **Are the 16 inferred relationships involving `Message` (e.g. with `create_session()` and `delete_message()`) actually correct?**
  _`Message` has 16 INFERRED edges - model-reasoned connections that need verification._
- **Should `Frontend API Types` be split into smaller, more focused modules?**
  _Cohesion score 0.05970695970695971 - nodes in this community are weakly interconnected._