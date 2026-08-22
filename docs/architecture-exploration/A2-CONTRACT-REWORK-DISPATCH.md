# A2 execution-contract review rework dispatch

Status: **Claude-first attempt returned HTTP 429; same-class GPT-5.6 Sol T3 fallback authorized from exact `dcbd437`; A3 and implementation remain blocked**

This is a repository-development correction brief. It is not canonical product architecture, an owner answer, a capability-closure result, a maintenance-form choice, or implementation authority.

## Exact assignment

- Candidate branch / worktree: `docs/4-v2-architecture-candidate` / `worktrees/1649`.
- Exact starting head: `dcbd4375e8f230e7620065a714b6ab5248d4241b`.
- Sealed A1 parent that must remain unchanged: `b5076179a37f8d654e758ca0b4a8bdeec8caaaa5`.
- Control merge-base that must remain unchanged: `c383afd2fdb5f08342cde277b7babced6c1207fc`.
- Role / class: Worker / T3; the returned candidate still requires independent T3-par Standards and Spec review.
- Required first binding attempt: Claude Code / `claude-opus-5` / high. The prior quota response named a 2026-08-23 02:00 Asia/Shanghai reset, and that window has now passed; yesterday's fallback reason cannot be reused without a new real attempt.
- Permitted fallback: the existing same-class GPT-5.6 Sol / `xhigh` binding, only after the new Claude attempt returns an observed unavailability or exhaustion result. Record requested binding, actual binding, session/result, cost if reported, and exact downgrade reason.
- Actual Claude result: session `1540bd4c-0b54-4454-8a5f-6b2dec2b1cc8` returned exit 1 / API HTTP 429, `You've hit your session limit · resets 2am (Asia/Shanghai)`, before model inference; the CLI reported `$0` and the candidate worktree remained unchanged and clean. The same-class GPT-5.6 Sol / `xhigh` fallback is therefore authorized; this is no task-class downgrade.
- Every earlier candidate Worker and both Reviewers are stopped before the transfer. Exactly one Worker may write the candidate worktree.

## Exact review verdict being corrected

Independent T3-par Standards and Spec review of `b507617...dcbd437` failed while confirming the exact clean one-commit A2 range and all matrix arithmetic. Both reviews disclose `same-provider review — independence reduced for the corrected A2 content`. The correction must close only these findings:

1. **P1 — incomplete and conflated cross-ledger contract.** `A2-CODEX-SEAM.md`, `CC-28`, and the Decision Queue use noncanonical `ExecutionSpan`, call it a binding, and bind only Run/attempt plus a few executor identities. They omit Task/Task Intent, Plan identity and semantic-envelope digest, applicable Effect associations, exact Harness Session event ranges, and dispatch/continuation/retry attribution. A repeated open could therefore accept authority-bearing drift.
2. **P1 — Run-specific confinement is placed in singleton composition configuration.** Run Source Scope, sandbox/permissions, grants, provider plan, roots, and Run budget are per execution. Independently authorized Runs may have overlapping readable source sets; what must never be shared is mutable scope authority/state, scratch, or cache.
3. **P1 — the dual capability guard is not specified or tested.** `CC-15` checks the advertised tool list but not the accepted requirement to enforce the same Task Skill Activation and Effective Capability Grants at both the Harness tool guard and the AI7 capability/service facade.
4. **P2 — the evidence register lacks the required supported-claim mapping.** It has no `Supported claims / rows` field, and `S-A2-08` does not enumerate the exact seven admitted A1 architecture paths.
5. **P2 — DeepSeek re-entry state is misstated.** The Codex-gap prerequisite was assessed and is not met; the Mature Runtime Alternative prerequisite was not assessed and is also not met.
6. **P2 — an A1 stop boundary remains falsely current.** It must be labeled historical and written in past tense, separate from the current A2 stop boundary.
7. **P3 — exact owner-direction trace shape is misstated.** Exact object `4741dd1b:docs/architecture-exploration/CODEX-HARNESS-DIRECTIVE.md` has eleven evidence bullets plus one separate K/A/R/S disposition bullet. The first component/pin bullet and second license/notices bullet must be traced separately; the disposition row must not be called an evidence bullet.

The reviews otherwise passed row identities, score/load-bearing totals, Unknown/register equality, Experimental mappings, `CC-37`, `CC-41`–`CC-44`, ambiguity/attempt/fallback/subagent/reparse/offline invariants, DeepSeek's bounded `Keep` disposition, probe truth, support-maturity warning, source boundary, links/tables, and Git mechanics. Do not disturb them.

## Required contract correction

Keep the `PrimaryAgentHarness` Interface deep and AI7-shaped, but make its records and lifecycle unambiguous.

### Separate the two canonical records

Use the exact canonical terms and keep them distinct:

- **Execution Binding** is the immutable cross-ledger association owned and persisted by AI7. It binds the exact Task Intent and Run, Plan Envelope identity plus semantic-envelope digest, execution attempt and continuation kind, applicable authority-bearing pins, Effective Capability Grants digest, Run Source Scope digest, Provider Resolution Plan digest, exact Adapter/Surface identity, exact Harness Session/thread identity, and references to the applicable Harness Execution Spans. It carries references and digests, never transcript content or business authority.
- **Harness Execution Span** is the exact contiguous Harness Session event range or explicit event-range set attributable to one dispatch, continuation, or retry. It is technical history, not an Execution Binding, Run Record, attempt, Effect Receipt, or completion proof.

No unqualified `ExecutionSpan` may remain. `openExecution` may allocate or recover the technical identities needed to construct an Execution Binding, but before `submit` or any other action that can invoke a capability or produce an Effect, the AI7 service must persist the authoritative Execution Binding and the Module must verify its reference/digest. The Module may persist only its executor-owned technical mapping; it still writes no AI7 domain record.

Repeated open/reattach for the same Run and attempt must compare every bound semantic and authority-bearing input. Any drift in Task/Intent, Plan identity or semantic digest, attempt/continuation attribution, grants, scope, provider plan, budget/authority pins, Adapter/Surface identity, or executor identity fails closed with a named binding-mismatch error. Same-attempt reattachment remains the only automatic recovery; a new attempt still requires explicit AI7 continuation authority.

Effects need not be guessed before they exist. Define an append-only applicable-Effect association at the AI7 boundary: before or as a governed capability call is admitted, AI7 binds the stable `effectId` and idempotency/replay identity to the exact attempt and eventual Codex tool-call/item identity. A Harness call result never becomes an Effect Receipt. `close` finalizes or returns the exact Harness Execution Span descriptor; AI7 links it through the existing Execution Binding without copying events.

Strengthen `CC-28` without changing its `Candidate` disposition. Its exit test must cover complete-field persistence, exact Session event range/set, per-Effect association where applicable, repeat-open equality, fail-closed semantic drift, dispatch/Resume/Retry attribution, and no transcript or authority promotion.

### Separate static composition from per-execution state

Static composition configuration may contain only facts common to the shipped adapter, such as Adapter selection, exact artifact and expected schema fingerprint, technical storage root, reviewed capability-implementation registry, and instance-wide concurrency/budget ceilings.

Each successful `openExecution` derives one immutable per-execution resolved context containing Run Source Scope and roots, Task Skill Activation, Effective Capability Grants, Provider Resolution Plan, per-Run budget, sandbox/permission binding, and their exact digests/references. It is bound to the handle and compared on reattachment; callers cannot mutate it per tool call.

Independently authorized Runs may read overlapping source sets. Tests must cover both overlapping and disjoint authorized scopes, cross-scope denial, effective-target confinement, semantic drift on reopen, and strict non-sharing of scratch/cache and mutable authority state.

### Enforce capabilities twice

State the accepted invariant exactly: the same Task Skill Activation and Effective Capability Grants are enforced at both the Harness tool guard and the AI7 capability/service facade. Keep capability projection internal. Strengthen `CC-15` without changing its `Candidate` disposition. Negative tests must attempt forged/direct facade calls, forbidden operations, out-of-scope arguments, and mismatched activation at both boundaries, and must prove structural denial with no side effect.

## Traceability and current-state correction

- Add a `Supported claims / matrix rows` field to every `S-A2-01`–`S-A2-11` evidence-register row. Give every source an exact claim/row mapping; do not create a new source or inflate evidence strength.
- Expand `S-A2-08` to enumerate exactly these seven A1 architecture paths: `README.md`, `A1-PRODUCT-CONSISTENCY.md`, `A1-EVIDENCE-CROSSWALK.md`, `DECISION-QUEUE.md`, `GLOSSARY.md`, `domain/execution/CONTEXT.md`, and `adr/0001-conditional-primary-agent-harness-and-gap-closure.md`, each under `docs/architecture-v2/`.
- In the owner-direction trace, say **eleven evidence bullets plus one disposition bullet**. Trace the component/version/package/transitive-closure bullet separately from the license/NOTICE/redistribution/update/pinning/trademark bullet. Label the K/A/R/S row as the separate disposition bullet. Matrix rows and totals do not change.
- Correct the DeepSeek Runtime Re-entry Gate statement: the verified-Codex-gap condition was assessed and is not met; the Mature Runtime Alternative condition was not assessed and is not met. Preserve `Keep — deferred candidate evidence only for this A2 evaluation` and every no-re-entry/no-runtime implication.
- Label the earlier Issue #4/A1 stop paragraph **Historical A1 stop boundary**, convert it to past tense, and keep the current A2 stop boundary separate.
- Update candidate `PROGRESS.md` to record the failed `dcbd437` reviews, this bounded correction, the actual Claude/fallback result, exact new head, validation, current next action, key decisions, and one-sentence Resume Prompt. Do not claim review acceptance before fresh verdicts exist.

## Write and evidence boundary

Amend only the existing A2 commit and edit only the same seven paths:

1. `PROGRESS.md`;
2. `docs/architecture-v2/README.md`;
3. `docs/architecture-v2/DECISION-QUEUE.md`;
4. `docs/architecture-v2/A2-CAPABILITY-CLOSURE.md`;
5. `docs/architecture-v2/A2-CODEX-SEAM.md`;
6. `docs/architecture-v2/A2-EVIDENCE-REGISTER.md`;
7. `docs/architecture-v2/A2-GAP-REGISTER.md`.

No new matrix row, score change, source, web retrieval, local probe, source inspection, dependency, prototype, DeepSeek runtime evidence, ADR, owner answer, maintenance-form selection, A3 work, implementation, issue decomposition, push, PR, merge, publication, or other external action is authorized. Preserve the exact `44 / 43 / 0 Proven / 15 Candidate / 2 Experimental / 26 Unknown / 1 Not applicable / 0 Gap claims / 0 Verified Gaps` result, the sealed A1 parent, the lowercase commit subject, and all three contributor trailers.

## Exit

Validate the exact parent and two-commit history; seven-path boundary; clean worktree/index; `git diff --check`; unchanged matrix IDs, dispositions, totals, Unknown/register equality, and Experimental mappings; no unqualified `ExecutionSpan`; complete Execution Binding and separate Harness Execution Span terms; dual capability-guard test; static/per-execution separation; supported-claim/source mapping; exact seven A1 paths; corrected DeepSeek and historical-stop wording; local Markdown links/anchors and table shapes; no new source; lowercase subject; all contributor trailers; and no post-amend work. Report the exact head and stop for fresh independent T3-par review.
