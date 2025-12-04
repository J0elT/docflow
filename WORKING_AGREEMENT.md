# Working Agreement — DocFlow

## Purpose
Make the PRD real through a repeatable, auditable loop that avoids scope drift and keeps the app calm, clear, and trustworthy.

## Sources of Truth (SoT)
- PRD: `PRD.Next.md` (features, success signals).
- Design guardrails: existing cards/typography/colors in `globals.css`, `DocumentTable`, `UploadForm`.
- Data model: Supabase schema for users/documents/categories/tasks; storage bucket rules.
- Prompt/specs: `v2docflowprompt.md` (LLM behavior) once stable; decision log (see below).

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
- Create/append Plan.md for non-trivial work (new features/flows): scope, files, tests, risks, rollback, success criteria.
- Update a simple `DECISIONS.md` for key choices (LLM prompt/version, OCR provider, storage rules, language cache strategy) with date/rationale.

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
- Log extraction/LLM errors, durations, and user-facing failure states; track success signals: repeat uploads, return usage, clarity/anxiety feedback.
