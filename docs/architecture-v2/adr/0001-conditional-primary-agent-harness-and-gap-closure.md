# Conditional Primary Agent Harness role and Codex gap-closure ladder

Status: **proposed — Issue #4 candidate-local noncanonical ADR; not accepted, not integrated, not implementation authority**

This ADR is candidate-local to `docs/architecture-v2/`. It is numbered inside this candidate directory and is **not** part of the canonical `docs/adr/` series; it neither amends nor supersedes any canonical ADR. Its terms are defined in the candidate [Execution context](../domain/execution/CONTEXT.md) and indexed in the candidate [glossary](../GLOSSARY.md).

## Decision

Preserve the owner's conditional disposition of the V2 agent-execution runtime and incorporate the later U2 risk decision without conflating technical evidence with risk appetite. A2 must prove or refute **Harness Capability Closure** against one exact Codex surface, and every branch of that result follows a ladder that keeps exactly one production agent loop. The current A2 verdict is `Closure not proven`; X2 fixes its sole closure subject at the stable `0.149.0` Windows x64 App Server package, while U2 records **Accepted Unsupported Dependency Risk** for that exact subject under the controls and suspension conditions below.

Neither X2 nor U2 selects a production dependency, proves a capability, changes the vendor's Experimental classification, or authorizes implementation. The distinction is recorded here because the ladder and the unsupported-dependency exception are authority-shaped, easy to misread as runtime approval, and hard to reverse if later buried in code or a lockfile.

## Exact owner basis

| Object | Exact identity | Role |
| --- | --- | --- |
| Owner direction | [`4741dd1b:docs/architecture-exploration/CODEX-HARNESS-DIRECTIVE.md`](https://github.com/zhouy1017/ai7-harness/blob/4741dd1b468e1fd88b9d71386446f761eef8e1e5/docs/architecture-exploration/CODEX-HARNESS-DIRECTIVE.md); blob `29dcb3e6aa0a3180117400404ed0fa77504bb641`; 8213 bytes | High-level Codex-first direction, **later narrowed** by the two resolutions below. It is an exact owner-direction object, not technical truth, capability evidence, or an A2 seam conclusion. |
| Resolution 0001 | [`92e2160f:docs/architecture-exploration/clarifications/0001-primary-agent-harness-role.md`](https://github.com/zhouy1017/ai7-harness/blob/92e2160fef9ce8195f1fee7fe29b60ba7e9d33a3/docs/architecture-exploration/clarifications/0001-primary-agent-harness-role.md); blob `9666dccafcce3d46711bc3ce18c820fa8cc377bb`; 6162 bytes | Resolves the role **if** closure passes. It does not prove closure. |
| Resolution 0002 | [`753db78c:docs/architecture-exploration/clarifications/0002-codex-gap-closure-and-dsh-reentry.md`](https://github.com/zhouy1017/ai7-harness/blob/753db78c15a1853047a41c1402d80c0ad8dbe2ea/docs/architecture-exploration/clarifications/0002-codex-gap-closure-and-dsh-reentry.md); blob `b041b743e081ed93bf6d3a9f8187e5945d202f24`; 6467 bytes | Narrows the failed-closure branch. It does not prove a gap. |
| Resolution 0003 / U2 | [`800a0d3:docs/architecture-exploration/clarifications/0003-accept-bounded-unsupported-codex-risk.md`](https://github.com/zhouy1017/ai7-harness/blob/800a0d3c4b65388aaa6f122f84ea6a1821ad800a/docs/architecture-exploration/clarifications/0003-accept-bounded-unsupported-codex-risk.md); blob `921983e817668b1a51f4799c4942e265ba4280a5`; 5661 bytes | Accepts the exact surface's unsupported status as a bounded candidate risk. It does not change maturity, prove closure, select a dependency, or authorize implementation. |
| Commander X2 decision | [`800a0d3:docs/architecture-exploration/A2-CLOSURE-SUBJECT-DECISION.md`](https://github.com/zhouy1017/ai7-harness/blob/800a0d3c4b65388aaa6f122f84ea6a1821ad800a/docs/architecture-exploration/A2-CLOSURE-SUBJECT-DECISION.md); blob `7630529e3536fc1bc58e5c9ec4e4acffd22faeb6`; 4378 bytes | Selects the stable `0.149.0` Windows x64 App Server package as the sole closure subject, not as a product dependency. |
| Exact-artifact evidence | [`800a0d3:docs/architecture-exploration/A2-EXACT-ARTIFACT-EVIDENCE.md`](https://github.com/zhouy1017/ai7-harness/blob/800a0d3c4b65388aaa6f122f84ea6a1821ad800a/docs/architecture-exploration/A2-EXACT-ARTIFACT-EVIDENCE.md); blob `f934efbf48573a9404440c6b4eaf13461d4e8144`; 11902 bytes | Maps the selected official release, tag, source commit, package and standalone digests, schema-source objects, legal objects, and exact missing links. |
| Corrected static observation | [`800a0d3:docs/architecture-exploration/A2-STATIC-ARTIFACT-PROBE-RETRY-EVIDENCE.md`](https://github.com/zhouy1017/ai7-harness/blob/800a0d3c4b65388aaa6f122f84ea6a1821ad800a/docs/architecture-exploration/A2-STATIC-ARTIFACT-PROBE-RETRY-EVIDENCE.md); blob `0d16aa81e4c8231873ad884b5d8c66abdaf813ec`; 16943 bytes | Records `probe partial`: official bytes and digest matched; static archive and legal inventory only; no downloaded binary execution or runtime proof. |

Exact clause-by-clause rules remain in [OR-2026-08-21-01](../DECISION-QUEUE.md#or-2026-08-21-01--conditional-primary-agent-harness-role-resolved-not-pending) and [OR-2026-08-21-02](../DECISION-QUEUE.md#or-2026-08-21-02--codex-gap-closure-and-deepseek-runtime-re-entry-resolved-not-pending).

## The ladder this ADR preserves

1. **Closure pass.** If A2 later proves Codex Harness Capability Closure, Codex Harness becomes the **sole production Primary Agent Harness**, and DeepSeek Harness becomes a non-runtime **Development Reference Framework** only — no package, executable, process, Session, tool runtime, capability grant, fallback executor, runtime authority, or user-facing branding.
2. **Claimed gap.** A claimed **Codex Capability Gap** is not a gap. It must be proven against an exact Codex component, pin, protocol, and supported configuration — missing documentation, an undiscovered seam, or an untested assumption does not qualify.
3. **Verified gap.** A verified gap is first costed for **Codex Secondary Development** across implementation, testing, security, licensing and notices, platform behavior, upstream updates, protocol migration, and long-term maintenance, while preserving one Primary Agent Harness and every AI7 authority boundary.
4. **Re-entry.** DeepSeek runtime becomes eligible for comparison only when that exact Codex capability remains absent **and** an exact DeepSeek surface proves a **Mature Runtime Alternative**. Passing the [DeepSeek Runtime Re-entry Gate](../domain/execution/CONTEXT.md#remedies-and-gates) requires a new owner choice and never creates automatic fallback, a dual runtime, or a second agent loop; if DeepSeek is later selected, one runtime replaces the other for the affected role.
5. **Open maintenance form.** External adapter or extension, upstream contribution, maintained patch set, and fork all remain open. A2 answers the stable-binding question as a Candidate through distinct AI7-owned Execution Binding and Harness Execution Span records. The separate formal maintenance-policy Question 3 remains unanswered.

## Accepted Unsupported Dependency Risk / 已接受的不受支持依赖风险

U2 applies only to this exact closure subject:

- stable tag `rust-v0.149.0`;
- annotated tag object `a4e15bf371341b067c8278d3b70b1a8c7b3d793e`;
- peeled source commit `758ef40f50c1a458425c7cfbf1eb12cbc07af0b0`;
- asset `codex-app-server-package-x86_64-pc-windows-msvc.tar.gz` at SHA-256 `580207baa5ecabb8e42fd734bdb774ffcd82709ccd60bff8fa812b1b83962e28`; and
- its contained and standalone `codex-app-server.exe` at SHA-256 `d181a381eece22dd21f98a06006c03289fe1a705012b9ca8fb3596dc0d90ea61`.

The minimum candidate controls are the AI7-owned `PrimaryAgentHarness` Module; exact artifact and protocol/schema fingerprints; fail-closed drift handling; no floating or silent upgrade; deterministic compatibility and editorial-journey gates; isolated storage and process lifecycle; documented rollback or replacement; and a maintained exit plan. The current static evidence supplies the exact artifact fingerprint but no generated protocol/schema fingerprint, runtime compatibility result, or journey evidence.

Production admissibility is suspended by any artifact or schema fingerprint mismatch, unmitigated security issue, inability to reproduce or package the artifact, failure of a load-bearing capability test, or material widening of the unsupported surface. Suspension never causes automatic upgrade, retry, provider fallback, DeepSeek runtime re-entry, or a second agent loop.

The candidate exit paths are explicit: upstream support may remove the unsupported classification; a reviewed replacement may satisfy the closure matrix under a new exact decision; or the candidate is withdrawn. Until a later coherent V2 candidate exposes this risk and these conditions for final owner acceptance, the exact subject remains evidence for continued evaluation only.

U2 does **not** prove Harness Capability Closure or a Codex Capability Gap; select Codex for production; reopen DeepSeek runtime comparison; choose adapter, patch, upstream, or fork maintenance; enter A3; grant Run Authorization, Effect Approval, Proposal Decision, Review Decision, Public Release Permission, or any other domain authority; prove an Effect; or authorize implementation.

## What this ADR is not

- Not canonical acceptance. Canonical `main@c8cbe26` is unchanged; [ADR 0020](https://github.com/zhouy1017/ai7-harness/blob/c8cbe26c4cccc4a912b3bbc05bd5b23fbf5468b9/docs/adr/0020-consume-pinned-harness-package-subset.md) and [ADR 0021](https://github.com/zhouy1017/ai7-harness/blob/c8cbe26c4cccc4a912b3bbc05bd5b23fbf5468b9/docs/adr/0021-single-execution-authority.md) remain the accepted records until a later candidate disposes of them through the normal owner and Commander path.
- Not implementation authorization. The exact X2 subject is a closure/evidence identity, not an installed, copied, vendored, or accepted product dependency.
- Not closure proof. A2 returns `Closure not proven` with zero Proven rows.
- Not gap proof. A2 asserts zero Codex Capability Gaps.
- Not A3 entry. The exact subject is identified, but the remaining matrix is not technically closed or decision-ready; DQ-A1-01 is still not an A2/A3 evidence substitute.

## Consequences

- AI7 keeps one generic agent loop in every branch of the ladder, so no design may assume a fallback executor exists.
- The vendor's unsupported classification remains Experimental even though the owner accepted bounded candidate risk; support, evidence maturity, and authority remain separate records.
- Writing these terms down now costs a rename if the owner later reverses the direction; leaving them unwritten costs the far more likely error of a later reader treating a gap report as DeepSeek re-authorization.
- The candidate execution context and glossary must be re-verified, not assumed, if A2 changes the surface these terms point at.
