# Decision Log (append-only)

This file is a durable “decision journal”. Record choices that constrain future work:
architecture, data models, API contracts, security posture, style conventions, tool choices, etc.

Decisions should be:
- **append-only** (don’t rewrite history),
- **specific** (what changed, why),
- **linked** (to PRs/commits/Plan entries when possible).

---

## Table (quick index)

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
| 2025-12-15 | UI: Rebrand to “Orderly”; mobile-first attention/file cards with preview/chat/trash actions, to-do carousel, and profile overlay for language+logout; nav uses paper-plane/+ /folder with blur on overlay. | Clarifies brand and consolidates UX around card-based attention/file lanes with clear actions; keeps overlays consistent. | JT |
| 2025-12-15 | Titles: build `documents.title` from explicit issuer/kind/period fields (`issuer_short` + `document_kind_fine` + `billing_period`) with fallback. | Improve scanability and consistency; avoid noisy legal names in the primary title line. | JT |
| 2025-12-15 | Tasks: create multiple tasks from `actions_required[]` with strict no-task policy for informational/confirmation/autopay letters; prioritize display by due/urgency. | Avoid noise while capturing all required actions; show the most critical work first. | JT |
| 2025-12-15 | Dates: format by UI language (not document locale). | Matches user expectation when reading foreign-language documents; avoids ambiguous formatting. | JT |
| 2025-12-15 | Details UI: show only Key facts + Contact; hide Reference/PII. | Reduce overwhelm; keep only user-relevant outcomes and how to reach the sender. | JT |
| 2025-12-15 | Summaries: preserve short `summary` and treat `main_summary` as optional longer explanation; UI uses `summary` for the gist. | Avoid run-on/truncated summaries and trailing ellipses; keep predictable card height and readability. | JT |
| 2025-12-15 | No-action message: show it once (status line), don’t repeat in `summary`. | Reduce duplication; keep Summary meaning-only. | JT |
| 2025-12-16 | LLM: default processing model is `gpt-5.2` (env override; text/vision fallback to `gpt-4o-mini`). | Improve extraction quality while keeping processing resilient. | JT |
| 2025-12-16 | Vision: default OCR/vision model is `gpt-4o` (fallback `gpt-4o-mini`; text stays on `gpt-5.2`). | Avoid text-only model failures on `image_url` payloads while keeping env overrides and a cheaper fallback. | JT |
| 2025-12-16 | Deadlines: show relative deadlines; don’t duplicate document date in Key facts. | Don’t hide rights/deadlines just because the letter uses relative phrasing; keep Key facts high-signal. | JT |
| 2025-12-16 | Appeal rights: info by default; task only on negative impact. | Prevent noisy “Widerspruch einlegen” tasks on positive decisions while keeping appeal windows visible. | JT |
| 2025-12-16 | Key facts: full-sentence explanations; start-only periods show “from/ab <date>”. | Improve readability for stressed users and avoid misleading “period” labels when only a start date is known. | JT |
| 2025-12-18 | Assistant chat history: minimal per-session storage, no summaries | Token-based rolling window only (Galaxy global session; Clarity per-document session) in Supabase with strict RLS; no cross-session recall or summaries; no idle TTL; user can clear history; Clarity chat deletes with its doc; signed URLs not persisted (recreated at render time). | JT |
| 2025-12-18 | Bundle downloads: stable internal link | Store bundle zips under `${userId}/bundles/` and persist only an internal `/bundles/download?name=...` link; signed URLs are generated on demand. | JT |
| 2025-12-18 | Scanning: capture-time quality gate + OCR presets + multi-page stack | OCR quality is mostly decided at capture time; enforce retakes for low quality and make multi-page assembly predictable before uploading as one document. | JT |
| 2025-12-19 | Processing: hash reuse + page caps + model tiering + telemetry | Reduce processing latency/cost by skipping unchanged files, capping OCR pages, and routing large docs to fast text models with timing telemetry. | JT |

---

## Template: decision record (copy/paste)

## YYYY-MM-DD — <Decision title>

**Context**
- What problem forced a decision?
- What constraints apply (from PRD/SoT)?

**Options considered**
- Option A: …
- Option B: …
- (Optional) Option C: …

**Decision**
- We will: …

**Consequences**
- Good: …
- Tradeoffs: …
- Follow-ups: …

## 2025-12-18 — Bundle downloads: stable internal link (no signed URL persisted)

**Context**
- Supabase signed URLs include a token and expire; storing them in assistant chat breaks “go back and download later”.
- We still want a one-click download in the Galaxy chat UI without exposing long URLs or leaking tokens in persisted history.
- Existing Supabase Storage policies for bucket `documents` allow users to access objects under the prefix `${userId}/...`.

**Options considered**
- Store the signed Supabase URL directly in chat history (simple, but expires and stores tokens).
- Store no link and ask the user to re-export every time (safe but poor UX).
- Persist a stable internal link and generate a fresh signed URL at download time.

**Decision**
- Upload bundles to the storage path `${userId}/bundles/<bundleName>.zip` (matches existing storage prefix policies).
- In Galaxy chat, persist only a stable internal link: `/bundles/download?name=<bundleName>.zip`.
- The `/bundles/download` page uses the client’s Supabase session to call `createSignedUrl(...)` and redirects to start the download.
- Continue to sanitize `*.supabase.co` signed URLs in persisted chat; keep markdown punctuation intact when sanitizing.

**Consequences**
- Good: link stays short and readable in chat; no long URLs/tokens stored; users can revisit and download later as long as the bundle exists.
- Tradeoffs: requires the user to be logged in when clicking; repeated exports with the same inferred name may overwrite because upload uses `upsert=true`.

**Evidence**
- Tests run:
  - `NO_COLOR=1 pnpm test`
  - `NO_COLOR=1 pnpm build`

**Links**
- Plan entry: `Plan.md#2025-12-18-—-BUGFIX:-Bundle-download-links-persist-and-work-(no-signed-URL-stored)`

**Risks / unknowns**
- If something is uncertain, name it explicitly (and reflect it in `gate.risks` for the related task).

**Evidence**
- Tests run / validation performed:
  - …

**Links**
- Plan entry: `Plan.md#...`
- PR/commit: …
- Relevant docs: …

## 2025-12-15 — Orderly UI and card-based attention/file layout

**Context**
- We are rebranding to “Orderly” and shifting the home/attention experience to mobile-first cards instead of wide tables. The design adds a profile overlay (language + logout) and standardizes actions (preview, deep-dive chat, trash) on every card, plus swipe/arrow-to-file behavior.

**Options considered**
- Keep DocFlow branding and table layout with scattered actions.
- Move to card-based layout with aligned actions and brand/profile overlay.

**Decision**
- Rebrand to Orderly. Adopt rounded cards for “Needs your attention” and “Swipe right to file” with top-row title+preview+tags+add-to-do, carousel to-dos, summary + details toggle, completed row, and a bottom actions row (details toggle, chat, trash). Provide swipe-right filing (arrow button on desktop). Profile icon opens a blur-overlay with language selector and logout. Bottom nav uses paper-plane / oversized plus / folder; blur nav when plus overlay is open.

**Consequences**
- Good: clearer mental model (attention vs file), consistent actions, better mobile UX.
- Tradeoffs: larger refactor risk to existing table layout; more surface to localize and test; overlay behaviors must be coordinated.

**Risks / unknowns**
- Card refactor may regress existing table behaviors; swipe/desktop parity needs manual validation; profile overlay must not conflict with auth/lang state.

**Evidence**
- Wireframes and interactive mock discussions; no automated tests yet.

**Links**
- Plan entry: `Plan.md#2025-12-15-—-FEATURE-Orderly-UI-refresh-(attention/file-cards-+-actions)`
- PRD addendum: `PRD.Next.md#2025-12-—-Orderly-mobile-first-attention/file-view-(addendum)`

## 2025-12-15 — Document titles built from issuer/kind/period fields

**Context**
- Current titles often concatenate topic + legal sender + full date, producing noisy strings that are hard to scan in lists (e.g., mobile phone bills).
- We want titles to capture the “gist that matters” for browsing: issuer (brand), doc kind, and the relevant period (for recurring bills).

**Options considered**
- Keep existing heuristic: `topic + sender + date`.
- Let the LLM generate a free-form `title` field.
- Add explicit structured fields and build the stored title deterministically (with fallbacks).

**Decision**
- Add extraction fields: `issuer_short`, `issuer_legal`, `document_date`, `billing_period` (YYYY-MM), `document_kind_fine`, plus existing `amount_total`, `due_date`, and `reference_ids`.
- Build `documents.title` as: `<issuer_short> <document_kind_fine> (<Mon YYYY>)` when `billing_period` is present; otherwise fall back to the prior heuristic so older docs remain readable.

**Consequences**
- Good: consistent, scan-friendly titles; avoids stuffing legal entities into the primary title line; predictable formatting.
- Tradeoffs: relies on prompt/model compliance for best results; some docs will still fall back until fields are reliably populated.

**Evidence**
- Tests run:
  - `pnpm test -- src/app/api/process-document/route.test.ts`

**Links**
- Plan entry: `Plan.md#2025-12-15-—-FEATURE:-Title-extraction-fields-+-deterministic-title-format`

## 2025-12-15 — Tasks generated from extracted actions with a strict no-task policy

**Context**
- We want tasks to be reliable across all kinds of letters, not just invoices. Most documents should produce **no task** unless there is a user action with consequence.
- The extractor already produces `actions_required[]` and `task_suggestion`; our backend previously created at most one task per document and could miss multiple required actions.

**Options considered**
- Keep single-task creation (one open task per doc) to avoid clutter.
- Always create a task if the doc looks like a bill (too noisy; not universal).
- Generate tasks from `actions_required[]` with clear “no task” cases and prioritize display.

**Decision**
- Treat `actions_required[]` as the primary source of tasks (create multiple tasks per document, deduped by title), with fallbacks to `task_suggestion` and `key_fields.action_required + action_description`.
- Make the prompt explicit that informational/confirmation/already-paid and recurring automatic payment/collection letters with no user choice/deadline should output **no actions** and set `action_required=false`.
- Sort pending tasks in the UI so the highest priority (due date / urgency) appears first.

**Consequences**
- Good: captures multiple required actions; reduces “noise tasks”; makes “what to do next” clearer.
- Tradeoffs: depends on model compliance; may still emit micro-actions (mitigated by insertion cap).

**Evidence**
- Tests run:
  - `pnpm test -- src/app/api/process-document/route.test.ts`

**Links**
- Plan entry: `Plan.md#2025-12-15-—-FEATURE:-Generate-multiple-tasks-from-extraction-(clear-no-task-policy-+-prioritization)`

## 2025-12-15 — Summary is meaning-only; Details is grouped, copyable facts

**Context**
- The current “summary + extra bullets” presentation can become redundant: summaries repeat action language that already exists as tasks, and Details can look like an unstructured bullet dump.
- We want a universal, predictable layout that reduces anxiety: identity (title) → action (tasks) → meaning (summary) → raw facts (details).

**Options considered**
- Keep the current gist + “show additional details” bullet list (fast, but inconsistent and noisy).
- Let the model generate a long narrative explanation by default (helpful sometimes, overwhelming often).
- Enforce a strict split: summary is meaning-only, and details is structured into consistent groups of copyable values.

**Decision**
- Update the extraction prompt so `summary` is meaning-only (no task/deadline repetition); when `action_required=false`, the summary explicitly states no action needed (localized).
- Treat `extra_details` as copyable facts only and render Details grouped as **Key facts / Reference / Contact**.
- Make `reference_ids` a flexible key/value map (invoice/customer/contract/case numbers, IBAN/BIC, mandate reference) and display labeled entries in Details.
- Change the visible toggle microcopy to a single calm label: `Details` with an expand/collapse chevron.

**Consequences**
- Good: predictable, scan-friendly cards; less duplication; Details becomes useful for copying values into forms/calls.
- Tradeoffs: relies on reprocessing to populate new fields and to get the model to stop repeating task language in summary; older docs may show sparse Details until updated.

**Evidence**
- Tests run:
  - `pnpm test`
  - `pnpm build`

**Links**
- Plan entry: `Plan.md#2025-12-15-—-FEATURE:-Universal-summary-+-structured-details-(meaning-only-+-grouped-facts)`

## 2025-12-15 — Dates are formatted by UI language

**Context**
- Users can set their preferred UI language, and documents can be in a different language/locale (e.g. German letters viewed in English UI).
- Date formatting should match the user’s UI language choice to reduce confusion and ambiguity.

**Options considered**
- Format dates by document locale (e.g. German docs always `dd.mm.yyyy`).
- Format dates by UI language (e.g. English UI uses month names).

**Decision**
- Format dates using the UI language locale (e.g. `en` → `Oct 22, 2025`; `de` → `22.10.2025`).

**Consequences**
- Good: predictable and user-controlled formatting; unambiguous English dates.
- Tradeoffs: mixed-locale UIs may see dates different from the original document’s style (acceptable).

**Evidence**
- Tests run / validation performed:
  - `pnpm test`
  - `pnpm build`

**Links**
- Plan entry: `Plan.md#2025-12-15-—-FEATURE:-Calmer-doc-cards-(status-line-+-masked/copyable-Details)`

## 2025-12-15 — Details UI shows only Key facts + Contact (no Reference/PII)

**Context**
- “Reference” fields (IBAN/BIC/customer/invoice numbers, birthdate, etc.) overwhelm users and rarely help them understand what the letter means or what to do.
- We want Details to be a digestible “so what?” list: outcomes, important amounts/dates/periods, and how to contact the sender.

**Options considered**
- Keep a Reference section with masked values + copy.
- Hide Reference behind an extra expansion step.
- Remove Reference entirely from the UI and keep only Key facts + Contact.

**Decision**
- Remove the Reference section from the UI.
- Filter out birthdates, IBAN/BIC, and other admin identifiers from Details and Summary.
- Use Key facts for user-relevant outcomes (e.g. monthly benefit amount, benefit period, direct debit date) with short “what it means” phrasing.
- Keep Contact with copy on phone/email only.

**Consequences**
- Good: calmer cards, less anxiety, faster understanding; users see only what matters.
- Tradeoffs: some users may want invoice/customer numbers; those remain stored in extraction JSON but aren’t shown in the UI.

**Evidence**
- Tests run / validation performed:
  - `pnpm test`
  - `pnpm build`

**Links**
- Plan entry: `Plan.md#2025-12-15-—-FEATURE:-Details:-Key-facts-+-Contact-only-(no-Reference)`

## 2025-12-15 — Summaries: preserve short `summary` (no ellipsis on cards)

**Context**
- We store both `summary` (short gist) and `main_summary` (optional longer explanation) in `extractions.content`.
- The processing pipeline and UI were collapsing the two fields (overwriting `summary` with `main_summary`), which caused long, clause-heavy card summaries that got cut with trailing ellipses and lost the “one/two sentence gist” promise from the PRD.
- Some `extra_details` items include “— what it means”; when the value was a date, the UI formatted the date but dropped that explanatory tail.

**Options considered**
- Keep using `main_summary` everywhere and accept truncation/ellipses.
- Remove `main_summary` entirely and force a single short summary.
- Preserve both fields, use `summary` for the card gist, and keep `main_summary` available for deeper views; preserve key-fact notes when formatting dates.

**Decision**
- Preserve `summary` and `main_summary` separately during normalization; only backfill missing fields for older extractions.
- Render the card gist from `summary` (fallback to `main_summary` only when `summary` is missing).
- When rendering date-like Key facts from `extra_details`, keep the trailing “— …” explanation alongside the formatted date.

**Consequences**
- Good: card summaries stay short and self-contained; no “…” endings caused by using the longer field; details remain explanatory even for date facts.
- Tradeoffs: older docs may still have identical fields until reprocessed; we still rely on the model to respect the character limits.

**Evidence**
- Tests run:
  - `pnpm test -- src/app/api/process-document/route.test.ts`
  - `pnpm build`

**Links**
- Plan entry: `Plan.md#2025-12-15-—-FEATURE:-Summaries:-use-short-summary-(no-ellipsis)`

## 2025-12-15 — No-action message: show it once (status line)

**Context**
- Cards already show action state directly under the title (e.g. `No action required`).
- Some extracted summaries ended with an extra “No action needed.” sentence, which duplicated the status line and wasted precious space on mobile.

**Options considered**
- Keep repeating “No action required” in the summary for explicitness.
- Remove the no-action sentence from summaries and rely on the status line as the canonical action indicator.

**Decision**
- Keep `summary` meaning-only and do not include “No action required/needed” sentences when `action_required=false`.
- In the UI, drop a standalone no-action sentence from multi-sentence summaries so legacy documents also stop repeating it without requiring reprocessing.

**Consequences**
- Good: less repetition; summaries focus on “what this is about” and the user gets the action state once in a predictable spot.
- Tradeoffs: if a future surface hides the status line, it must provide some other action indicator (badge/tasks) rather than relying on summary text.

**Evidence**
- Tests run:
  - `pnpm test`
  - `pnpm build`

**Links**
- Plan entry: `Plan.md#2025-12-15-—-FEATURE:-No-action-summary-dedup`

## 2025-12-15 — Key facts: keep 4–6, remove duplicates

**Context**
- The “Key facts” list is meant to calm a stressed user by showing only the most important outcomes: key amounts, dates/periods, and what they mean.
- In practice we saw repeated/overlapping facts (e.g. the same amount shown as `Total`, `Monthly payout`, and `Upcoming payment`), duplicated follow-up lines (“separate letter will follow” variants), and duplicated appeal legalese (date-based “Appeal by …” plus generic “you may object within one month”).
- Some extra-detail bullets also drifted into the wrong format (money labels where the value was a date and the amount lived in the explanatory tail), which made Key facts confusing.

**Options considered**
- Rely on the extraction prompt only.
- Do prompt guidance + UI-side normalization/deduping for legacy and imperfect extractions.

**Decision**
- Strengthen extraction guidance for `extra_details`: 4–6 max, atomic/type-correct values, no duplicates, avoid low-value clutter; use `amount_total` only for one-off totals (not recurring rates).
- In the UI, de-duplicate Key facts by money amount, collapse multiple follow-up facts to a single best one, and drop appeal boilerplate when an appeal-by date is already present.
- Keep the Key facts list short (max 6) to preserve scanability on mobile.

**Consequences**
- Good: calmer Details, less repetition, fewer confusing “date as value” money facts; users see the “so what” faster.
- Tradeoffs: some secondary facts might not appear in the first 6 bullets; users can still open the original document if needed.

**Evidence**
- Tests run:
  - `pnpm test`
  - `pnpm build`

**Links**
- Plan entry: `Plan.md#2025-12-15-—-FEATURE:-Key-facts-dedup-+-clarity`

## 2025-12-15 — Contact fields: never show recipient name

**Context**
- Some documents include the recipient name prominently (address block). The extractor occasionally mislabels that recipient name as `contact_person`, which makes the Contact section confusing (“Contact: <my name>”).

**Options considered**
- Rely on prompt guidance only.
- Add a UI-side guardrail that hides `contact_person` when it matches the current user’s profile name.

**Decision**
- Tighten extraction guidance: `contact_person` must be the sender’s caseworker/department/service contact and never the recipient name.
- Add a UI filter: when `contact_person` (or a contact-like bullet) matches the user’s own name (from profile/auth metadata), do not show it.

**Consequences**
- Good: avoids misleading “Contact: me” artifacts without hiding useful sender phone/email.
- Tradeoffs: if a sender contact person genuinely shares the same name as the user (rare), it may be hidden; phone/email still show.

**Evidence**
- Tests run:
  - `pnpm test`
  - `pnpm build`

**Links**
- Plan entry: `Plan.md#2025-12-15-—-FEATURE:-Contact-person:-ignore-recipient-name`

## 2025-12-15 — Language consistency + date/dash formatting

**Context**
- Users can switch the UI language. Output text should consistently follow the UI language to avoid confusion.
- Some extracted content occasionally mixes languages (e.g. German sentences inside an English UI) because the model copies phrasing from the source letter.
- Date formats like “Jan 09, 2026” or locale-specific numeric formats can be harder to scan quickly; we want a single unambiguous format.
- Em dashes (`—`) read as “heavy punctuation” and show up frequently in Key facts; we want calmer separators.

**Options considered**
- Keep locale date formatting and accept occasional ambiguity.
- Standardize date formatting to ISO (`YYYY-MM-DD`) everywhere.
- Standardize date formatting to a month-name variant (`YYYY-MMM-DD`) for scanability.

**Decision**
- Enforce language rules in extraction: all generated text fields must be in the user’s selected UI language; only keep short official terms from the source letter when needed (no full copied sentences).
- Standardize displayed dates to `YYYY-MMM-DD` (e.g. `2025-Nov-06`) for clarity across locales.
- Replace em dash separators with a simple hyphen (`-`) in UI-presented “value - what it means” phrasing (and update prompt examples accordingly).

**Consequences**
- Good: fewer mixed-language surprises, clearer dates, calmer Key facts typography.
- Tradeoffs: month abbreviations are fixed-format (not fully localized); if a user wants fully localized dates, we may revisit.

**Evidence**
- Tests run:
  - `pnpm test`
  - `pnpm build`

**Links**
- Plan entry: `Plan.md#2025-12-15-—-FEATURE:-Language-consistency-+-date-format`

## 2025-12-15 — Date normalization: convert inline dates to YYYY-MMM-DD

**Context**
- Even with prompt guidance, generated text (and legacy extractions) can include locale date formats like `01.11.2025`.
- We want user-visible dates to be consistent and quickly scannable across the app.

**Options considered**
- Enforce date format only via the extraction prompt.
- Normalize dates in the UI (and chat context) so display stays consistent even when the extractor drifts.

**Decision**
- Keep structured date fields as ISO (`YYYY-MM-DD`) for parsing/storage, but normalize user-visible dates to:
  - `YYYY-MMM-DD` for full dates (e.g. `2025-Nov-06`)
  - `YYYY-MMM` for month-only periods (e.g. `2025-Oct`)
- Convert inline ISO and common locale `DD.MM.YYYY` / `DD/MM/YYYY` patterns in displayed text.
- Prefer YYYY-MMM(-DD) for backend-generated titles so the same title displays consistently across UI and chat surfaces.

**Consequences**
- Good: consistent scanning; fewer mixed-format dates in summaries/key facts; legacy docs look better without reprocessing.
- Tradeoffs: `DD/MM/YYYY` is interpreted as day-month-year; truly ambiguous dates may be misread for non-DE locales (acceptable for now, revisit if needed).

**Evidence**
- Tests run:
  - `NO_COLOR=1 pnpm test`
  - `NO_COLOR=1 pnpm build`

**Links**
- Plan entry: `Plan.md#2025-12-15-—-FEATURE:-YYYY-MMM-DD-everywhere-(UI-+-titles-+-chat)`

## 2025-12-16 — Dates: localize month abbreviations (MMM) by UI language

**Context**
- Users read dates faster when the month abbreviation matches their UI language (e.g. German `Okt` instead of English `Oct`).
- We also saw “period/timeframe” facts (e.g. `Leistungszeitraum`) where the extracted value contained only a start date, which is misleading.

**Options considered**
- Keep English month abbreviations universally (simple, but wrong/foreign for many users).
- Localize month abbreviations to the UI language and translate existing `YYYY-MMM` strings on display.

**Decision**
- Keep the `YYYY-MMM-DD` convention, but localize `MMM` to the selected UI language (de: `Okt`, `Dez`, `Mai`, etc.).
- Normalize inline dates inside displayed text, including translating existing `YYYY-MMM(-DD)` strings and localizing common date-range connectors (e.g. `to` → `bis` in German).
- For period-like key facts (Zeitraum/period), expand a single start date to a start+end range when another extracted range exists elsewhere on the card; also tighten prompt guidance so period labels use period values.

**Consequences**
- Good: dates look native in the UI language; existing docs benefit without reprocessing; period facts become clearer.
- Tradeoffs: month localization is a display concern; stored titles may still contain prior abbreviations until reprocessed (but UI will translate most patterns).

**Evidence**
- Tests run:
  - `NO_COLOR=1 pnpm test`
  - `NO_COLOR=1 pnpm build`

**Links**
- Plan entry: `Plan.md#2025-12-16-—-FEATURE:-Localized-month-abbreviations-+-period-ranges`

## 2025-12-16 — LLM: gpt-5.2 for processing

**Context**
- We want the best possible extraction quality for summaries/key facts across many letter types.
- We also need scanned/image PDFs to keep working even if the primary model is unavailable or lacks image support.

**Options considered**
- Keep the existing model mix (`gpt-5-mini` for text, `gpt-4o-mini` for vision/OCR).
- Switch processing to `gpt-5.2` everywhere.
- Make models configurable via env, with a fallback.

**Decision**
- Default processing to `gpt-5.2` for:
  - text extraction (`callTextModel`)
  - vision extraction (`callVisionModel`)
  - OCR-to-text fallback (`ocrImagesToText`)
- Add env overrides:
  - `DOCFLOW_PROCESS_MODEL` (default)
  - `DOCFLOW_PROCESS_TEXT_MODEL`
  - `DOCFLOW_PROCESS_TEXT_FALLBACK_MODEL` (default `gpt-4o-mini`)
  - `DOCFLOW_PROCESS_VISION_MODEL`
  - `DOCFLOW_PROCESS_VISION_FALLBACK_MODEL` (default `gpt-4o-mini`)
- If a configured text/vision model fails, retry once with the fallback model to keep processing working.

**Consequences**
- Good: higher quality extraction by default; can tune cost/latency per environment without code changes.
- Tradeoffs: potential cost increase; quality differences between primary vs fallback on scanned docs.

**Evidence**
- Tests run:
  - `NO_COLOR=1 pnpm test`
  - `NO_COLOR=1 pnpm build`

**Links**
- Plan entry: `Plan.md#2025-12-16-—-FEATURE:-Switch-processing-model-to-gpt-5.2`

## 2025-12-16 — Deadlines: show relative deadlines; dedupe document date

**Context**
- Some letters state deadlines only in relative terms (e.g. “innerhalb eines Monats nach Bekanntgabe”) and do not provide a concrete date.
- Previously, the UI only surfaced deadlines when `date_exact` was present, so important rights like Widerspruch were missing from Key facts.
- We also saw duplication where `Dokumentdatum` was shown in Key facts even when the title already included the same full date.

**Options considered**
- Keep the strict `date_exact` requirement (simple, but hides important deadlines).
- Attempt to compute an exact date (risky: Bekanntgabe/Zugang date is often unknown).
- Show relative deadlines as written, without inventing an exact date.

**Decision**
- Treat relative deadlines as first-class:
  - If `deadlines[].relative_text` exists and `date_exact` is missing, show it in Key facts (especially for appeal/Widerspruch deadlines).
  - Do not invent a calculated calendar date unless the document explicitly provides the reference date.
- Suppress `Dokumentdatum` in Key facts when the title already contains that same full date.

**Consequences**
- Good: users see appeal/objection rights even when the letter uses relative phrasing; Key facts remain high-signal and avoid duplication.
- Tradeoffs: relative deadlines can still feel “fuzzy” because the reference date may be unclear; we prefer honesty over guessing.

**Evidence**
- Tests run:
  - `NO_COLOR=1 pnpm test`
  - `NO_COLOR=1 pnpm build`

**Links**
- Plan entry: `Plan.md#2025-12-16-—-FEATURE:-Relative-deadlines-+-dedup-document-date`

## 2025-12-16 — Appeal rights: info by default; Key facts clarity rules

**Context**
- Many decisions include an appeal/objection clause as standard boilerplate; creating a “Widerspruch einlegen” task for every such letter is noisy and often wrong.
- Some letters *do* contain a meaningful negative outcome (e.g. Sperrzeit/sanction/reduction/denial/repayment) where surfacing the appeal option as a task can be helpful.
- Key facts must be scannable for stressed users; fragments, slash-joined notes, and misleading “period” labels reduce clarity.

**Options considered**
- Always create an appeal task when an appeal window exists (high noise).
- Never create appeal tasks; show as info only (misses valuable prompts in adverse decisions).
- Create appeal tasks only when negative impact signals exist; otherwise show as info.

**Decision**
- Treat appeal/objection rights as information by default:
  - Keep appeal windows in `deadlines[]` (including relative deadlines via `relative_text`) and show them in Key facts.
  - Do not create tasks or set `action_required=true` solely because an appeal is possible.
- Allow appeal-like tasks/actions only when negative impact signals are present (e.g. Sperrzeit/sanction/reduction/denial/repayment) or `risk_level` is medium/high.
- Key facts readability rules:
  - Require 1 simple full sentence after `-` (no fragments, no ` / ` joins, no trailing `...`).
  - For period-like labels, if only a start date is known and no end date can be inferred, display as “from/ab <date>” (localized) instead of implying a full range.

**Consequences**
- Good: fewer false “open tasks”; appeal rights still visible; Key facts are clearer and less repetitive.
- Tradeoffs: negative-impact detection is heuristic and may need tuning per language/jurisdiction; full-sentence Key facts still depend on model compliance.

**Evidence**
- Tests run:
  - `NO_COLOR=1 pnpm test`
  - `NO_COLOR=1 pnpm build`

**Links**
- Plan entry: `Plan.md#2025-12-16-—-FEATURE:-Appeal-task-guardrails-+-Key-facts-clarity`

## 2025-12-16 — Two-layer extraction: deterministic candidates + constrained fields

**Context**
- “Key facts right” is the product; hallucinated IDs/dates/amounts destroy trust.
- Some fields are regex-friendly (IDs, IBAN/BIC, explicit dates/amounts) and should be extracted deterministically whenever possible.
- We want to keep the existing extraction JSON shape/UI behavior; changes must be additive/backwards compatible.

**Options considered**
- LLM-only extraction for all fields (high recall, but higher hallucination risk for IDs/bank/contact fields).
- Add deterministic candidate extraction and constrain the LLM to copy exact candidates (or return null), with post-processing enforcement.
- Store full raw OCR text in the DB and cite positions (higher provenance, but larger storage/PII risk; not required for this step).

**Decision**
- Implement a two-layer strategy:
  - Layer A: deterministic candidate extraction from OCR text (dates, money, IBAN/BIC, common identifiers, email/phone) with `source_snippet`.
  - Layer B: LLM extraction receives the candidate lists and must copy exact candidate values (or return null) for deterministic fields; never invent.
  - Post-processing enforces constraints by dropping non-candidate values for deterministic fields and safely auto-filling IDs into `key_fields.reference_ids`.
- Extend the extraction schema additively:
  - Add `required_documents[]` for “what to provide” + “where/how to submit” with `source_snippet` + `confidence`.
  - Extend `key_fields.reference_ids` usage to include `aktenzeichen`, `kundennummer`, `vorgangsnummer` (in addition to existing keys).
- Store the candidate payload in `extractions.content.deterministic_candidates` for debugging and future iteration.

**Consequences**
- Good: fewer hallucinated IDs/bank/contact facts; clearer separation of deterministic evidence vs interpretation; easier to tighten prompts without losing backward compatibility.
- Tradeoffs:
  - Recall can drop when the deterministic layer misses formats (e.g. month-name dates); in those cases constrained fields become null rather than guessed.
  - Scanned documents now prefer OCR-to-text + text-model extraction before vision extraction; may increase latency/cost but enables deterministic constraints.

**Evidence**
- Tests run:
  - `NO_COLOR=1 pnpm test`
  - `NO_COLOR=1 pnpm build`
- Note: `pnpm lint` fails in the repo baseline (unrelated to this change set).

**Links**
- Plan entry: `Plan.md#2025-12-16-—-AI_FEATURE:-Deterministic-candidates-+-constrained-key-facts`

## 2025-12-16 — UI scanability: human dates + top facts + key-value Eckdaten

**Context**
- `YYYY-MMM-DD` reads like a database dump in the UI, especially for German users.
- The main product value is fast, boringly-correct scanability of key facts; long bullets slow users down.
- Period facts (e.g. `Sperrzeit`) must show start **and** end when the document provides both.

**Options considered**
- Keep `YYYY-MMM-DD` everywhere for unambiguous scanning.
- Switch to fully localized UI date formats and keep ISO only for storage + model output.

**Decision**
- Display dates in a human UI format:
  - German: `DD.MM.YYYY` (ranges like `01.11–30.11.2025`)
  - English/other: `D MMM YYYY` (ranges like `1 Nov–30 Nov 2025`)
- Keep structured date fields stored as ISO `YYYY-MM-DD` in the DB and require ISO in generated text fields; format at display time.
- Improve scanability of key facts on the document card:
  - Show 3–4 “Top facts” chips under the gist.
  - Render `Eckdaten/Key facts` as key-value rows with an optional short hint line (not long bullets).
- Treat `Sperrzeit`/`Ruhezeit` as period-like labels for range expansion, and tighten extraction guidance so period labels use a full date range value when available.

**Consequences**
- Good: UI feels “finished” and faster to scan; date ranges read naturally; fewer misleading “period start only” facts.
- Tradeoffs: numeric German dates are locale-specific (intended); some legacy titles remain stored in the old format but are normalized on display.

**Evidence**
- Tests run:
  - `NO_COLOR=1 pnpm test`
  - `NO_COLOR=1 pnpm build`

**Links**
- Plan entry: `Plan.md#2025-12-16-—-FEATURE:-UI-scanability:-human-dates-+-top-facts`

## 2025-12-16 — Vision/OCR defaults to gpt-4o (text stays on gpt-5.2)

**Context**
- `image_url` payloads for OCR/vision were routed to the default processing model (`gpt-5.2`), which is text-only, causing 400 “Invalid content type. image_url is only supported by certain models.”
- We need a vision-capable default while keeping text extraction on `gpt-5.2` and allowing env overrides.

**Options considered**
- Keep vision tied to the processing model with only a fallback to `gpt-4o-mini` (current: fails when the primary is text-only).
- Default vision to `gpt-4o` with `gpt-4o-mini` fallback; keep env overrides.
- Switch all processing (text + vision) to `gpt-4o` to simplify (higher cost; loses explicit text/vision split).

**Decision**
- Default `DOCFLOW_PROCESS_VISION_MODEL` to `gpt-4o` and keep the vision fallback at `gpt-4o-mini`; leave text processing default at `gpt-5.2`. Env overrides remain supported.

**Consequences**
- Good: avoids text-only model errors on OCR/vision requests; keeps a cheaper fallback and clear separation between text and vision models.
- Tradeoffs: slightly higher default cost for vision calls; requires `gpt-4o` access in the target environment.

**Risks / unknowns**
- If `gpt-4o` is unavailable or rate-limited, processing will rely on `gpt-4o-mini` fallback; monitor cost/latency after rollout.

**Evidence**
- Tests run:
  - `NO_COLOR=1 pnpm test -- src/app/api/process-document/route.test.ts`

**Links**
- Plan entry: `Plan.md#2025-12-16-—-FEATURE:-Vision-OCR-defaults-to-gpt-4o`

## 2025-12-18 — Scanning: capture-time quality gate + OCR presets + multi-page stack

**Context**
- OCR quality is mostly determined at capture time; accepting blurry/dark/glare scans turns the rest of the product into damage control.
- Users need an effortless “stack” mental model for multi-page documents: scan pages, review/reorder/delete/crop, then save as one document.
- We want this to work inside the existing upload flow (Next.js + Supabase) without introducing external OCR SaaS or heavy new dependencies.

**Options considered**
- Keep a simple camera capture UI and accept all scans (fast to build, but produces unreadable OCR and noisy downstream UX).
- Add hints but let users proceed with low quality (still too much user burden; users won’t notice bad scans).
- Enforce a client-side quality gate (blur/exposure/glare/crop confidence) and force retake below threshold; provide an explicit review/assemble step before uploading.

**Decision**
- Implement a full-screen scan → review → save flow with:
  - Edge outline + auto-crop preview (jscanify) and optional auto-capture when stable + detected + not blurry + acceptable lighting.
  - Real-time guidance chips only when needed (Hold still / Zu dunkel / Reflexion / Unscharf).
  - A hard quality gate on each capture (blur/contrast/exposure/glare + crop confidence). If it fails: show the captured image and force “Neu aufnehmen” (no “keep anyway” path).
  - OCR-friendly presets applied client-side: default “OCR” (contrast stretch + Otsu B/W), plus “Graustufen” and “Farbe”; allow global preset + per-page override.
  - Review screen for reorder (drag), delete, crop/rotate, and optional split, then save as one PDF with title + folder/category selection.

**Consequences**
- Good: higher OCR consistency; fewer unreadable uploads; multi-page assembly becomes predictable; “Fertig” unambiguously maps to “this becomes one document”.
- Tradeoffs: heuristics/thresholds need real-device tuning; torch support depends on browser capabilities; client-side processing costs CPU/battery; drag reorder UX may need iteration on iOS.

**Evidence**
- Tests run:
  - `NO_COLOR=1 pnpm test`
  - `NO_COLOR=1 pnpm build`

**Links**
- Plan entry: `Plan.md#2025-12-18-—-FEATURE:-World-class-scanning-(quality-gated-multi-page-stack)`

## 2025-12-19 — Processing: hash reuse + page caps + model tiering + telemetry

**Context**
- Processing large or scanned PDFs was slow because OCR/vision rendered every page and model calls ran on full inputs.
- Reprocessing unchanged files wasted time; no timing telemetry existed to measure bottlenecks.

**Options considered**
- Keep current processing (simple, but slow for large/scanned PDFs).
- Add page caps + text-page skipping + model tiering + hash reuse with minimal DB changes.
- Introduce a background queue and progressive batching (rejected for now).

**Decision**
- Add file-hash reuse with a force override for reprocess.
- Cap PDF OCR/vision rendering and skip pages with meaningful text before OCR.
- Route large documents to a fast text model with fallback to the default model.
- Log timing/page telemetry for visibility into bottlenecks.

**Consequences**
- Good: faster processing for large/scanned PDFs; fewer redundant reprocesses; actionable timing data.
- Tradeoffs: hard caps can omit late pages; text-page skipping uses heuristics; large-doc model tiering may reduce quality.

**Evidence**
- Tests run:
  - `NO_COLOR=1 pnpm test -- src/app/api/process-document/route.test.ts`

**Links**
- Plan entry: `Plan.md#2025-12-19-—-FEATURE:-Processing-speed-optimizations-(caps,-hash-reuse,-telemetry)`

## 2025-12-19 — Processing: block above hard page cap with a user-visible summary

**Context**
- Very large PDFs produced odd key facts because we truncated text and capped OCR/vision pages, so the model saw partial context.
- Returning a hard error hides the document in the UI, which is worse than showing a clear “split this document” message.

**Options considered**
- Keep partial processing with caps and accept degraded key facts.
- Hard fail with status error + 413 response (document disappears from the UI).
- Skip extraction when page count exceeds the hard cap, but still create a minimal extraction that tells the user to split.

**Decision**
- When `DOCFLOW_PDF_HARD_CAP_BLOCK` is enabled and page count exceeds `DOCFLOW_PDF_PAGE_HARD_CAP`, skip OCR/vision and create a minimal extraction with a clear “document too long” summary + badge.
- Keep document status `done` (so it remains visible), avoid renaming/categorization based on the placeholder, and log telemetry as `skipped` with `skipReason=page_cap`.

**Consequences**
- Good: users get immediate, visible guidance instead of misleading key facts; processing time/cost is avoided for oversize documents.
- Tradeoffs: no extraction for oversize PDFs until they are split; requires clear UI messaging to avoid confusion.

**Evidence**
- Tests run:
  - `NO_COLOR=1 pnpm test -- src/app/api/process-document/route.test.ts`

**Links**
- Plan entry: `Plan.md#2025-12-19-—-BUGFIX:-Block-oversize-PDF-processing`
