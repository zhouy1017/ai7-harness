# AI7 development plan

Status: Owner-approved order of 2026-10-12 under [ADR 0089](../adr/0089-adopt-orca-dispatch-and-value-first-live-model-delivery.md), based on `dev@afaf74657004e1cf1849f70457abd294d2768fef`. This is the sole delivery-order owner. [PROGRESS](../../PROGRESS.md) reports implementation; each Issue owns bounded acceptance. #805 changes documentation and tracker records, not product behavior.

## Delivery approach

The editor, manuscript history, marks, delivery records and many AI task surfaces already exist. Fixture success does not establish real execution or editorial usefulness. Deliver the smallest usable real-model loop, measure its quality and document fidelity, then expand retrieval, learning and orchestration.

[Orca dispatch](../agents/orca-dispatch.md) owns models, roles and integration. The Commander prepares a [bounded brief](../agents/change-brief.md), then schedules eligible independent slices with disjoint ownership. Every product wave requires #806 readiness. #806 itself is the infrastructure bootstrap under the rulebook, not its own dependency. P0–P3 are delivery priorities, distinct from review-finding severity; implementation risk determines T1–T3 in the brief.

## Current priorities and dependencies

Issue references in this table refer to the [GitHub tracker](https://github.com/zhouy1017/ai7-harness/issues).

| Priority | Issue / retained slice | Outcome | Dependencies and current disposition |
| --- | --- | --- | --- |
| P0 | #806 Orca/CI | Executable wave dispatch and explicit Reviewer/Commander merge release | #805, actual Orca runtime, existing exact-ref provider-free bootstrap validation. Current dev-only queue lacks these release checks. |
| P0 | #808 test reuse | Necessary live development checks without repeatedly paying for the same question | #806; extend existing Ledger/Result Cache. Family reuse, endpoint namespace and durable send claims remain. |
| P0 | #807 model migration | Configurable Go DeepSeek V4.1 Flash with its own capability evidence | #808 before new live evidence; relevant #452 configuration residue. Current selected model remains V4 Flash. |
| P0 | #387 S41-f1 | Labeled recorded-model regression in J-04 | Inventory/convert existing captures independently; new V4.1 evidence follows #808/#807. Verify missing units; no web dependency. |
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

The Go target is V4.1 Flash; old V4 evidence stays labeled V4. Go's repository-agent GLM allowlist does not register GLM in AI7. Migration, real execution and CI adaptation remain implementation follow-ups.

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
| Provider configuration and tool foundations | S55a #712; platform tools #671/#724/#733, inactive under selected developer-live v5 |

Completed Issues stay closed. Superseded S15, S18b/c, S19–S25, S44b, S45 and S55 are not revived; their outcomes moved into integrated surfaces and the remainder Issues above. #28 remains the PRD epic pointer.

## Scope and activation

The [policy index](../policies/README.md) owns current runtime selection and immutable predecessors. #807 creates coherent successors; #473 reconciles its draft instead of assuming an old policy-version sequence. Production uses the user's credential/data, never the developer key/cache.

Orca dispatch defines validation and merge responsibility. Read the installed version's guides before actual dispatch; this documentation did not validate Orca runtime. Main promotion, packaging, signing, notarization and release remain separate work. Protected manuscripts remain excluded from development repositories and CI.
