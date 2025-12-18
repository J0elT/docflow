# Context Retrieval (SURVEY Step)

This playbook uses `ContextItem[]` as the atomic “context bundle” you pass into mode agents.

## Manual mode vs optional orchestrator

- **Manual mode (this repo):** you build `ContextItem[]` by copy/pasting the *minimum* repo + SoT slices needed to do the task safely.
- **Optional orchestrator concept (not included):** a harness can implement `RetrieveContext(Task, repoState) -> ContextItem[]` using heuristics. The second half of this doc sketches that idea, but nothing here requires code.

`ContextItem` is defined in `schemas.md`.

---

## ContextItem schema

```json
{
  "source": "code | docs | tests | issues | memory",
  "path": "string",
  "snippet": "string",
  "relevanceScore": 0.0,
  "notes": "string"
}
```

---

## Manual SURVEY protocol (recommended)

The biggest failure mode in agent workflows is **starting ungrounded**. Prevent that by always retrieving **memory artifacts first**, then code.

### 1) Always include a memory ContextItem (orientation header)

Create one `ContextItem` that summarizes the durable state:

- What backlog item / acceptance criteria are we working on?
- What was the last progress + what’s still failing?
- What constraints/decisions must not be violated?
- What test commands count as evidence?

Example:

```json
{
  "source": "memory",
  "path": "Plan.md + tasks/tasks-*.md (summary)",
  "snippet": "Working on tasks item 1.2. Last run added DB column; tests failing due to missing fixtures. Constraints: do not guess schema; unknowns go into gate.risks. Evidence: pnpm lint + pnpm test.",
  "relevanceScore": 1.0,
  "notes": "Boot ritual summary."
}
```

### 2) Include SoT slices

- PRD slice that defines the behavior (“what done means”).
- The relevant task list section (so the agent doesn’t redefine the backlog).
- Any relevant decision entries.
- Any product prompts that constrain behavior (see `../prompts.md`).

### 3) Include the *actual* target files

- The 2–5 repo files you expect to touch (or that define the behavior).
- The most relevant test file(s) near those files.
- If BUGFIX: the failing `testOutput` text (as `testOutput` in BUGFIX input, or as a `ContextItem` if needed).

### 4) Keep it bounded

- Prefer 5–20 `ContextItem`s.
- If a file is large, include only the relevant region and note what was omitted.

### 5) Unknowns must surface as risks

If you suspect missing context, you don’t guess. You:
- request the missing file/section, and/or
- record the uncertainty in `gate.risks` (mode output), and/or
- block merge until evidence exists.

---

## Optional orchestrator sketch (not included)

If you later build a harness, a simple heuristic strategy (no vector DB) works well:

1. **Seed from Task metadata**
   - If `task.metadata.targetFiles` exists, include those files first.
2. **Include default key files**
   - repo config (`package.json`, `tsconfig.json`, etc.)
   - app entry points / routing
   - data schema/migrations (Supabase/Prisma/etc.)
3. **Include tests**
   - tests adjacent to target files and any failing tests
4. **Rank and limit**
   - direct target files: ~0.9
   - same directory: ~0.7
   - global config: ~0.5
   - limit to N (e.g., 20)

**Notes for agents**

- `ContextItem.snippet` is always partial. Do not assume full-file knowledge.
- If you need more context, say so and put the unknown in `gate.risks`.
