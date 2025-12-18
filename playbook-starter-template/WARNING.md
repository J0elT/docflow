# Playbook Starter Template

This folder is product-agnostic scaffolding for a new repo. Copy it into your project and then run the process **manually** (SoT, plans, decisions, prompts) with your normal dev workflow.

## Important

- This starter is **manual-first**: there is **no orchestrator** included or required.
- Some docs describe an optional “orchestrator/harness” concept. Treat that as future automation, not something you should install or assume exists.
- If you want higher reliability across many short LLM sessions, see the optional memory + boot ritual layer: `playbook_v2/domain_memory.md`.

## Included

- Working Agreement + checklists (`WORKING_AGREEMENT.md`).
- Plan and Decisions templates aligned to playbook v2 schemas (`Plan.md`, `DECISIONS.md`).
- Prompt index (`prompts.md`).
- PRD stub and tasks stub (`PRD.md`, `tasks/`).
- `ai-dev-tasks-main/` guides (create PRD, generate tasks).
- `playbook_v2/` schemas/modes/context retrieval/logging/evals docs.

Reminder: update your SoT (PRD, design tokens, schema, key components) before running tasks.
