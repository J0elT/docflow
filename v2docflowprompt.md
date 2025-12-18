# Codex instructions – DocFlow v2 (Categories + Tasks)

You are an expert TypeScript/Next.js + Supabase engineer.  
You are working in the `docflow` repository, which is already a working app:

- Next.js (App Router, TypeScript, Tailwind)
- Supabase (auth, Postgres, RLS, Storage `documents` bucket)
- OpenAI LLM for document extraction
- Current flow:
  - User logs in (email magic link)
  - Uploads PDF/TXT/DOC/DOCX via drag & drop or file picker
  - File is stored in Supabase Storage and a `documents` row is created
  - Backend route calls OpenAI, stores JSON into `extractions.content`
  - Dashboard shows title, summary, created_at

**Do not break existing functionality.** Extend it.

The new goal is to turn DocFlow into a personal “Verwaltungssystem” that:

- Works for **letters and arbitrary documents**
- Automatically figures out a reasonable **category / folder** structure per user
- Shows a clear **task list** derived from documents (what to do, by when)
- Uses as few pages and clicks as possible

The core UX Joel wants:

> “I open the app, drop a file, and the system:
>  - understands what it is,
>  - files it into the right (or newly suggested) folder,
>  - and, if needed, creates a minimal task with due date I can check off.”

---

## Existing data model (do not change these fundamentals)

In schema `public` we already have:

- `documents`
  - `id` uuid PK
  - `user_id` uuid FK → `auth.users.id`
  - `title` text
  - `storage_path` text
  - `created_at` timestamptz
  - `status` text (uploaded / processing / done / error)
  - `error_message` text

- `extractions`
  - `id` uuid PK
  - `document_id` uuid FK → `documents.id`
  - `user_id` uuid FK → `auth.users.id`
  - `content` jsonb
  - `created_at` timestamptz

- `profiles` (standard Supabase pattern, not core to this task)

RLS is enabled with policies so each user only sees their own rows.

Currently `extractions.content` contains a summary and some fields. You are allowed to change its JSON structure as long as it stays valid JSON and is backwards compatible (handle missing fields gracefully in UI).

---

## Desired behaviour – high level

### 1. Category / folder system

We want DocFlow to maintain a **category tree per user** and to automatically place each document into this tree.

- Think of categories as folders, with possible nesting:
  - Root: “Joel’s personal documents”
    - `Finanzen`
      - `Steuern`
      - `Bank / Konto`
    - `Versicherung`
    - `Miete / Wohnen`
    - `Gesundheit`
    - `Job / Verträge`
    - `Sonstiges`

- The system should:
  - look at a newly uploaded document,
  - **suggest** a category path (e.g. `Finanzen > Steuern`),
  - **reuse existing categories** when possible,
  - only create new categories when nothing fits reasonably.

We want something that can work for letters *and* generic documents (contracts, invoices, PDFs, etc.).

### 2. Task list

For documents that actually require action (pay, respond, send docs, sign, etc.) we want a persistent **task** representation.

- Tasks should include:
  - link to the underlying document
  - short title / description
  - due date (if any)
  - status (open / done)
  - created_at, completed_at

We want:

- a **minimal Tasks view** where Joel can see all open tasks sorted by due date and check them off
- task info visible in the documents table (e.g. badge / icon).

---

## New data model to add

### A. Categories

Create a `categories` table:

- `id` uuid PK default gen_random_uuid()
- `user_id` uuid not null FK → `auth.users.id` ON DELETE CASCADE
- `name` text not null
- `parent_id` uuid nullable FK → `categories.id` ON DELETE CASCADE
- `created_at` timestamptz not null default now()

RLS: standard “user owns their categories”:

- enable RLS
- policy: `auth.uid() = user_id` for all operations

Add a nullable foreign key on `documents`:

- `category_id` uuid FK → `categories.id` ON DELETE SET NULL

We still keep `extractions.content.key_fields.category` for convenience, but `documents.category_id` is the canonical link.

### B. Tasks

Create a `tasks` table:

- `id` uuid PK default gen_random_uuid()
- `user_id` uuid not null FK → `auth.users.id` ON DELETE CASCADE
- `document_id` uuid nullable FK → `documents.id` ON DELETE SET NULL
- `title` text not null          -- short description: “Pay tax notice 423,70 EUR”
- `description` text             -- optional longer explanation
- `due_date` date                -- nullable
- `status` text not null default 'open'  -- 'open' | 'done'
- `urgency` text not null default 'normal'  -- 'low' | 'normal' | 'high'
- `created_at` timestamptz not null default now()
- `completed_at` timestamptz     -- nullable

RLS: same pattern:

- enable RLS
- policy: `auth.uid() = user_id` for all operations.

---

## LLM extraction changes

We now want `extractions.content` to follow a **stable schema** that works for letters and generic documents.

Update the extraction step so the model returns **only JSON** like:

```json
{
  "summary": "Meaning-only gist for the card (1–2 short sentences, no ellipses).",
  "main_summary": "Optional longer meaning-only explanation (2–4 sentences) or null.",
  "badge_text": null,
  "extra_details": [
    "Total: 23.94 EUR - total amount",
    "Direct debit: 2025-11-11 - money leaves your bank"
  ],
  "document_kind": "letter | invoice | contract | notice | info | other",
  "key_fields": {
    "language": "de",
    "issuer_short": "TK",
    "issuer_legal": "Techniker Krankenkasse",
    "document_date": "2025-02-01",
    "billing_period": null,
    "document_kind_fine": "Beitragsanpassung",
    "sender": "Techniker Krankenkasse",
    "topic": "Beitragsanpassung 2025",
    "letter_date": "2025-02-01",
    "due_date": "2025-02-28",
    "amount_total": 123.45,
    "currency": "EUR",
    "action_required": true,
    "action_description": null,
    "reference_ids": {
      "invoice_number": null,
      "customer_number": "123456789",
      "contract_number": null,
      "case_number": null,
      "tax_number": null,
      "aktenzeichen": null,
      "kundennummer": "123456789",
      "vorgangsnummer": null,
      "iban": "DE...",
      "bic": null,
      "mandate_reference": null
    }
  },
  "deadlines": [
    {
      "id": "d1",
      "date_exact": "2025-02-28",
      "relative_text": null,
      "kind": "payment",
      "description": "Pay the amount to avoid late fees",
      "is_hard_deadline": true,
      "source_snippet": "Bitte zahlen Sie bis 28.02.2025 ...",
      "confidence": 0.9
    }
  ],
  "amounts": [
    {
      "value": 123.45,
      "currency": "EUR",
      "direction": "you_pay",
      "frequency": "one_off",
      "description": "Amount due",
      "source_snippet": "Betrag 123,45 €",
      "confidence": 0.9
    }
  ],
  "actions_required": [
    {
      "id": "a1",
      "label": "Check direct debit amount",
      "description": "€123.45, Techniker Krankenkasse - to avoid late fees",
      "due_date": "2025-02-28",
      "severity": "high",
      "is_blocking": true,
      "source_snippet": "Bitte prüfen Sie ...",
      "confidence": 0.8
    }
  ],
  "required_documents": [
    {
      "id": "rd1",
      "description": "Provide proof of income for 2024",
      "where_how": "Upload via portal (link on page 2) or send by mail to the address above",
      "related_deadline_ids": ["d1"],
      "source_snippet": "Bitte reichen Sie ... ein",
      "confidence": 0.7
    }
  ],
  "category_suggestion": {
    "path": ["Finanzen", "Steuern"],
    "confidence": 0.9
  },
  "task_suggestion": {
    "should_create_task": true,
    "title": "Pay tax notice 423,70 EUR",
    "description": "Tax office letter about 2024 income tax; pay by 28.02.2025.",
    "due_date": "2025-02-28",
    "urgency": "high"
  }
}
```

Notes:
			•	The model must always return valid JSON with those keys, using null where info is missing.
			•	Two-layer extraction: the backend extracts deterministic candidates (dates/amounts/IDs/IBAN/BIC/email/phone) and passes them to the model; for those fields the model must copy an exact candidate value or return null (never invent).
			•	Language: Write all generated text in the chosen output language (summary/main_summary/badge_text/extra_details/action_description/follow_up). Translate from the letter; only keep short official terms (program names, legal labels) in the source language when needed. Do not copy full sentences in the source language.
			•	Date format: Whenever you mention calendar dates in any generated text field, use ISO `YYYY-MM-DD` (and ranges as `YYYY-MM-DD to YYYY-MM-DD`). The UI will display dates in a human format (e.g. `06.11.2025` in German, `6 Nov 2025` in English; ranges like `01.11–30.11.2025`).
			•	Deadlines: If a deadline is only given relatively (e.g. “within one month after Bekanntgabe”), set `date_exact=null` and put the phrase into `relative_text`. Do not drop it just because there is no exact date.
			•	`summary` must explain meaning only and must not repeat to-dos or deadlines when `action_required=true`. Tasks come from `actions_required`.
			•	When `action_required=false`, do not add a separate “No action required” sentence to `summary` - action state is represented by `action_required`/tasks in the UI.
			•	Think as the recipient: surface the 2–6 most important facts the user needs (what is happening, why, key dates/amounts/actions). If more than 6 genuinely critical facts exist, include them; otherwise prefer 2–6. If the document explains a change/decision/termination, include the stated reason/justification as one of those facts (short clause, <=120 chars). No new fields—map to existing fields (amounts, deadlines, extra_details).
			•	If a termination/change/decision is described, explicitly extract the stated reason/justification and include it in `extra_details` as `Reason/Begründung: <short reason> - what it means` (<=120 chars). Do not guess; use the letter’s wording or return null.
			•	Contact fields: `contact_person`/`contact_phone`/`contact_email` must describe how to reach the **sender** (caseworker/department/service line). Never use the recipient/user name from the address block; if unclear, return null.
				•	`extra_details` should be user-relevant key facts (4–6 max) in short “Label: value - what it means” form, written for a stressed/overwhelmed human.
					•	The explanation after `-` must be one simple full sentence (no fragments, no slashes like ` / `, no trailing `...`).
					•	The `value` must be atomic and type-correct: a money amount with currency, an ISO date (`YYYY-MM-DD`), or a period (`YYYY-MM` or `YYYY-MM-DD to YYYY-MM-DD`).
					•	If the label implies a time period (Zeitraum/period/coverage/Sperrzeit/Ruhezeit), the `value` must be a period (`YYYY-MM` or `YYYY-MM-DD to YYYY-MM-DD`), not just a single start date.
					•	Do not put a date as the value for an amount label; keep the amount as the value and put the date in the explanation.
					•	Avoid duplicates (don’t restate the same amount/date with different labels); avoid low-value clutter (shipping cost 0, VAT rates, product/model codes, document date if the title already shows it).
				•	Do **not** include IDs/PII; put those into `reference_ids` (and the UI can choose to hide them).
			•	If the document is informational/confirmation/already-paid or a recurring automatic payment/collection with no user choice/deadline: set `action_required=false`, `actions_required=[]`, and `task_suggestion.should_create_task=false`.
			•	Appeal rights: Do **not** create tasks just because an appeal/objection is possible. Treat it as information (deadlines[] + key facts). Only suggest an appeal task when there is a negative impact (e.g. Sperrzeit/sanction/reduction/denial/repayment) and the user could reasonably want to challenge it.
			•	category_suggestion.path is an array from top-level to leaf (no user-specific categories baked in; just generic names).
			•	For non-letters (e.g. contracts, info documents), it should still try to suggest a reasonable path, e.g. ["Job / Verträge"], ["Versicherung"], ["Sonstiges"].

Update the backend extraction prompt accordingly and keep using response_format: { type: "json_object" }.

⸻

Category resolution logic

Implement backend logic (e.g. helper functions in the existing process route or new utilities) to:
	1.	Fetch all existing categories for the user when processing a document.
	2.	Given category_suggestion.path, try to map it onto the user’s categories:
	•	Compare path segments case-insensitively.
	•	If a level doesn’t exist, decide whether to create it:
	•	For now: create missing nodes only if confidence ≥ 0.7.
	•	Otherwise, leave documents.category_id null and store the suggestion in extractions.content.category_suggestion for manual fix.
	3.	If mapping succeeds:
	•	Ensure the category tree exists (create missing parent/child rows).
	•	Set documents.category_id to the resolved category id.
	•	Store the final category path into extractions.content.key_fields.category_path as an array of names.
	4.	If mapping fails or confidence is low:
	•	Leave documents.category_id null.
	•	Leave the suggestion in content.category_suggestion for UI to show “Suggested: X > Y (low confidence)”.

The initial seed categories can be implicit (i.e. created on demand) or you can create a simple default set when the first document for a user is processed:
	•	Finanzen
	•	Versicherung
	•	Miete / Wohnen
	•	Gesundheit
	•	Job / Verträge
	•	Behörden / Amt
	•	Sonstiges

Only do this once per user.

⸻

Task creation logic

Extend the processing route so that after storing extractions.content and resolving categories, you also generate tasks from extracted actions:
	1.	Primary source: `actions_required[]`
	•	Create 0–6 tasks per document from `actions_required[]` (verb-first, deduped by normalized title).
	•	title = action.label
	•	description = action.description (include 1-line reason/consequence; include amount + counterparty if relevant)
	•	due_date = action.due_date if ISO (YYYY-MM-DD), else null
	•	urgency derived from severity (high/medium/low → high/normal/low)
	2.	Fallbacks:
	•	If `actions_required[]` is empty and `task_suggestion.should_create_task=true`, create a single task from `task_suggestion`.
	•	If both are missing but `key_fields.action_required=true`, fall back to `key_fields.action_description`.
	3.	Strict no-task policy:
	•	If `action_required=false` or the doc is informational/confirmation/already-paid/autopay with no user choice/deadline, do not create tasks.

⸻

UI changes

Minimise pages. We want:
	•	/ (main) → upload + documents overview + inline task hint
	•	/tasks → task list with checkboxes
	•	Category “file structure” visible either as a side panel or a simple separate route (/structure) – whichever keeps UX simplest.

1. Documents table (main page)

Extend the existing “My documents” section to show:
	•	Sender (from content.key_fields.sender or fallback to title)
	•	Category (resolved from documents.category_id, show as Finanzen > Steuern text)
	•	Topic (from content.key_fields.topic)
	•	Due date (from content.key_fields.due_date or earliest task due date)
	•	Task:
	•	If there is an open task for this document: show a small badge or icon “Task”.
	•	Optional: clicking it opens /tasks filtered by this document.

Also:
	•	Keep summary available, but maybe as truncated text or on row expand.
	•	Add a simple filter/toggle: Show only docs with open tasks.

2. Tasks page /tasks

Create a new route src/app/tasks/page.tsx with:
	•	List of tasks for the signed-in user:
	•	Title
	•	Linked document title/sender (clickable to go to that document row or preview)
	•	Due date
	•	Urgency badge
	•	Checkbox / button to mark as done

Behaviour:
	•	Sort tasks:
	•	open tasks first, sorted by due_date (nulls last)
	•	completed tasks in a separate collapsed section or not shown at all by default.
	•	Marking a task as done:
	•	updates status to 'done'
	•	sets completed_at = now()
	•	updates UI optimistically.

Keep this view minimal and quick. One page, one list.

3. Category structure view

Add a simple category tree view.

Implementation options (pick the simpler):
	•	Either:
	•	/structure route that shows:
	•	a tree of categories (parent/children)
	•	count of documents per category
	•	Or:
	•	a collapsible side panel on / with the same information.

Tree can be rendered by fetching all categories for the user, building a nested structure in JS, and displaying:
	•	Finanzen (5)
	•	Steuern (3)
	•	Bank / Konto (2)

Clicking a category filters the documents table to that category.

We don’t need editing UI yet; category editing/renaming can come later. For now, categories come from automatic creation plus maybe a future manual override.

⸻

Implementation details & constraints
	•	Use existing Supabase helpers (supabaseBrowser, supabaseAdmin) and keep SUPABASE_SERVICE_ROLE_KEY on server only.
	•	Database changes:
	•	add tables and columns via SQL / migrations in the Supabase SQL editor scripts (you can write them into a docs/sql/ file for reference).
	•	LLM calls:
	•	reuse the existing process route
	•	make sure the new JSON schema is handled gracefully if some old extractions don’t have these keys (guard against undefined in UI).
	•	TypeScript:
	•	define types for ExtractionContent, KeyFields, CategorySuggestion, TaskSuggestion so the rest of the code is type-safe.
	•	Upload flow:
	•	Stick with the existing “drop file / click to choose” pattern.
	•	Do not implement camera or scan features for now; documents enter the system as files (PDF, image, DOCX, etc.) and you process them server-side.

⸻

Explanation requirement

After each major step, briefly explain in comments or a short markdown note what you did and how it connects to the data model:
	1.	Schema changes: tables, columns, relationships.
	2.	Extraction changes: what the new JSON keys mean.
	3.	Category resolution: how suggested paths become rows + category_id.
	4.	Task creation: how tasks are derived and linked to documents.
	5.	UI changes: how / and /tasks now present documents and tasks.

Keep explanations short but make sure a developer (or Joel) reading the diff understands why we do each step, not just what changed.

⸻

Files page chat agent (cross-document assistant)

Purpose: a cautious assistant on the Files page that can answer cross-document questions, surface relevant docs, aggregate amounts/dates/tasks, bundle exports, and reorganize files into categories without breaking trust.

Conversation policy (clarify-first):
	•	Before any heavy operation (aggregation, bundle, bulk move), ask up to 3 clarifying questions if time window, country/profile, business vs private, or case/episode is unclear. Example clarifiers: “Which year or period?”, “Business or personal?”, “Which country profile applies?”, “Is this about the knee injury case?”
	•	Always state assumptions made; prefer deferring execution over guessing.
	•	Always show which documents were included, and flag borderline/ambiguous ones separately.

Required answer shape:
	•	result (answer/summary)
	•	applied filters + assumptions
	•	included doc_ids (with short display meta) and any excluded/uncertain docs with reason
	•	next-step options when relevant (e.g., “Download bundle?”, “Move these to Finanzen > Steuern?”, “Create a follow-up task?”)

Backend tools (conceptual contracts):
	1) ListDocuments(filters) -> { docs[], applied_filters }
		•	Filters: time (year/month/range), sender (name/type), topic/profile, case/episode, flags (has_open_tasks, risk_level).
		•	Outputs: doc_id, title/sender/topic, period dates, category_path, has_open_tasks; include why each doc matched when possible.
	2) SemanticSearch(query, filters) -> { docs[], matched_spans?, score, reason }
		•	Supports keyword + embedding over title/summary/tags/raw text; accepts same structured filters; return why-matched text/snippets.
	3) Aggregate(docs_or_filters, agg_spec) -> { groups[], assumptions }
		•	Sum/count/group-by (year/category/sender/case); attach doc_ids per group for provenance.
	4) Tasks(filter) -> { tasks[], sort }
		•	Filters: due window (e.g., next 30 days), urgency, status, doc_id; include linked doc meta for display.
	5) BundleExport(doc_ids) -> { bundle_id, download_url, doc_ids, size/count }
		•	Only after user confirms the set; surface any excluded/ambiguous docs.
	6) ReorganizeDocuments(doc_ids, new_category_path, create_if_missing=false, confidence?) -> { moved[], created_categories[], skipped[] }
		•	Moves one or many docs to a category path. Only create missing nodes if user opted in or confirmed. Report from/to paths per doc and any skips with reasons.

Chat UX for reorganizing:
	•	Present a compact confirmation card: current path → proposed path, doc count, and actions: Move / Adjust / Cancel. Include a toggle/CTA for “create missing categories” when needed.
	•	For large moves (e.g., 100+ docs) or low confidence, ask for confirmation before calling the tool; if huge, suggest a modal/bulk review but keep inline flow as default.
	•	After moving, return a diff list (doc title → new path) plus quick links to view.

Execution order guidance:
	•	Start with structured filters (ListDocuments) to narrow scope; refine with SemanticSearch if needed.
	•	Run Aggregate only on a confirmed doc set or well-scoped filters.
	•	Run BundleExport only after the user confirms the list; show size/count before executing.
	•	Run ReorganizeDocuments only after explicit user intent; never auto-create categories without consent.

Guardrails:
	•	No tax/legal certainty; use “likely relevant, please verify.”
	•	Cap heavy operations; explain if the result set was truncated or paginated.
	•	Respect language/profile preferences when summarizing answers.
