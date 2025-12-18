# Decision log (append-only)

This file is a durable “decision journal”. Record choices that constrain future work:
architecture, data models, API contracts, security posture, style conventions, tool choices, etc.

Decisions should be:
- **append-only** (don’t rewrite history),
- **specific** (what changed, why),
- **linked** (to PRs/commits/Plan entries when possible).

---

## Table (quick index)

| Date | Decision | Rationale | Links |
|---|---|---|---|
| YYYY-MM-DD | … | … | … |

---

## Template: decision record (copy/paste)

## YYYY-MM-DD — <Decision title>

**Context**
- What problem forced a decision?
- What constraints apply (from PRD/SoT)?

**Options considered**
- Option A: …
- Option B: …
- (Optional) Option C: …

**Decision**
- We will: …

**Consequences**
- Good: …
- Tradeoffs: …
- Follow-ups: …

**Risks / unknowns**
- If something is uncertain, name it explicitly (and reflect it in `gate.risks` for the related task).

**Evidence**
- Tests run / validation performed:
  - …

**Links**
- Plan entry: `Plan.md#...`
- PR/commit: …
- Relevant docs: …
