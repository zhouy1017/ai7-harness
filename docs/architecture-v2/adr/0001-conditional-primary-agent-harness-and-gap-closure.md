# Conditional Primary Agent Harness role and Codex gap-closure ladder

Status: **proposed — Issue #4 candidate-local noncanonical ADR; not accepted, not integrated, not implementation authority**

This ADR is candidate-local to `docs/architecture-v2/`. It is numbered inside this candidate directory and is **not** part of the canonical `docs/adr/` series; it neither amends nor supersedes any canonical ADR. Its terms are defined in the candidate [Execution context](../domain/execution/CONTEXT.md) and indexed in the candidate [glossary](../GLOSSARY.md).

## Decision

A1 records — but does not exercise — the owner's conditional disposition of the V2 agent-execution runtime: a future A2 must prove or refute **Harness Capability Closure** against an exact Codex surface, and every branch of that result is pre-committed to a ladder that keeps exactly one production agent loop. This is recorded now because the ladder is authority-shaped, it is easy to misread a later gap report as permission to reopen DeepSeek, and the owner already resolved the trade-off in two exact clarification objects.

## Exact owner basis

| Object | Exact identity | Role |
| --- | --- | --- |
| Owner direction | [`4741dd1b:docs/architecture-exploration/CODEX-HARNESS-DIRECTIVE.md`](https://github.com/zhouy1017/ai7-harness/blob/4741dd1b468e1fd88b9d71386446f761eef8e1e5/docs/architecture-exploration/CODEX-HARNESS-DIRECTIVE.md); blob `29dcb3e6aa0a3180117400404ed0fa77504bb641`; 8213 bytes | High-level Codex-first direction, **later narrowed** by the two resolutions below. It is an exact owner-direction object, not technical truth, capability evidence, or an A2 seam conclusion. |
| Resolution 0001 | [`92e2160f:docs/architecture-exploration/clarifications/0001-primary-agent-harness-role.md`](https://github.com/zhouy1017/ai7-harness/blob/92e2160fef9ce8195f1fee7fe29b60ba7e9d33a3/docs/architecture-exploration/clarifications/0001-primary-agent-harness-role.md); blob `9666dccafcce3d46711bc3ce18c820fa8cc377bb`; 6162 bytes | Resolves the role **if** closure passes. It does not prove closure. |
| Resolution 0002 | [`753db78c:docs/architecture-exploration/clarifications/0002-codex-gap-closure-and-dsh-reentry.md`](https://github.com/zhouy1017/ai7-harness/blob/753db78c15a1853047a41c1402d80c0ad8dbe2ea/docs/architecture-exploration/clarifications/0002-codex-gap-closure-and-dsh-reentry.md); blob `b041b743e081ed93bf6d3a9f8187e5945d202f24`; 6467 bytes | Narrows the failed-closure branch. It does not prove a gap. |

Exact clause-by-clause rules remain in [OR-2026-08-21-01](../DECISION-QUEUE.md#or-2026-08-21-01--conditional-primary-agent-harness-role-resolved-not-pending) and [OR-2026-08-21-02](../DECISION-QUEUE.md#or-2026-08-21-02--codex-gap-closure-and-deepseek-runtime-re-entry-resolved-not-pending).

## The ladder this ADR preserves

1. **Closure pass.** If a future A2 proves Codex Harness Capability Closure, Codex Harness becomes the **sole production Primary Agent Harness**, and DeepSeek Harness becomes a non-runtime **Development Reference Framework** only — no package, executable, process, Session, tool runtime, capability grant, fallback executor, runtime authority, or user-facing branding.
2. **Claimed gap.** A claimed **Codex Capability Gap** is not a gap. It must be proven against an exact Codex component, pin, protocol, and supported configuration — missing documentation, an undiscovered seam, or an untested assumption does not qualify.
3. **Verified gap.** A verified gap is first costed for **Codex Secondary Development** across implementation, testing, security, licensing and notices, platform behavior, upstream updates, protocol migration, and long-term maintenance, while preserving one Primary Agent Harness and every AI7 authority boundary.
4. **Re-entry.** DeepSeek runtime becomes eligible for comparison only when that exact Codex capability remains absent **and** an exact DeepSeek surface proves a **Mature Runtime Alternative**. Passing the [DeepSeek Runtime Re-entry Gate](../domain/execution/CONTEXT.md#remedies-and-gates) requires a new owner choice and never creates automatic fallback, a dual runtime, or a second agent loop; if DeepSeek is later selected, one runtime replaces the other for the affected role.
5. **Open maintenance form.** External adapter or extension, upstream contribution, maintained patch set, and fork all remain open. **The A2 stable-binding question — what binding correlates executor technical history with AI7 Tasks, Runs, Plans, and Effects — is unanswered** in A1; A1 neither defines nor answers the separate formal pending Commander clarification Question 3, which concerns maintenance policy. All are deferred to A2.

## What this ADR is not

- Not canonical acceptance. Canonical `main@c8cbe26` is unchanged; [ADR 0020](https://github.com/zhouy1017/ai7-harness/blob/c8cbe26c4cccc4a912b3bbc05bd5b23fbf5468b9/docs/adr/0020-consume-pinned-harness-package-subset.md) and [ADR 0021](https://github.com/zhouy1017/ai7-harness/blob/c8cbe26c4cccc4a912b3bbc05bd5b23fbf5468b9/docs/adr/0021-single-execution-authority.md) remain the accepted records until a later candidate disposes of them through the normal owner and Commander path.
- Not implementation authorization. No dependency is installed, inspected, copied, vendored, or pinned.
- Not closure proof. A1 asserts no Harness Capability Closure.
- Not gap proof. A1 asserts no Codex Capability Gap.
- Not A2 entry. A2 may begin only after the Commander confirms that the [A1 invariant list](../A1-PRODUCT-CONSISTENCY.md#stable-invariant-list) is stable and issues a separate brief; the owner's DQ-A1-01 tuple is not an A2 prerequisite.

## Consequences

- AI7 keeps one generic agent loop in every branch of the ladder, so no design may assume a fallback executor exists.
- Writing these terms down now costs a rename if the owner later reverses the direction; leaving them unwritten costs the far more likely error of a later reader treating a gap report as DeepSeek re-authorization.
- The candidate execution context and glossary must be re-verified, not assumed, if A2 changes the surface these terms point at.
