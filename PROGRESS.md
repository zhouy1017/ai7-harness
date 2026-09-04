# Current checkpoint

## What's done

- Repository-development dispatch is routed by the Commander's harness under ADR 0061: a Codex Commander uses the Codex route (ADR 0059's bindings, Task Sessions, and tools) and a Claude Code Commander uses the Claude Code route (ADR 0060's), never mixed within one attempt. Work-ready Issue bodies carry one requested binding per harness; receipts use schema v3 with a `harness` field.
- ADR 0059 and ADR 0060 are preserved as superseded history; the role model, Issue-body hash, two-stage launch, no-fallback, parallelism, and Commander-only boundaries continue unchanged.
- Issue #209 / PR #214 is the last product integration; Issues #229 / PR #230 and this cutover are governance-only.

## What's next

- The active Commander queries the Dispatch Register on its own harness. Open Issues #215, #198, #217, #227, and #91 carry a single Codex binding line: a Codex Commander may launch them unchanged; a Claude Code Commander first adds the `claude-code` line with an incremented Brief revision and re-resolves the exact base/target.
- Reshape Issue #215 before any relaunch: its brief archives pre-cutover root routers at base `9d73070`, which have since been replaced twice.
- Product integration remains serial; the Commander resolves the order among the open Draft pull requests after each base is re-resolved.

## Key decisions

- Two harnesses, Codex and Claude Code; the Commander's harness selects the route. Bindings per harness: Codex Commander `gpt-5.6-sol @ ultra`, T1 `gpt-5.6-luna @ medium`, T2 `gpt-5.6-terra @ high`, T3 `gpt-5.6-sol @ xhigh`; Claude Code Commander `claude-fable-5-1 @ xhigh`, T1 `claude-sonnet-5 @ medium`, T2 `claude-opus-5 @ high`, T3 `claude-fable-5-1 @ xhigh`. A Reviewer matches the reviewed class on the same harness. No fallback across models, efforts, or harnesses.
- A Task Session is a fresh top-level session of the Commander's harness; read-only exploration subagents may run only inside that session's own worktree. No CLI launcher, daemon, or script exists on either route.
- Root `PROGRESS.md` and `HANDOFF.md` remain Commander-owned integration-line routers; per-attempt evidence lives in Issue receipts and session state.
- Product Provider, Model Role, DSH, Provider Processing/fallback, credential, Effect, provider-free E2E, export, publication, distribution, release, and `main` authority are unchanged.

## Unresolved matters or blockers

- Codex-era attempts on the open Issues ended when their exact base/target drifted; each needs a fresh attempt from the then-current `dev` on the launching Commander's harness.
- Whether the `.agents/skills` vendoring on `temp/freeze-20260904-112022` enters `dev`, archival of `handoff20260817/`, and removal of stale local worktree registrations are separate Owner decisions outside this route.
- Required product validation and paired Hosted Gate evidence remain governed by each product Issue and the current CI boundary.

## Safe Resume Prompt

```text
Commander: identify your harness (Codex or Claude Code), then query the Dispatch Register and current Issue receipts with that harness's tools. Reshape Issue #215 first. For each open Issue (#215, #198, #217, #227, #91) launch a fresh attempt from the then-current exact dev base through the two-stage receipt protocol on your harness; a Claude Code Commander first adds the claude-code binding line with an incremented Brief revision. Keep product integration serial; under ADR 0058 do not query, estimate, report, or consider Actions usage. Do not touch Provider, credentials, sample1, recording, fixture admission, product Effect, export, publication, release, distribution, or main.
```
