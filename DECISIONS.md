# Decision Log (append-only)

| Date | Decision | Rationale | Owner |
| --- | --- | --- | --- |
| 2025-12-04 | LLM: `gpt-4.1-mini` for text extracts; `gpt-4.1` vision fallback for image-only PDFs. Prompt lives in `src/app/api/process-document/route.ts`. | Keeps latency/cost lower on text; vision only when OCR via pdfjs fails. | JT |
| 2025-12-04 | OCR: text-first via `pdf-parse`; PDF images rendered with `pdfjs` + `canvas`, then OpenAI vision. No external OCR SaaS. | Avoids extra infra; vision only on scanned/image PDFs. | JT |
| 2025-12-04 | Storage/upload: bucket `documents`, non-public, path `${userId}/${uuid}-filename`, cache-control 3600, no size limit set. Insert row in `documents` table then trigger processing. | Simple per-user isolation; leverages Supabase storage + auth RLS on `documents`. | JT |
| 2025-12-04 | Language cache strategy: not implemented yet; plan to cache summaries per (doc, language) once multi-language UI wiring lands. | Avoid repeated LLM calls and ensure consistent outputs across sessions. | JT |
| 2025-12-04 | Auth strategy: Supabase auth now; keep auth boundary thin to allow later swap to World ID/MiniKit for World App while retaining Supabase sessions for web users. | Enables dual path (web + World App) without deep refactor. | JT |
| 2025-12-04 | Payment strategy: no payments yet; introduce a `startPayment`/checkout abstraction to support Stripe (EU-first) and World App payments later with minimal UI changes. | Keeps UX decoupled from provider and ready for regional rails. | JT |
| 2025-12-06 | Process: adopt playbook v2 schemas/prompts manually (Task/PlanStep/CodeChange/TestSpec/GateReport), keep SURVEY→PLAN→EXECUTE→TEST→GATE human-driven, remove orchestrator CLI. | Gain consistency and auditability without new automation; avoid extra toolchain/cost. | JT |
| 2025-12-09 | Extraction prompt schema-first with `category_suggestion.path` + confidence and `task_suggestion`; create/attach categories only when confidence ≥0.7 (seed defaults), tasks follow suggestion before heuristics. | Remove letter-type slug hardcoding, keep categories content-agnostic, avoid duplicate tasks, and store resolved category_path for UI. | JT |
