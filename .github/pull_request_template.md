## Summary

<!-- What changed and why (1–3 sentences). -->

## SoT links

- PRD slice: (link to `PRD.Next.md` section)
- Backlog item: (link to checkbox in `tasks/tasks-*.md`)
- Plan entry: (link to entry in `Plan.md`)

## Evidence

### Tests run (paste raw output or link to CI)

- `npm run check:playbook`
- `npm run lint`
- `npm run test`

### Manual checks (if applicable)

- [ ] Upload + process a real letter
- [ ] Verify loading/error/empty states for changed UI

## Gate / risks / rollback

- Gate status (`Plan.md`): pass / needs_review / fail
- Risks:
  - …
- Rollback:
  - …

## Process checklist

- [ ] `Plan.md` updated (Task/PlanSteps/TestSpec/GateReport + evidence)
- [ ] `DECISIONS.md` appended (only if a choice became sticky)
- [ ] `prompts.md` updated (only if active prompt set changed)
- [ ] `v2docflowprompt.md` updated (only if DocFlow prompt behavior changed)
- [ ] `tasks/tasks-*.md` updated (only if scope/backlog changed)

<!-- CI enforces that `Plan.md` is updated on PRs unless you add the `skip-plan` label (for truly trivial changes). -->
