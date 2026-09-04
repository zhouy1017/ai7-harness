# Current checkpoint

## What's done

- Repository-development dispatch is rebound from Codex to Claude Code under ADR 0060: fixed Claude Code bindings, fresh top-level Task Sessions in isolated `.claude/worktrees/<name>` worktrees, schema-v2 receipts, and a Dispatch Register over Claude desktop session tools.
- ADR 0059 is preserved as explicitly superseded history; the role model, Issue-body hash, two-stage launch, no-fallback, parallelism, and Commander-only boundaries it introduced continue unchanged.
- Issue #209 / PR #214 is the last product integration completed under the Codex-era process.

## What's next

- The Commander queries the Dispatch Register, then revises each open Issue that still carries a Codex binding block or Codex trailer (#215, #198, #217, #227, #91) with an incremented Brief revision, its Claude Code class binding, and the then-current exact base/target, records `superseded` Return Receipts for their Codex-era attempts, and launches fresh Task Sessions.
- Issue #215's brief must be reshaped before relaunch: it archives the pre-cutover root routers at base `9d73070`, which this cutover has since replaced.
- Product integration remains serial; the Commander resolves the order among the open Draft pull requests after each base is re-resolved.

## Key decisions

- Bindings are Commander `claude-fable-5-1 @ xhigh`, T1 `claude-sonnet-5 @ medium`, T2 `claude-opus-5 @ high`, T3 `claude-fable-5-1 @ xhigh`; a Reviewer matches the reviewed class. No fallback.
- A Task Session is a fresh top-level Claude Code session created by hand in the desktop app; read-only exploration subagents may run only inside that session's own worktree. No CLI launcher, daemon, or script exists.
- Root `PROGRESS.md` and `HANDOFF.md` remain Commander-owned integration-line routers; per-attempt evidence lives in Issue receipts and session state.
- Product Provider, Model Role, DSH, Provider Processing/fallback, credential, Effect, provider-free E2E, export, publication, distribution, release, and `main` authority are unchanged.

## Unresolved matters or blockers

- No Codex-era attempt can continue; each open Issue needs a revised body and a fresh attempt before further controlled-file work.
- Whether the `.agents/skills` vendoring on `temp/freeze-20260904-112022` enters `dev`, archival of `handoff20260817/`, and removal of stale local worktree registrations are separate Owner decisions outside this route.
- Required product validation and paired Hosted Gate evidence remain governed by each product Issue and the current CI boundary.

## Safe Resume Prompt

```text
Commander: query the Dispatch Register and current Issue receipts first. Revise each open Issue that still names a Codex binding or trailer (#215, #198, #217, #227, #91) to its Claude Code class binding with an incremented Brief revision and the then-current exact dev base, record superseded Return Receipts for Codex-era attempts, and launch fresh Task Sessions through the two-stage receipt protocol. Keep product integration serial; under ADR 0058 do not query, estimate, report, or consider Actions usage. Do not touch Provider, credentials, sample1, recording, fixture admission, product Effect, export, publication, release, distribution, or main.
```
