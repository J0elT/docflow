# BUGFIX Mode (Schema-first)

BUGFIX mode is used when tests fail after FEATURE or when the user requests a bug fix directly.


## Manual mode note

This starter template is manual-first. You paste the BUGFIX input JSON (including raw test output) and apply the resulting code changes yourself.


---

## Input schema

```json
{
  "task": "Task",
  "context": ["ContextItem"],
  "testOutput": "string"
}
```

- `task.mode` MUST be `"BUGFIX"`.
- `testOutput` is the raw test output from `pnpm test` (possibly truncated).

**Example input**

```json
{
  "task": {
    "id": "aa6a83e1-0c2c-476d-93ad-b4f4131a6b8d",
    "mode": "BUGFIX",
    "title": "Fix failing tests after adding task status field",
    "description": "Tests are failing after adding status; diagnose and fix.",
    "acceptanceCriteria": [
      "All tests pass",
      "Status behavior matches feature spec"
    ],
    "createdAt": "2025-01-01T14:00:00.000Z",
    "metadata": {}
  },
  "context": [
    {
      "source": "code",
      "path": "app/tasks/page.tsx",
      "snippet": "/* updated TasksPage implementation */",
      "relevanceScore": 0.9,
      "notes": "Recent feature changes."
    }
  ],
  "testOutput": "FAIL app/tasks/__tests__/tasks.test.tsx ... expected status to be 'todo', received 'undefined' ..."
}
```

---

## Output schema: BugfixResponse

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

- `analysis`: textual reasoning about root cause (in JSON string form).
- `plan`: steps to fix the bug and stabilize tests.
- `codeChanges`: focused edits, ideally minimal.
- `tests`: how to re-run or extend tests.
- `gate`: bugfix-specific gate summary (e.g. “pending manual regression check”).

**Example output (shortened)**

```json
{
  "task": {
    "id": "aa6a83e1-0c2c-476d-93ad-b4f4131a6b8d",
    "mode": "BUGFIX",
    "title": "Fix failing tests after adding task status field",
    "description": "Tests are failing after adding status; diagnose and fix.",
    "acceptanceCriteria": [
      "All tests pass",
      "Status behavior matches feature spec"
    ],
    "createdAt": "2025-01-01T14:00:00.000Z",
    "metadata": {}
  },
  "analysis": "Tests fail because the TasksPage component expects `task.status`, but the mock data in tests does not include this property.",
  "plan": [
    {
      "id": "step-1",
      "kind": "analysis",
      "description": "Review failing test and identify missing status field in test fixtures.",
      "targetFiles": ["app/tasks/__tests__/tasks.test.tsx"],
      "done": false,
      "notes": ""
    },
    {
      "id": "step-2",
      "kind": "code",
      "description": "Update test fixtures to include a default status value.",
      "targetFiles": ["app/tasks/__tests__/tasks.test.tsx"],
      "done": false,
      "notes": ""
    }
  ],
  "codeChanges": [
    {
      "filePath": "app/tasks/__tests__/tasks.test.tsx",
      "changeType": "modify",
      "language": "tsx",
      "description": "Add status field to mocked task objects.",
      "beforeSnippet": "{ id: 1, title: 'Test task' }",
      "afterSnippet": "{ id: 1, title: 'Test task', status: 'todo' }",
      "wholeFile": null
    }
  ],
  "tests": [
    {
      "id": "tests-bugfix-1",
      "description": "Re-run unit tests for TasksPage after fixture update.",
      "type": "unit",
      "commands": ["pnpm test -- app/tasks/__tests__/tasks.test.tsx"],
      "targetFiles": ["app/tasks/__tests__/tasks.test.tsx"],
      "notes": "Confirm status is rendered and tests now pass."
    }
  ],
  "gate": {
    "overallStatus": "needs_review",
    "summary": "Bugfix is narrow and should resolve failing tests. Manual UI verification still recommended.",
    "risks": ["Mock fixtures might diverge from real data shape if API/schema changes again."],
    "testStatus": {
      "testsPlanned": ["pnpm test"],
      "testsImplemented": ["pnpm test -- app/tasks/__tests__/tasks.test.tsx"],
      "manualChecks": ["Open Tasks page and verify status rendering for a few tasks."]
    },
    "notes": ""
  },
  "notes": "Keep bugfixes minimal and scoped to the failure."
}
```

---

## Prompt template (LLM system prompt sketch)

> You are the BUGFIX mode coding agent in a Vibe Coding software factory.  
> You receive a failing test output and limited code context.  
> Your job is to diagnose the likely root cause and propose **minimal, safe** code changes.  
> Input: JSON with `task` (mode BUGFIX), `context` (ContextItem[]), and `testOutput` (string).  
> Output: JSON `BugfixResponse`.  
> Rules:  
> - Return only JSON, no markdown.  
> - Prefer the smallest change that makes tests pass while preserving feature intent.  
> - If you are uncertain, say so in `analysis` and add items to `gate.risks`.  
> - Never mask or ignore test failures; treat unknowns honestly.
