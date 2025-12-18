# CI Integration

This starter template does **not** include an orchestrator, but the schemas are designed so an optional harness *could* integrate into CI later.

## In practice (manual mode)

In manual mode, your CI is just your normal CI:

- run lint/build/tests
- block merges on failures
- optionally require a `GateReport` section in PR descriptions (human process)

## Optional CHECK mode concept (not included)

If you build a harness, CI can run a “CHECK mode” that:

1. Receives a `CIEvent` (push/PR metadata).
2. Runs tests (e.g., `pnpm lint && pnpm test`).
3. Optionally constructs an `EvalTask` from the last Task + FEATURE output (if logged) and calls JUDGE.
4. Prints a short summary:
   - Test status (pass/fail).
   - Any `mustFix` items from the latest `EvalReport`.
   - A link to logs (if persisted somewhere).

---

## CIEvent schema (optional)

```json
{
  "type": "pull_request | push",
  "branch": "string",
  "commitSha": "string",
  "changedFiles": ["string"]
}
```

This doc exists to keep the contracts stable if/when you add automation.
