# Tasks — DocFlow V1 (from `PRD.Next.md`)

Format inspired by `ai-dev-tasks-main/generate-tasks.md`. Keep items atomic: one checkbox should be doable in one PR/commit with clear evidence in `Plan.md`.

## Relevant Files
- `PRD.Next.md` — source of requirements and constraints
- `Plan.md` — append-only run log (Task/PlanSteps/Tests/Gate)
- `DECISIONS.md` — decision journal (append-only)
- `prompts.md` / `v2docflowprompt.md` — prompt registry + product-specific constraints
- `supabase/` — schema/RLS/storage rules
- `src/` — app code
- `manual-tests/` — fixed set of real letters (manual regression set)

## Notes
- Prefer small, reversible diffs.
- Do not mark done without test output and/or explicit manual checks recorded in `Plan.md`.

## Tasks
- [ ] 0.0 Process & test discipline
  - [ ] 0.1 Define baseline commands (install/lint/test/build) and keep them stable per milestone
  - [ ] 0.2 Maintain a fixed manual test set (PDF + photos) and record expected outcomes

- [ ] 1.0 Document ingestion (photos + PDFs)
  - [ ] 1.1 Support PNG/JPEG uploads end-to-end (storage + processing)
  - [ ] 1.2 Reduce image size safely (fast uploads, readable text)
  - [ ] 1.3 Hardening: multi-page PDFs, timeouts, and clear error states
    - [x] 1.3a Block processing above PDF hard page cap with user-visible guidance

- [ ] 2.0 Language support
  - [ ] 2.1 Preferred language setting (profile/settings + persistence)
  - [ ] 2.2 Ensure extraction outputs (gist/action/deadline) always respect preferred language
  - [ ] 2.3 Localize key UI strings (at least the main flows)

- [ ] 3.0 Understanding the letter (gist + action + deadline)
  - [ ] 3.1 Validate extraction JSON (schema-first) and handle malformed outputs gracefully
  - [ ] 3.2 Clarify uncertainty: missing/ambiguous deadlines and “action required” edge cases

- [ ] 4.0 Dashboard: “Needs attention” vs “Ready to file”
  - [ ] 4.1 Define and implement the lane rules (based on action/tasks/deadlines)
  - [ ] 4.2 Minimal interactions: mark handled, move to filed/archive state

- [ ] 5.0 Filing page (archive)
  - [ ] 5.1 Browse by category and year (and optionally month)
  - [ ] 5.2 Simple search (title, gist, category)
  - [ ] 5.3 Optional: export bundle (ZIP) of filed documents

- [ ] 6.0 Document detail view
  - [ ] 6.1 Show gist + long explanation behind “show more”
  - [ ] 6.2 Edit category and filed/archive state (with loading/error states)

- [ ] 7.0 Trust & privacy
  - [ ] 7.1 Privacy copy near uploads and in settings
  - [ ] 7.2 Avoid logging sensitive document content; log only safe telemetry

- [ ] 8.0 Quality harness
  - [ ] 8.1 Add Playwright smoke E2E harness (no-auth) that runs `pnpm build` + `pnpm start` and checks key routes load without console errors
