# Active Prompts (manual loop over playbook v2)

This file is the **only thing you need to open while working with an LLM**.
For full details, see the corresponding mode docs under `playbook_v2/modes/`.

This repo is **manual-first**: there is no orchestrator to run. You drive SURVEY → PLAN → EXECUTE → TEST → GATE by copy/paste + normal dev commands.

---

## 1) PRD_MODE — Idea → `PRD.Next.md`

**When to use:** You have rough notes and want a crisp PRD update.

**Source:** `ai-dev-tasks-main/create-prd.md`

**How to use:**
1. Copy the prompt from `ai-dev-tasks-main/create-prd.md`.
2. Paste your raw idea + any existing PRD content.
3. Let the model draft/refresh `PRD.Next.md`.
4. Edit by hand before committing.

---

## 2) TASK_MODE — PRD → task list (`tasks/tasks-*.md`)

**When to use:** PRD exists, but there is no clear task breakdown yet.

**Source:** `ai-dev-tasks-main/generate-tasks.md`

**How to use:**
1. Copy the prompt from `ai-dev-tasks-main/generate-tasks.md`.
2. Paste the relevant slice of `PRD.Next.md`.
3. Let the model propose tasks.
4. Save the chosen tasks to `tasks/tasks-*.md` (atomic checkboxes).

Rule of thumb: aim for tasks that can be completed with **one** commit and **clear test evidence**.

---

## 3) (Optional) MEMORY_BOOTSTRAP — Durable “domain memory” + boot ritual

**When to use:** You want higher reliability across many short LLM sessions.

**Source:** `playbook_v2/domain_memory.md` + optional schemas in `playbook_v2/schemas.md` (`DomainMemory`, `MemoryUpdate`).

---

## 4) FEATURE_MODE — Implement one task

**Source:** `playbook_v2/modes/FEATURE.md` + `v2docflowprompt.md`

**Why:** New feature work; enforces SURVEY→PLAN→EXECUTE→TEST→GATE and schema’d outputs (`PlanStep`, `CodeChange`, `TestSpec`, `GateReport`) with honesty about unseen code.

---

## 5) BUGFIX_MODE — Fix failing tests / regressions

**Source:** `playbook_v2/modes/BUGFIX.md` + `v2docflowprompt.md`

**Why:** Scoped fixes with targeted context, explicit tests, and a gate.

---

## 6) AI_FEATURE_MODE — Prompt/model behavior changes

**Source:** `playbook_v2/modes/AI_FEATURE.md` + `v2docflowprompt.md`

---

## 7) ARCHITECT_MODE — Design and refactors

**Source:** `playbook_v2/modes/ARCHITECT.md`

---

## 8) JUDGE_MODE — Self-audit / evaluation (optional)

**Source:** `playbook_v2/modes/JUDGE.md` + `playbook_v2/evals_and_judges.md`

---

## 9) Context discipline (SURVEY seed)

Whenever you call an LLM for FEATURE/BUGFIX/AI_FEATURE:
- Always include: a **memory** summary (even if informal), the task (from `Plan.md`), the relevant PRD slice, 2–5 relevant files, relevant `DECISIONS.md` entries, and the latest `GateReport` if present.
- Keep snippets bounded; **don’t invent unseen code**.
- Prefer schema-first outputs; validate and handle failures explicitly.

---

## 10) Files page chat agent

**Source:** `v2docflowprompt.md` (Files page chat assistant section)

**Why:** Cross-document Q&A with structured filters + semantic search + aggregation + tasks + bundling + category reorganizing; clarify-first, provenance-rich responses.
