# Working Agreement — DocFlow

## Purpose
Make the PRD real through a repeatable, auditable loop that avoids scope drift and keeps the app calm, clear, and trustworthy.

## Sources of Truth (SoT)
- PRD: `PRD.Next.md` (features, success signals).
- Design guardrails: existing cards/typography/colors in `globals.css`, `DocumentTable`, `UploadForm`.
- Data model: Supabase schema for users/documents/categories/tasks; storage bucket rules.
- Prompt/specs: `v2docflowprompt.md` (LLM behavior) once stable; decision log (see below).
- Playbook: `playbook_v2` schemas/prompts (local copy under `~/Downloads/vibe_coding_playbook_v2_orchestrator/playbook_v2`). We are using the schemas/prompts manually; the orchestrator was removed.
- SoT readiness: if SoT is missing, create it before execution:
  - PRD: author via `~/Downloads/ai-dev-tasks-main/create-prd.md`.
  - Tasks/plan: generate via `~/Downloads/ai-dev-tasks-main/generate-tasks.md` and capture as `PlanStep[]`/`TestSpec[]` in Plan.md.
  - Prompts/decisions stubs: add `prompts.md` and `DECISIONS.md` entries; do not proceed without these anchors.

## Playbook v2 alignment (manual, no orchestrator)
- Keep the SURVEY→PLAN→EXECUTE→TEST→GATE loop manual, but shape artifacts to `playbook_v2/schemas.md`:
  - `Task` metadata per change (mode, title/description, acceptance criteria, target files).
  - `PlanStep[]` in Plan.md (kind/description/targetFiles/done).
  - `CodeChange[]` summaries for notable diffs (filePath/changeType/snippet or whole-file).
  - `TestSpec[]` for what we ran or intend to run.
  - `GateReport` for self-check (overallStatus, risks, tests, notes).
- Context discipline (SURVEY): always pull PRD.Next.md, `globals.css` (and shared components), Supabase schema, `v2docflowprompt.md`, `DECISIONS.md`, and any target files. Keep snippets bounded; do not invent unseen code.
- Logging (optional but preferred): manual NDJSON entries per `playbook_v2/telemetry_and_logs.md`; use `evals_and_judges.md` as a self-judge rubric when helpful.
- Not using: the `orchestrator` CLI; all steps are human-driven with the same guardrails.

## Work Loop (per change)
1) **SURVEY** – Read SoT, current UI/DB, constraints; note deltas.
2) **PLAN** – Short Plan.md entry: scope, files to touch, tests to run, risks/rollback.
3) **EXECUTE** – Code + tests + docs updates; keep WIP small.
4) **TEST** – Run agreed tests; note coverage/TSR; manual pass on the fixed test set of real letters.
5) **GATE** – Apply process/product gates (below); human review before merge/release.
6) **RELEASE** – Stabilize, no new features; tag/notes; ensure telemetry toggles/logging are on.

## Definitions
- **Definition of Ready**: Task points to PRD section; target outcome/user state defined; impacted surfaces listed; dependencies (auth/storage/LLM) resolved or stubbed.
- **Definition of Done**: Code, tests, docs updated; loading/error/empty states covered; analytics/logs for failures; manual test set pass; risks/decisions recorded.

## Planning Expectations
- Create/append Plan.md for non-trivial work (new features/flows): scope, files, tests, risks, rollback, success criteria. Structure plan steps as `PlanStep` (kind/description/targetFiles/done) per playbook v2.
- Capture notable diffs as `CodeChange` summaries (filePath/changeType/snippet or whole-file) when writing up changes.
- Capture tests planned/run as `TestSpec` entries; keep manual test set coverage visible.
- Update a simple `DECISIONS.md` for key choices (LLM prompt/version, OCR provider, storage rules, language cache strategy) with date/rationale; mirror `Task.metadata`/decision context where relevant.

## Gates
- **Process Gates**: DoD met; Plan.md updated; Decision log updated; tests executed and reported; accessibility sanity (keyboard/focus) for new UI controls.
- **Product Gates**: Aligns to PRD promises—clear gist/action/deadline, preferred language honored, “Needs attention” vs “Ready to file” separation, archive/search working (when in scope), privacy copy intact. Mobile-first with safe-area padding; single clear primary CTA per screen; 44px tap targets; no hover-only interactions; explicit loading/error/empty states; clear back/close affordances; privacy messaging near uploads.

## Test Set & Acceptance (run after each milestone)
- Fixed set of real letters: PDF + photo cases; expected: upload → gist/action/deadline; correct language; needs-attention vs ready-to-file placement; detail view correctness; basic search/filter.
- Record failures and fixes; keep the set updated but stable per milestone.

## Cadence
- Follow the SURVEY→PLAN→EXECUTE→TEST→GATE→RELEASE loop for each meaningful change. Do demos/reviews when milestones land; update Plan.md and Decision log at those points.

## Risk Watchlist
- OCR quality (photos), deadline extraction accuracy, multilingual consistency, Supabase auth/storage rules, latency/timeouts on OCR/LLM.

## Observability
- Log extraction/LLM errors, durations, and user-facing failure states; track success signals: repeat uploads, return usage, clarity/anxiety feedback. Prefer NDJSON per `telemetry_and_logs.md` (manual entry if no automation).

## Prompts
- Use `v2docflowprompt.md` plus the mode prompts in `playbook_v2/modes/` for SURVEY→PLAN→EXECUTE→TEST→GATE grounding. Keep `prompts.md` updated with the active prompt set and why it is in scope for a task; consult `prompts.md` during SURVEY.
- Prefer schema-first LLM outputs and validate before use (e.g., extraction JSON shape, playbook_v2 schemas). If validation fails, surface/log and handle gracefully instead of guessing.

## How to run a task (manual loop with playbook v2)
1) **Prep SoT**: Ensure PRD.Next.md, globals.css/shared UI, Supabase schema, v2docflowprompt.md, DECISIONS.md, prompts.md, and target files exist/are current. If missing: create PRD via `~/Downloads/ai-dev-tasks-main/create-prd.md`; generate tasks via `~/Downloads/ai-dev-tasks-main/generate-tasks.md`; stub DECISIONS/prompts.
2) **Capture the task**: Use the template `Mode/Title/Description/Acceptance/[Target files]/[Tests]` (modes: FEATURE, BUGFIX, AI_FEATURE, ARCHITECT, JUDGE). Record in Plan.md as a Task entry and select the corresponding mode prompt from `playbook_v2/modes/`.
3) **SURVEY**: Read SoT + target files + prompts.md; use the selected mode prompt for grounding. Keep snippets bounded; do not invent unseen code.
4) **PLAN**: Add `PlanStep[]` to Plan.md (kind/description/targetFiles/done). Note intended `CodeChange[]` and `TestSpec[]`.
5) **EXECUTE**: Implement changes; keep WIP small. Capture notable diffs as `CodeChange` summaries.
6) **TEST**: Run agreed automated tests and the fixed manual letter set; log results as `TestSpec` executed.
7) **GATE**: Write a `GateReport` (overallStatus, risks, tests run/planned, manual checks, notes). Ensure DoD/product gates are met.
8) **DECISIONS**: Append key choices/rationales to DECISIONS.md.
9) **Log (optional)**: NDJSON entry per `playbook_v2/telemetry_and_logs.md`; optional self-judge via `playbook_v2/evals_and_judges.md`.

## For a tighter (10/10) setup
- Validate LLM outputs against schemas (e.g., extraction JSON, playbook_v2 schemas) and log/fail gracefully on mismatches.
- Add a lightweight CI check to ensure Plan/DECISIONS/Prompts follow required fields and schema validation passes on samples.
- Provide ready-to-fill YAML/JSON snippets for Task/PlanStep/TestSpec/GateReport to reduce format drift.
- Default telemetry: use NDJSON logging and occasional JUDGE/self-check runs to keep honesty/coverage visible.
- Onboarding checklist: short “Before first run / Per task” steps to enforce SoT + validation discipline for newcomers.
