# Telemetry & Logs

Logging is optional, but strongly recommended if you want repeatable, auditable progress.

This playbook uses NDJSON `LogEntry` objects (one JSON object per line). Logging works in:

- **Manual mode:** you (or a script) append a line after each run.
- **Optional harness mode:** an orchestrator can write logs automatically (not included in this starter).

---

## LogEntry schema

See `schemas.md` for the canonical `LogEntry` shape.

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

---

## Log format and location (suggested)

- Format: NDJSON (one `LogEntry` per line).
- Suggested location: `logs/YYYY-MM-DD/factory.ndjson` (repo-relative or working-dir relative; your choice).

Example:

```text
logs/2025-12-12/factory.ndjson
```

If you don’t want a `logs/` folder, you can keep log excerpts inside `Plan.md` instead.

---

## What to log (minimum useful set)

After each run, capture:

- Task id/title/mode (or the Plan.md section header)
- A short context summary (what you fed the model)
- The model’s structured output (FeatureResponse/BugfixResponse/EvalReport)
- The exact test commands run and their raw output
- Duration (optional)

---

## Why log?

- **Debugging:** see what input produced what output; compare runs.
- **Metrics:** how often do we reach “pass”; what risks recur.
- **Datasets:** logs are a clean substrate for evals or future automation.

---

## Optional harness note (not included)

If you later build a harness, it should write a `LogEntry` at the end of every run (pass or fail),
and never claim tests passed without storing the raw output.
