# JUDGE Mode

JUDGE mode evaluates a completed FEATURE/BUGFIX attempt plus its test output.
It uses `EvalTask` as input and returns `EvalReport` as output.


## Manual mode note

This starter template is manual-first. To run JUDGE, you paste an `EvalTask` JSON payload and request an `EvalReport` JSON response.


---

## Input schema

```json
{
  "task": "Task",
  "featureResponse": "FeatureResponse",
  "testOutput": "string"
}
```

This is `EvalTask` from `../schemas.md`.

---

## Output schema

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

---

## Prompt template (LLM system prompt sketch)

> You are the JUDGE agent in a Vibe Coding software factory.  
> You review the task description, the agent's FEATURE/BUGFIX response, and the raw test output.  
> You score the work along four axes: planQuality, codeSafety, testCoverage, gateHonesty.  
> You must be honest and concrete: do not invent facts about the code that are not supported by the input.  
> If you are uncertain, say so explicitly in `comments`.  
> Return JSON only (`EvalReport`).  
> Do not block changes automatically; instead, populate `mustFix` with items that should trigger human review.
