# Current handoff

[Issue #96](https://github.com/zhouy1017/ai7-harness/issues/96) owns the Markdown-only lifecycle closure for [Issue #86](https://github.com/zhouy1017/ai7-harness/issues/86) / [PR #87](https://github.com/zhouy1017/ai7-harness/pull/87). Issue #86 integrated into exact `dev@ec623a6ae3d411c36eb64d02b7c527fd3f883cc5` on 2026-08-27 after Route E2E and the existing Windows/macOS J-01 jobs passed.

Resolve this file from the exact tree being read. If an integrated `dev` commit contains the Issue #96 replacement, the lifecycle node is complete; elsewhere it remains a lifecycle candidate. Verify live Issue/PR state rather than inferring integration from a worktree.

## Current authority and tracker route

- Stable Issue #86 authority now lives in root ADRs 0045–0048, UI ADRs 0015–0017, Provider Processing/active-policy-set v3 and the updated domain, architecture, UI/UX, glossary and constraint owners.
- Native DSH artifacts retain identity, versioned Workflow definitions and technical logic. AI7 owns exact selection/pins, compatibility/authority sidecars and durable Workflow business state.
- Provider setup and artifact acquisition/install/enablement remain non-authorizing. Imported updates remain inert until explicit adoption or the narrow eligible Artifact Update Rule.
- New autonomous Provider-backed manuscript analysis requires active matching Background Analysis Enrollment. Every formal agent-originated Manuscript mutation still crosses one exact, editor-confirmed, single-use AI7 Apply boundary.
- [PRD #28](https://github.com/zhouy1017/ai7-harness/issues/28) is refreshed against exact `dev@ec623a6...` with stable stories 1–141 plus successor stories 142–148. It remains a requirements index, not implementation authority.
- Existing Issues #38, #46–#49, #51–#59 and #61–#66 carry explicit post-#86 non-dispatch markers and required successor deltas. #65/#66 retain their identities but their historical Task Skill/standalone Workflow-definition assumptions require in-place replacement before dispatch.
- New enhancement-only Issues #88–#95 own the native artifact lifecycle, foreign Skill updates, Agent Workspace, ordinary-production Provider Run, covered analysis, Result Set history, analysis metrics and Background Analysis Enrollment. None is `ready-for-agent`; #88 and #91 additionally require named Owner selections.
- [Issue #37](https://github.com/zhouy1017/ai7-harness/issues/37), titled **[S02b] J-01: Disclose a same-name different-content import collision**, is the only next `ready-for-agent` development target. Its exact filename-collision-only Change Brief excludes fuzzy matching, other SampleBooks, parser/schema/dependency changes, native Workflow migration, Providers and new gates.

## Lifecycle archive

The consumed exact Issue #86 root checkpoint and handoff are preserved byte-for-byte in one indexed historical archive node. Archive discovery remains in the archive router; ordinary current-state reading does not enter it.

No product code, dependency/plugin installation, Provider call, new manuscript/derivative, release or `main` action was performed during PRD/Issue routing or this lifecycle sweep. No Worker has started Issue #37.

## Safe next action

If Issue #96 is not integrated, finish only its authorized Markdown checks, one pull request to `dev`, CI routing observation and squash merge. After verified integration, the next product action is a separately initiated one-Issue/one-branch/one-PR dispatch of exact Issue #37. Do not start any other backlog Issue or broaden S02b without new authority.

## Resume prompt

```text
Resolve exact HEAD, worktree, origin/dev and Issue #96/PR state. If the Issue #86 lifecycle replacement is not integrated, finish only its Markdown-only validation, pull request and squash merge to dev. If it is integrated, treat Issue #37 “[S02b] J-01: Disclose a same-name different-content import collision” as the single next ready development target, but start it only through a separate explicit dispatch. Preserve exact sample1 identity, the runtime-only unrelated public-synthetic clean collision input, the current initial/exact-match J-01 outcomes, provider-free/network-denied execution, immutable policy/ADR history, native DSH definition ownership, non-authorizing setup/install, inert updates, active Enrollment for autonomous background Provider analysis and exact single-use AI7 Apply. Do not install dependencies/plugins, call Providers, add tracked manuscripts/derivatives, release or touch main.
```
