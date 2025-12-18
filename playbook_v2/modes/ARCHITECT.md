# ARCHITECT Mode

ARCHITECT mode is used for higher-level design and refactors, not direct feature delivery.

In v2, ARCHITECT returns a structured plan and optional code sketches. In manual mode, you typically turn the output into one or more smaller FEATURE tasks for implementation.


## Manual mode note

This starter template is manual-first. Use ARCHITECT to design and de-risk, then execute via one or more atomic FEATURE/BUGFIX runs.


---

## Input schema

```json
{
  "task": "Task",
  "context": ["ContextItem"]
}
```

with `task.mode` set to `"ARCHITECT"`.

---

## Output schema

```json
{
  "task": "Task",
  "plan": ["PlanStep"],
  "architectureNotes": "string",
  "highLevelCodeChanges": ["CodeChange"],
  "gate": "GateReport"
}
```

- `plan`: multi-step, possibly multi-PR plan.
- `architectureNotes`: rationale, tradeoffs, constraints.
- `highLevelCodeChanges`: may omit `wholeFile` and just use `beforeSnippet`/`afterSnippet` for sketches.

ARCHITECT responses are for human consumption and future FEATURE tasks.

---

## Prompt template (LLM system prompt sketch)

> You are the ARCHITECT mode agent.  
> Your job is to propose a coherent design and phased plan, not to fully implement it.  
> Output structured JSON suitable for future FEATURE tasks.  
> Be explicit about risks, unknowns, and assumptions (put them in `gate.risks`).  
> Return JSON only.
