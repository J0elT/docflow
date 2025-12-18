# Active Prompts (manual loop over playbook v2)

This file is the **only thing you need to open while working with an LLM**.
For full details, see the corresponding mode docs under `playbook_v2/modes/`.

This starter template is **manual-first**: there is no orchestrator to run. You drive SURVEY → PLAN → EXECUTE → TEST → GATE by copy/paste + normal dev commands.

---

## 1. PRD_MODE – Idea → PRD.md

**When to use:** You have an idea or rough notes and want a clean PRD in `PRD.md`.

**Source:** `ai-dev-tasks-main/create-prd.md`

**How to use:**
1. Copy the prompt from `ai-dev-tasks-main/create-prd.md`.
2. Paste your raw idea + any existing PRD content.
3. Let the model draft/refresh the PRD.
4. Edit by hand before committing.

Tip: if you do **not** want a back-and-forth Q&A, include your own answers inline (target user, constraints, success criteria).

---

## 2. TASK_MODE – PRD → task list

**When to use:** PRD exists, but there is no clear task breakdown yet.

**Source:** `ai-dev-tasks-main/generate-tasks.md`

**How to use:**
1. Copy the prompt from `ai-dev-tasks-main/generate-tasks.md`.
2. Paste the relevant slice of the PRD.
3. Let the model propose a list of tasks.
4. Copy the chosen task(s) into `Plan.md` (Task section) and refine by hand.

Rule of thumb: aim for tasks that can be completed with **one** commit and **clear test evidence**.

---

## 3. (Optional) MEMORY_BOOTSTRAP – Durable “domain memory” + run/test ritual

**When to use:** You want higher reliability across many short LLM sessions.

**Source:** `playbook_v2/domain_memory.md` + optional schemas in `playbook_v2/schemas.md` (`DomainMemory`, `MemoryUpdate`).

**How to use:**
1. Read `playbook_v2/domain_memory.md` (initializer + worker pattern + boot ritual).
2. Ask the model to produce a small `DomainMemory` JSON snapshot (inside a Markdown code fence).
3. Paste that snapshot into `Plan.md` as a pinned “memory header” for the project.
4. On each run, include a memory summary as a `ContextItem` with `source: "memory"`.

This is optional, but it prevents “amnesiac intern” behavior.

---

## 4. FEATURE_MODE – Implement a single task

**When to use:** You have **one well-defined task** in `Plan.md` and want help with plan + code + tests.

**Source:** `playbook_v2/modes/FEATURE.md` + product-specific instructions (SoT, Working Agreement).

**How to use (pattern):**
1. In SURVEY, gather (in this order):
   - **memory** summary (what we’re doing + last progress + constraints),
   - the task (from `Plan.md`),
   - the relevant PRD slice,
   - 2–5 relevant files (code/schema/components),
   - any relevant entries in `DECISIONS.md`,
   - any prompt constraints that matter.
2. Copy the FEATURE prompt sketch from `playbook_v2/modes/FEATURE.md`.
3. Paste:
   - the prompt sketch,
   - the input JSON (`{ task, context: ContextItem[] }`).
4. Ask the model to respond with **JSON only** matching `FeatureResponse` in `playbook_v2/schemas.md`.
5. Apply the suggested code manually, adjust to taste, then TEST.
6. Update `Plan.md` with the GateReport and test evidence (paste the output).

---

## 5. BUGFIX_MODE – Fix failing tests / regressions

**When to use:** Tests fail or behavior is wrong after a change.

**Source:** `playbook_v2/modes/BUGFIX.md`

**How to use (pattern):**
1. Collect:
   - the task that caused the change,
   - the failing test output / error (raw text),
   - the relevant code files.
2. Copy the BUGFIX prompt sketch from `playbook_v2/modes/BUGFIX.md`.
3. Paste:
   - the prompt sketch,
   - the input JSON (`{ task, context, testOutput }`).
4. Ask the model for a **minimal, local fix** as **JSON only** matching `BugfixResponse` in `playbook_v2/schemas.md`.
5. Apply manually, re-run tests, update `Plan.md` and `gate.risks` if needed.

---

## 6. AI_FEATURE_MODE – Work focused on AI behavior

**When to use:** You are changing prompts/models/LLM behaviors, not core business logic.

**Source:** `playbook_v2/modes/AI_FEATURE.md`

**How to use:**
- Same pattern as FEATURE_MODE, but with extra emphasis on:
  - prompt construction,
  - model parameters,
  - timeouts/error handling,
  - PII safety and logging.
- Output is still `FeatureResponse` JSON (see `playbook_v2/schemas.md`).

---

## 7. ARCHITECT_MODE – Design and refactors

**When to use:** You need a phased plan and tradeoffs, not direct implementation.

**Source:** `playbook_v2/modes/ARCHITECT.md`

**How to use:**
- Include memory + PRD + constraints + relevant code.
- Ask for **JSON only** per `ARCHITECT.md`.
- Convert the result into smaller FEATURE tasks (atomic progress).

---

## 8. JUDGE_MODE – Self-audit / evaluation (optional)

**When to use:** You have a proposed implementation + test output and want an independent critique.

**Source:** `playbook_v2/modes/JUDGE.md` + `playbook_v2/evals_and_judges.md`

**How to use:**
1. Provide:
   - the task,
   - the FEATURE/BUGFIX output JSON,
   - raw test output (what was run, what passed/failed).
2. Ask the model to return **JSON only**: `EvalReport`.
3. Treat output as a **second opinion**, not truth. Fix anything that clearly needs evidence.

---

## 9. Context discipline (SURVEY seed)

Whenever you call an LLM for FEATURE/BUGFIX/AI_FEATURE:

- Always include:
  - a **memory** ContextItem (what we’re doing + last progress + constraints),
  - PRD slice,
  - Working Agreement / SoT as needed,
  - schema/migrations for affected data,
  - current `Plan.md` section (Task + latest GateReport),
  - any relevant entries in `DECISIONS.md`,
  - the actual target files (code + tests).
- Keep snippets bounded; **don’t invent unseen code**.
- If SoT is missing, bootstrap it first (PRD_MODE → TASK_MODE → Plan entry).

---

## 10. Notes

- **Manual mode:** all loops are manual SURVEY→PLAN→EXECUTE→TEST→GATE.
- **Logging (optional):** you may log runs as NDJSON per `playbook_v2/telemetry_and_logs.md`.
- **Schema-first:** prefer structured JSON responses matching the relevant schema. If the model drifts, re-ask with stricter “JSON only” instructions.
- **Risks:** unknowns and assumptions must be recorded in `gate.risks`, not buried in prose.
