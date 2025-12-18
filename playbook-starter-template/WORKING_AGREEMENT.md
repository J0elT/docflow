# Working Agreement — Starter (Product-agnostic)

## Purpose

Deliver features against a clear Source of Truth (SoT) through a repeatable, auditable
SURVEY → PLAN → EXECUTE → TEST → GATE loop — without scope drift or wishful thinking.

## Manual mode vs optional orchestrator

This starter template is **manual-first**:

- You (a human) run the loop using normal dev commands and copy/paste prompts.
- There is **no orchestrator** included here.

Some docs mention an “orchestrator” as an optional concept. Treat those references as **future automation**, not something you should install or assume exists.

## Sources of Truth (SoT)

Before execution, the SoT must exist and be referenced during SURVEY:

- **PRD:** requirements + constraints (`PRD.md` or versioned PRDs under `tasks/`).
- **Task list:** backlog of atomic work items (`tasks/tasks-*.md`).
- **Plan log:** append-only run log (`Plan.md`).
- **Decision journal:** append-only constraints/tradeoffs (`DECISIONS.md`).
- **Prompts registry:** active prompts and product-specific instructions (`prompts.md`).
- **Design guardrails:** tokens/components/styles (repo-specific).
- **Data model:** schema/migrations/RLS/policies (repo-specific).

If any of these are missing, bootstrap them **before** making code changes.

## Non-negotiable behavior rules

1) **Do not invent unseen code**
- If a file/section is not provided, it is unknown.
- Request the missing context or make a minimal change that doesn’t depend on guessing.

2) **Tests are the source of truth**
- “Done” requires evidence: test output and/or explicit manual checks.
- Never claim tests pass without capturing raw output.

3) **Atomic progress**
- One backlog item / one clear slice per run.
- Prefer many small, test-tied commits over one giant speculative rewrite.

4) **Risks must be explicit**
- Unknowns, assumptions, and risks go in `gate.risks` (do not bury them in prose).
- If risks are material, set `GateReport.overallStatus = "needs_review"` (or `"fail"`) and/or trigger JUDGE.

5) **Schema discipline**
- When a mode prompt asks for JSON, return **JSON only** (no markdown, no code fences).
- If the model drifts, re-ask: “Return ONLY valid JSON for <SchemaName>.”

## How to run a task (manual loop)

1) **Prep SoT**
- Confirm PRD + tasks exist.
- Confirm any relevant decisions/prompts exist.
- Confirm baseline run/test commands.

2) **Capture the task**
- Create a `Task` entry in `Plan.md` for one atomic item.

3) **SURVEY**
- Read SoT first (PRD, tasks, Plan, Decisions, prompts).
- Build a small `ContextItem[]` bundle (see `playbook_v2/context_retrieval.md`).
- Include a `ContextItem` with `source: "memory"` summarizing the state.

4) **PLAN**
- Choose the correct mode prompt under `playbook_v2/modes/`.
- Ask for a plan (`PlanStep[]`), minimal diffs (`CodeChange[]`), tests (`TestSpec[]`), and a gate (`GateReport`).

5) **EXECUTE**
- Apply changes manually.
- Keep diffs small and reversible.

6) **TEST**
- Run the commands from `TestSpec[]`.
- Paste raw output into `Plan.md` (or logs).

7) **GATE**
- Write `GateReport` with explicit status + risks + tests run/planned + manual checks.

8) **Update durable state**
- Mark task list checkbox if appropriate.
- Append durable decisions to `DECISIONS.md`.
- Update `prompts.md` if the “active prompt set” changed.
- (Optional) append a `MemoryUpdate` if you maintain DomainMemory.

9) **Optional: JUDGE**
- If risks are material or evidence is weak, run JUDGE and address `mustFix`.

---

## Checklists

### Before first task

- [ ] PRD exists and has testable acceptance criteria.
- [ ] Task list exists and items are atomic.
- [ ] `Plan.md` has an initial entry for one task.
- [ ] `DECISIONS.md` captures any constraints that must not be violated.
- [ ] `prompts.md` reflects the active prompt set.
- [ ] You know the baseline commands (install/lint/test/build).

### Per task boot ritual

- [ ] Read PRD slice + constraints.
- [ ] Read task list section; pick **one** item.
- [ ] Read latest `Plan.md` entry.
- [ ] Read relevant `DECISIONS.md` entries.
- [ ] Build `ContextItem[]` including a `source: "memory"` summary first.
- [ ] Run/confirm baseline checks before making claims about “green”.
- [ ] Implement one change; run tests; update Plan + Gate.

### Before merge

- [ ] Test commands run match what’s listed in `TestSpec[]`.
- [ ] Gate status is `pass` or `needs_review` with explicit `gate.risks`.
- [ ] Any `mustFix` items from JUDGE are resolved (or explicitly accepted with rationale).
- [ ] SoT updated (Plan/Decisions/Prompts) so the next run starts grounded.
