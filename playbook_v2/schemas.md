# Core JSON Schemas

This file defines the core JSON structures used by the Vibe Coding factory.
All schemas are intentionally minimal but practical. They work in **manual mode** (copy/paste JSON in chat) and also map cleanly to TypeScript types if you later implement an orchestrator/harness (not included in this starter).

---

## Task

Represents a single unit of work for the factory.

```json
{
  "id": "string",
  "mode": "FEATURE | BUGFIX | AI_FEATURE | ARCHITECT | JUDGE",
  "title": "string",
  "description": "string",
  "acceptanceCriteria": ["string"],
  "createdAt": "ISO-8601 timestamp string",
  "metadata": {
    "issueId": "string",
    "branchName": "string",
    "severity": "string",
    "targetFiles": ["string"],
    "extra": {}
  }
}
```

- `mode` drives which agent prompt is used.
- `acceptanceCriteria` define success in the user's own words.
- `metadata.targetFiles` is optional but helps context retrieval.

**Example**

```json
{
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
    "issueId": "DOC-123",
    "branchName": "feature/task-status",
    "severity": "normal",
    "targetFiles": [
      "app/tasks/page.tsx",
      "lib/db.ts",
      "supabase/migrations"
    ]
  }
}
```

---

## PlanStep

High-level steps the agent will take to complete a Task.

```json
{
  "id": "string",
  "kind": "analysis | code | tests | migration | docs | refactor | review",
  "description": "string",
  "targetFiles": ["string"],
  "done": false,
  "notes": "string"
}
```

**Example**

```json
{
  "id": "step-1",
  "kind": "analysis",
  "description": "Understand existing task data model and Supabase schema.",
  "targetFiles": [
    "lib/db.ts",
    "supabase/migrations"
  ],
  "done": false,
  "notes": "Check for existing status-like fields."
}
```

---

## CodeChange

A proposed change to a single file. v2 supports both full-file and snippet-based edits.

```json
{
  "filePath": "string",
  "changeType": "create | modify | delete",
  "language": "ts | tsx | sql | js | jsx | json | md | other",
  "description": "string",
  "beforeSnippet": "string | null",
  "afterSnippet": "string | null",
  "wholeFile": "string | null"
}
```

- `filePath`: repo-relative path (`app/tasks/page.tsx`).
- `changeType`:
  - `create` – new file.
  - `modify` – existing file changed.
  - `delete` – file removed.
- `wholeFile`: when non-null, the orchestrator treats this as the entire new file content.
- `beforeSnippet` / `afterSnippet`: used for targeted replacements when `wholeFile` is null.

**Example**

```json
{
  "filePath": "app/tasks/page.tsx",
  "changeType": "modify",
  "language": "tsx",
  "description": "Render a status badge in the tasks table.",
  "beforeSnippet": "<td>{task.title}</td>",
  "afterSnippet": "<td>{task.title}</td>\n<td>{task.status}</td>",
  "wholeFile": null
}
```

---

## TestSpec

Describes how tests should be exercised for this Task.

```json
{
  "id": "string",
  "description": "string",
  "type": "unit | integration | e2e | manual",
  "commands": ["string"],
  "targetFiles": ["string"],
  "notes": "string"
}
```

**Example**

```json
{
  "id": "tests-1",
  "description": "Run existing unit tests and integration tests for tasks.",
  "type": "integration",
  "commands": ["pnpm lint", "pnpm test"],
  "targetFiles": [
    "app/tasks/__tests__/",
    "lib/db.test.ts"
  ],
  "notes": "Add or update tests as needed to cover new status field."
}
```

---

## GateReport

Agent's own view of whether the change is ready.

**Rule:** unknowns, assumptions, and risks go in `risks` (don’t hand-wave).

```json
{
  "overallStatus": "pass | fail | needs_review",
  "summary": "string",
  "risks": ["string"],
  "testStatus": {
    "testsPlanned": ["string"],
    "testsImplemented": ["string"],
    "manualChecks": ["string"]
  },
  "notes": "string"
}
```

**Example**

```json
{
  "overallStatus": "needs_review",
  "summary": "Schema and UI changes are designed, but tests need human review.",
  "risks": [
    "Possible mismatch with existing Supabase migrations",
    "Status enum values may need product confirmation"
  ],
  "testStatus": {
    "testsPlanned": ["pnpm lint", "pnpm test"],
    "testsImplemented": ["pnpm test"],
    "manualChecks": ["Verify status edit flow in browser"]
  },
  "notes": "Be explicit about any uncertainty in the Supabase schema."
}
```


---

## FeatureResponse

Canonical FEATURE/AI_FEATURE output. See `modes/FEATURE.md` and `modes/AI_FEATURE.md` for guidance.

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

- `memoryUpdate` is optional. Use it when you are maintaining durable domain memory (see `domain_memory.md`).

---

## BugfixResponse

Canonical BUGFIX output.

```json
{
  "task": "Task",
  "analysis": "string",
  "plan": ["PlanStep"],
  "codeChanges": ["CodeChange"],
  "tests": ["TestSpec"],
  "gate": "GateReport",
  "memoryUpdate": "MemoryUpdate | null",
  "notes": "string"
}
```

- `analysis` is the suspected root cause based on provided evidence (as a JSON string).
- Unknowns and risks must go into `gate.risks` (not implied away).

---

## ContextItem

The atomic unit of retrieved context passed to agents.

```json
{
  "source": "code | docs | tests | issues | memory",
  "path": "string",
  "snippet": "string",
  "relevanceScore": 0,
  "notes": "string"
}
```

- `source`: where the context came from.
- `path`: file path, issue key, or logical identifier.
- `snippet`: text excerpt or summary.
- `relevanceScore`: [0, 1]; higher is more relevant to current Task.

**Example**

```json
{
  "source": "code",
  "path": "lib/db.ts",
  "snippet": "export const tasks = pgTable('tasks', { id: serial('id').primaryKey(), title: text('title').notNull() });",
  "relevanceScore": 0.9,
  "notes": "Current tasks schema; no status field yet."
}
```

---

## LogEntry

Telemetry entry describing a single run for a Task/mode (manual or harnessed).

```json
{
  "timestamp": "string",
  "taskId": "string",
  "mode": "FEATURE | BUGFIX | AI_FEATURE | ARCHITECT | JUDGE",
  "input": {
    "task": "Task",
    "contextSummary": "string"
  },
  "output": {
    "featureResponse": "FeatureResponse | null",
    "bugfixResponse": "BugfixResponse | null",
    "evalReport": "EvalReport | null"
  },
  "testResult": {
    "success": true,
    "output": "string"
  },
  "durationMs": 0
}
```

**Example**

```json
{
  "timestamp": "2025-01-01T13:00:00.000Z",
  "taskId": "c8e7c54f-2ef0-4d5a-a274-6f33c3f34855",
  "mode": "FEATURE",
  "input": {
    "task": {
      "id": "c8e7c54f-2ef0-4d5a-a274-6f33c3f34855",
      "mode": "FEATURE",
      "title": "Add task status field",
      "description": "Add a status field to tasks...",
      "acceptanceCriteria": ["Tasks have a status column"],
      "createdAt": "2025-01-01T12:34:56.000Z",
      "metadata": {}
    },
    "contextSummary": "7 context items from app/, lib/, supabase/migrations."
  },
  "output": {
    "featureResponse": {
      "task": { "id": "c8e7c54f-2ef0-4d5a-a274-6f33c3f34855", "mode": "FEATURE" },
      "plan": [],
      "codeChanges": [],
      "tests": [],
      "gate": {
        "overallStatus": "needs_review",
        "summary": "Example only",
        "risks": [],
        "testStatus": {
          "testsPlanned": [],
          "testsImplemented": [],
          "manualChecks": []
        },
        "notes": ""
      }
    },
    "bugfixResponse": null,
    "evalReport": null
  },
  "testResult": {
    "success": true,
    "output": "Example only"
  },
  "durationMs": 12345
}
```

---

## EvalTask

Input payload to the JUDGE agent.

```json
{
  "task": "Task",
  "featureResponse": "FeatureResponse",
  "testOutput": "string"
}
```

**Example**

```json
{
  "task": {
    "id": "c8e7c54f-2ef0-4d5a-a274-6f33c3f34855",
    "mode": "FEATURE",
    "title": "Add task status field",
    "description": "Add a status field to tasks.",
    "acceptanceCriteria": ["Tasks have a status column"],
    "createdAt": "2025-01-01T12:34:56.000Z",
    "metadata": {}
  },
  "featureResponse": {
    "task": { "id": "c8e7c54f-2ef0-4d5a-a274-6f33c3f34855", "mode": "FEATURE" },
    "plan": [],
    "codeChanges": [],
    "tests": [],
    "gate": {
      "overallStatus": "needs_review",
      "summary": "Example only",
      "risks": [],
      "testStatus": {
        "testsPlanned": [],
        "testsImplemented": [],
        "manualChecks": []
      },
      "notes": ""
    }
  },
  "testOutput": "pnpm test: all tests passed."
}
```

---

## EvalReport

Output from the JUDGE agent.

```json
{
  "overallScore": 0.0,
  "scores": {
    "planQuality": 0.0,
    "codeSafety": 0.0,
    "testCoverage": 0.0,
    "gateHonesty": 0.0
  },
  "comments": ["string"],
  "mustFix": ["string"]
}
```

- Each score is in [0, 1].
- `mustFix` contains items that should block merge or demand human review.

**Example**

```json
{
  "overallScore": 0.72,
  "scores": {
    "planQuality": 0.8,
    "codeSafety": 0.7,
    "testCoverage": 0.6,
    "gateHonesty": 0.8
  },
  "comments": [
    "Plan is reasonably detailed, but migrations are underspecified.",
    "Code changes appear safe, but enum values for status need confirmation."
  ],
  "mustFix": [
    "Add explicit Supabase migration for the status column.",
    "Clarify allowed status values (enum vs free-text)."
  ]
}
```

---



---

## DomainMemory (Optional)

A durable, structured snapshot of “where the work stands” so each new run can re-ground quickly.
See `domain_memory.md` for the recommended boot ritual and update pattern.

In this starter, DomainMemory can live:
- As a JSON code fence inside `Plan.md` (append-only snapshots), and/or
- As a summarized `ContextItem` with `source: "memory"`.

### JSON Schema (optional)

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "DomainMemory",
  "type": "object",
  "additionalProperties": false,
  "required": ["schemaVersion", "updatedAt", "runbook", "backlog"],
  "properties": {
    "schemaVersion": { "type": "string", "description": "Bump when fields change." },
    "updatedAt": { "type": "string", "description": "ISO-8601 timestamp string." },
    "constraints": {
      "type": "array",
      "items": { "type": "string" },
      "description": "Non-negotiable constraints (stack, policies, decisions)."
    },
    "runbook": {
      "type": "object",
      "additionalProperties": false,
      "required": ["test"],
      "properties": {
        "install": { "type": "string" },
        "lint": { "type": "string" },
        "test": { "type": "string" },
        "e2e": { "type": ["string", "null"] },
        "notes": { "type": "string" }
      }
    },
    "backlog": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["id", "title", "status"],
        "properties": {
          "id": { "type": "string" },
          "title": { "type": "string" },
          "status": { "type": "string", "enum": ["todo", "in_progress", "blocked", "done"] },
          "acceptanceCriteria": { "type": "array", "items": { "type": "string" } },
          "testRefs": { "type": "array", "items": { "type": "string" } },
          "notes": { "type": "string" },
          "lastUpdatedAt": { "type": "string" }
        }
      }
    },
    "recentProgress": {
      "type": "array",
      "items": { "type": "string" },
      "description": "Short append-only progress bullets (most recent first)."
    }
  }
}
```

**Example**

```json
{
  "schemaVersion": "1",
  "updatedAt": "2025-12-12T00:00:00.000Z",
  "constraints": [
    "Manual mode: no orchestrator is assumed.",
    "Unknowns must be recorded in gate.risks."
  ],
  "runbook": {
    "install": "pnpm install",
    "lint": "pnpm lint",
    "test": "pnpm test",
    "e2e": null,
    "notes": "If tests are slow, run the closest targeted command and record it."
  },
  "backlog": [
    {
      "id": "1.2",
      "title": "Render status badge in task list",
      "status": "todo",
      "acceptanceCriteria": ["Status is visible in the list", "UI has empty/loading/error states"],
      "testRefs": ["pnpm test -- app/tasks/__tests__/tasks.test.tsx"],
      "notes": "Don’t guess enum values; confirm in schema.",
      "lastUpdatedAt": "2025-12-12T00:00:00.000Z"
    }
  ],
  "recentProgress": [
    "Initialized PRD and task list; defined boot ritual and test commands."
  ]
}
```

---

## MemoryUpdate (Optional)

Describes a single atomic update to DomainMemory after a run. This makes progress explicit and auditable.

### JSON Schema (optional)

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "MemoryUpdate",
  "type": "object",
  "additionalProperties": false,
  "required": ["timestamp", "itemId", "statusAfter", "testsRun", "summary", "gateOverallStatus"],
  "properties": {
    "timestamp": { "type": "string", "description": "ISO-8601 timestamp string." },
    "itemId": { "type": "string", "description": "Backlog item id or task id." },
    "statusBefore": { "type": ["string", "null"], "enum": ["todo", "in_progress", "blocked", "done", null] },
    "statusAfter": { "type": "string", "enum": ["todo", "in_progress", "blocked", "done"] },
    "testsRun": { "type": "array", "items": { "type": "string" } },
    "summary": { "type": "string" },
    "gateOverallStatus": { "type": "string", "enum": ["pass", "fail", "needs_review"] },
    "links": { "type": "array", "items": { "type": "string" } }
  }
}
```

**Example**

```json
{
  "timestamp": "2025-12-12T01:23:45.000Z",
  "itemId": "1.2",
  "statusBefore": "todo",
  "statusAfter": "done",
  "testsRun": ["pnpm lint", "pnpm test -- app/tasks/__tests__/tasks.test.tsx"],
  "summary": "Implemented status badge rendering and fixed fixtures; added a regression test.",
  "gateOverallStatus": "pass",
  "links": ["Plan.md#2025-12-12---feature-render-status-badge"]
}
```

---

## FeedbackEntry (Optional)

v2 does not require persistent memory, but we allow simple feedback entries for retros and future improvements.

```json
{
  "id": "string",
  "taskId": "string",
  "createdAt": "string",
  "kind": "retro | user_feedback | system_note",
  "summary": "string",
  "details": "string"
}
```

These entries are not wired into any automation in this starter, but they’re useful as durable notes.
