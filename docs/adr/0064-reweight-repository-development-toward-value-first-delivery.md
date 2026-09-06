---
status: accepted
---

# Reweight repository development toward value-first delivery

On 2026-09-06 the Owner reviewed the project against a prompt-only manuscript-review practice: one 313,308-character novel, 50 subagents, 6.4 hours of wall time, 1,902 findings with institutional sources, four deliverable forms, and an adversarial sample that measured A-tier precision at about 83%. The review found the analysis-domain design of [ADR 0047](./0047-separate-targeted-retrieval-from-covered-manuscript-analysis.md) and [ADR 0048](./0048-enroll-and-evaluate-background-manuscript-analysis.md) independently validated by that practice, and found development over-weighted toward governance: 72 of 113 merged pull requests were documentation, about 40 of them routing or lifecycle closes; every product merge cost a second T1 Issue, pull request, and Gate to replace two root routers; a T3 Change Brief ran to 32 KB; the product had never made a model call; and none of the seven executable Journeys produced the outcome an editor pays for. The Owner directed a reorganization and a value-first plan. This decision records the resulting rules. It changes repository-development process and documentation ownership only; product authority, Provider Processing, and every ADR not named below are unchanged.

## Decision

### Sequencing

[`docs/development/development-plan.md`](../development/development-plan.md) is the ordered backlog and the only place the delivery order lives. Root `PROGRESS.md` names the next slice; Issues carry their plan slot. The order is value-first: finish the in-flight Plan Envelope slice, then the developer-live Provider scope ([ADR 0065](./0065-admit-a-developer-live-provider-processing-scope.md)), factual verification and research retention, model-driven cross-unit reduction and assurance sampling ([ADR 0066](./0066-add-model-driven-cross-unit-reduction-and-assurance-sampling.md)), the Run Report, Proposal review and Apply, and local export, before continuation, budget, concurrency, learning, ecosystem, and dialogue slices.

### Process weight

- **One root router.** `PROGRESS.md` is the single Commander-owned status and routing file; `HANDOFF.md` is removed. The Commander updates `PROGRESS.md` inside the integrating product pull request or through its own documentation-only pull request, with no separate Issue, Worker, or receipts. Branch protection still requires a pull request; nothing is pushed directly to `dev`.
- **Commander-authored mechanical edits.** The Commander may itself perform mechanical T1 documentation work through its own pull request: root routers, archive indexes, link repairs, status lines, and the plan. Product code, tests, runners, schemas, and policies stay with Workers.
- **Reviewer is optional for every class.** A fresh read-only Reviewer is recommended for a T3 product slice and never required; its findings remain advisory and never gate a pull request.
- **Receipts are schema v5.** One Launch Receipt and one Return Receipt per attempt, immutable once posted, each a short Issue comment: `dispatch_id`, `issue`, `brief_revision`, `brief_sha256` (T3 only; `none` otherwise), `harness`, `launch_mode`, `binding` (model and effort as launched), `base`, `head` (Return only), `terminal_status` (Return only), `worktree`, `session`. Schema v1 to v4 receipts stay as historical evidence.
- **Body hash only for T3.** A T1 or T2 attempt freezes the Brief revision, not the body bytes; an editorial body edit does not restart it.
- **Continuation after base drift.** When integration moves `dev` and only the exact base changes, the same Task Session continues after one Commander message naming the new base; a new attempt is needed only when the Brief's contract changes.
- **One-page Change Brief.** [`docs/agents/change-brief.md`](../agents/change-brief.md) defines the form: outcome, acceptance criteria, allowed change, non-goals, Journey disposition, stop conditions, and links. The canonical-authority list for an area lives in the read-by-task table of [`docs/agents/README.md`](../agents/README.md), not in every Issue.

### Documentation ownership

- `docs/architecture-v2/`, `docs/ui-ux-v2/`, `kick-in/`, `docs/domain/*/CONTEXT.md`, `GLOSSARY.md`, and `UBIQUITOUS_LANGUAGE.md` are frozen design references as of `dev@4c50ce31b0f15ff2bfadd2af17fc914c317e0f22`. They change only through an ADR that names the clause being changed.
- Implementation status lives only in `PROGRESS.md` and [`docs/development/e2e-journeys.md`](../development/e2e-journeys.md). No design document, README, or PRD carries a "current implementation" paragraph.
- The qualifier that a record is repository-current only at an exact integrated `dev` commit is stated once, in [`docs/agents/README.md`](../agents/README.md), and removed from every other file. `dev` is the only development line, so the qualifier adds no decision value elsewhere.
- The PRD lives at [`docs/prd/ai7-v2-prd.md`](../prd/ai7-v2-prd.md); Issue #28 is the epic pointer.
- Every design-phase planning body on an open slice Issue is historical input; the dispatchable Brief is written in the one-page form on the then-current `dev` head when the slice is reached.

### Fixtures

Hand-written synthetic fixtures keep their current key. New fixture material is generated from developer-live output by tooling once ADR 0065 lands; unit and service tests may resolve fixture entries by unit content digest alone, and the prompt-contract digest assertion stays in the J-04 Journey only.

## Consequences

- Supersedes the receipt schema, mandatory-Reviewer, T1/T2 body-hash, and fresh-attempt-after-rebase clauses of [ADR 0061](./0061-route-repository-dispatch-by-commander-harness.md) and [ADR 0063](./0063-allow-cross-harness-dispatch-through-cli-launched-task-sessions.md); their harness, binding, launch-mode, and Commander-only external-action rules continue. [`kick-in/27-repository-development-dispatch.md`](../../kick-in/27-repository-development-dispatch.md) and [`docs/agents/dispatch-register.md`](../agents/dispatch-register.md) carry the compact operating detail.
- [ADR 0027](./0027-concentrate-ci-on-e2e-functionality.md) and [ADR 0062](./0062-adopt-a-local-verification-ladder-with-ci-as-delivery-gate.md) are unchanged: the Gate and the Local Verification Ladder keep their meaning.
- Expected saving per product slice: two Issues, two pull requests, two Gate occurrences, and most of the Commander time spent on receipts and Brief re-publication.

## Rejected alternatives

- **Keep the process and only re-order the backlog.** Rejected: the routing and receipt overhead is paid on every slice and would dominate the value-first slices too.
- **Drop Issues and receipts entirely.** Rejected: the Issue is still the one durable place a cold Worker reads its brief, and one Launch and one Return Receipt per attempt remain the cheapest audit of what ran.
- **Continue provider-free until most features exist.** Rejected by ADR 0065: the prompt contract and pipeline shape are the quality-critical parts, and only real output can test them.
