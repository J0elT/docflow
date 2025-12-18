# FEATURE Mode (Schema-first)

FEATURE mode implements a new feature in a Next.js + TypeScript + Supabase repo.

The FEATURE agent must:
- Follow the SURVEY → PLAN → EXECUTE → TEST → GATE loop conceptually.
- Produce a structured JSON response (`FeatureResponse`).
- Avoid guessing unknown code; be explicit about uncertainty.


## Manual mode note

This starter template is **manual-first**. There is no orchestrator included here — you provide the input JSON and you apply changes yourself.
If you later build a harness, it can send the same payload and validate the same output schema.


---

## Input schema

Input to FEATURE is the following JSON (manual or harnessed):

```json
{
  "task": "Task",
  "context": ["ContextItem"]
}
```

Where `Task` and `ContextItem` are defined in `../schemas.md`.

**Example input**

```json
{
  "task": {
    "id": "c8e7c54f-2ef0-4d5a-a274-6f33c3f34855",
    "mode": "FEATURE",
    "title": "Add task status field",
    "description": "Add a `status` field to tasks, persist it in Supabase, and show it in the Next.js UI.",
    "acceptanceCriteria": [
      "Tasks have a status column in the database",
      "Status can be edited from the UI",
      "Status is rendered in the task list"
    ],
    "createdAt": "2025-01-01T12:34:56.000Z",
    "metadata": {
      "targetFiles": [
        "app/tasks/page.tsx",
        "lib/db.ts",
        "supabase/migrations"
      ]
    }
  },
  "context": [
    {
      "source": "code",
      "path": "lib/db.ts",
      "snippet": "export const tasks = pgTable('tasks', { id: serial('id').primaryKey(), title: text('title').notNull() });",
      "relevanceScore": 0.9,
      "notes": "Current tasks schema."
    },
    {
      "source": "code",
      "path": "app/tasks/page.tsx",
      "snippet": "export default async function TasksPage() { /* ... */ }",
      "relevanceScore": 0.8,
      "notes": "Tasks list page."
    }
  ]
}
```

---

## Output schema: FeatureResponse

```json
{
  "task": "Task",
  "plan": ["PlanStep"],
  "codeChanges": ["CodeChange"],
  "tests": ["TestSpec"],
  "gate": "GateReport",
  "memoryUpdate": "MemoryUpdate | null",
  "notes": "string"
}
```

- `plan`: SURVEY/PLAN steps as `PlanStep[]` (analysis, code, tests, migrations, docs).
- `codeChanges`: concrete changes to apply.
- `tests`: how to exercise the changes.
- `gate`: agent’s own gate summary.
- `notes`: optional free-form commentary (still inside JSON).

**Worked example output (shortened)**

```json
{
  "task": {
    "id": "c8e7c54f-2ef0-4d5a-a274-6f33c3f34855",
    "mode": "FEATURE",
    "title": "Add task status field",
    "description": "Add a status field to tasks...",
    "acceptanceCriteria": [
      "Tasks have a status column in the database",
      "Status can be edited from the UI",
      "Status is rendered in the task list"
    ],
    "createdAt": "2025-01-01T12:34:56.000Z",
    "metadata": {}
  },
  "plan": [
    {
      "id": "step-1",
      "kind": "analysis",
      "description": "Review current tasks schema and UI rendering.",
      "targetFiles": ["lib/db.ts", "app/tasks/page.tsx"],
      "done": false,
      "notes": ""
    },
    {
      "id": "step-2",
      "kind": "migration",
      "description": "Add `status` column to tasks table in Supabase.",
      "targetFiles": ["supabase/migrations"],
      "done": false,
      "notes": "Use text or enum as appropriate."
    }
  ],
  "codeChanges": [
    {
      "filePath": "supabase/migrations/20250101_add_status_to_tasks.sql",
      "changeType": "create",
      "language": "sql",
      "description": "Add status column to tasks table.",
      "beforeSnippet": null,
      "afterSnippet": null,
      "wholeFile": "alter table public.tasks add column status text not null default 'todo';"
    },
    {
      "filePath": "app/tasks/page.tsx",
      "changeType": "modify",
      "language": "tsx",
      "description": "Render and edit task status in the TasksPage table.",
      "beforeSnippet": "/* existing table row rendering */",
      "afterSnippet": "/* updated table row rendering with status column */",
      "wholeFile": null
    }
  ],
  "tests": [
    {
      "id": "tests-1",
      "description": "Run existing tests and add coverage for status rendering.",
      "type": "integration",
      "commands": ["pnpm lint", "pnpm test"],
      "targetFiles": ["app/tasks/__tests__/tasks.test.tsx"],
      "notes": "Add a test that asserts status text appears in the DOM."
    }
  ],
  "gate": {
    "overallStatus": "needs_review",
    "summary": "Migration and UI are specified; tests require human validation.",
    "risks": [
      "Status default value may need product confirmation"
    ],
    "testStatus": {
      "testsPlanned": ["pnpm lint", "pnpm test"],
      "testsImplemented": ["pnpm test"],
      "manualChecks": ["Manually edit status in UI and confirm persistence"]
    },
    "notes": "If migrations already exist for tasks, integrate this carefully."
  },
  "notes": "Example response; actual changes must respect existing code."
}
```

---

## Prompt template (LLM system prompt sketch)

If you use a harness, it may use a system prompt similar to:

> You are the FEATURE mode coding agent in a Vibe Coding software factory.  
> You operate on a Next.js + TypeScript + Supabase/Postgres repo.  
> You follow the SURVEY → PLAN → EXECUTE → TEST → GATE loop conceptually, but you only **return JSON**.  
> Input: a JSON object with `task` (Task) and `context` (ContextItem[]).  
> Output: a single JSON object of type `FeatureResponse`.  
> Rules:  
> - Return **ONLY** JSON (no markdown, no code fences, no comments).  
> - Do not invent code that contradicts the provided context; if unsure, mark risks in `gate.risks`.
> - If you are maintaining DomainMemory, include a `memoryUpdate` that reflects the single atomic state change for this run.  
> - Prefer small, safe changes and clear tests.  
> - Use `wholeFile` when you can safely reconstruct the file; otherwise, use `beforeSnippet`/`afterSnippet`.  
