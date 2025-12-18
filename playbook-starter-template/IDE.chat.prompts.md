# IDE Chat Prompts (minimal ask)

Use these one-liners. You only state the task; Codex handles SURVEY→PLAN→EXECUTE→TEST→GATE, picks files/tests, and updates Plan/Decisions/prompts as needed.

## Feature / UI change
“Codex, apply the Working Agreement to [task]. Use FEATURE_MODE. SoT: PRD.Next.md, tasks/tasks-*.md, Plan.md, DECISIONS.md, prompts.md, v2docflowprompt.md. Figure out relevant files/tests during SURVEY. Update Plan.md + DECISIONS if needed.”

## Bugfix
“Codex, apply the Working Agreement to [bugfix]. Use BUGFIX_MODE. SoT: failing test/output + Plan.md + DECISIONS.md + prompts.md + v2docflowprompt.md. Figure out files/tests. Update Plan.md + DECISIONS if needed.”

## Prompt/model change
“Codex, apply the Working Agreement to [prompt/model change]. Use AI_FEATURE_MODE. SoT: PRD.Next.md, Plan.md, DECISIONS.md, prompts.md, v2docflowprompt.md. Figure out files/tests. Update Plan.md + DECISIONS if the prompt set changes.”

## Architect / design refactor
“Codex, apply the Working Agreement to [design/refactor]. Use ARCHITECT_MODE. SoT: PRD.Next.md, Plan.md, DECISIONS.md, prompts.md. Figure out artifacts/tests. Update Plan.md; no code unless agreed.”

## Self-audit
“Codex, apply the Working Agreement in JUDGE_MODE on [PR/task]. SoT: Plan.md entry + test output + relevant files. Return EvalReport; call out must-fix.”

## Trivial (skip Plan)
“Codex, trivial change [describe]. Label PR ‘skip-plan’ if used; otherwise update Plan.md. SoT: [files]. Tests: lint if relevant.”
