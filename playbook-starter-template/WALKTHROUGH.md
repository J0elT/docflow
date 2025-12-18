# How to use this starter

This starter is an operating manual + durable artifacts for AI-assisted delivery. It is **manual-first**: there is nothing to “run” besides your normal dev commands.

## First run (grab-and-go path)

1) **Copy the scaffold into your repo**
- Copy the contents of `playbook-starter-template/` into your project repo root.
- Commit the baseline files so future runs have stable references.

2) **Clean zip cruft (if present)**
- Delete `__MACOSX/` and any `.DS_Store` files.
- Recommended one-liner (safe to run at repo root):

```bash
find . -name "__MACOSX" -type d -prune -exec rm -rf {} + && find . -name ".DS_Store" -type f -delete
```

3) **Create your SoT (source of truth) before coding**
- **PRD:** use `ai-dev-tasks-main/create-prd.md` to draft a PRD and save it as:
  - `PRD.md` (simple), or
  - `tasks/0001-prd-<feature>.md` (versioned PRDs).
- **Task list:** use `ai-dev-tasks-main/generate-tasks.md` to generate a task list and save it as `tasks/tasks-<prd-file-name>.md`.
- **Decisions:** add any non-negotiable constraints in `DECISIONS.md` (append-only).
- **Prompts:** confirm `prompts.md` lists which prompts you’ll actually use and any product-specific instructions.

Commit these SoT files. The whole point is that future runs can re-ground reliably.

4) **Pick one atomic task**
Choose a single checkbox item from `tasks/tasks-*.md` that:
- can be completed in one PR/commit, and
- has observable evidence (tests or explicit manual checks).

Copy it into `Plan.md` as a `Task` object + initial `PlanStep[]` + `TestSpec[]` (see templates in `Plan.md`).

5) **Run the loop (SURVEY → PLAN → EXECUTE → TEST → GATE)**
- **SURVEY:** gather context (see `playbook_v2/context_retrieval.md`). Start with a **memory** summary first (what we’re doing, what changed last run, constraints).
- **PLAN:** pick the correct mode prompt from `playbook_v2/modes/` and ask for **JSON only**.
- **EXECUTE:** apply changes manually (small diffs; reversible).
- **TEST:** run the commands from `TestSpec[]`; paste raw output into the record.
- **GATE:** write/refresh a `GateReport` in `Plan.md`. Unknowns and risks must be recorded in `gate.risks`.

6) **Repeat**
Each new change is a new loop. Keep your SoT updated; treat `Plan.md` and `DECISIONS.md` as append-only memory.

---

## Optional reliability layer: domain memory + boot ritual

If you are doing more than one or two runs, read:

- `playbook_v2/domain_memory.md`

It introduces an initializer + worker pattern and a per-run boot ritual that prevents “amnesiac agent” behavior. It is optional, but it measurably improves consistency.

---

## Checklists

These mirror the recommended “re-grounding” protocol.

### Before first task

- [ ] PRD exists and is specific enough to test.
- [ ] Task list exists (with clear atomic items).
- [ ] `Plan.md` has a starter entry with a single Task.
- [ ] `DECISIONS.md` captures any constraints you must not violate.
- [ ] You know the baseline run/test commands for the repo.

### Per task boot ritual

- [ ] Read the PRD slice for the task.
- [ ] Read the task list section and pick **one** item.
- [ ] Read the latest `Plan.md` entry (what happened last run).
- [ ] Read `DECISIONS.md` for constraints.
- [ ] Build a `ContextItem[]` bundle (include a `source: "memory"` summary first).
- [ ] Run/confirm baseline checks (at least lint/unit tests) before claiming “green”.
- [ ] Implement one change, run tests, then update the plan + gate.

### Before merge

- [ ] Tests run match the `TestSpec[]` you claimed.
- [ ] `GateReport.overallStatus` is `pass` or `needs_review` with explicit `gate.risks`.
- [ ] If risks are material, run JUDGE (`playbook_v2/modes/JUDGE.md`) and address `mustFix`.
- [ ] SoT updated (Plan/Decisions/Prompts) so the next run starts grounded.

---

## Repo hygiene note (recommended)

Because these templates are often copied from ZIPs, add this snippet to your project’s `.gitignore` (if you have one):

```gitignore
# macOS
.DS_Store
__MACOSX/
```

Do **not** create a `.gitignore` just for this starter if your repo doesn’t already have one; treat this as a reminder snippet.

---

## What the SoT pieces are

- **PRD:** product/feature requirements (problem, goals, user stories, functional requirements, non-goals, success metrics, open questions).
- **Tasks:** backlog derived from the PRD (`tasks/tasks-*.md`).
- **Plan log:** append-only run log with Task, PlanSteps, CodeChanges, Tests, and GateReports (`Plan.md`).
- **Decisions:** append-only decision journal (`DECISIONS.md`).
- **Prompts:** which prompts are “in force” for the repo (`prompts.md`).
- **Schema/migrations:** data definitions (prevents schema guessing).
- **Shared UI patterns/tokens:** prevents the agent from inventing a new design system.

---

## For a tighter (10/10) setup

- Validate LLM outputs against the schemas in `playbook_v2/schemas.md` (even if only by spot-checking JSON validity).
- Keep progress atomic and observable: one item per run, tied to tests.
- Default telemetry: NDJSON logging (`playbook_v2/telemetry_and_logs.md`) and occasional JUDGE runs (`playbook_v2/evals_and_judges.md`).
