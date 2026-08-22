# A1 and A2 decision queue

Status: **Issue #4 noncanonical queue; three decisions pending — the compound A1 owner decision `DQ-A1-01` plus the two A2 entries `DQ-A2-01` and `DQ-A2-02`; recommendations are advisory, not preselection**

## Commander clarification protocol

This protocol is binding from the 2026-08-21 Commander clarification and does not widen A1. If an ambiguous term or unresolved choice could change product scope, platform promise, AI7/Codex/DeepSeek ownership, single execution authority, Policy/Effect authority, the data/privacy boundary, UI business semantics, or later A2/A3 evidence scope, a Worker first explores all authorized exact evidence. Only a residual owner trade-off enters this queue. The Worker then must:

1. record the exact residual question, why evidence cannot decide it, why it is load-bearing, its admitted evidence, two or three mutually exclusive answers, an explicit recommendation, and the error caused by guessing;
2. stop that branch of inference without choosing for the owner; and
3. wait for an exact resolution relayed by the Commander.

The Commander uses `grill-with-docs`—a one-question-at-a-time grilling flow with active domain modeling—to map the known decision tree, announce and revise its estimated question count, give a recommendation for each question, and obtain one exact answer before continuing. When an answer resolves domain language, the Commander updates the owning `CONTEXT.md` and the bilingual `GLOSSARY.md`; an ADR is warranted only when the result is simultaneously hard to reverse, surprising without context, and a real trade-off. The Worker does not run that owner interview or write canonical term/ADR changes on this branch.

DQ-A1-01 below is still the **only compound owner decision requested by A1**, but it contains seven known sequential clarification questions. A2 later added two further entries, [DQ-A2-01](#dq-a2-01--unsupported-dependency-acceptance-threshold) and [DQ-A2-02](#dq-a2-02--exact-closure-subject-artifact), under this same protocol. Conditional exact parameters—OS versions, the value of `N`, CPU family names, channel membership, primary/preview cells, Core Parity Set IDs, an external accessibility standard, or a new Policy-governance role—remain evidence-blocked and require a new protocol-complete queue entry before a canonical promise; no default may be inferred.

## DQ-A1-01 — Product Support and Consistency Profile

**Decision owner:** repository owner, reached through the Commander.

**Question:** Under the Windows+macOS working premise, which compound profile defines one AI7 product?

Choose exactly one option from each matrix in [A1 Product Consistency](./A1-PRODUCT-CONSISTENCY.md#mutually-exclusive-owner-choice-axes):

| Field | Mutually exclusive values |
| --- | --- |
| OS-floor policy | `O1` fixed product-major / `O2` rolling vendor window / `O3` release-specific evidence |
| CPU policy | `C1` all current native / `C2` one launch baseline per OS / `C3` primary native plus translated compatibility |
| Channel outcome | `H1` symmetric dual / `H2` one preferred native per OS / `H3` evidence-driven per-platform portfolio |
| Support tier | `S1` uniform GA / `S2` per-cell GA plus preview / `S3` primary/secondary platform |
| Feature parity | `F1` full lockstep / `F2` exact Core Parity Set plus expiring exceptions / `F3` differentiated catalogs |
| Accessibility | `A11Y-1` essential-journey equivalence / `A11Y-2` formal conformance plus journeys / `A11Y-3` published compatibility matrix only |
| Policy visibility/activation | `PV1` outcome-only/developer / `PV2` read-only receipt/developer / `PV3` scoped editorial governance |

This is the **only owner choice requested by A1**. It is one compound decision rather than seven unrelated architecture decisions because the combination must pass the consistency checks. A1 deliberately supplies no preselected answer, exact OS version, CPU name, package format, or release date.

The sentence above means the product has no preselected answer. The following architect recommendations are required inputs to the Commander's one-at-a-time clarification and remain non-authoritative until the owner resolves each question.

### Seven sequential clarification questions

| Step | Exact question | Why load-bearing | Admitted evidence | Mutually exclusive answers | Architect recommendation | Error if guessed |
| --- | --- | --- | --- | --- | --- | --- |
| **DQ-A1-01.A** | What policy governs the minimum supported OS version over time? | It determines promise stability, deprecation, verification breadth, and upgrade burden. | The [review packet](../architecture-exploration/REVIEW-PACKET.md#audited-candidate-input--platform-q16-and-phase-0) leaves exact floors open; `EV-A1-01` records the missing fleet/lifecycle evidence. | `O1` / `O2` / `O3` | **Recommend O1**: stable product-major floors best fit a professional enterprise audience; choose exact versions only after fleet/lifecycle evidence. | AI7 silently promises every version, or changes floors release by release without an understood contract. |
| **DQ-A1-01.B** | What CPU-family rule defines formal launch support, and what status may translated execution receive? | It changes ABI, performance, IME/accessibility, confinement, and release evidence scope. | No CPU commitment exists in the [packet](../architecture-exploration/PACKET-MANIFEST.md); `EV-A1-01` and `EV-A1-08` record fleet and runtime-surface gaps. | `C1` / `C2` / `C3` | **Recommend C2 initially**: one evidence-backed native baseline per OS avoids treating “can launch” as support; expansion remains a later explicit choice. | Hardware is excluded accidentally, or translation is marketed as GA without 10M, accessibility, and isolation proof. |
| **DQ-A1-01.C** | Must Windows and macOS expose the same distribution-channel outcomes? | Channel choice changes install/remove/update, data location, recovery, relocation, and managed-machine expectations. | Canonical Windows outcomes are exact in [ADR 0023](https://github.com/zhouy1017/ai7-harness/blob/c8cbe26c4cccc4a912b3bbc05bd5b23fbf5468b9/docs/adr/0023-portable-release-with-self-contained-data-root.md); no macOS equivalent is admitted, and `EV-A1-02` records the gap. | `H1` / `H2` / `H3` | **Recommend H3**: preserve outcome evidence per platform instead of forcing package symmetry or discarding accepted Windows needs. | A platform inherits an unnatural/unsafe channel, or a required data/recovery outcome disappears because channel counts were normalized. |
| **DQ-A1-01.D** | Must every admitted OS/CPU/channel cell be GA at the same time? | It controls release claims, support obligations, evidence gates, and whether “one product” permits staged maturity. | The [review packet](../architecture-exploration/REVIEW-PACKET.md#audited-candidate-input--platform-q16-and-phase-0) records no accepted support tier; `EV-A1-03/06` record absent per-cell evidence. | `S1` / `S2` / `S3` | **Recommend S2**: per-cell GA/preview labels permit evidence-honest staging without silently creating a permanent secondary edition. | Preview evidence is marketed as GA, or a second product tier emerges without explicit owner acceptance. |
| **DQ-A1-01.E** | What does feature parity require across GA cells? | It decides whether native variation preserves one product or masks different capabilities and business outcomes. | The [crosswalk](./A1-EVIDENCE-CROSSWALK.md#disposition-legend-and-totals) identifies 60 shared semantics, 5 adapter-bound rows, 10 candidate hypotheses, and 4 evidence gaps. | `F1` / `F2` / `F3` | **Recommend F2**: an exact Core Parity Set with expiring exceptions preserves business semantics while admitting justified native integration. | Pixel sameness becomes the gate, or material semantic gaps are hidden as “native” differences. |
| **DQ-A1-01.F** | What accessibility outcome is part of a formally supported cell? | It changes whether professional editors can complete essential journeys and what evidence a support claim requires. | J-14 and the missing macOS/professional/disabled-editor results are exact in the [crosswalk](./A1-EVIDENCE-CROSSWALK.md#fourteen-journeys); `EV-A1-03/06` record the gap. | `A11Y-1` / `A11Y-2` / `A11Y-3` | **Recommend A11Y-1**: essential-journey equivalence is strong and product-specific without guessing an external conformance level. | Windows-only plans are generalized to macOS, or “supported” excludes keyboard/IME/AT completion without disclosure. |
| **DQ-A1-01.G** | What Policy identity may editorial users see, and who may activate which Policy class? | It can widen domain authority or make audit/blocker explanations opaque; visibility must not be mistaken for activation. | Current precedence is exact in [ADR 0018](https://github.com/zhouy1017/ai7-harness/blob/c8cbe26c4cccc4a912b3bbc05bd5b23fbf5468b9/docs/adr/0018-tiered-activation-for-agent-authored-revisions.md); [ADR 0004](https://github.com/zhouy1017/ai7-harness/blob/c8cbe26c4cccc4a912b3bbc05bd5b23fbf5468b9/docs/adr/0004-govern-learning-eligibility-with-versioned-policy-documents.md) supplies earlier user-governance rationale; `EV-A1-07` records evidence needed only for a future supersession. | `PV1` / `PV2` / `PV3` | **Recommend PV2**: expose a read-only identity/receipt while keeping activation developer-owned; this requires explicit supersession of the hidden-assets wording. | Editors cannot identify the governing version when the product needs that trace, or editorial visibility silently grants activation/authority. |

### Why the owner must choose

The exact owner wording “consistent product outlook” does not settle parity, native exceptions, support tiers, accessibility, Policy visibility, or exact supported cells; the [review packet](../architecture-exploration/REVIEW-PACKET.md#audited-candidate-input--platform-q16-and-phase-0) explicitly says none is accepted or proposed. Canonical `main@c8cbe26` remains Windows-only, while candidate ADR 0027 is admitted only as candidate evidence by the [packet manifest](../architecture-exploration/PACKET-MANIFEST.md#platform-candidate-objects).

### Choice result

The selected tuple must produce:

1. a declared supported-cell schema `{OS floor × CPU × channel × tier}`;
2. an exact feature/core-parity set and any Native Exception Ledger entries;
3. the accessibility evidence promise for each formal tier;
4. the Policy visibility and activation actor contract;
5. explicit incompatibilities rather than silent fallbacks; and
6. an ADR disposition proposal—still noncanonical until owner acceptance and Commander integration.

Exact cell values may remain evidence-bound after the owner selects the governing policy. “To be measured” is valid only when paired with the evidence owner, exit criterion, and current non-support status; it is never an implicit broad promise.

## Canonical disposition if DQ-A1-01 is later accepted

A1 edits none of these records. A later coherent candidate must state the exact disposition:

| Canonical record at `c8cbe26` | Invariant material to keep | Option-dependent disposition |
| --- | --- | --- |
| [ADR 0013](https://github.com/zhouy1017/ai7-harness/blob/c8cbe26c4cccc4a912b3bbc05bd5b23fbf5468b9/docs/adr/0013-ship-standalone-only-v1.md) | Chinese-first Standalone, professional editing sufficiency, Word exclusion. | Supersede only the Windows-only product clause if two-platform scope is accepted. |
| [ADR 0014](https://github.com/zhouy1017/ai7-harness/blob/c8cbe26c4cccc4a912b3bbc05bd5b23fbf5468b9/docs/adr/0014-verify-on-one-windows-gate.md) | Concise provider-free evidence, request fingerprint, no manuscripts in hosted CI. | Reopen platform evidence ownership; A1 does not select workflow topology. |
| [ADR 0023](https://github.com/zhouy1017/ai7-harness/blob/c8cbe26c4cccc4a912b3bbc05bd5b23fbf5468b9/docs/adr/0023-portable-release-with-self-contained-data-root.md) | Windows channel/data/secret outcomes and no-silent-fallback principle as current Windows facts. | Keep, narrow, or supersede channel promises according to H1/H2/H3; infer nothing for macOS. |
| [ADR 0024](https://github.com/zhouy1017/ai7-harness/blob/c8cbe26c4cccc4a912b3bbc05bd5b23fbf5468b9/docs/adr/0024-electron-shell-with-isolated-ai7-service.md) | Product outcomes such as responsive editing, crash separation, headless evidence need, no exposed listener remain evidence inputs. | Runtime/process/IPC mechanism is outside A1 and must be revalidated later, not preserved by the platform choice. |
| [ADR 0004](https://github.com/zhouy1017/ai7-harness/blob/c8cbe26c4cccc4a912b3bbc05bd5b23fbf5468b9/docs/adr/0004-govern-learning-eligibility-with-versioned-policy-documents.md) | Versioned, evaluated, non-self-expanding governance. | Preserve as earlier rationale; PV1 follows the later developer-only rule, while PV2/PV3 require explicit supersession and a precise actor contract. |
| [ADR 0018](https://github.com/zhouy1017/ai7-harness/blob/c8cbe26c4cccc4a912b3bbc05bd5b23fbf5468b9/docs/adr/0018-tiered-activation-for-agent-authored-revisions.md) | Developer review, lineage, rollback, no self-activated authority expansion. | Keep the current hidden-assets rule under PV1; explicitly supersede visibility/actor clauses under PV2/PV3. |
| [ADR 0025](https://github.com/zhouy1017/ai7-harness/blob/c8cbe26c4cccc4a912b3bbc05bd5b23fbf5468b9/docs/adr/0025-windowed-editing-over-a-paging-manuscript-store.md) | 500K/1M/10M and whole-manuscript user outcomes. | Mechanisms remain outside A1 and evidence-gated; feature parity applies to the outcomes. |
| [`AGENTS.md`](https://github.com/zhouy1017/ai7-harness/blob/c8cbe26c4cccc4a912b3bbc05bd5b23fbf5468b9/AGENTS.md) | All platform-neutral domain, safety, authority, privacy, learning, and editing invariants. | Reconcile Windows-only and Policy-visibility wording only through accepted ADR disposition. |

Candidate ADR 0027 at `9606891` is evidence, not a canonical record to amend. A later ADR may reuse or replace its premise only after the normal owner/Commander path.

## OD-2026-08-21 — V2 harness selection direction (recorded, not pending)

**Exact owner record:** [`4741dd1b468e1fd88b9d71386446f761eef8e1e5:docs/architecture-exploration/CODEX-HARNESS-DIRECTIVE.md`](https://github.com/zhouy1017/ai7-harness/blob/4741dd1b468e1fd88b9d71386446f761eef8e1e5/docs/architecture-exploration/CODEX-HARNESS-DIRECTIVE.md), blob `29dcb3e6aa0a3180117400404ed0fa77504bb641`, 8213 bytes. A1 re-derived all three values before reading the object.

**Status:** exact owner-direction object conveyed through the Commander; it creates no second A1 owner choice and makes no dependency canonical. It is an owner direction only — not technical truth, not capability evidence, and not an A2 seam conclusion. [OR-2026-08-21-01](#or-2026-08-21-01--conditional-primary-agent-harness-role-resolved-not-pending) and [OR-2026-08-21-02](#or-2026-08-21-02--codex-gap-closure-and-deepseek-runtime-re-entry-resolved-not-pending) **later narrow it**: where this object still says DeepSeek Harness "remains a comparison candidate" and allows a provably non-overlapping mixed design, the two later resolutions replace that with the closure/gap/re-entry ladder. Read the narrowed rules, not this object alone.

**Superseded assumption:** future A2 would examine only DeepSeek Harness `0.1.0-rc.6` composition/seam closure.

**New working premise:** AI7 owns and defines its business requirements, domain authority, Policy Documents, Effects/Receipts, Task Ledger and other business records, Book/manuscript scope, and professional editorial UX outcomes. A2 evaluates open-source Codex Harness Capability Closure first and dispositions DeepSeek rules/patterns plus V1 runtime assumptions as reference-framework evidence; “Codex-first” is priority of evaluation, not proof of closure. The provenance the object registers for that future investigation is [OpenAI's official platform article](https://developers.openai.com/blog/codex-as-a-platform) and the open-source [Codex research snapshot `main@44e95c857f37f81a5731eab72c32a3d334d0e2c4`](https://github.com/openai/codex/tree/44e95c857f37f81a5731eab72c32a3d334d0e2c4). A1 has not technically evaluated either source; the snapshot is not a product dependency pin.

## OR-2026-08-21-01 — Conditional Primary Agent Harness role (resolved, not pending)

**Exact owner record:** [`92e2160fef9ce8195f1fee7fe29b60ba7e9d33a3:docs/architecture-exploration/clarifications/0001-primary-agent-harness-role.md`](https://github.com/zhouy1017/ai7-harness/blob/92e2160fef9ce8195f1fee7fe29b60ba7e9d33a3/docs/architecture-exploration/clarifications/0001-primary-agent-harness-role.md), blob `9666dccafcce3d46711bc3ce18c820fa8cc377bb`, 6162 bytes. A1 re-derived all three values before reading the object.

**Status:** owner accepted for the V2 candidate; canonical integration pending; the Codex role remains contingent on future A2 evidence. This is not a pending clarification and adds no owner question to DQ-A1-01.

| Condition/result | Exact owner resolution | Forbidden inference |
| --- | --- | --- |
| A2 proves **Harness Capability Closure** for one exact Codex surface | Codex Harness becomes the sole production **Primary Agent Harness** (`主代理执行框架`): the single framework for generic model conversation, context assembly, turn progression, model invocation, tool dispatch, streamed technical events, and in-turn recovery. | A1 completion, the official article, repository shape, compilation, or feature impression does not prove closure. |
| That closure passes | DeepSeek Harness becomes a non-runtime **Development Reference Framework** (`开发参考框架`) only: AI7 may re-express useful rules, patterns, checklists, and documentation experience in AI7-owned records/assets. | DeepSeek contributes no product package, executable/process, Session authority, loop, tool runtime, capability grant, fallback executor, runtime authority, or user-facing branding. |
| A2 claims a load-bearing Codex gap | Apply [OR-2026-08-21-02](#or-2026-08-21-02--codex-gap-closure-and-deepseek-runtime-re-entry-resolved-not-pending): verify the exact gap, prefer and cost Codex-based secondary development, and admit DeepSeek to comparison only after proving a Mature Runtime Alternative. | A gap alone does not admit DeepSeek; comparison does not select it; no automatic fallback or second loop is inferred. |
| Canonical/coherent-candidate writing becomes authorized | Vendor-qualify Codex/DeepSeek claims and disposition the canonical execution context, canonical bilingual glossary, ADR 0020/0021/runtime ADRs, and dependent instructions through the normal candidate and integration path. | This A1 branch does not edit canonical V1 or treat the conditional record as integrated architecture. The candidate-local [execution context](./domain/execution/CONTEXT.md), [glossary](./GLOSSARY.md), and [ADR 0001](./adr/0001-conditional-primary-agent-harness-and-gap-closure.md) exist inside `docs/architecture-v2/` only and are not the canonical records. |

**Harness Capability Closure** (`执行框架能力闭合`) is the future A2 evidence result that one exact candidate surface supplies every load-bearing AI7 agent-loop capability, natively or through a narrow AI7 adapter that does not reproduce a second generic loop. A2 must define and close that matrix; A1 does not claim it exists yet. This term and the other six candidate execution terms are owned by the candidate [Execution (V2 candidate)](./domain/execution/CONTEXT.md) context and indexed bilingually in the [candidate glossary](./GLOSSARY.md); the conditional disposition is [candidate ADR 0001](./adr/0001-conditional-primary-agent-harness-and-gap-closure.md).

## OR-2026-08-21-02 — Codex gap closure and DeepSeek runtime re-entry (resolved, not pending)

**Exact owner record:** [`753db78c15a1853047a41c1402d80c0ad8dbe2ea:docs/architecture-exploration/clarifications/0002-codex-gap-closure-and-dsh-reentry.md`](https://github.com/zhouy1017/ai7-harness/blob/753db78c15a1853047a41c1402d80c0ad8dbe2ea/docs/architecture-exploration/clarifications/0002-codex-gap-closure-and-dsh-reentry.md), blob `b041b743e081ed93bf6d3a9f8187e5945d202f24`, 6467 bytes. A1 re-derived all three values before reading the object.

**Status:** owner accepted for the V2 candidate; canonical integration pending; the exact Codex maintenance form remains open. This is a resolved future-A2 constraint, not a pending A1 clarification, and adds no owner question to DQ-A1-01.

| Future-A2 condition | Required disposition | Forbidden inference |
| --- | --- | --- |
| A Codex capability gap is claimed | Verify the load-bearing requirement and prove that an exact Codex component, pin, protocol, and supported configuration cannot satisfy it, using a provenance-labeled probe when needed. | Missing documentation, an undiscovered seam, or an untested assumption is not yet a gap. |
| An exact Codex gap is verified | Prefer and cost Codex Secondary Development while preserving one Primary Agent Harness and every AI7 authority boundary. Cost implementation, testing, security, licensing/notices, platform behavior, upstream updates, protocol migration, and long-term maintenance. | The owner's “low cost” premise is not evidence; A1 does not select external adapter/extension, upstream contribution, maintained patch set, or fork. |
| DeepSeek runtime re-entry is proposed | First prove both the exact Codex gap and an exact, obtainable, license/platform-compatible, maintained, testable DeepSeek Mature Runtime Alternative with credible lifecycle, persistence, security, upgrade, packaging, and verification behavior. | A repository feature, design document, unpublished package, marketing claim, or the Codex gap alone does not pass the re-entry gate. |
| Both re-entry conditions pass | Compare cost and risk, then return the residual production-runtime choice to the owner. If DeepSeek is later selected, one runtime replaces the other for the affected production role. | Eligibility is not selection, fallback, supplement, interchangeable loops, or authority to run both inside one authorized Run. |

This clarification narrows the failed-closure branch of OR-2026-08-21-01. A1 records the gate and writes the candidate-local records the two resolutions require — the [Execution (V2 candidate)](./domain/execution/CONTEXT.md) context, the [candidate glossary](./GLOSSARY.md), and [candidate ADR 0001](./adr/0001-conditional-primary-agent-harness-and-gap-closure.md). A1 still builds no gap matrix, cost model, or probe, makes no maintenance-form decision, and promotes nothing to a canonical context, glossary, or ADR.

### Canonical-baseline records A2 must disposition

A1 changes none of these accepted records. The owner direction reopens their runtime-specific conclusions for a future candidate while preserving their AI7 outcome constraints:

| Canonical record at `c8cbe26` | Invariant material to keep | A2 disposition required |
| --- | --- | --- |
| [ADR 0011](https://github.com/zhouy1017/ai7-harness/blob/c8cbe26c4cccc4a912b3bbc05bd5b23fbf5468b9/docs/adr/0011-separate-task-business-and-harness-execution-ledgers.md) | AI7 business truth and executor technical history remain separate and exactly bound; continuation meanings remain distinct. | On closure pass, replace the DeepSeek-specific technical ledger primitive/name with the exact Codex binding; no DeepSeek product Session remains. |
| [ADR 0017](https://github.com/zhouy1017/ai7-harness/blob/c8cbe26c4cccc4a912b3bbc05bd5b23fbf5468b9/docs/adr/0017-full-engine-narrow-tool-surface.md) | AI7 domain-shaped capabilities, no generic shell/roaming filesystem/arbitrary network, and no user-evaluated unsafe escalation. | Preserve outcomes; on closure pass, restate “full engine” against the exact Codex surface with DeepSeek reference-only. |
| [ADR 0020](https://github.com/zhouy1017/ai7-harness/blob/c8cbe26c4cccc4a912b3bbc05bd5b23fbf5468b9/docs/adr/0020-consume-pinned-harness-package-subset.md) | Exact provenance/pins, dependency-graph exclusion as stronger than unwired defaults, notices, and capability-exposure/compatibility evidence. | On closure pass, reject the DeepSeek package-subset/`0.1.0-rc.6` production conclusion and establish exact Codex artifact/pin/upgrade rules; reference-only DeepSeek has no dependency. |
| [ADR 0021](https://github.com/zhouy1017/ai7-harness/blob/c8cbe26c4cccc4a912b3bbc05bd5b23fbf5468b9/docs/adr/0021-single-execution-authority.md) | Parallel Runs are required; one generic execution-authority implementation serves a Run; AI7 owns business scheduling. | On closure pass, vendor-qualify Codex as that one implementation and remove every DeepSeek loop, scheduler, Session, or fallback role without weakening AI7 scheduling. |
| [ADR 0024](https://github.com/zhouy1017/ai7-harness/blob/c8cbe26c4cccc4a912b3bbc05bd5b23fbf5468b9/docs/adr/0024-electron-shell-with-isolated-ai7-service.md) | Responsive editing, crash separation, headless evidence, and no exposed listener remain product/evidence inputs. | Revalidate all runtime/process/IPC mechanisms against the surviving A2 candidate; A1 preserves none by implication. |

### Required A2 candidate dispositions

| Candidate | Question A2 must answer | No inference in A1 |
| --- | --- | --- |
| **A — Codex app-server** | Does its exact lifecycle/protocol surface contribute all required embedded-product capabilities to Codex Harness Capability Closure? | It is a preferred evaluation surface, not a closure result, dependency pin, or product authorization. |
| **B — Codex SDK / `codex exec`** | Can either fill only a bounded background/verification role without duplicating app-server lifecycle/authority, and what exact surface is actually exercised? | SDK, CLI/exec, and app-server are not interchangeable names or pre-approved seams. |
| **C — DeepSeek Harness `0.1.0-rc.6`** | Which rules/patterns remain valuable as Development Reference Framework evidence, and—only after OR-2026-08-21-02's two necessary conditions pass—does an exact surface qualify as a Mature Runtime Alternative? | If Codex closure passes, DeepSeek has no runtime, fallback, package, process, Session, tool, authority, or branding role. A closure failure alone infers no DeepSeek role. |
| **D — Runtime composition** | Under a closure pass, disposition this as rejected. Under an eligible DeepSeek re-entry, compare mutually exclusive single-authority outcomes and return a new owner choice; do not design automatic/interchangeable fallback. | The earlier conditional allowance for a provably non-overlapping composition is not an owner choice already made; “use both” and silent fallback remain unauthorized. |

### Hard boundaries carried into A2

- AI7 Task Ledger, Workflow Instances, Plan Envelopes, Capability Grants, Policy Documents, Effects/Receipts, manuscript authority, and Book/Run Source Scope remain AI7 records. Codex Thread/Turn/Item records and DeepSeek Session events may correlate with them but never impersonate them.
- Runtime approval or sandbox state is execution-layer evidence only; it cannot grant Effect Approval, Public Release Permission, or any other AI7 domain authority, and it cannot substitute for an Effect Receipt.
- Editorial Runs still receive no generic shell, roaming filesystem, arbitrary network tool, coding preset/prompt/tool default, or self-service capability escalation.
- The product and interface owner remains AI7. Codex Desktop-like interaction may inform interaction language and information architecture, but neither Codex nor DeepSeek becomes user-facing branding and no implementation, layout, asset, or coding-agent purpose is inherited by default.
- Provider/model replaceability remains required. A2 must test the actual separation among the open-source Codex harness, provider/model access, credentials, and any managed service rather than infer it from branding or repository structure.
- A closure pass has one resolved production authority: Codex Harness. DeepSeek is reference-only. A claimed closure failure follows the OR-2026-08-21-02 ladder: exact gap proof, costed Codex secondary development, then Mature Runtime Alternative proof before any DeepSeek comparison and new owner choice. No step activates fallback or composition.

### Exact questions deferred to A2

1. What closed AI7 capability matrix defines Harness Capability Closure, including conversation/thread lifecycle, context assembly, turns, model invocation, tool dispatch, continuation, interruption, retry, technical events, and in-turn recovery?
2. Which exact Codex app-server, SDK, and/or `codex exec` surfaces satisfy each matrix row, and are their roles one framework surface rather than duplicate loops or authorities?
3. What stable binding correlates Codex technical history with AI7 Tasks/Runs/Plans/Effects without copying transcripts or promoting runtime success to business completion?
4. What are the real process, protocol, tool, filesystem, network, sandbox, approval, cancellation, crash, and concurrency surfaces on every claimed OS/CPU cell?
5. Can all coding defaults and broad capabilities be absent from both composition and dependency surface, not merely hidden in UI?
6. How independent is the exact Codex surface from a particular provider, model, endpoint, credential path, or managed service?
7. What licensing, NOTICE, trademark/brand, release/pin, upgrade, compatibility, and protocol-version obligations follow from the Codex production role and DeepSeek reference-only role?
8. If closure is claimed to fail, does the exact Codex component/pin/protocol/supported configuration—and a provenance-labeled probe where needed—prove a Codex Capability Gap rather than missing documentation, an undiscovered seam, or an untested assumption?
9. For a verified gap, what costed Codex Secondary Development forms could close it while preserving one loop, and why does the preferred form survive implementation, testing, security, licensing/notices, platform, upstream-update, protocol-migration, and long-term-maintenance review?
10. Only if the Codex gap remains, does an exact DeepSeek surface prove a Mature Runtime Alternative; if so, what residual mutually exclusive runtime trade-off must return to the owner?

### Historical A1 record of A2 admission and evidence requirements

In the A1-only turn, A2 **was unavailable**. It required Commander confirmation that the [A1 invariant list](./A1-PRODUCT-CONSISTENCY.md#stable-invariant-list) was stable, a separate brief, and exact provenance labels for every source or probe. The later A2 dispatch supplied that authority and admitted the exact source classes recorded in the [A2 Evidence Register](./A2-EVIDENCE-REGISTER.md). This paragraph is historical A1 admission state; it is not a current claim that A2 remains unentered. Transcripts, active foreign worktrees, unlabeled context, implementation, dependency installation, source copying, vendoring, prototype work, and external actions remained inadmissible unless separately authorized; none was authorized for A2.

## A2 result — Codex-first capability closure (complete, not pending)

**Verdict: `Closure not proven`.** Full records: [A2 Capability Closure](./A2-CAPABILITY-CLOSURE.md), [A2 Codex Seam](./A2-CODEX-SEAM.md), [A2 Evidence Register](./A2-EVIDENCE-REGISTER.md), [A2 Gap Register](./A2-GAP-REGISTER.md).

| Measure | Result |
| --- | --- |
| Corrected closed row set | 44 rows; exact review re-opened the incomplete former set, all eleven owner-direction evidence bullets plus the separate K/A/R/S disposition bullet were traced, four omitted rows were added, and the corrected set was frozen before re-scoring |
| Load-bearing rows | 43 (`CC-36` is `Not applicable`: canonical baseline is Windows-only and `DQ-A1-01` is unresolved) |
| Proven | **0** |
| Candidate / Experimental / Unknown | 15 / 2 / 26 |
| Gap claims | 0 |
| **Verified Codex Capability Gaps** | **0** |

**What this result does and does not activate.**

| Conditional record | Effect of the A2 result |
| --- | --- |
| [OR-2026-08-21-01](#or-2026-08-21-01--conditional-primary-agent-harness-role-resolved-not-pending) closure-pass branch | **Does not activate.** Codex does not become the sole production Primary Agent Harness, and DeepSeek Harness does not become a Development Reference Framework. |
| [OR-2026-08-21-02](#or-2026-08-21-02--codex-gap-closure-and-deepseek-runtime-re-entry-resolved-not-pending) gap ladder | **Does not activate.** No gap is verified, so no costed Codex Secondary Development is produced and no maintenance form is selected. |
| DeepSeek Runtime Re-entry Gate | **Remains closed.** The Codex Capability Gap condition was assessed and is not met; the Mature Runtime Alternative condition was not assessed and is also not met. `Closure not proven` is an evidence state, not a verified gap, and only a verified gap permits assessment of the second condition. |

Candidate C receives the exact disposition **Keep — deferred candidate evidence only for this A2 evaluation**. “Keep” is neither DeepSeek runtime selection/evaluation nor Development Reference Framework activation; it does not pass the Runtime Re-entry Gate and promises no future admission.

**The three blockers.** Each fails closure independently of any single row.

| ID | Blocker | Rows | Resolved by |
| --- | --- | --- | --- |
| **BLK-A2-01** | No exact coherent surface exists to close against. The pinned research snapshot is explicitly not a dependency pin; the current official documentation names no version. Their method inventories, data-directory documentation, and the scope of their production warning differ. | `CC-01` | `DQ-A2-02` |
| **BLK-A2-02** | The vendor recommends `codex app-server` for exactly AI7's integration shape **and** states that "The app-server command and WebSocket transport are experimental and aren't supported for production workloads." Both are simultaneous facts; the stricter, current one governs the production question. | `CC-02`, `CC-03` | `DQ-A2-01`, or an upstream support change |
| **BLK-A2-03** | The narrow-tool-surface exclusion is unproven in the direction AI7 defined as decisive. Shell, filesystem, network, and coding-oriented tooling are documented as sandbox-*constrained*; nothing shows they can be made *absent*. | `CC-16`–`CC-19` | Evidence (`UNK-A2-06`–`UNK-A2-09`), not a decision |

### Disposition of the four A1 candidates

A1 required A2 to disposition candidates A–D; here is where each stands. None of these is a selection.

| Candidate | A2 disposition |
| --- | --- |
| **A — Codex app-server** | **Spike.** The preferred evaluation surface and the [seam design](./A2-CODEX-SEAM.md)'s production *candidate*. It does not contribute all required capabilities on the admitted evidence: 26 rows Unknown and the surface itself Experimental by vendor statement. Not a closure result, dependency pin, or authorization. |
| **B — Codex SDK / `codex exec`** | **Reject as an additional production surface.** `S-A2-01` assigns the three integration layers distinct roles, and admitting more than one would create overlapping loops (`CC-04`). AI7's bounded background and verification role is served by the AI7-owned deterministic replay adapter, which needs no second Codex entry point. Not re-evaluated as a fallback. |
| **C — DeepSeek Harness `0.1.0-rc.6`** | **Keep — deferred candidate evidence only for this A2 evaluation.** Keep means the already admitted candidate record remains available as deferred evidence only. It is explicitly not runtime selection or evaluation, Development Reference Framework activation, Runtime Re-entry Gate passage, or a promise of future admission. |
| **D — Runtime composition** | **Reject.** No evidence supports a mixed or dual-runtime design, and none was sought. The one-loop invariant is enforced structurally by the Module admitting exactly one adapter per execution. |

**The A2 stable-binding question is answered as a candidate.** A1 left open what binding correlates executor technical history with AI7 Tasks, Runs, Plans, and Effects. The [seam design](./A2-CODEX-SEAM.md#the-stable-binding-answer) keeps two canonical records distinct: the immutable AI7-owned Execution Binding binds the complete semantic/authority inputs and references, while each Harness Execution Span identifies the exact Harness Session event range or explicit range set for one dispatch, Resume, or Retry. AI7 persists the binding before capability- or Effect-capable action; repeat-open drift fails closed; append-only link records associate applicable Effects without mutating the binding, and no Harness result becomes an Effect Receipt. `CC-28` remains `Candidate`, not Proven. This is a different question from the formal pending maintenance-policy Question 3, which **A2 did not answer**.

## DQ-A2-01 — Unsupported-dependency acceptance threshold

**Decision owner:** repository owner, reached through the Commander.

**Exact question:** May AI7 ship a Primary Agent Harness whose vendor documents it as experimental and not supported for production workloads?

**Why evidence cannot decide it:** support classification is OpenAI's policy, not a technical property. No AI7 code, adapter, or probe changes it, and no further evidence AI7 can gather resolves it. It is a risk-appetite trade-off.

**Why it is load-bearing:** it caps `CC-02` and `CC-03` at Experimental, which alone prevents a closure pass however well every other row scores. It also governs whether A3 can ever receive a decision-ready surface.

**Admitted evidence:** `S-A2-01` recommends app-server for embedded products in wording that matches AI7's shape precisely. `S-A2-02` excludes the app-server command from production workloads. `S-A2-03`, at the pinned snapshot, scopes the same warning to WebSocket alone. Neither source documents a compatibility or breaking-change policy (`CC-32`).

| Option | Meaning |
| --- | --- |
| **U1** | Require a vendor-supported surface before any production role. A2 stays open until upstream changes its classification. |
| **U2** | Accept unsupported status as a recorded, bounded risk: one exact pin, an AI7-owned schema-fingerprint gate that fails closed on drift, and a stated exit plan. |
| **U3** | Defer the decision and re-evaluate at a named later date or upstream milestone. |

**Architect recommendation — U2.** U1 makes AI7's schedule a function of another vendor's release policy with no lever to move it, and the owner's Codex-first direction would stall indefinitely. U3 defers without reducing risk. U2 is honest about the exposure and converts it into something AI7 controls: the [seam design](./A2-CODEX-SEAM.md) already concentrates the entire exposure behind one Module and one `describeSurface()` call, and the fail-closed fingerprint gate is the concrete mitigation. U2 is a recommendation and is not a decision.

**Error if guessed:** guessing U2 ships a product on an explicitly unsupported vendor surface without the owner having accepted that risk. Guessing U1 silently blocks the owner's stated Codex-first direction on a condition the owner never set.

## DQ-A2-02 — Exact closure-subject artifact

**Decision owner:** Repository Development Commander, escalating to the owner only if the choice changes the support classification decided in `DQ-A2-01` or implies a cost the owner has not accepted.

**Exact question:** Which exact artifact is the subject of a re-scored capability-closure matrix?

**Why evidence cannot decide it:** the two documented surfaces are both real and neither is a shippable pin. Choosing between them is a scope decision about what AI7 intends to consume.

**Why it is load-bearing:** closure is defined against *one exact surface* (`S-A2-05`). Without this, every row is scored against something AI7 may never ship, and `CC-01` cannot leave Unknown.

**Admitted evidence:** `S-A2-04` declares the snapshot research evidence and not a dependency pin. `S-A2-02` names no version. `S-A2-03` and `S-A2-02` document materially different method inventories and different production-warning scopes.

| Option | Meaning |
| --- | --- |
| **X1** | The pinned research commit `44e95c857f37f81a5731eab72c32a3d334d0e2c4`. |
| **X2** | An exact published release, package version, or binary to be identified, which AI7 could actually consume. |
| **X3** | Whatever is current at evaluation time. |

**Architect recommendation — X2.** X1 scores closure against a surface the owner-direction object already says is not a pin, so a pass would prove nothing shippable. X3 reproduces the exact incoherence that produced `BLK-A2-01` and contradicts AI7's accepted rule against treating a moving branch as a pin. X2 requires one preliminary step — identifying what is actually published and obtainable, which is `UNK-A2-20` — and it is the only option under which a closure pass would mean anything. This is a recommendation and is not a decision.

**Error if guessed:** guessing X1 produces a closure verdict about research code. Guessing X3 makes the verdict expire silently as upstream moves, which is the failure mode ADR 0020 was written to prevent.

## Phase entry rules

| Later activity | Actual entry rule | What does **not** grant entry |
| --- | --- | --- |
| A2 — Codex-first capability closure | **Entered and corrected after exact review** under separate Commander dispatches. Owner selection of DQ-A1-01 was not required and did not occur. | Exited `Closure not proven` with 44 rows / 43 load-bearing / 0 Proven / 15 Candidate / 2 Experimental / 26 Unknown / 1 Not applicable / 0 Gap claims / 0 Verified Codex Capability Gaps. Fresh independent exact-head T3-par review is next. |
| A2 continuation — re-scored matrix against one exact artifact | `DQ-A2-02` resolves the exact artifact; `DQ-A2-01` resolves the support threshold; every relied-on Unknown receives its named exit evidence, including `UNK-A2-06`–`UNK-A2-09` and `UNK-A2-22`–`UNK-A2-26`. A separate brief is still required, as is separate authorization for any probe or spike. | This A2 result grants no continuation by implication, and neither does the seam design. |
| Future A3 isolation/local-authority exploration | **Stopped.** A3 requires one selected or decision-ready single-execution-authority surface. A2 identified no exact artifact (`CC-01`) and returned `Closure not proven`, so no such surface exists. | Exact gap evidence, DeepSeek re-entry eligibility, a candidate list, documented sandbox claims, UI claims, unresolved composition, current A1 options, **or this A2 result**. A `Closure not proven` verdict is not a decision-ready surface. |
| Canonical product promise | Owner selects DQ-A1-01, evidence supports the exact cells, affected ADRs are explicitly disposed, and Commander integrates through normal review. | A1 completion, candidate ADR status, or Commander invariant confirmation alone. |
| Coherent V2 candidate | A1 choice plus A2's capability-closure result and conditional role disposition, A3 tests, and other named evidence are reconciled into one candidate. | Either frozen Worker branch wholesale, treating the owner condition as proof of closure, or silently retaining DeepSeek runtime/fallback. |
| Product implementation | Coherent candidate passes independent T3 hostile challenge, owner explicitly accepts it, Commander integrates it, and owner separately authorizes implementation planning. | Any architecture exploration result by implication. |

Future A2/A3 may use separately authorized, exact, provenance-labeled direct evidence and probes. The sealed packet remains the only inherited V1/frozen-candidate input and the only source for the A1 crosswalk; the A1 turn additionally admitted exactly one exact owner-direction object plus two exact owner-resolution objects for its registered direction and future-A2 constraints. The later separately dispatched A2 also admitted the exact Commander-curated seam audit, official OpenAI documentation, the exact source snapshot, and the Commander version/help observations recorded in the [A2 Evidence Register](./A2-EVIDENCE-REGISTER.md). Transcripts, active foreign worktrees, and unlabeled context remain prohibited throughout.

## Evidence queue — not owner decisions and not authorized work

These rows record missing evidence only. They do not dispatch a spike, choose a mechanism, or broaden Issue #4.

| ID | Missing evidence | Needed by / exit condition | Invalidation consequence |
| --- | --- | --- | --- |
| **EV-A1-01** | Target publishing-house OS/version/CPU fleet and upgrade cadence. | Exact O/C cell values; representative, dated fleet evidence. | Broad/fixed floor options remain ungrounded. |
| **EV-A1-02** | Per-platform channel demand, managed-machine constraints, relocation/backup/update/removal expectations. | H1/H2/H3 exact channel set; user-outcome evidence, not package preference. | Channel symmetry/asymmetry promise must remain provisional. |
| **EV-A1-03** | macOS professional-editor, Chinese IME, keyboard, screen-reader, contrast, zoom/reflow, focus, and native lifecycle evidence; appropriate disabled-editor evidence if claimed. | A11Y selection and J-14 parity; every essential journey passes at the chosen tier. | Accessibility parity/support tier must be reduced or the cell excluded. |
| **EV-A1-04** | Complete import metadata/transaction and reimport ambiguity contract plus representative fidelity evidence. | `UX-IMP-004/005`, J-01, feature parity. | Do not claim complete import parity or silent-loss-safe reimport. |
| **EV-A1-05** | End-to-end exact Unicode/IME anchors and complete Factual Verification outcome taxonomy. | `UX-ED-004`, `UX-EVD-004`, J-02/J-04. | Keep rows as evidence gaps; no exact parity claim. |
| **EV-A1-06** | Professional-editor validation of J-01–J-14 and five critical semantic checks on every claimed formal platform tier. | Feature/accessibility acceptance; dated sessions with actual environment and retest status. | Candidate journeys remain hypotheses, never product evidence. |
| **EV-A1-07** | If PV2/PV3 is considered: audit audience, required visibility, exact activating actor, and separation between editorial owner, product owner, and developer review. | Future PV2/PV3 ADR disposition. | Current baseline remains exactly PV1; no editorial visibility or activation may be inferred. |
| **EV-A1-08** | A2 Codex Harness Capability Closure matrix; exact lifecycle/protocol/package/ABI/provider/tool/process/network/approval/sandbox evidence; for any claimed gap, exact proof plus a costed Codex secondary-development assessment; only then, if needed, exact Mature Runtime Alternative evidence and a new owner choice; finally A3 confinement tests against the single surviving surface. | Conditional Primary Agent Harness role, final CPU cells, and runtime-backed UI scope/privacy claims. | **Partly delivered.** The [closure matrix](./A2-CAPABILITY-CLOSURE.md) now exists and returns `Closure not proven`. The exact lifecycle, protocol, ABI, provider, tool, process, network, approval, and sandbox evidence remains outstanding as `EV-A2-01`–`EV-A2-09` below. Closure and gaps remain unproven; no Codex production or DeepSeek comparison, fallback, or enforcement claim may activate. |

### A2 evidence queue

These rows record missing evidence only. They dispatch no spike, select no mechanism, and authorize no probe. Each maps to entries in the [A2 Gap Register](./A2-GAP-REGISTER.md).

| ID | Missing evidence | Needed by / exit condition | Invalidation consequence |
| --- | --- | --- | --- |
| **EV-A2-01** | The tool-registration surface of the exact artifact: whether shell, process, filesystem, network, and coding-oriented tools can be **absent** rather than sandbox-constrained. | `CC-16`–`CC-19`; `UNK-A2-06`–`UNK-A2-09`. The single highest-leverage item in the register. | ADR 0017's narrow-tool-surface guarantee cannot be claimed for a Codex-based composition. |
| **EV-A2-02** | Exact artifact identity, publication channel, obtainability, and update cadence. | `CC-01`, `CC-39`; `UNK-A2-01`, `UNK-A2-20`; input to `DQ-A2-02`. | Every matrix row remains scored against a surface AI7 may never ship. |
| **EV-A2-03** | Provider replaceability for a named mainland-China provider, and the credential path. | `CC-13`, `CC-14`; `UNK-A2-04`, `UNK-A2-05`. Requires retrieving `model-provider-info` at the exact artifact. | Chinese-first provider independence and the Credential Broker boundary stay unproven. |
| **EV-A2-04** | Windows sandbox enforcement strength, elevation behavior, immutable per-execution root/sandbox binding including junction/reparse-point traversal, crash, shutdown, concurrency, and scratch/cache/mutable-authority isolation across overlapping and disjoint authorized scopes. | `CC-22`–`CC-27`, `CC-43`; `UNK-A2-11`–`UNK-A2-16`, `UNK-A2-25`. | The Agent Data Root cannot be described as enforced rather than intended, junction/reparse-point escapes and semantic drift on reopen remain untested, and parallel-Run isolation stays unproven. |
| **EV-A2-05** | Protocol compatibility policy, or acceptance that an AI7-owned schema-fingerprint gate is the entire contract. | `CC-32`; `UNK-A2-18`. | ADR 0020's pin-bump verification has no upstream stability contract to verify against. |
| **EV-A2-06** | Egress inventory: whether compliance-log identification, attestation, feedback upload, or diagnostics transmit Run content, and what is enabled by default. | `CC-31`, `CC-40`; `UNK-A2-17`, `UNK-A2-21`. | The accepted egress boundary — only a configured model call may carry a manuscript off the machine — cannot be claimed. |
| **EV-A2-07** | The four exact source paths cited only through the Commander-curated seam audit and never independently retrieved (`S-A2-10`), plus `LICENSE` and `NOTICE` at the exact artifact (`S-A2-11`). | `CC-09`, `CC-13`, `CC-25`, `CC-30`, `CC-35`, `CC-37`; `UNK-A2-22` is the exact license/notices exit evidence. | Index-mediated rows cannot close; `CC-37` remains Unknown until exact-pin license/notices retrieval. |
| **EV-A2-08** | The two separately authorized version/help probes, `codex --version` and `codex app-server --help`, ran successfully under Commander authority at `2026-08-22T14:50:23Z` after the original Worker refusal. | The observations establish only `codex-cli 0.147.0` and the local app-server help surface and close no matrix row. **Runtime-behavior and closure probes did not run.** | A2 still lacks runtime-behavior evidence and remains `Closure not proven`. |
| **EV-A2-09** | Exact subagent lifecycle/event projection, provider-fallback/ambiguity-stop, and offline-startup behavior. | `CC-41`, `CC-42`, `CC-44`; `UNK-A2-23`, `UNK-A2-24`, `UNK-A2-26`. | Subagents, fallback, and offline startup remain required Interface invariants but cannot be claimed as executor capabilities. |

## Invalidation conditions

Reopen A1 rather than patching a later document if any of these occurs:

- the owner retracts or materially changes the Windows+macOS working premise;
- a proposed supported cell cannot preserve any stable invariant I-01–I-11;
- evidence shows a “native” difference changes authority, data, fidelity, recovery, or accessibility tier;
- the Core Parity Set changes without owner disposition;
- a new user role is required to make PV3 coherent;
- an admitted requirement or journey is superseded by a later accepted domain record;
- a target-house fleet makes the selected floor/CPU/channel policy materially misleading; or
- A2/A3 evidence proves that the selected support promise cannot be met honestly.

Reject an A2 candidate rather than weakening A1 if:

- Codex closure is claimed without every load-bearing matrix row and exact-surface evidence;
- a Codex gap is asserted without exact component/pin/protocol/configuration evidence, the Codex secondary-development cost step is skipped, or DeepSeek re-enters without a proven Mature Runtime Alternative and a new owner choice;
- an A2 candidate requires a second overlapping generic agent loop or cannot prove its responsibility partitions mutually exclusive;
- executor technical events, approval, or sandbox state must impersonate AI7 business records, domain authority, or Effect proof;
- a generic shell, roaming filesystem, arbitrary network path, coding default, or developer escalation reaches an Editorial Run; or
- a closure-pass candidate retains any DeepSeek runtime/fallback role, or requires Codex/DeepSeek branding, coding-agent purpose, or copied UI implementation to remain coherent.

## Historical A1 stop boundary

Issue #4 A1 completed by validating and locally committing its candidate documents, including the candidate-local execution context, glossary, and ADR 0001. It did not choose DQ-A1-01, assert Harness Capability Closure or a Codex Capability Gap, activate the conditional Codex role, admit or retain DeepSeek runtime/fallback, choose an adapter/upstream/patch/fork form, answer Question 3, write the A2 gap matrix, promote any candidate term or ADR to a canonical context/glossary/ADR, admit or cite any post-packet object beyond the one exact direction object and two exact resolution objects, install a dependency, inspect or copy Codex/DeepSeek source, update canonical V1, start A2/A3, create implementation issues, push, open a pull request, merge, publish, or take any external action. This paragraph records the earlier A1 stop; it is not the current A2 boundary.

## Current A2 stop boundary

A2 completes by locally committing exactly seven paths above the sealed A1 head `b5076179a37f8d654e758ca0b4a8bdeec8caaaa5`, which it neither amended nor altered. Beyond A1's admitted objects, A2 additionally admitted the Commander-curated seam audit `9af2a07f:docs/architecture-exploration/CODEX-EXTENSION-SEAMS.md` as an evidence index with warnings, two official OpenAI pages, and one exact `openai/codex@44e95c85…` source path — all recorded in the [A2 Evidence Register](./A2-EVIDENCE-REGISTER.md).

A2 does **not** assert Harness Capability Closure or any Codex Capability Gap; select a Codex surface, artifact, version, package, or dependency; select the maintenance form among external adapter or extension, upstream contribution, maintained patch set, and fork; answer the formal pending maintenance-policy Question 3; answer `DQ-A1-01`, `DQ-A2-01`, or `DQ-A2-02`; produce costed Codex Secondary Development routes; inspect DeepSeek runtime evidence or open its re-entry gate; write an ADR; promote any candidate term or record to a canonical context, glossary, or ADR; update canonical V1; enter A3 or implementation; install, clone, copy, or vendor anything; authenticate, call a model or provider, start app-server, or generate a schema; or push, open a pull request, merge, publish, or take any external action. The Worker session historically refused both separately authorized local probes; Commander later executed them successfully, observing only binary identity and local help-surface facts, with no runtime-behavior evidence.
