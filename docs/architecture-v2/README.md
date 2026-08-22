# AI7 V2 architecture candidate — A1 and A2

Status: **Issue #4 noncanonical candidate; A1 sealed and A2 complete; no implementation authority**

This directory records the decision-ready results of two phases. **A1, One-product consistency and UI parity**, remains sealed at exact commit/head `b5076179a37f8d654e758ca0b4a8bdeec8caaaa5`, unamended and the historical authority for every A1 claim. A2 updates this shared README and `DECISION-QUEUE.md` only to append its A2 results; it does not retroactively alter A1 semantics. **A2, Codex-first capability closure**, returns the verdict **`Closure not proven`**.

Neither phase changes canonical product architecture, accepts either frozen Worker branch, selects a runtime, dependency, or packaging mechanism, or authorizes A3, implementation, issue decomposition, a pull request, or release.

## Exact authority and evidence boundary

| Input | Exact identity | Authority in A1 |
| --- | --- | --- |
| Canonical design baseline | `main@c8cbe26c4cccc4a912b3bbc05bd5b23fbf5468b9` | Accepted only to the extent recorded by the exact canonical objects in the [packet manifest](../architecture-exploration/PACKET-MANIFEST.md#canonical-baseline-objects). |
| Commander control/evidence unit | `c383afd2fdb5f08342cde277b7babced6c1207fc` | Binding workflow and curated packet; not new canonical product architecture. See the [review packet](../architecture-exploration/REVIEW-PACKET.md). |
| Platform/Q16/Phase-0 reference | `960689172bcf54eb3f27b57045a4ce4e9f20695d` | Frozen candidate evidence; its Windows+macOS premise and recommendations are not silently promoted. |
| UI/UX reference | `587d6455f6a578d3df8a39f534ec7a057c07a18c` | Frozen candidate evidence; its 79 requirements and fourteen journeys are hypotheses to map, not accepted screens or geometry. |
| Exact post-packet owner architecture direction | [`4741dd1b:docs/architecture-exploration/CODEX-HARNESS-DIRECTIVE.md`](https://github.com/zhouy1017/ai7-harness/blob/4741dd1b468e1fd88b9d71386446f761eef8e1e5/docs/architecture-exploration/CODEX-HARNESS-DIRECTIVE.md); blob `29dcb3e6aa0a3180117400404ed0fa77504bb641`; 8213 bytes | Separately authorized exact **owner-direction object**, later narrowed by Clarifications 0001 and 0002 below. It supersedes only the old assumption that A2 would examine DeepSeek Harness alone. It is not technical truth, capability evidence, an A2 seam conclusion, a 52nd manifest row, or a dependency selection. |
| Exact Primary Agent Harness role resolution | [`92e2160f:docs/architecture-exploration/clarifications/0001-primary-agent-harness-role.md`](https://github.com/zhouy1017/ai7-harness/blob/92e2160fef9ce8195f1fee7fe29b60ba7e9d33a3/docs/architecture-exploration/clarifications/0001-primary-agent-harness-role.md); blob `9666dccafcce3d46711bc3ce18c820fa8cc377bb`; 6162 bytes | Separately authorized, owner-accepted future-A2 input. It resolves the role **if** Codex capability closure passes; it neither proves closure nor changes canonical V1. |
| Exact Codex gap-closure / DeepSeek re-entry resolution | [`753db78c:docs/architecture-exploration/clarifications/0002-codex-gap-closure-and-dsh-reentry.md`](https://github.com/zhouy1017/ai7-harness/blob/753db78c15a1853047a41c1402d80c0ad8dbe2ea/docs/architecture-exploration/clarifications/0002-codex-gap-closure-and-dsh-reentry.md); blob `b041b743e081ed93bf6d3a9f8187e5945d202f24`; 6467 bytes | Separately authorized, owner-accepted future-A2 input. It narrows the failed-closure branch; it neither proves a Codex gap nor admits DeepSeek. |

Beyond the sealed packet, A1 admits exactly **one exact owner-direction object plus two exact owner-resolution objects** — the three rows above. All 51 manifest rows were re-derived before candidate evidence was read: every `commit:path` matched its listed blob and byte count, as did all three post-packet objects. Noncurrent material was read only with `git show <exact-commit>:<path>`. A1 used no transcript, active foreign worktree, unlisted legacy branch material, raw design conversation, real manuscript, credential, or private sample Book, as required by the [multi-session workflow](../agents/multi-session-design-workflow.md#context-contamination-firewall).

Every substantive A1 claim is either:

- linked to an exact source object in the source registry of [A1 Evidence Crosswalk](./A1-EVIDENCE-CROSSWALK.md#source-registry);
- linked to the separately authorized exact owner-direction object or to one of the two exact owner-resolution objects identified above;
- marked `candidate hypothesis`, `option`, `conflict`, `open question`, or `evidence gap`; or
- a derived A1 contract clause whose cited accepted records state all of its semantic inputs.

## A2 result — Codex-first capability closure

**Verdict: `Closure not proven`.** Exact review disproved the completeness of the previous set, so A2 re-opened it, traced the owner direction's eleven evidence bullets plus its separate K/A/R/S disposition bullet, added four omitted load-bearing rows, froze the corrected set, and re-scored it. Of 44 rows, 43 are load-bearing: **0 Proven**, 15 Candidate, 2 Experimental, 26 Unknown, **0 Gap claims, and 0 Verified Codex Capability Gaps**. One row is `Not applicable`.

Non-closure is an evidence state, not a finding against Codex. Three blockers are independent of any single row:

1. **No exact coherent surface exists to close against.** The pinned research snapshot `openai/codex@44e95c85…` is explicitly not a dependency pin, and the current official documentation names no version at all. Their documented method inventories, data-directory documentation, and the *scope of their production warning* differ.
2. **The vendor excludes the candidate surface from production.** OpenAI recommends `codex app-server` for exactly AI7's integration shape *and* states that "The app-server command and WebSocket transport are experimental and aren't supported for production workloads." A2 holds both as simultaneous facts. Whether AI7 accepts an unsupported dependency is an owner trade-off, recorded as `DQ-A2-01`.
3. **The narrow-tool-surface exclusion is unproven.** Shell, filesystem, network, and coding-oriented tooling are documented as sandbox-*constrained*; nothing in the admitted evidence shows they can be made *absent*, which is the standard AI7 accepted.

Because no gap is verified, no maintenance form is selected, no costed secondary-development route is produced, and the **DeepSeek Runtime Re-entry Gate remains closed**. Its Codex-gap prerequisite was assessed and is not met; its Mature Runtime Alternative prerequisite was not assessed and is also not met. Equally, the [OR-2026-08-21-01](./DECISION-QUEUE.md#or-2026-08-21-01--conditional-primary-agent-harness-role-resolved-not-pending) closure-pass dispositions do not activate. Candidate C is **Keep — deferred candidate evidence only for this A2 evaluation**: not runtime selection/evaluation, reference-role activation, re-entry, or future admission.

The evidence does support a strong Codex-first architecture candidate: the official ownership split matches AI7's own, and stdio JSONL over JSON-RPC 2.0 is simultaneously the documented default transport and the only transport compatible with AI7's accepted no-TCP-listener IPC rule.

## Outputs

### A2 — Codex-first capability closure

- [A2 Capability Closure](./A2-CAPABILITY-CLOSURE.md) — the re-derived and frozen 44-row matrix, its eleven-evidence-plus-one-disposition traceability, scoring rules, verdict, and three blockers.
- [A2 Codex Seam](./A2-CODEX-SEAM.md) — the AI7-owned deep `PrimaryAgentHarness` Module, its full interface, the distinct AI7-owned Execution Binding and Harness Execution Span contracts, the seam placement, and its two adapters. It recommends a candidate seam; it selects no surface, dependency, or maintenance form.
- [A2 Evidence Register](./A2-EVIDENCE-REGISTER.md) — every source with exact identity, retrieval date, evidence kind, supported-claim/matrix-row mapping, stability warning, and whether direct verification occurred; the Commander-executed version/help observations and the explicit absence of runtime-behavior or closure probes.
- [A2 Gap Register](./A2-GAP-REGISTER.md) — Unknown, Experimental, Gap claim, and Verified Codex Capability Gap kept strictly apart, with exact next evidence for every Unknown.

### A1 — product consistency (sealed, unchanged)

- [A1 Product Consistency](./A1-PRODUCT-CONSISTENCY.md) — shared-product/native-variation contract, mutually exclusive support options, conflicts, non-goals, and the owner-choice boundary.
- [A1 Evidence Crosswalk](./A1-EVIDENCE-CROSSWALK.md) — 79/79 requirement rows and 14/14 journey rows mapped to exact candidate sources and canonical record owners.
- [Decision Queue](./DECISION-QUEUE.md) — the compound A1 owner decision packet, evidence gaps, invalidation conditions, affected canonical records, and later-phase entry rules. A2 later added `DQ-A2-01`, `DQ-A2-02`, and the A2 evidence queue to the same file.
- [Execution (V2 candidate)](./domain/execution/CONTEXT.md) — candidate-local, noncanonical definition owner for the seven execution terms required by the exact owner resolutions.
- [Glossary Reference (V2 candidate)](./GLOSSARY.md) — candidate-local, noncanonical bilingual index and collision guide; it defines nothing and adds no row to the canonical root glossary.
- [Candidate ADR 0001](./adr/0001-conditional-primary-agent-harness-and-gap-closure.md) — candidate-local, noncanonical record of the conditional Primary Agent Harness disposition and the gap-closure/re-entry ladder.

The last three are required by the exact Clarification 0001/0002 resolutions and exist as of this candidate. Promotion to canonical `CONTEXT.md`, `GLOSSARY.md`, or `docs/adr/` still requires explicit owner acceptance and Commander integration. The A2 capability matrix now exists and is listed above; **runtime-behavior and closure probes, technical selection, any A2 ADR, and canonical record updates remain deferred.** The version/help probes already ran under Commander authority and established only binary identity/help facts. No candidate ADR was authorized for A2, and none was written — a later ADR requires a reviewed, decision-ready result plus any outstanding owner disposition.

## Owner direction registered after the sealed packet

*This section records the direction as A1 registered it, and is retained unchanged as the historical basis A2 acted on. Where it says "future A2", read the [A2 result](#a2-result--codex-first-capability-closure) above: A2 has since run and returned `Closure not proven`, so none of the conditional dispositions described below has activated.*

The effective future A2 working premise is **AI7 domain-owned, Codex-first capability-closure evaluation, DeepSeek reference-framework disposition**. AI7 remains the definition owner for business requirements, domain authority, Policy Documents, Effects/Receipts, ledgers, Book/manuscript scope, and professional editorial UX outcomes. “Codex-first” is an evaluation/design priority, not proof of capability closure or an active dependency.

That premise is carried by one exact owner-direction object, [`4741dd1b:docs/architecture-exploration/CODEX-HARNESS-DIRECTIVE.md`](https://github.com/zhouy1017/ai7-harness/blob/4741dd1b468e1fd88b9d71386446f761eef8e1e5/docs/architecture-exploration/CODEX-HARNESS-DIRECTIVE.md) (blob `29dcb3e6aa0a3180117400404ed0fa77504bb641`, 8213 bytes), re-derived before it was read. It is an owner direction only: it is not technical truth, capability evidence, or an A2 seam conclusion, and Clarifications 0001 and 0002 later narrow it — in particular its original "DeepSeek remains a comparison candidate" and mixed-composition wording now runs through the closure/gap/re-entry ladder below.

The direction names [OpenAI's official Codex harness platform article](https://developers.openai.com/blog/codex-as-a-platform) and the open-source [Codex research snapshot `main@44e95c857f37f81a5731eab72c32a3d334d0e2c4`](https://github.com/openai/codex/tree/44e95c857f37f81a5731eab72c32a3d334d0e2c4) as its own provenance. A1 registers those references but does not inspect, reproduce, install, or draw a seam conclusion from them. The snapshot is research evidence, not a product dependency pin.

The two exact owner resolutions make A2's condition explicit. A2 must prove or refute **Codex Harness Capability Closure** against AI7's evidence-bearing matrix. If closure passes, Codex is the sole production **Primary Agent Harness** and DeepSeek Harness becomes a non-runtime **Development Reference Framework** with no package, process, Session, tool, fallback, authority, or branding role. If a Codex gap is claimed, A2 must first verify the exact gap and prefer a costed Codex-based secondary-development closure. DeepSeek may re-enter runtime comparison only if that exact Codex capability remains absent and an exact DeepSeek surface proves a Mature Runtime Alternative; passing that re-entry gate triggers comparison and a new owner choice, never automatic fallback or a second loop. External adapter/extension, upstream contribution, maintained patch set, and fork remain unselected maintenance forms. The **A2 stable-binding question** — what binding correlates executor technical history with AI7 Tasks, Runs, Plans, and Effects — remains unanswered in A1; A1 neither defines nor answers the separate formal pending Commander clarification Question 3, which concerns maintenance policy. A1 registers those future-A2 constraints and writes the candidate-local [execution context](./domain/execution/CONTEXT.md), [bilingual glossary](./GLOSSARY.md), and [candidate ADR 0001](./adr/0001-conditional-primary-agent-harness-and-gap-closure.md) that the exact resolutions require; it asserts neither closure nor a gap and writes no gap matrix. Exact rules are in [OR-2026-08-21-01](./DECISION-QUEUE.md#or-2026-08-21-01--conditional-primary-agent-harness-role-resolved-not-pending) and [OR-2026-08-21-02](./DECISION-QUEUE.md#or-2026-08-21-02--codex-gap-closure-and-deepseek-runtime-re-entry-resolved-not-pending).

## Phase gates

| Gate | Entry | Exit / next authority |
| --- | --- | --- |
| A1 — product consistency | Sealed packet verified; Windows+macOS treated only as the owner-stated working premise recorded by the [review packet](../architecture-exploration/REVIEW-PACKET.md#audited-candidate-input--platform-q16-and-phase-0). | Invariant list, bounded native differences, options, and evidence gaps are explicit. This branch then stops for Commander review. |
| A2 — Codex-first capability closure | **Entered and corrected after exact review.** Entered under a separate Commander dispatch admitting the exact owner-direction object, both exact owner resolutions, and the Commander-curated seam audit. DQ-A1-01 was not an evidence prerequisite and remains unanswered. | **Exited with `Closure not proven`.** The corrected result is 44 rows / 43 load-bearing / 0 Proven / 15 Candidate / 2 Experimental / 26 Unknown / 1 Not applicable / 0 Gap claims / 0 Verified Codex Capability Gaps. Neither the closure-pass dispositions nor the gap ladder activates. Next authority is fresh independent exact-head T3-par review; A3 remains blocked. |
| Owner product choice | The Commander presents the A1 option profile after reviewing this candidate. | The owner's exact parity/support choice gates a canonical product promise and the later coherent candidate; it does not retroactively make either frozen branch canonical. |
| Future A3 — truthful OS isolation | **Not entered, and now explicitly stopped.** A3 requires one selected or decision-ready A2 runtime surface. A2 returned `Closure not proven` and identified no exact artifact (`CC-01`), so no such surface exists yet. A gap report, re-entry eligibility, candidate list, or unresolved composition grants no entry — and neither does this A2 result. | Test that actual process, tool, network, approval, and sandbox surface on each claimed OS; support an honest confinement contract or explicitly reduce the claim. |
| Coherent V2 candidate | A1–A3 and other named evidence are reconciled. | Independent T3 hostile challenge, explicit owner acceptance, Commander integration, and separate implementation authorization remain mandatory under the [architecture-to-implementation gate](../agents/multi-session-design-workflow.md#architecture-to-implementation-gate). |

## A1 scope guard

A1 may define product outcomes, record semantics, user-visible negative guarantees, native variation bounds, support options, accessibility outcomes, and Policy visibility options. It deliberately does **not** assert Codex Harness Capability Closure or a Codex Capability Gap, choose a Codex integration or maintenance form, create the future gap matrix, activate DeepSeek as runtime/fallback, select Electron, ProseMirror, process topology, IPC, store/index/retrieval design, package format, updater, signing mechanism, credential implementation, sandbox mechanism, or release-workflow topology. Codex Desktop-like interaction is a design reference, not permission to copy its implementation, layout, assets, brand, or coding-agent purpose. Historical UI geometry, Windows-specific behavior, browser-prototype health, and candidate ADR status are not architecture facts.

## A2 scope guard

A2 wrote exactly seven paths: this README, [`DECISION-QUEUE.md`](./DECISION-QUEUE.md), the four new `A2-*.md` records, and root `PROGRESS.md`. It preserved all A1 content and history and added no commit to the sealed A1 head.

A2 deliberately did **not**: assert Harness Capability Closure; assert any Codex Capability Gap; select a Codex surface, artifact, version, package, or dependency; select the maintenance form among external adapter or extension, upstream contribution, maintained patch set, and fork; answer the formal pending maintenance-policy Question 3; answer `DQ-A1-01`; produce costed Codex Secondary Development routes; inspect DeepSeek runtime evidence or open its re-entry gate; write an ADR; promote any candidate term or record to a canonical context, glossary, or ADR; or enter A3.

It took no external action of any kind: no clone, download, copy, vendoring, install, authentication, dependency resolution, model or provider call, app-server start, protocol handshake, schema generation, prototype, push, pull request, merge, or publication. Both separately authorized version/help probes (`P-A2-01`, `P-A2-02`) were refused by the original Worker session's permission mode and later executed successfully by Commander authority, establishing the installed binary identity `codex-cli 0.147.0` and the app-server help surface. **Those version/help probes ran; runtime-behavior and closure probes did not.** The observations do not run app-server or the editor and prove no matrix row.

Only official OpenAI sources were used for Codex claims. One is recorded with its provenance caveat: the official documentation URL `developers.openai.com/codex/app-server` returned an HTTP 308 redirect to the OpenAI-owned host `learn.chatgpt.com/docs/app-server`, which was followed and recorded. No third-party page was admitted.
