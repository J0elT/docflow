You are an expert TypeScript/Next.js + Supabase engineer. You are working in an existing repo called `docflow`. It is a Next.js App Router project bootstrapped with `create-next-app` (TypeScript + Tailwind). Your job is to wire Supabase and build the first working MVP flow.

## Current backend context

There is already a Supabase project for this app with:

- Storage bucket: `documents`
- Auth: email OTP / magic link is enabled
- Tables in schema `public`:

1) documents
   - id uuid primary key default gen_random_uuid()
   - user_id uuid not null references auth.users(id) on delete cascade
   - title text
   - storage_path text
   - created_at timestamptz not null default now()
   - status text not null default 'uploaded'
   - error_message text

2) extractions
   - id uuid primary key default gen_random_uuid()
   - document_id uuid not null references public.documents(id) on delete cascade
   - user_id uuid not null references auth.users(id) on delete cascade
   - content jsonb
   - created_at timestamptz not null default now()

3) profiles
   - id uuid primary key references auth.users(id) on delete cascade
   - updated_at timestamptz
   - username text unique
   - full_name text
   - avatar_url text
   - website text

Row-level security is enabled. Policies:
- documents: user can only see/modify rows where auth.uid() = user_id
- extractions: user can only see/modify rows if there exists a documents row with id = document_id and documents.user_id = auth.uid()
- profiles: standard Supabase example policies (public read, user can insert/update their own row).

Do NOT change this database schema or any RLS policies.

## Env variables

Assume `.env.local` already exists with:

- NEXT_PUBLIC_SUPABASE_URL
- NEXT_PUBLIC_SUPABASE_ANON_KEY
- SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY
- OPENAI_API_KEY

You must not hardcode these values; always use process.env.

## Goal

Implement a minimal but working MVP of **DocFlow**, a simple app that:

1. Lets a user log in via Supabase email magic link.
2. Lets the logged-in user upload a document (pdf/txt/doc/docx).
3. Saves the file into Supabase Storage bucket `documents`.
4. Creates a row in `public.documents` with:
   - user_id = current user id
   - title = original file name
   - storage_path = path in the bucket
   - status = 'uploaded' initially, then updated to 'processing' and 'done' or 'error' accordingly.
5. Triggers a server-side process that:
   - downloads the file from storage
   - extracts text (for pdfs use pdf-parse; other formats just treat as utf8 text)
   - calls the OpenAI chat completions API (model: gpt-4.1-mini) with a prompt that returns **JSON only** with this structure:

     {
       "summary": "<max 5 sentences>",
       "key_fields": {
         "document_type": "...",
         "date": "...",
         "amount_total": <number or null>,
         "currency": "...",
         "counterparty": "...",
         "other": "anything else useful"
       }
     }

   - parses that JSON and stores it in `public.extractions.content` as JSONB, together with document_id and user_id.
   - sets documents.status to 'done' or 'error', and fills error_message on errors.
6. Shows a dashboard where the logged-in user can see a table of their documents with:
   - title
   - status (uploaded / processing / done / error)
   - error_message (if any)
   - created_at
   - summary from the associated extraction (if present)

All UI can be minimal Tailwind, no fancy styling required. Focus on clean data flow and error handling.

## Implementation constraints / style

- Use Next.js App Router conventions (`src/app`).
- Use TypeScript everywhere.
- Keep things simple and explicit; no unnecessary abstractions.
- Handle errors gracefully (console.error + user-visible message where reasonable).
- Do NOT modify the Supabase database from code (no migrations, no create table in code).
- Do NOT expose the service role key to the browser. Use:
  - `@supabase/supabase-js` with anon key for browser
  - `@supabase/supabase-js` with service role key only in server-side code (route handlers).
- Follow this high-level file structure (you can adapt slightly if needed):

  src/
    lib/
      supabaseBrowser.ts
      supabaseAdmin.ts
    app/
      login/page.tsx
      page.tsx          // main dashboard
      api/
        process-document/route.ts
        // you can add api/ping/route.ts for debugging if helpful
    components/
      UploadForm.tsx
      DocumentTable.tsx

## Step-by-step tasks

Execute the following steps in order and show me the diffs / final code for each file you touch.

### 1. Dependencies

- Install packages:

  - @supabase/supabase-js
  - openai
  - pdf-parse

Assume the user will run `npm install` themselves; just mention the exact commands at the end.

### 2. Supabase helpers

Create these two files:

#### src/lib/supabaseBrowser.ts

- Export a function `supabaseBrowser()` that creates a Supabase client with:
  - url: NEXT_PUBLIC_SUPABASE_URL
  - key: NEXT_PUBLIC_SUPABASE_ANON_KEY

#### src/lib/supabaseAdmin.ts

- Export a function `supabaseAdmin()` that creates a Supabase client with:
  - url: SUPABASE_URL
  - key: SUPABASE_SERVICE_ROLE_KEY
  - auth options: autoRefreshToken false, persistSession false.

### 3. Auth: login page

Create `src/app/login/page.tsx`:

- Client component.
- Simple email input.
- On submit:
  - call `supabaseBrowser().auth.signInWithOtp({ email })`.
  - show a message “Check your email for the magic link” on success.
- No need for full session management yet; the main page will check if user is logged in.

### 4. Upload form

Create `src/components/UploadForm.tsx`:

- Client component that takes `onUploaded: () => void`.
- State:
  - selected File
  - loading boolean
- On submit:
  - use `supabaseBrowser()`:
    - get current user via `auth.getUser()`. If no user, throw error.
    - upload file to storage bucket `documents` at path `${user.id}/${crypto.randomUUID()}-${file.name}`.
    - insert row into `public.documents` with:
      - user_id = user.id
      - title = file.name
      - storage_path = path
      - status = 'uploaded'
    - select the inserted document id.
  - after insert, trigger `/api/process-document` with POST JSON body `{ documentId }` (fire and forget; ignore response).
  - clear the file input, call `onUploaded()` to let the parent refresh.
- Show basic loading state and `alert()` on errors.

### 5. Server-side processing route

Create `src/app/api/process-document/route.ts`:

- runtime: "nodejs".
- Use `supabaseAdmin()` and `OpenAI` from `openai`.
- POST handler:
  - Read JSON body, get `documentId` (string); validate.
  - Fetch the corresponding `documents` row (id, user_id, title, storage_path).
  - Update that document row: status = 'processing', error_message = null.
  - Download the file from the `documents` bucket using storage_path.
  - Convert to Buffer, then:
    - If file name ends with `.pdf` (case insensitive), use pdf-parse to get text.
    - Else, treat buffer as utf8 text.
  - Build the prompt as described above and call OpenAI chat completions:

    - model: "gpt-4.1-mini"
    - response_format: { type: "json_object" }
    - one user message with the prompt and document text (truncate to ~8000 chars).

  - Parse `completion.choices[0].message.content` as JSON.
  - Insert into `public.extractions`:

    - document_id = doc.id
    - user_id = doc.user_id
    - content = parsed JSON

  - Update documents.status = 'done', error_message = null.
  - Return JSON { ok: true }.

- Error handling:
  - On any error, log it.
  - Update the document row: status = 'error', error_message = error message.
  - Return 500.

### 6. Dashboard table

Create `src/components/DocumentTable.tsx`:

- Client component that takes `refreshKey: number`.
- On mount + on refreshKey change:
  - use `supabaseBrowser().auth.getUser()` to get current user.
  - query `public.documents` with:

    - select: `id, title, status, error_message, created_at, extra:extractions(content)`
    - filter: `user_id = user.id`
    - order: created_at desc

    Use Supabase’s “select with foreign table” syntax to bring back at most one extraction per document (it will be an array alias).

  - Map result into an array of rows where:
    - summary = `extra[0]?.content.summary` if exists.
- Render a simple `<table>` with one row per document showing:
  - title
  - status (and error_message if status === 'error')
  - summary (or “Processing…” if status === 'processing' and no extraction yet)
  - created_at formatted with `.toLocaleString()`.

### 7. Main page logic

Edit `src/app/page.tsx`:

- Make it a client component.
- On mount, use `supabaseBrowser().auth.getUser()` to decide if user is logged in.
- If not logged in:
  - show simple landing with “DocFlow” and a link/button to `/login`.
- If logged in:
  - render:
    - `<UploadForm onUploaded={() => setRefreshKey(k => k + 1)} />`
    - `<DocumentTable refreshKey={refreshKey} />`

Optional: add a simple “Log out” button that calls `supabaseBrowser().auth.signOut()` and flips state.

### 8. Basic sanity checks

Ensure:

- All imports are correct and use `@/lib/...` and `@/components/...` with the existing `@/*` alias.
- Types compile under `npm run lint` and `npm run build`.
- You never import the service role client into client components.
- You never call OpenAI from the browser; only from the route handler.

At the end, summarize:

- Files created/edited with their roles.
- The exact `npm install` command(s) the user must run.
- Any manual steps (e.g. ensure env vars are set, Supabase email provider enabled) you assume.

Now start implementing step by step and show the resulting code for each file.

## Very important: explanation

After each major step (dependencies, Supabase helpers, login page, upload form, process-document API route, dashboard, main page) do the following:

1. Briefly explain in plain language what you just implemented and how it connects to the database model:
   - which tables are read/written (`documents`, `extractions`, `profiles`),
   - which relationships are used (`user -> documents -> extractions`),
   - what the data flow is (e.g. "on upload we create X, then call Y").

2. Point out any tradeoffs or things you are simplifying for the MVP.

Keep explanations short but educational: I want to understand the architecture, not just see code.