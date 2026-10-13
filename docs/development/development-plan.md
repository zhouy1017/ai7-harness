# AI7 development plan

Status: Owner-approved order of 2026-10-12 under [ADR 0089](../adr/0089-adopt-orca-dispatch-and-value-first-live-model-delivery.md); #808 delivered to dev at `c194482eb09479299a9c95fea173ea0bcd17db53` (tree `e27e9e86`), after #806's delivery at `c7b646bf` and protection activation. #807 was delivered to dev at `c5fcf114be2bdc105f89c90a0d3fd2de47bae9a4` (tree `77898a22`) through [PR #824](https://github.com/zhouy1017/ai7-harness/pull/824), including independently reviewed product #823 and the required J-16 repair #825. This is the sole delivery-order owner. [PROGRESS](../../PROGRESS.md) reports implementation; each Issue owns bounded acceptance. [PR #820](https://github.com/zhouy1017/ai7-harness/pull/820) records #808's cumulative verification and dev delivery.

## Delivery approach

The editor, manuscript history, marks, delivery records and many AI task surfaces already exist. Fixture success does not establish real execution or editorial usefulness. Deliver the smallest usable real-model loop, measure its quality and document fidelity, then expand retrieval, learning and orchestration.

[Orca dispatch](../agents/orca-dispatch.md) owns models, roles and integration. The Commander prepares a [bounded brief](../agents/change-brief.md), then schedules eligible independent slices with disjoint ownership. Every product wave requires #806 readiness. #806 itself is the infrastructure bootstrap under the rulebook, not its own dependency. P0–P3 are delivery priorities, distinct from review-finding severity; implementation risk determines T1–T3 in the brief.

## Current priorities and dependencies

Issue references in this table refer to the [GitHub tracker](https://github.com/zhouy1017/ai7-harness/issues).

| Priority | Issue / retained slice | Outcome | Dependencies and current disposition |
| --- | --- | --- | --- |
| P0 | #806 Orca/CI | Executable wave dispatch and explicit Reviewer/Commander merge release | Delivered through #817 at `c7b646bf`; exact-candidate guest/paired hosted verification and strict aggregate protection are complete. |
| P0 | #808 test reuse | Necessary live development checks without repeatedly paying for the same question | Core #818, fixture #819 and checkpoint #821 extended existing owners with purpose/namespace/generation, durable unknown-send claims and auditable conversion. #820 delivered cumulative acceptance to dev at `c194482e`. |
| P0 | #807 model migration | Configurable Go DeepSeek V4.1 Flash with its own capability evidence | Delivered to dev at `c5fcf114` through [PR #824](https://github.com/zhouy1017/ai7-harness/pull/824) ([exact final acceptance](https://github.com/zhouy1017/ai7-harness/issues/807#issuecomment-6127011906)). The integrated product selects Provider Processing v9 / active-set v7 with [actual V4.1 product evidence](https://github.com/zhouy1017/ai7-harness/issues/807#issuecomment-6124340363): completed-with-gaps, 7/8 units closed. Relevant #452 model configuration residue is covered. Continue existing P0 follow-ups. |
| P0 | #387 S41-f1 | Labeled recorded-model regression in J-04 | Implemented in this wave: J-04 replays the reviewed 12 original V4.1 captures, preserving the malformed unit-1 failure and successful stages. Replay incurs no new transmission and is not an 8/8 live result or quality proof. Dev delivery is recorded by final integration [PR #828](https://github.com/zhouy1017/ai7-harness/pull/828). |
| P0 | #826 S41 follow-up | Fix the V4.1 baseline unit schema gap and verify the product result | Implemented in this wave. Baseline prompt contract /2 and sampling /2 add literal shapes, with /1 retained only for J-04's historical replay and a stage drift guard. [First repair](https://github.com/zhouy1017/ai7-harness/issues/826#issuecomment-6138564926): units 8/8 (two new unit responses, six lineage reuses), exposing sampling gaps. [Final checkpoint](https://github.com/zhouy1017/ai7-harness/issues/826#issuecomment-6138730918): all stages closed (three cache replays, four new transmissions). Original 7/8 stays historical. Dev delivery is recorded by [PR #828](https://github.com/zhouy1017/ai7-harness/pull/828). |
| P0 | #52 S17 live dialogue | Real streamed discussion of the selected passage | #807/#808 and existing S17a surface. S17b structured follow-up waits for #423's future composer. |
| P0 | #809 review follow-up | Real non-web review findings and usable marks | #807/#808; #759 only for optional material references. Completed S69/#417 stays closed. |
| P0 | #810 writing follow-up | Real drafts in the existing writing workflow | #807/#808; #759 only for optional material references. Completed S84/#432 stays closed. |
| P0 | #429 S81 live execution | Real AI7 初评, 审稿意见 and 按我的评分重写评语 | #807/#808; #759 only for optional references. Records, calibration and profile editing already exist. |
| P0 | #811 local production | Analyze the user's manuscript with their own credential and actionable results | #807 and #808's development/production isolation. Other AI kinds and installers are not prerequisites. |
| P1 | #812 editorial quality | Evidence that the complete editing/review/adoption/writing flow helps the editor | A working P0 real loop and admitted reusable cases; bounded effect checks, not a new benchmark programme. |
| P1 | #813 consistency | Check manuscript and existing deliverables together | Working review and real deliverable inputs; current unconditional unavailable result needs implementation. |
| P1 | #814 document fidelity | Edited complex DOCX retains meaningful content/formatting through export | Existing import/edit/export; can proceed beside live AI. Original-file preservation is insufficient. |
| P1 | #473 / PR #742 S87-f3 | Policy-admitted model-initiated websearch/webfetch | Reconcile draft with #807; reviewed policy/configuration/egress successor before tool evidence. Plumbing exists but is inert. |
| P1 | #744 and #425 S70 | Accurate search declarations and retained/aligned/translated external evidence | #473 and exact-model tool evidence; #744 aligns categories, #425 consumes sources. No non-web P0 dependency. |
| P1 | #766 format observations | Reliable material reads on representative formats | Check fixes already in #785; admit public files before use. Separate from edited-DOCX fidelity. |
| P2 | #759 reference withdrawal | Withdrawn references cannot reach later model work | Existing pins/index. Bring consumption-time refusal forward for reference-bearing P0 tasks; other follow-ups remain P2. |
| P2 | #428 S80 | Retrieval beyond four implemented index layers | Concrete consumers and admitted vector/OCR/PDF/translation dependencies. Do not rebuild layers 1–4. |
| P2 | #427, #61, #62 S79/S26/S27 | Feedback/knowledge affects later work with traceable, revocable influence | Actual producer/consumer after useful AI tasks; #428/#759 as applicable. Records alone do not implement learning. |
| P3 | #64 S29 | Wider cross-Book scope and Series tasks | Existing Book loop and retrieval/withdrawal semantics; Series foundations are integrated. |
| P3 | #66, #89 S31/S33 | Further procedure lifecycle and foreign Skill updates | Existing pin/reuse/disable flows remain complete; unresolved authority changes need their own decision. |
| P3 | #423, #90 S77/S34 | Free-text Task Intent Draft and Book-bound Agent Workspace | Real dialogue #52 and accepted interaction/authority seams. Task panel already exists. |
| P3 | #415 S66d | House-specific workflow gates | Deferred until a concrete house workflow profile exists. Production Documents/delivery records already exist. |
| P3 | Installation/distribution | Installable, maintainable desktop delivery | Useful local business loop and separate release authorization; no release implementation included here. |

#452 is enabling configuration work scoped into #807/#473 when those owners change; generated declarations exist. #287 stays parked until a reachable binding/sidecar-drift case exists after migration. #745 remains an observation record for macOS J-06 already repaired through #747/#753; do not duplicate the fix or invent new green evidence.

Issue bodies retain exact acceptance and dependencies. Fix defects blocking an active outcome with that outcome; review-finding labels do not automatically determine roadmap priority. Other observed follow-ups remain scoped to their existing Issues instead of becoming a parallel backlog here.

## Live-use boundary

[ADR 0089](../adr/0089-adopt-orca-dispatch-and-value-first-live-model-delivery.md) and [ADR 0067](../adr/0067-authorize-the-opencode-go-development-credential-with-live-once-testing.md) own autonomous necessary development validation and reuse. Record a new question's substantive delta and save its evidence. CI/Gate/ordinary regression stays provider-free. New actual business Tasks perform real model steps even for repeated input; continuation/incremental reuse retains its own semantics. No new daily/batch/call-count ceiling is added.

The selected Go model is V4.1 Flash; old V4 evidence stays labeled V4. Go's repository-agent GLM allowlist does not register GLM in AI7. #807 has independently reviewed representative real-path evidence, with a correctly rejected unit schema gap; #826 corrects that gap and the sampling-ref gap it exposed under versioned contracts, with real 8/8 all-stage evidence, and #812 owns editorial quality. The product slice preserves live-head policy/launch/prompt-contract identity, and PR #824 delivered the exact cumulative acceptance to dev. The tested `zen/go` endpoint does not establish the newly documented `inference/go` endpoint. Provider-free evidence-reuse tests do not establish live execution or quality.

## Completed foundation

This is a historical mapping, not another execution order. Exact old rows and landing chronology remain in Git.

| Foundation | Retained slices / evidence |
| --- | --- |
| Covered analysis, reduction, factual-review records, sampling, Run Report | S36–S44; #393/#395/#399; later S69/S71 surfaces |
| Editing, history, marks, suggestions, adoption and conflict handling | S58–S63 and S22; current Journeys and authority records retained |
| Import/export, Production Documents, 发稿, delivery package, maintenance | S64–S68; S66a–c integrated, S66d alone deferred |
| Task Drawer, plans, controls, interruption, connectivity, concurrency, enrollment | S72–S78, S14/S16/S39; #755/#763/#769/#776/#783/#786/#787/#788 integrated |
| Knowledge, exemplars, material selection and four index layers | S79/S80; #725/#758/#761/#774/#777/#791/#794 integrated |
| Evaluation, report, calibration and scoring | S81/S82; #570/#653/#662/#682/#739/#741 integrated |
| Latest additions after the old checkpoint | Profile editing #797; writing exemplar isolation #799; evaluation caps/skipped exemplars #802; damaged-index isolation and truthful developer-live disclosure #804 |
| Local dialogue and writing | S17a #658; S84 #688/#701; live successors #52/#810 |
| Series and reusable procedures | S28/S29a–b, S30/S31a–b; remainder #64/#66/#89 |
| Provider configuration and tool foundations | S55a #712 and #807's V4.1 binding; platform tools #671/#724/#733 remain inactive under selected developer-live v9 |

Completed Issues stay closed. Superseded S15, S18b/c, S19–S25, S44b, S45 and S55 are not revived; their outcomes moved into integrated surfaces and the remainder Issues above. #28 remains the PRD epic pointer.

## Scope and activation

The [policy index](../policies/README.md) owns runtime selection and immutable predecessors. #807's integrated dev tree at `c5fcf114` selects Provider Processing v9 / active-set v7, preserving all 39 immutable predecessor assets; PR #824 delivered that coherent final dev integration. #473 reconciles its separate draft instead of assuming an old policy-version sequence. Ordinary-production launch remains #811; production uses the user's credential/data, never the developer key/cache.

Orca dispatch defines validation and merge responsibility. Orca 1.4.224 was verified and used for #806's Worker/Reviewer handoff, fixes, validation and slice merge; read the installed version's guides and verify effective bindings for later assignments too. Main promotion, packaging, signing, notarization and release remain separate work. Protected manuscripts remain excluded from development repositories and CI.
