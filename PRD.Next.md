DocumentFlow – Product Requirements Document (PRD)

Version: V1 (MVP)

⸻

1. Product Purpose

DocumentFlow helps people quickly understand official letters (especially German bureaucracy letters) and know exactly what they need to do, without drowning in complex language or scattered paperwork.

Core promise:

Upload any letter → see the gist in your language → know what to do by when → file it away.

The app reduces:
	•	Confusion about what a letter actually means
	•	Missed deadlines and unnecessary penalties
	•	Wasted time re-reading Amtsdeutsch or asking others for help
	•	Chaos of photos, PDFs, and paper lying around with no system

⸻

2. Target Users

2.1 Primary
	1.	Immigrants / language learners in Germany
	•	Participants in language courses (e.g. Volkshochschule)
	•	People dealing with Ausländerbehörde, Jobcenter, Arbeitsamt, Krankenkasse, Finanzamt etc.
	•	Often receive critical letters they only partly understand and are afraid of misreading.
	2.	Young professionals and freelancers
	•	First job, first flat, first dealings with Finanzamt and insurances
	•	Overwhelmed by the number of letters and deadlines
	•	Want clarity and a simple overview rather than complex tools.

2.2 Secondary
	3.	Overwhelmed adults handling family paperwork
	•	People who manage letters for themselves and possibly relatives
	•	Need a calm place to store and understand everything.

⸻

3. Core User Journey
	1.	Letter arrives
	•	User receives a physical letter or a PDF from email or portal.
	2.	Upload to DocumentFlow
	•	User opens the app, uploads a photo or PDF of the letter.
	3.	Choose language
	•	User sets or confirms their preferred language (German, English, Romanian, Turkish, Arabic).
	•	The app uses this language for both the interface and the explanation.
	4.	Get the gist and required action
	•	The app shows a short, simple explanation of what the letter is about.
	•	The app clearly states whether the user has to do something, what that is, and by when (if a deadline exists).
	5.	Decide what to do with the document
	•	If actions are still open, the document stays in a “needs attention” area.
	•	Once everything is handled, the document is moved to a “ready to file” area and can then be filed into the archive.
	6.	Find documents later
	•	User can browse filed documents by category and time period, and use a simple search.
	•	Optionally, user can export their documents (e.g. as a ZIP) for backup or switching.

⸻

4. Core Product Concept

The app is essentially a calm cockpit for bureaucracy:
	•	One place for all important letters
	•	One simple explanation per letter, in the user’s preferred language
	•	One clear indication of required actions and deadlines
	•	One archive where everything is stored in an organized way

⸻

5. High-Level Features (V1)

5.1 Document Ingestion
	•	Allow users to upload common formats:
	•	Photos of letters (PNG, JPEG)
	•	PDF files (e.g. attached to emails)
	•	Handle typical letter use cases (single-page letters, basic multi-page documents).
	•	Internally, reduce file size enough to keep uploads fast and storage manageable, without harming readability.

Outcome: Users can always get a letter into the system without thinking about format or size.

⸻

5.2 Language Support
	•	User selects a preferred language for the whole experience:
	•	German, English, Romanian, Turkish, Arabic (initial set).
	•	The app:
	•	Shows all interface text in that language
	•	Produces summaries, explanations, and action descriptions in that language
	•	The original letter can be in any language; the output is always aligned with the chosen language.

Outcome: Users understand what’s going on in their own language, not in bureaucratic German.

⸻

5.3 Understanding the Letter (Gist + Action)

For each uploaded document, the app produces:
	•	Short gist:
A very brief description that answers “What is this letter about?” in one or two clear sentences.
	•	Action:
A short statement that answers “Do I need to do anything? If yes, what and by when?”
	•	Examples:
	•	“You must pay amount X by date Y.”
	•	“You need to send missing documents.”
	•	“No action required.”
	•	Deadline (if present):
The most important date that indicates a consequence (payment date, response date, appointment date, etc.).
	•	Category suggestion:
A simple category such as:
	•	Employment agency / Jobcenter
	•	Tax office / Finanzamt
	•	Health insurance
	•	Rent / Housing
	•	Phone / Internet
	•	Other

Users can adjust this category.

⸻

## 2025-12 — Orderly mobile-first attention/file view (addendum)

- Branding & header
	• Product name is “Orderly”; centered brand mark.
	• Profile icon replaces email/logout; tapping opens a small overlay (blur background) with language switcher + “Log out”; dismiss on outside tap.
- Bottom navigation
	• Left: paper-plane (attention/inbox). Center: oversized plus (upload/add). Right: folder (files/archive). Blur other nav items when the plus overlay is open.
- Attention page sections
	• Two stacks: “Needs your attention” (docs with active to-dos) and “Swipe right to file” (ready to file).
	• Each document is a rounded card with:
		– Top row: title on the left; preview icon next to title; key tags as pill chips on the same row; inline “+” to add a to-do on the right.
		– To-Do area: carousel-style to-do chips/cards; overflow hinted by a partial card on the right. Desktop also shows a right-arrow CTA; mobile uses swipe.
		– Summary line plus “show additional details” toggle; expanded view lists extra bullets and deadlines.
		– Completed tasks: collapsed by default; expanded view shows a “completed (n)” carousel row.
		– Filing affordance: when no active to-dos, show “No current To-Do” and surface “move to file” (button on desktop; swipe on mobile).
		– Bottom actions row (always visible): left = details toggle; center = deep-dive chat bubble; right = trash/delete. Preview lives in the top row; to-do “+” sits near tags.
- Interactions
	• Profile and plus overlays blur the rest of the UI.
	• Attention page focuses on docs with active to-dos; ready-to-file emphasizes swipe/arrow to archive.
	• Deep-dive chat is document-scoped; preview opens the doc; trash deletes (with confirm/undo per implementation).
- Non-goals
	• No backend data model changes; this is a layout/interaction refresh.

Outcome: Every document has a clear, minimal summary that removes ambiguity and anxiety.

⸻

5.4 Dashboard: “Needs Attention” vs “Ready to File”

The main page focuses on two clear sections:
	1.	Needs your attention
	•	Documents where:
	•	there is still something to do
	•	or outstanding tasks exist
	•	This section answers: “What do I still need to handle?”
	2.	Ready to file
	•	Documents where:
	•	no actions are left
	•	everything is already handled
	•	These can be moved into the archive.

This structure is more important than any clever feature. It gives users a simple mental model:
top = still active, bottom = can be put away.

Outcome: Users always know what’s pending and what is already done.

⸻

5.5 Filing Page (Archive)

A dedicated view for all filed documents.

Key capabilities:
	•	Browse documents by:
	•	Category
	•	Year (and optionally month)
	•	Simple search across basic document information:
	•	Title
	•	Gist
	•	Category

Optional in V1, but desirable:
	•	Allow users to download their filed documents as an export (e.g. a compressed bundle).

Outcome: Users can later find and prove things easily:
“When did I receive that tax letter?”, “Where is that letter from the health insurance?”, etc.

⸻

5.6 Document Detail View

For each document, a detail screen gives a deeper view:
	•	Title and category (editable)
	•	Short gist and a more detailed explanation (the long summary can be hidden behind a “show more” toggle to keep things clean)
	•	Action required and deadline (if any)
	•	Overview of whether there is still something open
	•	Ability to move the document into the filed/archive state once everything is done

Outcome: Users can drill into problematic letters without cluttering the main list.

⸻

6. Non-Functional Aspects
	•	Speed:
Processing a typical letter (upload to gist/action) should feel quick enough not to break trust.
	•	Clarity:
Wording must be simpler than the original letter. The user should feel relief, not more confusion.
	•	Calm design:
No noisy colors or aggressive patterns. The app should feel like a clean desk, not another stressful dashboard.
	•	Trust and privacy:
Communicate clearly that documents are handled securely and are not misused. Users of authorities-related letters are very sensitive to this.
	•	Mobile-first:
Many users will photograph letters with their phone. The app must be smooth on mobile.

⸻

7. Explicitly Out of Scope for V1

To keep the MVP sharp, the following are not part of V1:
	•	Automatic reminders/notifications
	•	Complex shared access or multi-user collaboration
	•	Sophisticated folder hierarchies or smart auto-restructuring
	•	Deep AI chat about all past documents
	•	Complex legal or tax advisory (beyond explaining the letter and its required action)

These can be evaluated after real usage confirms the core value.

⸻

8. Success Signals for V1

The V1 is successful if:
	•	Users upload real letters (not just test files)
	•	Users come back to upload multiple letters over time
	•	Users report that they now feel:
	•	less anxious when a letter arrives
	•	clearer about what to do and by when
	•	more in control of their paperwork
	•	People from language schools, Arbeitsamt context, or immigrant communities see the app as genuinely helpful, not as another gimmick.

If those signals appear, the foundation is working and later versions can add things like reminders, shared use with family, and more advanced structure.

⸻

9. Essence

Strip everything down and the product is:

A calm, multilingual inbox for official letters that extracts the one thing that matters:
what the letter wants from you, in simple words, with the right deadline, and a place to file it away once you’re done.

⸻

10. Assistant chat history (minimal, per-session)

To keep assistants (Galaxy = cross-doc; Clarity = per-document) reliable without heavy infra:
	•	Scope: store chat history per assistant session only; Galaxy has one rolling session per user, Clarity sessions are keyed by document_id. No cross-session recall and no summarization layer yet.
	•	Window: token-based rolling window (e.g., ~2–3k tokens). Older turns beyond the token budget are pruned; no idle-expiry TTL.
	•	Storage: Supabase tables with strict RLS by user. Do not persist signed URLs—store doc/task IDs plus short labels, and recreate signed URLs at render time.
	•	Retention controls: provide “Clear Galaxy chat” and “Clear this document’s chat”; delete Clarity chat when the document is deleted.
	•	Language: keep messages in the user’s UI language; store lang per session/message; switch if the user explicitly asks in chat.
This keeps chat context practical while avoiding unnecessary complexity; summaries can be added later if long sessions or audit needs emerge.
