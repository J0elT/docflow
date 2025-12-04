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
  "summary": "Short human-readable summary of the document.",
  "document_kind": "letter | invoice | contract | notice | info | other",
  "key_fields": {
    "language": "de",
    "sender": "Techniker Krankenkasse",
    "topic": "Beitragsanpassung 2025",
    "letter_date": "2025-02-01",
    "due_date": "2025-02-28",
    "amount_total": 123.45,
    "currency": "EUR",
    "action_required": true,
    "action_description": "Pay 123.45 EUR by 28.02.2025.",
    "reference_ids": {
      "steuernummer": null,
      "kundennummer": null,
      "vertragsnummer": null
    }
  },
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



Additonal conversation:
Notes:
	•	The model must always return valid JSON with those keys, using null where info is missing.
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

Extend the processing route so that after storing extractions.content and resolving categories, you also handle tasks based on task_suggestion:
	1.	If task_suggestion.should_create_task is true:
	•	Insert a row in tasks:
	•	user_id = document.user_id
	•	document_id = document.id
	•	title = task_suggestion.title
	•	description = task_suggestion.description
	•	due_date = parsed date or null
	•	urgency = "high" | "normal" | "low" from suggestion (default to normal)
	•	If a task already exists for that document (status = 'open'), avoid duplicate tasks (simple check on document_id).
	2.	If should_create_task is false but we already have open tasks for this doc, do nothing (user might have created them manually later).

We keep task creation mostly automatic but simple.

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
