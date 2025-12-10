
# DocFlow – Universal Document Schema & Self‑Evolving Taxonomy (v1.5)

This document captures the **stable per‑document schema**, the **self‑evolving taxonomy layer**, and the **LLM pipeline** for DocFlow. It is designed to work for any country and any administrative domain (tax, healthcare, housing, employment, insurance, debt, subscriptions, etc.).

---

## 1. Purpose & Design Principles

DocFlow ingests arbitrary letters and administrative documents and must:

- Power a simple **inbox view**: title, summary, badges, actions.
- Support a **deep‑dive/chat** for each document that explains it clearly and honestly.
- Enable **cross‑document queries and bundles** (e.g. “all documents relevant to my tax return 2024”, “all hospital documents for my knee injury”, “all letters from this landlord”).

Design principles:

- **Stable core schema** – every document is stored with the same universal fields.
- **Flexible, self‑evolving taxonomy** – labels and normalized IDs (sender types, topics, domain profiles, cases) grow from real data.
- **LLM‑first extraction** – a single extraction step fills the schema using OCR text.
- **Structured‑first reasoning** – deep‑dives and agents treat structured fields as primary truth, with `raw_text` as a backing reference.
- **Explicit uncertainty** – fields encode OCR quality, ambiguity, and risk.

---

## 2. Universal Questions the Schema Must Answer

For any document, the stored fields must allow DocFlow to answer:

1. **What is this, who is it from, who is it about?**
2. **Which “world” or system does it belong to?**  
   (tax, healthcare, housing, employment, insurance, debt, subscriptions, etc.)
3. **When does it matter?**
   - When was it issued or received?
   - Which time period does it cover (if any)?
   - Are there deadlines or appointments?
4. **What is being stated or decided?**
5. **What flows of money or services are involved?**
6. **Do I need to do anything?**  
   What precisely, by when, and how serious is it if I don’t?
7. **What options or rights do I have if I disagree or want to change something?**
8. **What happens if I ignore this document?**
9. **How confident is DocFlow about all of the above?**
10. **How should this be stored and grouped for later?**  
    (topics, cases/episodes, years, contracts, injuries, etc.)

The schema sections below are designed so these questions can be answered without encoding any country‑specific law.

---

## 3. Stable Per‑Document Schema

Field types are conceptual. Implementations can use columns for common fields and JSON/JSONB for nested structures.

### 3.1 System & Workflow Metadata

DocFlow’s own bookkeeping, independent of the underlying letter.

- `id: string`  
  Unique document ID.

- `user_id: string`  
  Owner of the document.

- `created_at: datetime`  
  Ingestion timestamp.

- `workflow_status: enum("needs_attention","ready_to_file","filed","archived")`  
  Drives top‑level inbox sections.

- `source_channel: enum("upload_scan","upload_pdf","email_forward","portal_download","other")`  
  Where the file came from.

- `document_format: enum("scan","photo","born_digital_pdf","screenshot","other")`  
  Hints at OCR quality and typical errors.

- `related_document_ids: string[]` (optional)  
  Explicit threading: reminders, follow‑ups, previous decisions.

### 3.2 Original Document Metadata

What exists on paper / in the file, before interpretation.

- `document_language_primary: string`  
  ISO language code (e.g. `"de"`).

- `document_languages_other: string[]`  
  Additional languages if mixed.

- `raw_text: string`  
  Full OCR text (original language).

- `file_metadata: { filename, mime_type, size_bytes, page_count }`

- `document_title_original: string|null`  
  Subject line or heading printed on the letter.

### 3.3 World, Parties & Context

Who is involved, and which “world” this document belongs to.

- `country: string`  
  Jurisdiction code (e.g. `"DE"`, `"US"`). Used for deep‑dive behaviour, not to change schema.

- `ui_language: string`  
  Language for explanations and UI.

#### Parties (structured, multi‑person friendly)

```text
Party {
  role: enum(
    "sender",
    "primary_recipient",
    "co_recipient",
    "subject_person",
    "payer",
    "payee",
    "guarantor",
    "employer",
    "landlord",
    "tenant",
    "insurer",
    "health_provider",
    "other"
  ),
  name: string,                 // as printed
  type: enum("person","organisation","government_body","other"),
  label: string|null,           // "me", "my partner", "my company"
  normalized_contact_id: string|null  // optional link to contacts/profiles
}
```

- `parties: Party[]`  
  At minimum: a `sender` party and one or more recipients.

- `recipient_labels: string[]` (optional convenience)  
  Short labels describing who the document is about (e.g. `["me","my child"]`). Can be derived from `parties`.

#### World / taxonomy hooks (labels + normalized IDs)

- `sender_name: string`  
  Main printed sender (often same as `parties` with `role="sender"`).

- `sender_type_label: string`  
  Free‑text type (e.g. `"health insurer"`, `"city tax office"`).

- `sender_type_normalized: string|null`  
  Optional ID pointing into `taxonomy_sender_types` (e.g. `"health_insurer"`).

- `primary_topic_label: string`  
  Main domain/topic (e.g. `"income tax notice"`, `"hospital bill"`).

- `primary_topic_normalized: string|null`  
  Optional ID into `taxonomy_topics` (e.g. `"tax"`, `"healthcare"`).

- `secondary_topic_labels: string[]`  
  Additional domains if the letter straddles multiple systems.

- `domain_profile_label: string`  
  Specific document type (e.g. `"termination of mobile contract"`, `"rent increase notice"`).

- `domain_profile_normalized: string|null`  
  Optional ID into `taxonomy_domain_profiles`.

### 3.4 Case / Episode Linkage

Grouping documents by life episode, contract, dispute, medical issue, etc.

- `case_labels: string[]`  
  Free‑text episode names (e.g. `"knee injury 2024"`, `"Apartment Main Street 10"`). Multiple allowed per document.

- `case_ids: string[]`  
  IDs into a **per‑user** `Case` table:

```text
Case {
  id: string
  user_id: string
  label: string              // "Apartment Main Street 10"
  description: string|null
  created_at: datetime
  closed_at: datetime|null
}
```

Cases are user‑local; they are not global taxonomy.

### 3.5 Classification & Identity

“What kind of document is this at a glance?”

- `letter_kind: enum(
    "decision",
    "invoice_or_bill",
    "payment_confirmation",
    "reminder_or_dunning",
    "cancellation_or_termination",
    "contract_or_terms",
    "statement_or_summary",
    "request_for_information_or_documents",
    "appointment_or_schedule",
    "information_only",
    "other"
  )`

- `date_issued: date|null`  
  Date printed on the document.

- `date_received: date|null`  
  When the user received/became aware of it. Defaults to `created_at` but user‑editable. Important because some deadlines are relative to receipt.

- `identifiers: Identifier[]`

```text
Identifier {
  type: enum(
    "case_number",
    "customer_number",
    "policy_number",
    "contract_number",
    "invoice_number",
    "file_number",
    "other"
  ),
  value: string
}
```

- `decision_status: enum("approval","rejection","change","information_only","not_applicable")`  
  For decision‑like letters.

### 3.6 Time Relevance: Periods & Deadlines

#### Effective periods

```text
EffectivePeriod {
  start_date: date|null,
  end_date: date|null,
  description: string,       // "billing period", "coverage period"
  confidence: float,         // 0–1
  source_snippet: string|null
}
```

- `effective_periods: EffectivePeriod[]`  
  Billing periods, coverage durations, employment spans, etc.

#### Deadlines

```text
Deadline {
  id: string,
  date_exact: date|null,
  relative_text: string|null, // "within 14 days of receipt"
  kind: enum(
    "payment",
    "appeal_or_objection",
    "provide_documents",
    "attend_appointment",
    "sign_and_return",
    "other"
  ),
  description: string,
  is_hard_deadline: boolean,
  source_snippet: string|null,
  confidence: float
}
```

- `deadlines: Deadline[]`  
  Deadlines may be absolute (`date_exact`) or only relative (`relative_text`); the model must not invent concrete dates.

### 3.7 Money & Value Flows

Primitive amounts plus an optional net summary for faster queries.

#### Primitive amounts

```text
Amount {
  value: number,
  currency: string,
  direction: enum("you_pay","you_receive","neutral_or_unknown"),
  frequency: enum(
    "one_off",
    "monthly",
    "yearly",
    "per_visit",
    "per_day",
    "other",
    "unknown"
  ),
  description: string,        // "October mobile bill", "late fee"
  source_snippet: string|null,
  confidence: float
}
```

- `amounts: Amount[]`

#### Net summary

```text
MonetaryEffectSummary {
  net_direction: enum("you_pay","you_receive","neutral_or_unclear"),
  net_amount: number|null,
  currency: string|null,
  frequency: enum("one_off","recurring","unknown"),
  next_payment_date: date|null
}
```

- `monetary_effect_summary: MonetaryEffectSummary`  
  Derived by the extraction model from `amounts` and `deadlines`. Used for UI badges and cross‑document budgeting.

### 3.8 Obligations, Rights, Consequences

#### Actions required

```text
Action {
  id: string,
  label: string,                 // short: "Pay 23.94 EUR"
  description: string,           // more detailed in plain language
  related_deadline_ids: string[],
  channel: enum(
    "online_portal",
    "bank_transfer",
    "mail",
    "phone",
    "in_person",
    "email",
    "other",
    "unknown"
  ),
  due_date: date|null,           // best concrete guess if available
  severity: enum("high","medium","low"),
  is_blocking: boolean,          // keeps workflow_status=needs_attention
  source_snippet: string|null,
  confidence: float
}
```

- `actions_required: Action[]`  
  The app tracks completion state separately per `doc_id + action_id`.

#### Rights and options

```text
RightOption {
  id: string,
  description: string,
  related_deadline_ids: string[],
  prerequisites: string|null,   // "only if your income is below X"
  source_snippet: string|null,
  confidence: float
}
```

- `rights_options: RightOption[]`  
  Appeals, objections, options to change plans, etc.

#### Consequences if ignored

```text
Consequence {
  description: string,
  severity: enum("high","medium","low"),
  source_snippet: string|null,
  confidence: float
}
```

- `consequences_if_ignored: Consequence[]`

- `danger_flags: string[]`  
  Short codes from a controlled list, e.g.:
  - `"late_fee"`
  - `"service_cancellation"`
  - `"benefit_reduction"`
  - `"debt_collection"`
  - `"legal_action"`
  - `"none"`

### 3.9 Risk & Uncertainty

Can we trust what we extracted, and how serious is the document?

- `risk_level: enum("none","low","medium","high")`  
  Overall impact on user if mishandled.

- `ocr_confidence: float` (0–1)  
  Overall OCR quality.

- `unreadable_scan: boolean`  
  If true, extraction is unreliable.

- `uncertainty_flags: string[]`  
  From a controlled list, e.g.:
  - `"ocr_poor"`
  - `"deadline_ambiguous"`
  - `"amount_inferred"`
  - `"missing_page"`
  - `"mixed_language"`
  - `"handwritten"`
  - `"multi_document_in_one_file"`

- `field_confidence: { amounts?: float, deadlines?: float, actions_required?: float, rights_options?: float, parties?: float }`  
  Optional 0–1 scores per group.

- `comments_for_user: string|null`  
  Short explicit note like:  
  > "Scan is hard to read, please double‑check the original before relying on the deadlines."

### 3.10 UI Projection

Pre‑digested fields for the current UI. The underlying schema is still fully stored.

- `title_ui: string`  
  One‑line title (“Mobile bill from Provider X – Oct 2025”).

- `summary_ui: string`  
  1–3 sentences in `ui_language` summarising what this is and what it means.

- `badges_ui: Badge[]`

```text
Badge {
  label: string,
  kind: enum("date","money","risk","status","other")
}
```

- `cell_category_ui: string`  
  Category dropdown label in Files view (e.g. `"Internet"`, `"Rent"`, `"Health"`). Usually derived from topic/case.

- `task_items_ui: TaskItem[]`

```text
TaskItem {
  action_id: string,            // references actions_required.id
  label: string,
  status: enum("open","done","dismissed")
}

---

## Implementation status (Dec 2025)

- ✅ Categories + translations on create; typed taxonomy tables (sender/topic/domain_profile) and normalized IDs on ingest
- ✅ Cases layer (cases, case_documents, case_events) with UI attach/filter and event logging
- ✅ Extraction extras surfaced: tags, reference_ids, workflow_status, summaries/details, tasks/deadlines
- ✅ Agent endpoints: list/filter (incl. tags/ref IDs), aggregate, restructure (category/case), ZIP download
- ✅ Label candidates table + promote API into typed taxonomy
- ✅ Backfill/cleanup scripts for categories/taxonomy translations and orphan categories
```

The authoritative action state can live in a separate user‑interaction table; `task_items_ui` is a convenience projection.

### 3.11 Tags & Taxonomy Hooks

- `tags: string[]`  
  Free‑text tags suggested by the model (e.g. `"knee_injury"`, `"rehab"`, `"landlord_dispute"`).

All `*_normalized` fields point into separate taxonomy tables, described next.

---

## 4. Taxonomy & Cases: Self‑Evolving Layer

Taxonomy covers:

- `sender_type`
- `topic`
- `domain_profile`
- (optionally) templates of common case types

Cases themselves are **per‑user** episodes and are modelled separately.

### 4.1 Per‑document behaviour (labels vs normalized IDs)

Extraction must always:

- Fill the **label fields**:
  - `sender_type_label`
  - `primary_topic_label`
  - `domain_profile_label`
  - relevant `case_labels`
- **Try** to set the corresponding normalized fields:
  - `sender_type_normalized`
  - `primary_topic_normalized`
  - `domain_profile_normalized`
  - `case_ids` (for existing cases)
- Leave normalized fields **null** if no clear match exists. New taxonomy IDs are not invented during extraction.

### 4.2 Taxonomy entry tables

One global table per type:

```text
TaxonomyEntry {
  id: string,                  // e.g. "health_insurer"
  type: enum("sender_type","topic","domain_profile"),
  canonical_label: string,     // human-friendly, usually English-ish
  synonyms: string[],          // surface forms in any language
  description: string|null,
  country_scope: string[],     // optional list of countries; empty = global
  created_at: datetime,
  updated_at: datetime,
  source: enum("human","llm_auto","llm_proposed")
}
```

Examples:

- `taxonomy_sender_types`
- `taxonomy_topics`
- `taxonomy_domain_profiles`

Cases for each user are in the `Case` table described in §3.4 rather than in global taxonomy.

### 4.3 Label candidate aggregation

To let taxonomy self‑evolve, we maintain **aggregated label candidates** built from many documents.

```text
LabelCandidate {
  id: string,
  type: enum("sender_type","topic","domain_profile","case"),
  user_id: string|null,        // null for global types, set for cases
  label_text: string,          // normalized (e.g. lowercased, trimmed)
  raw_variants: string[],      // distinct originals that collapsed here
  doc_count: int,              // number of documents using this label
  example_sender_names: string[],
  example_titles: string[],
  countries: string[],
  existing_taxonomy_id: string|null,
  last_seen_at: datetime
}
```

A periodic background job:

1. Scans new documents since last run.
2. For each of `sender_type_label`, `primary_topic_label`, `domain_profile_label`, and each `case_labels` element:
   - Normalises text (case, whitespace, punctuation).
   - Upserts into `LabelCandidate`:
     - increments `doc_count`,
     - adds `raw_variants` if new,
     - keeps 3–5 example sender names and titles,
     - tracks countries.

For `case` type, aggregation is per user (`user_id` is set) so you can propose merges of case labels **within** an account.

### 4.4 LLM‑based taxonomy proposals

Another periodic job uses the LLM to propose taxonomy updates **based on aggregated candidates**, not individual documents.

Input to the LLM (per label type):

- Current taxonomy entries:
  - `id`, `canonical_label`, `synonyms`, `country_scope`, optional description.
- A batch of label candidates:
  - `label_text`, `doc_count`, `raw_variants`,
  - `example_sender_names`, `example_titles`, `countries`.

Prompt pattern:

> For each label candidate:
> - Map it to an existing taxonomy ID if it is clearly a synonym/variant, or  
> - Propose a new taxonomy ID and canonical_label, or  
> - Mark it as “too ambiguous / skip for now”.  
> Only map if you are highly confident; otherwise propose new or skip.

Output schema (stored in e.g. `taxonomy_proposals`):

```text
TaxonomyProposal {
  candidate_id: string,
  type: "sender_type" | "topic" | "domain_profile",
  action: "map_existing" | "create_new" | "skip",
  target_id: string|null,       // if map_existing
  new_id: string|null,          // if create_new
  new_canonical_label: string|null,
  new_synonyms: string[],       // include the candidate label_text
  confidence: float
}
```

For `case` labels, a similar process can be used to propose **merging** or renaming cases within a user account rather than creating global taxonomy entries.

### 4.5 Autopromotion vs human review

A separate job consumes `TaxonomyProposal` rows.

**Autopromotion (no manual review)**

If:

- `action == "map_existing"`, and
- `confidence >= THRESHOLD_HIGH` (e.g. 0.9), and
- the corresponding `LabelCandidate.doc_count >= MIN_DOCS_FOR_AUTOPROMOTION` (e.g. 20),

then:

- Add `label_text` and its `raw_variants` to the `synonyms` of the target `TaxonomyEntry`.
- Set `existing_taxonomy_id` on the `LabelCandidate`.
- Mark the proposal as `applied_auto`.

For `"create_new"` with high confidence & high `doc_count` and consistent `countries`, you can automatically insert a new `TaxonomyEntry` with `source="llm_auto"`.

**Human review (batched)**

Proposals below thresholds are shown in a small admin UI:

- Each row shows:
  - label_text, doc_count, example senders/titles, countries,
  - suggested mapping or new ID, model confidence.
- Reviewer can **accept, edit, or reject** the suggestion.

Accepted proposals:

- Update `TaxonomyEntry` (create or extend).
- Set `existing_taxonomy_id` on the relevant `LabelCandidate`s.
- Optionally trigger a **backfill job** to set `*_normalized` on existing documents using that label.

### 4.6 Case‑specific behaviour

Cases are per‑user episodes, not global taxonomy:

- `case_labels` and `case_ids` are written per document in extraction.
- Aggregated `LabelCandidate` rows with `type="case"` and `user_id` set can be used to:
  - Suggest merging similar labels (“Main Street 10” vs “Main Str. 10 apt”).
  - Suggest creation of a formal `Case` entry when a label is used in many documents.

Mistakes here are less serious (they only affect one user), so thresholds for automatic merges can be lower, and the app can expose a simple UI for the user to rename/merge cases themselves.

---

## 5. LLM Pipeline

### 5.1 Stage 1 – Ingest & OCR

1. User uploads a file.
2. OCR system produces:
   - `raw_text`
   - `ocr_confidence`
   - `document_language_primary`, `document_languages_other`
   - `page_count`
3. Heuristics (or computer vision) add uncertainty flags like:
   - `"handwritten"`, `"multi_document_in_one_file"`, `"missing_or_unreadable_pages"`.

These populate §3.2 and some of §3.9.

### 5.2 Stage 2 – Extraction to full schema

A single extraction LLM call per new document receives:

- `raw_text`
- `country`
- `ui_language`
- OCR metadata
- A trimmed snapshot of relevant taxonomy entries:
  - for each type: list of `{ id, canonical_label, synonyms, country_scope }`
- The user’s existing `Case` list for potential `case_ids`.

The LLM is instructed to:

1. **Fill the stable schema** (§3):
   - Parties, topic and world context, classification, effective periods, deadlines, amounts, actions, rights, consequences, risk & uncertainty, UI projection.

2. **Labels vs normalized IDs:**
   - Always fill:
     - `sender_type_label`
     - `primary_topic_label`
     - `domain_profile_label`
     - appropriate `case_labels`
   - For each type, try to map to a provided taxonomy entry:
     - If there is a **clear** match, set the corresponding `*_normalized`.
     - If not, leave normalized fields null. Do **not** invent new IDs.

3. **Cases:**
   - If the document obviously belongs to an existing `Case`, add that `case_id` and re‑use its label.
   - If it appears to start a new episode, add a new `case_labels` entry but do not create a `Case` row; that’s done by app logic.

4. **Source snippets and confidence:**
   - For every element of `amounts`, `deadlines`, `actions_required`, `rights_options`, `consequences_if_ignored`, always include a `source_snippet`.
   - Use `confidence` fields and `uncertainty_flags` instead of guessing missing values.

5. **Risk & comments:**
   - Set `risk_level` based on impact if ignored.
   - Fill `comments_for_user` with one short, honest explanation of uncertainty or risk where relevant.

The output is validated against a JSON schema. If validation fails, the system can rerun or repair the output.

### 5.3 Stage 2b – Label aggregation

A background job regularly:

- Reads new documents.
- Updates `LabelCandidate` rows for:
  - `sender_type_label`
  - `primary_topic_label`
  - `domain_profile_label`
  - `case_labels` (per user)
- Increments counts, maintains examples and countries.

This is completely independent of the user experience.

### 5.4 Stage 3 – Deep Dive per Document

When the user opens a document or starts chat, a deep‑dive LLM is called with:

- Context fields:
  - `country`, `ui_language`, `document_language_primary`,
  - `sender_name`, `sender_type_label`, `sender_type_normalized`,
  - `primary_topic_label` / `primary_topic_normalized`,
  - `domain_profile_label` / `domain_profile_normalized`,
  - `parties`, `case_labels`/`case_ids`.
- Structured facts:
  - `effective_periods`, `deadlines`,
  - `amounts`, `monetary_effect_summary`,
  - `actions_required`, `rights_options`, `consequences_if_ignored`,
  - `danger_flags`, `risk_level`,
  - `uncertainty_flags`, `field_confidence`.
- UI projection:
  - `title_ui`, `summary_ui`, `badges_ui`, `task_items_ui`.
- `raw_text` for quoting and verification.

System instructions:

- Answer in `ui_language`.
- Treat structured fields as **primary truth**, but:
  - If they clearly contradict the text, flag the discrepancy and side with the text when confident.
- Always point out uncertainty where `field_confidence` is low or `uncertainty_flags` are present.
- Explain what the document *says* and what typical consequences are, but avoid giving binding legal advice.

### 5.5 Stage 4 – Taxonomy Evolution

As described in §4:

1. LLM processes `LabelCandidate` batches and proposes `TaxonomyProposal`s.
2. High‑confidence, high‑support proposals are auto‑applied.
3. Others go through batched human review.
4. After new taxonomy entries or mappings are created, a backfill job can update `*_normalized` fields on existing documents that use those labels.

### 5.6 Stage 5 – Cross‑Document Queries & Bundles

Because each document stores:

- **Time:** `date_issued`, `date_received`, `effective_periods`
- **Parties:** `parties`, `sender_name`, `sender_type_*`
- **World & topic:** `primary_topic_*`, `secondary_topic_labels`, `domain_profile_*`, `tags`
- **Cases:** `case_labels`, `case_ids`
- **Money & obligations:** `amounts`, `monetary_effect_summary`, `actions_required`, `risk_level`, `danger_flags`
- **Semantics:** `raw_text`

higher‑level agents can:

- Filter and rank documents by these fields.
- Use normalized taxonomy IDs where available, falling back to labels and full‑text search where not.
- Answer queries like:
  - “All hospital‑related documents for my knee injury in 2024.”
  - “All documents relevant for my tax return last year.”
  - “All letters from this landlord with unpaid amounts.”

No changes to the base schema are required; new workflows are implemented as agents over this data.

---

## 6. Open Questions & Edge Cases

Some scenarios need special handling or future extensions.

### 6.1 Multi‑document files & attachments

- A single PDF might contain several letters (e.g. a monthly statement plus a separate legal notice).
- Initial mitigation:
  - Flag suspected cases via `uncertainty_flags` (e.g. `"multi_document_in_one_file"`), using heuristics (repeating headers, multiple salutations).
  - Let users manually split if needed.
- Future extension:
  - Represent a file as several `document` records, or add a `sub_documents[]` structure.

### 6.2 Handwritten or low‑quality scans

- OCR may be too poor for reliable extraction.
- Mitigation:
  - Use `ocr_confidence`, `unreadable_scan`, and relevant `uncertainty_flags`.
  - In deep dives, explicitly warn the user and avoid precise dates/amounts when not visible.
  - Optionally provide a “manual correction” UI.

### 6.3 Non‑letter artefacts (blank forms, tickets, QR only)

- Some uploads are forms to be filled or tickets without much prose.
- Initially treat them as `letter_kind="other"` with low `risk_level` unless obviously important.
- Over time, create `domain_profile` entries like `"form_to_fill"` or `"parking_ticket"` if common.

### 6.4 Conflicting jurisdictions

- Users may receive letters from multiple countries or supranational bodies.
- Taxonomy entries can use `country_scope` to avoid merging semantically different offices or document types across systems.
- Deep‑dive instructions must respect the specific `country` and avoid mixing legal frameworks.

### 6.5 User edits vs model extraction

- Users may correct titles, amounts, parties, deadlines, or case membership.
- Recommended:
  - Store user‑edited values separately or mark fields as “user_overridden”.
  - Never overwrite user overrides in future re‑extractions or backfills.
  - Allow users to rename/merge `Case`s; update `case_labels` accordingly.

### 6.6 Currency & conversion

- Schema stores raw amounts and currencies.
- Cross‑document budgeting in a single currency requires a separate conversion layer at query time.
- Out of scope for the base schema; can be layered on top.

### 6.7 Taxonomy pitfalls

**Over‑fragmentation**

- Too many near‑duplicate labels (“mobile provider”, “cell phone company”, “cellphone provider”).
- Mitigation:
  - Aggressive normalisation in `LabelCandidate` (case/whitespace).
  - Minimum `doc_count` before a label is even considered for LLM proposals.
  - Optional clustering of low‑frequency labels using embeddings.

**Mis‑grouping or semantic drift**

- LLM might incorrectly map labels to taxonomy IDs.
- Mitigation:
  - Conservative thresholds for auto‑promotion (high confidence & high `doc_count`).
  - Require country compatibility for merges.
  - Log all automatic changes and keep a rollback path.

**Country‑specific semantics hidden behind generic labels**

- A “tax notice” may mean different things in different countries.
- Mitigation:
  - Use `country_scope` on taxonomy entries.
  - In proposer prompts, emphasise: do not merge labels across countries when roles likely differ.

**Case label hygiene**

- Per‑user case labels can be noisy (“Main Street 10”, “Main Str. 10 apt”).
- Mitigation:
  - Aggregate per user and propose merges where labels and senders overlap.
  - Provide a simple in‑app UI for manual merge/rename operations.

---

This specification gives you:

- A **universal, stable document schema** covering identity, context, time, money, actions, risk, and UI.
- A **self‑evolving taxonomy layer** that always stores per‑document labels, aggregates them, and uses the LLM to propose robust normalized IDs with minimal manual oversight.
- A **pipeline** that powers per‑document inbox views, deep dives with explicit uncertainty, and future cross‑document agents without changing the base schema.
