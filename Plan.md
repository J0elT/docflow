# Plan (append per non-trivial change)

Use playbook v2 schemas (manual; no orchestrator). For each change, append a section with:
- **Task** (`mode`, `title`, `description`, `acceptanceCriteria`, `metadata.targetFiles`).
- **PlanStep[]**: checklist with `kind/description/targetFiles/done`.
- **CodeChange[]**: intended or actual diffs (`filePath/changeType/snippet or whole-file`).
- **TestSpec[]**: automated/manual commands and targets.
- **GateReport** summary: overall status, risks, tests run/planned, manual checks.
- **Rollback/contingency** and any other notes.

Append a new section per change; keep history instead of overwriting.

---

## 2025-12-04 — Milestone: Upload → Understand → Surface (vertical slice)

### Scope
- Deliver the core PRD loop: upload document, process (LLM extraction), show gist/action/deadline/category suggestion in home dashboard (“Needs attention” / “Ready to file”) and detail view.

### Deliverables
- Reliable upload for PDF/TXT/DOC/DOCX to bucket `documents` with DB row creation.
- LLM extraction outputs persisted on `documents` (summary/gist/action/deadline/category suggestion).
- Home dashboard shows new docs in correct lane; detail view populated; task add works.

### Impacted areas
- Backend: `src/app/api/process-document/route.ts`, Supabase tables (`documents`, `categories`, `tasks`), storage bucket rules.
- Frontend: `UploadForm`, `DocumentTable`, detail/task surfaces, language handling (preferred language plumbing).
- Prompts/specs: `v2docflowprompt.md` (if updated).

### Tests
- Automated: lint/build; any existing unit/integration tests.
- Manual: upload real-letter PDF (text) → gets gist/action/deadline; upload scanned/photo PDF → vision fallback works; dashboard lanes update; detail view data correct; task add/complete; basic search/filter if available.

### Risks & mitigations
- OCR/vision failures → user-facing error copy; fallback to “no text extracted” state.
- Deadline extraction accuracy → highlight missing/ambiguous deadlines; allow manual edit.
- Multilingual consistency → confirm preferred language applied; mark cache TODO.

### Rollback/contingency
- Disable processing trigger (comment call to `/api/process-document`) and keep uploads only; revert API route if needed; keep data safe.

### Acceptance
- Loading/error/empty states covered.
- Preferred language respected where available; outputs present even if not yet cached.
- New docs appear in correct lane with gist/action/deadline/category suggestion; detail view accurate; privacy copy intact.

## 2025-12-09 — Align processing to universal schema v1.5 (content-agnostic)

### Task
- mode: FEATURE
- title: Align processing to universal schema v1.5 and remove letter-type hardcoding
- description: Make extraction/schema outputs content-agnostic with category path + confidence and task suggestions; resolve categories with thresholded creation, store category_path, and avoid brittle letter-type mappings while keeping UI functional.
- acceptanceCriteria:
  - Extraction prompt outputs schema fields including `category_suggestion.path`+confidence and `task_suggestion` (validated).
  - Process route resolves/creates categories only when confidence ≥0.7, stores `documents.category_id` and `key_fields.category_path` on success; leaves null but preserves suggestion otherwise.
  - Task creation follows `task_suggestion` (no duplicate open tasks for a doc).
  - UI still renders summaries/actions/categories without regression; suggestions degrade gracefully.
- metadata.targetFiles: [src/app/api/process-document/route.ts, src/lib/extractionSchema.ts, src/components/DocumentTable.tsx, Plan.md]

### PlanStep[]
- { kind: "read", description: "Survey SoTs (PRD.Next, docflow_schema_v1_5, prompts, existing process route/UI, decisions)", targetFiles: ["PRD.Next.md", "docflow_schema_v1_5.md", "v2docflowprompt.md", "src/app/api/process-document/route.ts", "src/components/DocumentTable.tsx", "DECISIONS.md"], done: true }
- { kind: "plan", description: "Capture task/PlanSteps/TestSpec/CodeChange skeleton in Plan.md", targetFiles: ["Plan.md"], done: true }
- { kind: "build", description: "Refine extraction schema + prompt to new JSON (category path/confidence, task suggestion, uncertainty), add types", targetFiles: ["src/lib/extractionSchema.ts", "src/app/api/process-document/route.ts"], done: true }
- { kind: "build", description: "Implement category resolution from suggested paths with confidence threshold + default seeds; set category_id and store category_path", targetFiles: ["src/app/api/process-document/route.ts"], done: true }
- { kind: "build", description: "Align task creation with task_suggestion and keep UI mapping to new fields", targetFiles: ["src/app/api/process-document/route.ts", "src/components/DocumentTable.tsx"], done: true }
- { kind: "test", description: "Manual sanity: process text PDF + scanned PDF and check category/task handling + UI render", targetFiles: [], done: false }

### CodeChange[]
- Updated extraction schema/types to include category_path and path-based category suggestions; added normalization helpers.
- Rewrote extraction prompts (text/vision) to schema-first JSON with category_suggestion.path + task_suggestion; removed letter-type slug requirements.
- Added category resolution with default seeds and confidence gate before creating/linking categories; store resolved path on extraction; task creation now follows task_suggestion with action_required fallback.
- UI: DocumentTable reads category suggestion paths/confidence and surfaces suggestion hint for uncategorized docs; keeps backward slug fallback.

### TestSpec[]
- Automated: `npm test -- src/app/api/process-document/route.test.ts` (vitest) — pass.
- Manual (pending): upload text PDF → extraction JSON validated; upload scanned PDF → vision path used; verify category created only when confidence ≥0.7 and stored on doc; task suggestion creates single open task; UI shows summaries/tasks without errors.

### GateReport
- overallStatus: pending
- risks: extraction prompt changes may break validation; category creation thresholds might leave docs uncategorized; UI back-compat risk for suggestion shape.
- tests: automated vitest route helper test; manual upload/vision flow pending.
- notes: ensure explanation comments cover schema/prompt/category/task changes.

## 2025-12-09 — Processing UX polish (spinner + long-run hint)

### Task
- mode: FEATURE
- title: Add processing spinner in upload drop zone and long-running hint
- description: Improve user feedback while a document is processing by adding a visible spinner in the upload area and a hint when processing exceeds a short threshold, without altering backend behavior.
- acceptanceCriteria:
  - Upload drop zone shows a spinner/badge when uploading or when any doc is processing.
  - A subtle banner/hint appears if processing runs longer than ~25–30s and clears when processing finishes.
  - No change to extraction quality or backend logic; UI remains accessible.
- metadata.targetFiles: [src/components/UploadForm.tsx, src/app/page.tsx, src/lib/language.tsx]

### PlanStep[]
- { kind: "plan", description: "Add spinner UI and long-run hint states wired to existing processing flags", targetFiles: ["src/components/UploadForm.tsx", "src/app/page.tsx"], done: true }
- { kind: "build", description: "Add localized strings for processing hint", targetFiles: ["src/lib/language.tsx"], done: true }
- { kind: "test", description: "Manual: trigger upload, observe spinner and long-processing hint after timeout; ensure cleared on completion", targetFiles: [], done: false }

### CodeChange[]
- Planned: add spinner element to UploadForm when loading/processing; add long-processing timer and banner in page.tsx; add locale strings.

### TestSpec[]
- Manual: upload a file, verify spinner appears during processing; wait >25s or simulate processing flag to see hint; confirm hint disappears after completion.

### GateReport
- overallStatus: pending
- risks: minimal UI regression; ensure hint doesn’t block interactions.
- tests: pending (manual)
- notes: no backend changes.

## 2025-12-10 — Grow extraction toward v1.5 schema + reprocess action

### Task
- mode: FEATURE
- title: Expand extraction schema/prompt toward universal model and add reprocess action
- description: Widen the extraction schema/prompt to include the v1.5 core fields (parties, deadlines, amounts, actions, risk/uncertainty, category_path) while staying null-tolerant, and add a UI reprocess button to rerun extraction for existing docs so they can pick up improved categorization without reuploading.
- acceptanceCriteria:
  - extractionSchema accepts the richer fields without breaking older docs.
  - process prompt requests the expanded schema; still uses generic category roots + confidence gate.
  - Document list shows a reprocess button that triggers /api/process-document for that doc; status updates on completion.
  - Existing flows (title/summary/actions) remain functional.
- metadata.targetFiles: [src/lib/extractionSchema.ts, src/app/api/process-document/route.ts, src/components/DocumentTable.tsx, src/lib/language.tsx, Plan.md]

### PlanStep[]
- { kind: "plan", description: "Update schema/prompt to accept richer v1.5 fields (optional, back-compat)", targetFiles: ["src/lib/extractionSchema.ts", "src/app/api/process-document/route.ts"], done: true }
- { kind: "build", description: "Add per-row reprocess action in DocumentTable, localized strings", targetFiles: ["src/components/DocumentTable.tsx", "src/lib/language.tsx"], done: true }
- { kind: "test", description: "Manual: reprocess existing doc; verify status flips to processing then done, and doc still renders; upload new doc → extraction stored", targetFiles: [], done: false }

### CodeChange[]
- Planned: richer schema zod shape; prompt expanded for v1.5 fields with generic category roots; UI reprocess button invoking /api/process-document; locale strings.

### TestSpec[]
- Manual: click reprocess on an existing doc; watch processing badge/spinner clear; optional upload to ensure extraction still succeeds.

### GateReport
- overallStatus: pending
- risks: prompt/schema drift; reprocess might throttle if many clicks.
- tests: pending (manual)
- notes: keep null-tolerant validation to avoid blocking older docs.

## 2025-12-10 — Next: label candidates + richer row summary

### Task
- mode: FEATURE
- title: Add label candidate logging and show deadlines/money/risk in row
- description: Create a label_candidates table and log basic labels from extractions (sender/topic/domain_profile/case) for future taxonomy; surface deadlines/money/risk snippets in the document row while keeping UI minimal.
- acceptanceCriteria:
  - label_candidates table exists with per-user rows; processing logs labels without failing the flow if table missing.
  - Document rows show earliest deadline, money badge/line, and risk/uncertainty (already partially visible) in a compact way.
  - No break to existing upload/title/summary/actions flows.
- metadata.targetFiles: [supabase/sql/2025-12-10-label-candidates.sql, src/app/api/process-document/route.ts, src/components/DocumentTable.tsx, Plan.md]

### PlanStep[]
- { kind: "plan", description: "Add label_candidates schema + logging hooks with safe fallbacks", targetFiles: ["supabase/sql/2025-12-10-label-candidates.sql", "src/app/api/process-document/route.ts"], done: false }
- { kind: "build", description: "Render concise deadline/money/risk info in document rows", targetFiles: ["src/components/DocumentTable.tsx"], done: false }
- { kind: "test", description: "Manual: process/reprocess docs, ensure rows render with new info and no errors if label table absent", targetFiles: [], done: false }
## 2025-12-09 — Category suggestion UX + apply action

### Task
- mode: FEATURE
- title: Show category suggestion with apply action; strengthen prompt for generic paths
- description: Ensure extraction always returns a generic category path, surface the suggestion with confidence in the UI, and let users apply it (creating/reusing categories) without hardcoding letter types.
- acceptanceCriteria:
  - Prompt instructs model to always provide category_suggestion.path using the generic roots (Finanzen, Versicherung, Miete / Wohnen, Gesundheit, Job / Verträge, Behörden / Amt, Sonstiges).
  - Document list shows suggested path + confidence when uncategorized and offers an “apply” action to create/reuse the path and set category_id.
  - No hardcoded letter-type logic; existing dropdown editing still works.
- metadata.targetFiles: [src/app/api/process-document/route.ts, src/components/DocumentTable.tsx, src/lib/language.tsx, Plan.md]

### PlanStep[]
- { kind: "plan", description: "Add locale strings and UI affordance for suggestion + apply", targetFiles: ["src/lib/language.tsx", "src/components/DocumentTable.tsx"], done: false }
- { kind: "build", description: "Update extraction prompt to require generic category path", targetFiles: ["src/app/api/process-document/route.ts"], done: false }
- { kind: "build", description: "Implement apply-suggestion action that creates/reuses category path client-side and updates doc", targetFiles: ["src/components/DocumentTable.tsx"], done: false }
- { kind: "test", description: "Manual: upload doc with suggestion; verify suggestion shown + apply sets category; still editable via dropdown", targetFiles: [], done: false }

### CodeChange[]
- Planned: prompt tweak to always emit generic path; UI text for suggestion/apply; client helper to upsert category path via Supabase with RLS; apply button in DocumentTable.

### TestSpec[]
- Manual: upload a doc expected to map to Job/Verträge; see suggestion; apply; category persists; dropdown still works. Optional: upload without suggestion → no apply shown.

### GateReport
- overallStatus: pending
- risks: minor UI regression; client category upsert errors need handling.
- tests: pending (manual)
- notes: keep prompts generic, no hardcoded letter mappings.
