# Evals & Judges

JUDGE is an optional second pass that evaluates a completed FEATURE/BUGFIX attempt plus its test output.

## Manual mode vs optional harness

- **Manual mode (this repo):** you call JUDGE by copy/pasting an `EvalTask` JSON payload and asking for an `EvalReport`.
- **Optional harness (not included):** a CI/CLI harness can auto-run JUDGE after tests and record the report.

---

## EvalTask

Input to JUDGE mode.

```json
{
  "task": "Task",
  "featureResponse": "FeatureResponse",
  "testOutput": "string"
}
```

- `task`: original Task (or the Task object from `Plan.md`).
- `featureResponse`: what the FEATURE/BUGFIX agent produced.
- `testOutput`: raw text from the last test run (paste it; don’t paraphrase).

---

## EvalReport

Output from JUDGE mode.

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

- Scores are in [0, 1].
- `mustFix` items should be treated as **merge blockers** until proven resolved.

---

## JUDGE behavior expectations

JUDGE must follow the Working Agreement:

- No hallucinated facts about the repo.
- If something is unknown, say so explicitly in `comments`.
- Scores must be consistent with the evidence in `featureResponse` and `testOutput`.

---

## When to run JUDGE

Run JUDGE when any of these are true:

- The change is “done” but the `GateReport` has material risks.
- Tests are incomplete, flaky, or only partially executed.
- The work touches auth, data integrity, billing, security, or migrations.
- You suspect rationalization (“it should work”) instead of evidence.

JUDGE is advice, not authority. Evidence (tests + code) wins.
