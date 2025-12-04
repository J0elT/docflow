# Plan (append per non-trivial change)

## Scope
- What are we building/changing? (Tie to PRD section)

## Deliverables
- Outcomes and user-visible changes

## Impacted areas
- Files/systems to touch (frontend components, prompts, Supabase schema/storage, etc.)

## Tests
- Automated to run
- Manual steps (include the fixed letter test set cases where relevant)

## Risks & mitigations
- …

## Rollback/contingency
- How to revert or disable if needed

## Acceptance
- Definition of done for this change (states covered: loading/error/empty; language; needs-attention vs ready-to-file; privacy copy)

---

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
