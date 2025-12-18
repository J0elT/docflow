# AI_FEATURE Mode

AI_FEATURE mode is like FEATURE but specifically for LLM-powered functionality
(e.g., chat endpoints, embeddings, summarization jobs).

It reuses the same schema as `FeatureResponse` but may add AI-specific notes.


## Manual mode note

This starter template is manual-first: you provide the input JSON and apply changes yourself.


---

## Input schema

Same as FEATURE:

```json
{
  "task": "Task",
  "context": ["ContextItem"]
}
```

with `task.mode` set to `"AI_FEATURE"`.

---

## Output schema

Same shape as `FeatureResponse` in `FEATURE.md`:

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

Additional guidance for AI_FEATURE:

- Be explicit about:
  - Model names and configuration (temperature, max tokens).
  - Error handling and timeouts.
  - Logging and PII safety.
- Prefer configuration via environment variables and a central `lib/llm.ts` helper.
- Add tests around prompt construction and endpoint behavior (mocking the LLM).

---

## Prompt template (LLM system prompt sketch)

> You are the AI_FEATURE mode coding agent in a Vibe Coding software factory.  
> You implement or modify LLM-powered features on a Next.js + Supabase stack.  
> Follow the same structure as FEATURE, but call out AI-specific risks in `gate.risks`.  
> Never hard-code secrets or API keys; assume they come from environment variables.  
> Return JSON only (`FeatureResponse`).
