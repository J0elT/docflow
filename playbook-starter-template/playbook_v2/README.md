# Vibe Coding – Agent Playbook v2

This folder defines a schema-first, Markdown-based Agent Playbook for AI-assisted software delivery.

## Manual mode vs optional orchestrator

This starter template is **manual-first**: there is **no orchestrator CLI** included here. You run the loop by copy/pasting prompts into your LLM of choice and applying changes yourself.

- **Manual mode (this repo):** a human drives SURVEY → PLAN → EXECUTE → TEST → GATE. Nothing is “running” in the background besides your normal dev commands (tests, lint, build).
- **Optional orchestrator concept (not included):** if you later build a harness/CLI/CI job, these schemas and mode contracts are designed to be machine-consumable. This repo does **not** ship orchestrator code or folders.

Related docs:
- `../prompts.md` — the “open-this-while-working” index of prompts and how to run the loop manually.
- `domain_memory.md` — an **optional reliability layer**: persistent domain memory + a boot ritual (inspired by the “agents need memory + harness” pattern).

## Tech stack assumptions (example, not required)

These assumptions reflect a common “vibe coding” stack, but the playbook itself is stack-agnostic.

- Target apps: Next.js + TypeScript + React + Tailwind, deployed on Vercel.
- Database: Supabase (Postgres).
- Backend: Next.js API routes / server components.

## Core ideas

- Follow the SURVEY → PLAN → EXECUTE → TEST → GATE loop for every task.
- Use structured JSON for agent-facing inputs/outputs (schemas live in `schemas.md`).
- Keep agents honest and grounded via the Working Agreement:
  - Don’t fabricate unknown code.
  - Be explicit about uncertainty.
  - Prefer small, safe changes over large, risky ones.
  - Put unknowns and risks in `gate.risks` (don’t hand-wave).

## Key components in this Playbook

- `schemas.md`: Canonical JSON shapes (Task, PlanStep, CodeChange, TestSpec, GateReport, …) + optional DomainMemory schemas.
- `modes/*.md`: Mode-specific contracts and prompt sketches (FEATURE, BUGFIX, AI_FEATURE, ARCHITECT, JUDGE).
- `context_retrieval.md`: How to build `ContextItem[]` during SURVEY (manual protocol first; optional orchestrator sketch second).
- `telemetry_and_logs.md`: NDJSON log format (works manually or in a harness).
- `evals_and_judges.md`: Eval and Judge flow and schemas.
- `ci_integration.md`: How an optional harness could plug into CI.

## High-level flow (v2)

### Manual mode (this repo)

1. **SURVEY** – You assemble:
   - a `Task` (from `Plan.md`),
   - a small `ContextItem[]` bundle (PRD slice, decisions, prompts, relevant files),
   - optional memory artifacts (see `domain_memory.md`).
2. **PLAN** – A mode agent (e.g. FEATURE) returns JSON: `PlanStep[]`, `CodeChange[]`, `TestSpec[]`, `GateReport` (and optional `MemoryUpdate`).
3. **EXECUTE** – You apply the changes (manually), keeping diffs small and reversible.
4. **TEST** – You run the specified commands and capture the output.
5. **GATE** – You write/refresh the `GateReport` in `Plan.md`. If anything is uncertain, add it to `gate.risks` and/or trigger JUDGE.

### Optional orchestrator concept (not included)

If you later build an orchestrator/harness, it can automate the same loop:

1. Build `Task` + retrieve `ContextItem[]`.
2. Call mode agent → parse JSON output.
3. Apply `CodeChange[]`.
4. Run tests.
5. Persist `LogEntry` / optional memory updates; optionally call JUDGE.

This template intentionally stops at the **contracts and operating manual**; it does not provide the harness implementation.

## Change summary (template update 2025-12-12)

- Removed “phantom orchestrator” implications and made **manual mode** unambiguous across docs.
- Added `domain_memory.md` (optional reliability layer: persistent domain memory + boot ritual).
- Extended `schemas.md` with canonical `FeatureResponse`/`BugfixResponse` plus optional `DomainMemory` + `MemoryUpdate` schemas.
- Upgraded walkthrough, plan, and decision templates with copy/pastable skeletons and checklists for atomic, test-tied progress.

## Notes (assumptions used in this template)

- This repository remains **Markdown-only**; any JSON is shown only inside Markdown code fences.
- “Memory” is implemented as durable artifacts you already keep (PRD, tasks, Plan, Decisions, prompts), not as a long-running agent session.
