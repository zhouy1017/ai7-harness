# AI7 development plan

This is the sole delivery-order owner under [ADR 0089](../adr/0089-adopt-orca-dispatch-and-value-first-live-model-delivery.md). The 2026-10-21 refresh starts from `dev@f3199a2d823821476e7fcdcfb077e0a3d7b28b3c`: waves 1–16 are integrated, including the [Initial v1.0.0 Development Milestone record](milestone-1.0.0-scope.md). [PROGRESS](../../PROGRESS.md) owns implementation status; Issues own bounded acceptance. An open Issue can contain delivered work, and a milestone name is not a release claim.

The initial tracker snapshot contained **43 open Issues**, all accounted for below without reopening closed foundations; the Owner's same-day automatic-release follow-up adds #1015 and revises #1009. This is the remaining feature/fix roadmap, not a blanket dispatch authorization. The Commander turns a selected outcome into a current [Change Brief](../agents/change-brief.md), resolves blockers and assigns its exact baseline and writer through [Orca dispatch](../agents/orca-dispatch.md).

## Delivery order

1. Finish the already assigned wave 17 repository/documentation outcomes below, then validate the cumulative candidate.
2. Prioritize observed loss of editorial results and reliable execution: #879, #851 and #908. Take independent bounded regression fixes (#907, #970, #984, #960) alongside these when ownership is disjoint.
3. Close evidence-integrity and existing-workflow gaps (#850/#998, #1000, #959, #874), then deliver #905 and the task/surface refinements once their briefs are ready. A defect blocking a selected outcome travels with that outcome.
4. Schedule design-dependent expansion only after its named decision or material admission. Deferred work acquires no deadline from appearing here.

This preserves the accepted value-first approach: demonstrate a usable result, keep its gaps visible, and expand from existing owners. Priorities are delivery choices, distinct from review severity or implementation class T1–T3. Dates, current heads and required proof belong in the assigned Issue rather than another ledger.

## Assigned repository wave

| Issue | Outcome | Completion and boundary |
| --- | --- | --- |
| [#1008](https://github.com/zhouy1017/ai7-harness/issues/1008) | Product README, current-doc navigation, accurate checkpoint and actionable roadmap | Family review/dispositions recorded; links, root wrapper, directives, scenarios and diff checks pass. Frozen design and immutable policy assets preserved. |
| [#1009](https://github.com/zhouy1017/ai7-harness/issues/1009) | Quick local inspection, automatic nightly packages and version-tag inspection releases | Both platforms pass the existing nightly Gate at one pinned final-dev SHA before packaging. Matching version tags publish those exact verified artifacts under [ADR 0093](../adr/0093-automate-nightly-packages-and-version-tag-inspection-releases.md); no main promotion. Depends on #1015's identity contract. |
| [#1010](https://github.com/zhouy1017/ai7-harness/issues/1010) | Repository navigation/checks and behavior-preserving consolidation | Existing CLI consumers remain compatible, active local links/root wrappers checked and repository-structure guide supplied. No broad runtime redesign. |
| [#1015](https://github.com/zhouy1017/ai7-harness/issues/1015) | Unified source, package and runtime version identity | Software version, frozen Data Version 1, deterministic Git commit-count build number and exact source SHA agree in runtime displays, native metadata and release provenance; shallow/dirty release source is refused. |

These four are candidate work until final integration. The Owner's ChatGPT-only instruction applies to this session's model work, with actual bindings recorded in Orca/PRs; it does not fabricate cross-subscription review or authorize product model calls.

## Fixes and reliability

| Issue | Next bounded outcome | Dependency or missing fact | Done when |
| --- | --- | --- | --- |
| [#879](https://github.com/zhouy1017/ai7-harness/issues/879) | Stop excluding valid review quotations because overlap blocks confuse unit ordinals | #812's retained review captures; any prompt digest change needs a compatibility plan | Provider-free replay locates the off-by-one cases or proves the corrected contract; absent/ambiguous quotations stay excluded and the reviewed case baseline agrees. |
| [#851](https://github.com/zhouy1017/ai7-harness/issues/851) | Understand and repair transport failure immediately after long replies | Synthetic-server reproduction first; provider-side cause may require a separate retry decision | Cause and bounded mitigation documented; request bytes and outcome-unknown semantics preserved; necessary admitted live confirmation only under a later authorized assignment. |
| [#908](https://github.com/zhouy1017/ai7-harness/issues/908) | Make factual-review interruption/result accounting truthful and resolve live assurance failures | Contract-invalid and egress-refused units, no-status call and retry accounting need diagnosis; cross-Run live reuse also depends on #905 | Settled findings are versioned appropriately, per-unit outcomes are explained, and standard/strict evidence is recorded without calling an interrupted or unknown run successful. |
| [#907](https://github.com/zhouy1017/ai7-harness/issues/907) | Freeze the factual-verification unit-test clock | Existing 2026-10-16 captures reach the 90-day boundary around 2027-01-14 | Deterministic freshness assertions remain valid across wall-clock dates; product freshness semantics unchanged. |
| [#970](https://github.com/zhouy1017/ai7-harness/issues/970) | Resolve equal-timestamp Series Knowledge candidate ordering | Decide whether product order is guaranteed or intentionally unspecified | Deterministic tie ordering or an order-independent assertion matches that decision and repeats reliably. |
| [#984](https://github.com/zhouy1017/ai7-harness/issues/984) | Remove timing sensitivity from J-02 protection-initial-bound | Existing protection-state projection; preserve the product bound | The assertion waits on the right state, or the exact count moves to a justified unit check; Journey evidence records the choice. |
| [#960](https://github.com/zhouy1017/ai7-harness/issues/960) | Pin the manuscript-width fallback on the host | Existing 1120–1184 px behavior and J-03's 1180 px drawer assertion | A provider-free style/unit check covers manuscript and non-manuscript pages at the boundaries. |
| [#850](https://github.com/zhouy1017/ai7-harness/issues/850) | Tolerate unknown slice identifiers in the external test ledger | Existing cache/claim owner; identifier validation must not widen replay matching | Unknown rows are skipped/reported, while malformed, duplicated or digest-mismatched rows still fail. |
| [#998](https://github.com/zhouy1017/ai7-harness/issues/998) | Reconcile 265 reported registry/ledger differences | Developer host with the external ledger; metadata only, no captures or model calls | Admitted non-stale items reconcile, unsupported rows have an explicit disposition and generated provider support passes the ledger check. |
| [#1000](https://github.com/zhouy1017/ai7-harness/issues/1000) | Page extreme Cancellation Impact Summaries | Reuse #988/#996's budgeted/digest-pinned paging seam | About 20,000 waiting ranges show exact totals and paged impact without a frame refusal; cancellation authority unchanged. |
| [#959](https://github.com/zhouy1017/ai7-harness/issues/959) | Tighten delivery-package archive/folder operation routing | Existing export owner; protocol bump if removing ignored memberKeys changes input | Wrong-route approve/cancel refuses; archive preparation has no ignored required field; request/service tests agree. |
| [#874](https://github.com/zhouy1017/ai7-harness/issues/874) | Improve edited-DOCX fidelity within its admitted representation | #814 corpus; any schema/editor-model expansion needs a revised brief | Each formatting/hyperlink/field/revision exclusion is restored with paired evidence or remains specifically disclosed by the actual export. |

### Observations awaiting evidence

These records are not proof of a current reproducible defect or permission to repeat completed fixes. Use existing evidence when triaged; a recurrence gets its exact head/stage and a bounded guest investigation.

| Issue | State and next evidence | Closure condition |
| --- | --- | --- |
| [#1006](https://github.com/zhouy1017/ai7-harness/issues/1006) | Earlier Windows J-01 abandon-stage close timeout remains unclassified. #1004's close-phase attribution is integrated through #1007; a later green Gate does not identify the cause. | Reproducible cause and validated fix, or an evidence-backed external classification. |
| [#675](https://github.com/zhouy1017/ai7-harness/issues/675) | J-01 renderer-target acquisition miss; distinct from #1006's shutdown symptom. Inspect readiness/target evidence if it recurs. | Cause or justified disposition; do not assume the shutdown issue owns it. |
| [#643](https://github.com/zhouy1017/ai7-harness/issues/643) | J-08 no-snapshot restore failed once and passed on rerun; failure attribution is already present in the Journey. | Existing later evidence supports closure, or a recurrence yields a bounded correction. |
| [#621](https://github.com/zhouy1017/ai7-harness/issues/621) | Hosted Windows J-02 staging exceeded eight minutes. Attribute staging work before changing a timeout. | Explain slow-runner behavior and validate any correction without blindly raising the bound. |
| [#745](https://github.com/zhouy1017/ai7-harness/issues/745) | J-06 context-menu/scroll cause was fixed by #747/#753; only later macOS observation evidence remains. | Evidence-backed closure or a newly reproduced post-fix symptom; no duplicate diagnosis. |

## Feature completion and design decisions

| Issue | Remaining outcome | Dependency / decision before dispatch | Completion criterion |
| --- | --- | --- | --- |
| [#905](https://github.com/zhouy1017/ai7-harness/issues/905) | 再次核查 and 补充核查（范围）, multiple factual Runs and cross-Run evidence reuse | #901 ledger foundation is integrated; bound the task CHECK migration, scope gating and #908 live-proof dependency | New Runs preserve prior versions, bind supplementary work to 要求补充证据 and prove strict reuse of standard evidence without silently reusing business answers. |
| [#931](https://github.com/zhouy1017/ai7-harness/issues/931) | Custom-analysis redo/reprepare/reconfirm in the shared drawer | Current kind-aware brief with immutable dimension-version choice | Actual drawer handlers preserve the custom kind and pins, never call baseline preparation, and still require explicit authorization. |
| [#944](https://github.com/zhouy1017/ai7-harness/issues/944) | Put page actions and the save menu in the context header | Shared shell owner and a synchronized delta for the nine pinned Journey runners; reassess remaining work after #952/#1002 | Page actions remain visible with correct leave/focus behavior and every affected Journey pin is updated together. Its older 发现 note is not a second request to implement #952. |
| [#928](https://github.com/zhouy1017/ai7-harness/issues/928) | Exact-range preparation from Task Intent Drafts | Decide analysis context versus processing bounds, multi-span/stale pins and digest compatibility | Exact grapheme selections survive promotion, Plan Preview and Run scope; draft save sends nothing and grants no authority. |
| [#929](https://github.com/zhouy1017/ai7-harness/issues/929) | Deliverable targets in the Context-bound Task Composer | Define S66 manuscript-row identity, version/branch, supported kinds, stale handling and promotion | Draft remains local; promotion links one intent, binds the intended deliverable and still requires 开始任务. |
| [#795](https://github.com/zhouy1017/ai7-harness/issues/795), items 4/6 only | Decide per-template 审稿意见 reference selection and stricter lookup behavior | Design-complete choice before any schema/protocol work | The selected semantics are recorded and exercised; delivered items 1/2/3/5/7 stay closed in scope. |
| [#427](https://github.com/zhouy1017/ai7-harness/issues/427) | Identify the next concrete knowledge/learning consumer, or reconcile the umbrella's delivered scope | #61/#62 lineage/remediation and the house review-preference consumer are integrated; no new consumer is specified | Issue names an actual missing producer/consumer and its bounded acceptance, or closes delivered scope; stored rows alone never count as learning. |
| [#287](https://github.com/zhouy1017/ai7-harness/issues/287) | Durable binding/active-policy drift proof beyond unit tests | #807 is delivered, but a reachable second compatible binding and non-destructive real-record case must be shown | Authorization suspends on real drift and names the moved field without rewriting immutable history or adding speculative hooks. |
| [#719](https://github.com/zhouy1017/ai7-harness/issues/719) | Inert Doubao provider document | Official endpoint/wire/auth/model/tool evidence; recheck only when this work is selected | Schema/generator checks pass and cited facts support the declaration; no policy activation or credential enrollment. |

## Deferred expansion

These are unscheduled, not promises for a next release. The [milestone scope](milestone-1.0.0-scope.md), named ADRs and frozen UI clauses retain design authority.

| Issue / lineage | Outcome | Unlocking decision and eventual proof |
| --- | --- | --- |
| [#973](https://github.com/zhouy1017/ai7-harness/issues/973) / [#899](https://github.com/zhouy1017/ai7-harness/issues/899) | Local OCR for 需要识别 PDFs | Owner selects the recognition dependency under ADR 0070; a recognized-text layer retains page anchors and never replaces the original. One outcome, two lineage records. |
| [#974](https://github.com/zhouy1017/ai7-harness/issues/974) | Installed/portable GitHub Releases update path | Production release channel, signing and installed-update policy must be decided; preserve data and rollback. #1009's automatic inspection releases do not implement an installed-product updater. |
| [#975](https://github.com/zhouy1017/ai7-harness/issues/975) | Plugin-provided analysis kinds | Accepted loader/capability/authority design; a plugin kind works through existing plan and execution owners. Editor-defined dimensions already exist. |
| [#976](https://github.com/zhouy1017/ai7-harness/issues/976) | 结构调整模式 | A bounded ED-018 brief; section moves/hierarchy changes preserve revisions, anchors and explicit decisions. |
| [#977](https://github.com/zhouy1017/ai7-harness/issues/977) | Detached Manuscript Window | VIEW-016–024 ownership/focus/recovery brief; one manuscript authority survives detach/return and interrupted windows. |
| [#978](https://github.com/zhouy1017/ai7-harness/issues/978) | Workflow-definition results, drafts and published versions | Resolve the deferred ADR 0087 branch; exact-version definitions remain distinct from execution and activation. |
| [#979](https://github.com/zhouy1017/ai7-harness/issues/979) | Skill catalog, trust tiers and sandboxing | Owner accepts acquisition/trust/execution boundaries; imported inert revisions gain no incidental Provider, network, Effect or Apply authority. |
| [#980](https://github.com/zhouy1017/ai7-harness/issues/980) / [#415](https://github.com/zhouy1017/ai7-harness/issues/415) | S66d house workflow gates | A concrete house profile and gate policy; readiness remains separate from an unselected disposition and recorded decision. Existing documents/delivery are delivered. |
| [#981](https://github.com/zhouy1017/ai7-harness/issues/981) | Rewind/Replay reconsideration | Owner resolves CONT-002–012; no design promised. Resume, Retry, Redo, cancellation and Apply reversal remain separate existing behaviors. |
| [#766](https://github.com/zhouy1017/ai7-harness/issues/766), real-file evidence only | Real EPUB/ODT/RTF reader proof | Specific Owner admission of files in these formats; ADR 0091's DOCX books do not satisfy it. Reader fixes and synthetic proof are delivered; only the admitted real-file pass remains. |

## Delivered residue and unsliced findings

- [#880](https://github.com/zhouy1017/ai7-harness/issues/880) is still open in the tracker, but its wrapped synthesis-contract loader/generator fix and regression shipped in [#812 / PR #881](https://github.com/zhouy1017/ai7-harness/pull/881), integrated by [PR #878](https://github.com/zhouy1017/ai7-harness/pull/878). This needs tracker reconciliation, not reimplementation; this documentation task does not close it.
- #795 retains only items 4/6; #766 retains only real-file evidence; #745 retains observation only. #427's older prerequisite list is stale after the learning/knowledge waves. [#28](https://github.com/zhouy1017/ai7-harness/issues/28) remains the PRD epic pointer, not another priority list; its old P0 task list does not reopen delivered #806/#807/#808/#809/#810/#811.
- Packaged first-run leftover `shell` directory, prohibited-location remediation and Windows notification identity remain notes from [PR #969](https://github.com/zhouy1017/ai7-harness/pull/969). The Commander should turn a selected note into a bounded Issue before coding; #966's completed packaging implementation stays closed.
- Consolidated Windows/macOS re-entry under ADR 0054 is separate from the completed #972 boundary record and ordinary source-checkout Gate results. Locate or create its separately authorized current Issue before scheduling; do not infer packaged validation from the milestone.
- A real local embedding adapter remains unimplemented: similarity indexing currently uses deterministic `ai7-embedding/stub-1`. Select the dependency with the Owner, then brief the existing embedding seam and model-quality evidence; synthetic vector tests are not that evidence.
- Runtime refactoring is justified only by a selected feature/fix: feature-specific protocol types/validators behind existing exports, one store operation group preserving transactions, one renderer screen preserving its state owner, or one native integration preserving lifecycle. #1010's structure guide identifies these seams; there is no broad redesign task.
- Dialogue web research, 出版政策与风险 web declaration, retrieval over retained external sources and Bocha price-source verification remain disclosed limitations. They need a bounded outcome and, where applicable, policy/authority decisions; this refresh creates no model calls or new authority.

## Evidence and integration discipline

Use existing owners and provider-free regression first. Necessary later developer-live checks follow ADR 0089/0067 and the selected policy; existing development evidence may answer the same question, while a new business Task still performs its own real model steps. Old V4 evidence stays V4; endpoint documentation does not establish equivalence with the observed binding.

Product verification follows [CI and test boundaries](../agents/ci-test-boundaries.md), with agent-run Electron Journeys and their ladder on background guests. Documentation-only work uses links, root wrappers, directives, scenario walkthroughs and `git diff --check`. Keep the existing provider-free Gate. A slice enters its wave before final dev integration; green checks grant no release, main promotion or publication authority. Update PROGRESS and reconcile Issue state only against actual integration evidence.
