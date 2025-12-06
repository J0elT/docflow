# Active Prompts (playbook v2, manual loop)

## FEATURE / general build
- Source: `playbook_v2/modes/FEATURE.md` + `v2docflowprompt.md`
- Why: New feature work; enforces SURVEY→PLAN→EXECUTE→TEST→GATE, schema’d outputs (PlanStep, CodeChange, TestSpec, GateReport), and honesty about unseen code.

## BUGFIX
- Source: `playbook_v2/modes/BUGFIX.md` + `v2docflowprompt.md`
- Why: Regressions/defects; scoped fixes with targeted context, explicit tests, and gate.

## ARCHITECT (when needed)
- Source: `playbook_v2/modes/ARCHITECT.md`
- Why: Upfront design decisions or larger refactors; produces options/risks before coding.

## JUDGE (optional self-check)
- Source: `playbook_v2/modes/JUDGE.md`
- Why: Self-eval on plan quality, code safety, test coverage, gate honesty (used when we want a retro/score).

## Context discipline (SURVEY seed)
- Always include: `PRD.Next.md`; `globals.css` + shared UI (DocumentTable, UploadForm); Supabase schema/migrations; `v2docflowprompt.md`; `DECISIONS.md`; relevant target files; current `Plan.md` section.
- Keep snippets bounded; don’t invent unseen code.

## Notes
- Orchestrator: not used. Manual SURVEY→PLAN→EXECUTE→TEST→GATE only.
- Logging: optional NDJSON per `playbook_v2/telemetry_and_logs.md`; use `playbook_v2/evals_and_judges.md` rubric when helpful.
- If SoT is missing: create PRD via `~/Downloads/ai-dev-tasks-main/create-prd.md`, generate tasks via `~/Downloads/ai-dev-tasks-main/generate-tasks.md`, and stub `DECISIONS.md`/`prompts.md` before starting SURVEY.
- Prefer schema-first LLM responses and validate against expected JSON shapes (e.g., extraction JSON, playbook_v2 schemas) before consuming; handle validation failures explicitly.
