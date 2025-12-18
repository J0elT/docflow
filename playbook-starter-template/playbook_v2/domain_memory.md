# Domain Memory & Harness Ritual (Optional Reliability Layer)

This playbook works in **manual mode** without any orchestrator. However, long-running agent workflows fail for a predictable reason: each session starts “amnesiac” unless you give it a **persistent, structured state** to orient to.

This doc describes an **optional** reliability layer inspired by the “initializer + worker” pattern:

- **Initializer**: turns a prompt into durable “memory artifacts” + rules of engagement.
- **Worker**: repeatedly reads memory, makes **one test-tied change**, updates memory, commits, and stops.
- **Harness ritual**: a boot protocol that forces orientation → atomic progress → tests → explicit state updates.

You can do all of this **manually** with the artifacts already in this starter.

---

## What “domain memory” means here

**Domain memory** is a durable, structured representation of “where the work stands”:

- What are we building (goals, non-goals, constraints)?
- What items are left (backlog), and which are passing/failing?
- What was tried, what broke, what was reverted?
- How do we run and test the system?
- What counts as “done” (tests + observable checks), not vibes.

It is not “the model remembers”. It’s **the repo remembers**.

---

## Memory artifacts that already exist in this repo

You don’t need a database. Use the files you already keep:

- **PRD** (`../PRD.md` or `../tasks/0001-prd-*.md`): goals, requirements, constraints.
- **Task list** (`../tasks/tasks-*.md`): backlog/feature list (checkboxes are a simple “status” system).
- **Plan log** (`../Plan.md`, append-only): per-run plan, diffs, tests, gate report, and outcomes.
- **Decision log** (`../DECISIONS.md`, append-only): irreversible choices + rationale.
- **Prompt registry** (`../prompts.md`): which prompts are “in force” for this repo/product.

Optionally, you can also keep a **DomainMemory JSON snapshot** inside `Plan.md` as a pinned “state header” (see `schemas.md` for the optional schema).

---

## Initializer agent (one-time bootstrap)

**Goal:** transform a vague prompt into durable artifacts that a worker agent can reliably pick up later.

In this starter, you can run an initializer pass by doing:

1. **Create/refresh PRD** (PRD_MODE) → save to `PRD.md` or `tasks/0001-prd-*.md`.
2. **Generate tasks/backlog** (TASK_MODE) → save to `tasks/tasks-*.md`.
3. **Define the run/test ritual**:
   - What commands must always run (lint/unit/integration/e2e)?
   - What is “minimum test evidence” before marking an item done?
4. **Set rules of engagement** (Working Agreement):
   - Atomic progress (one backlog item per run).
   - Unknowns/risk go into `gate.risks`, never implied away.
5. **(Optional) Pin a DomainMemory snapshot** in `Plan.md`:
   - constraints, backlog items, and “how to run tests”.

The initializer doesn’t need long-lived memory. Its output **is** the memory.

---

## Worker agent (repeated, per run)

**Goal:** behave like a disciplined engineer: orient → change → test → update state → stop.

Per run, the worker should:

1. **Boot ritual (orientation)**
   - Read memory artifacts (PRD, tasks, most recent Plan entry, Decisions, prompts).
   - Read recent progress (what changed last run; what failed; what’s pending).
   - Run baseline checks (or confirm which checks are already passing/failing).
2. **Pick exactly one item**
   - One task checkbox / one acceptance criterion / one failing test cluster.
3. **Implement**
   - Make the smallest change that advances that one item.
4. **Test end-to-end**
   - Run the commands in `TestSpec[]`.
   - Do not claim “tests pass” without pasted output.
5. **Update memory**
   - Mark task checkbox status (if applicable).
   - Append a `Plan.md` entry (what changed, what tests ran, outcome).
   - If something is uncertain, add it to `gate.risks`.
6. **Commit**
   - Make progress durable in Git, then stop.

---

## Harness ritual (manual protocol)

Even without a harness, you can enforce the same discipline.

### Per-task boot ritual (copy/paste checklist)

- [ ] Read `PRD.md` (or the relevant PRD section) and confirm the target behavior.
- [ ] Read `tasks/tasks-*.md` and pick **one** unchecked item.
- [ ] Read the most recent entry in `Plan.md` (what just happened).
- [ ] Read `DECISIONS.md` for constraints you must not violate.
- [ ] Read `prompts.md` (active prompts + any product-specific prompt SoT).
- [ ] Build a `ContextItem[]` bundle (see `context_retrieval.md`) including a **memory** ContextItem summarizing the above.
- [ ] Run/confirm baseline checks (at least lint + unit tests) *before* making claims about “green”.

### After execution (state update ritual)

- [ ] Run the tests you promised in `TestSpec[]` and paste output into the record.
- [ ] Append to `Plan.md`: Task, PlanSteps, CodeChanges, Tests, GateReport.
- [ ] If you learned something durable, append to `DECISIONS.md`.
- [ ] If you used prompts or changed prompts, update `prompts.md`.
- [ ] Mark the one backlog item as done **only when** test evidence exists.

---

## Schema enforcement & output checking

To keep outputs machine-checkable (even manually):

- Ask the model to return **JSON only** (no markdown, no code fences).
- If output is not valid JSON:
  - Reply with “Return ONLY valid JSON for <SchemaName>. No commentary.”
- If something is unknown:
  - It must appear in `gate.risks` (not hidden in prose).

Optional schemas that support this layer live in `schemas.md`:
- `DomainMemory` (snapshot)
- `MemoryUpdate` (per-run update)

---

## When to trigger JUDGE

Trigger JUDGE when any of these are true:

- The change is “done” but the `GateReport` has non-trivial risks.
- Tests are incomplete, flaky, or hard to interpret.
- The task touches auth, data integrity, billing, security, or migrations.
- You suspect the agent is rationalizing instead of proving.

JUDGE is a **second opinion**, not a truth oracle. Treat `mustFix` as merge-blockers until proven otherwise.

---

## Example: memory as a ContextItem

When sending context to a mode agent, include a memory summary as a first-class `ContextItem`:

```json
{
  "source": "memory",
  "path": "Plan.md + tasks/tasks-*.md (summary)",
  "snippet": "Selected backlog item 1.2: 'Render status badge'. Last run added status column migration; pnpm test failing in TasksPage tests due to missing fixtures. Constraints: no schema guessing; update gate.risks for unknown enum values.",
  "relevanceScore": 1.0,
  "notes": "Domain memory snapshot for orientation."
}
```
