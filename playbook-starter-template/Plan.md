# Plan (append per non-trivial change)

This file is an **append-only run log**. Each entry should reflect **one atomic unit of progress** (one backlog item / one clear slice), with **observable evidence** (tests or explicit manual checks).

Schemas referenced below live in `playbook_v2/schemas.md`.

---

## Optional: DomainMemory snapshot (pinned)

If you’re using the optional reliability layer (`playbook_v2/domain_memory.md`), keep an occasional snapshot here so every run can re-ground quickly.

```json
{
  "schemaVersion": "1",
  "updatedAt": "YYYY-MM-DDTHH:MM:SSZ",
  "constraints": ["string"],
  "runbook": { "test": "string" },
  "backlog": [],
  "recentProgress": []
}
```

---

## Template: new run entry (copy/paste)

### Atomic progress rule

- Pick **one** backlog item / acceptance criterion.
- Do not mark it done without test evidence (or explicit manual checks recorded).

---

## YYYY-MM-DD — <MODE>: <Title>

### Task (Task)

```json
{
  "id": "uuid-or-human-id",
  "mode": "FEATURE",
  "title": "Short title",
  "description": "What is changing and why (1–3 paragraphs).",
  "acceptanceCriteria": ["Observable outcome 1", "Observable outcome 2"],
  "createdAt": "YYYY-MM-DDTHH:MM:SSZ",
  "metadata": {
    "issueId": "",
    "branchName": "",
    "severity": "",
    "targetFiles": ["path/to/file.ts"],
    "extra": {}
  }
}
```

### Context summary (human-readable)

- Memory/constraints: …
- Relevant files: …
- Known failures: …

### Plan (PlanStep[])

```json
[
  {
    "id": "step-1",
    "description": "Small, safe step.",
    "kind": "code",
    "targetFiles": ["path/to/file.ts"],
    "done": false,
    "notes": "If unsure about X, put it in gate.risks."
  }
]
```

### Code changes (CodeChange[])

```json
[
  {
    "filePath": "path/to/file.ts",
    "changeType": "modify",
    "beforeSnippet": "",
    "afterSnippet": "",
    "wholeFile": ""
  }
]
```

### Tests (TestSpec[])

```json
[
  {
    "id": "tests-1",
    "description": "Run targeted unit/integration tests for this change.",
    "type": "unit",
    "commands": ["pnpm test -- path/to/test"],
    "targetFiles": ["path/to/test"],
    "notes": "Paste raw output below."
  }
]
```

### Test output (paste raw)

```text
(paste raw command output here)
```

### Gate report (GateReport)

```json
{
  "overallStatus": "needs_review",
  "summary": "One sentence on readiness.",
  "risks": [
    "Unknown enum values for status (must confirm)",
    "Migration path not yet validated"
  ],
  "testStatus": {
    "testsPlanned": ["pnpm lint", "pnpm test -- path/to/test"],
    "testsImplemented": ["pnpm test -- path/to/test"],
    "manualChecks": ["Verify flow in browser"]
  },
  "notes": "Unknowns/assumptions belong in risks; don’t bury them in prose."
}
```

### Memory update (optional; MemoryUpdate)

Use this if you’re maintaining a DomainMemory snapshot.

```json
{
  "timestamp": "YYYY-MM-DDTHH:MM:SSZ",
  "itemId": "backlog-item-id",
  "statusBefore": "todo",
  "statusAfter": "in_progress",
  "testsRun": ["pnpm test -- path/to/test"],
  "summary": "What changed and what evidence exists.",
  "gateOverallStatus": "needs_review",
  "links": []
}
```

### Notes / follow-ups

- Follow-ups (new tasks, refactors, docs): …
- If a decision became “sticky”, add it to `DECISIONS.md`.
