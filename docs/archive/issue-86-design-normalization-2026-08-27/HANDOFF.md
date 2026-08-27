# Current handoff

[Issue #86](https://github.com/zhouy1017/ai7-harness/issues/86) owns the bounded documentation normalization on `codex/docs/86-design-handoff`, based on exact `dev@2f8471f0d80ffa79f3cbdf1d79b0f0491697ca63`. On 2026-08-27 the Owner accepted the completed result and separately authorized the Commander to integrate it through a pull request to `dev`, then update PRD Issue #28 and the affected implementation Issues and define one next-stage development target.

Resolve authority from the exact tree being read. The Issue #86 successor is repository-current only in an exact integrated `dev` commit containing this revision; elsewhere it remains accepted-but-unintegrated. It is design/documentation authority only and is not evidence of product implementation or permission for Provider calls, dependency/plugin installation, manuscript or derivative handling, release, `main`, or any other external action.

## Completed normalization

- Added root ADRs 0045–0048 and UI ADRs 0015–0017 while preserving superseded ADR history and exact full/partial successor relations.
- Added Provider Processing v3 and active-policy-set v3. Trusted launch authority maps development/CI→immutable v1, fixture recording→immutable v2, and ordinary production→v3; External Export remains immutable v1.
- Reconciled domain, architecture, UI/UX, glossary, constraints and routing around native DSH artifacts, covered analysis, Background Analysis Enrollment and exact single-use AI7 Apply.
- Preserved native DSH definition/technical ownership and AI7 selection, authority-sidecar and durable Workflow business-state ownership.
- Kept setup, installation and enablement non-authorizing; imported updates inert until adoption or the narrow Artifact Update Rule; new autonomous Provider-backed manuscript analysis dependent on active matching Enrollment.
- Recorded implementation truth without changing code: the repository remains the provider-free J-01 tracer, and its seeded AI7 `WORKFLOW_PROFILE` / `workflow_profiles.definition_json` is legacy future-migration work rather than successor implementation evidence.
- Replaced branch-static status text with target-qualified, merge-safe wording. Immutable Provider v1/v2, active-set v1/v2 and External Export v1 owners remain byte-identical.

## Validation and review

- `origin/dev` was re-fetched at the final pre-integration checkpoint and still resolved to `2f8471f0d80ffa79f3cbdf1d79b0f0491697ca63`; no target drift had occurred.
- Seven policy JSON/schema pairs and every active-set v3 digest validate; changed Markdown links resolve; `git diff --check` passes.
- UI structure remains 888 unique requirement IDs, exactly J-01–J-16 and 17 UI ADRs; all changed paths are documentation/routing only.
- Three bounded same-provider, read-only reviews found no ADR/policy, domain/architecture/implementation or UI/routing contradiction. Independence is reduced because no cross-provider review was used.

## Integration and lifecycle route

Verify the live GitHub Issue/PR and exact `origin/dev` state rather than inferring merge state from this file. If Issue #86 is not integrated, the authorized next action is commit, push, pull request validation and squash merge to `dev`. After verified integration, update PRD Issue #28 and only the affected implementation Issues, choose one bounded next-stage outcome, and perform the Issue #86 lifecycle sweep through its own scoped Issue/Change Brief: archive the consumed outgoing root `PROGRESS.md` and `HANDOFF.md`, index that one archive node, and replace the root routes. Do not enter `docs/archive/` before that lifecycle trigger is confirmed.

No product implementation begins until an exact next Issue/Change Brief is selected and target-qualified against the integrated `dev` commit. Do not install dependencies/plugins, call Providers, add manuscripts/derivatives, release, or touch `main` without separate authorization.

## Resume prompt

```text
Resolve Issue #86, its pull request, exact branch HEAD, origin/dev and worktree status. If the Owner-approved documentation successor is not yet integrated, finish only its authorized commit/push/PR checks and squash merge to dev. If it is integrated, update PRD Issue #28 and only the affected implementation Issues, define one bounded next-stage development target, then complete the separately scoped Issue #86 root-document lifecycle sweep. Preserve immutable Provider v1/v2 and External Export v1 history, superseded ADR history, native DSH definition ownership with AI7 durable-state authority, non-authorizing setup/install, active Enrollment for new autonomous Provider analysis, inert imported updates, and exact single-use AI7 Apply. Do not implement product code, install dependencies/plugins, call Providers, add manuscripts/derivatives, release or touch main.
```
