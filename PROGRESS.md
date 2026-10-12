# Current checkpoint

Checkpoint for the [#806 integration tree](https://github.com/zhouy1017/ai7-harness/pull/817), based on actual `dev@634b0ab3ed11702e6eb0033b93b1fb3995dc80be` fetched on 2026-10-12. The existing Gate and nightly queue now implement the Orca delivery controls. PR #817 owns the exact final dev merge, cumulative verification and protection activation; a slice merged only into its wave is not dev delivery. Product execution and selected policies remain unchanged.

The [development plan](docs/development/development-plan.md) owns delivery order. [Orca dispatch](docs/agents/orca-dispatch.md) owns repository roles and integration; [ADR 0089](docs/adr/0089-adopt-orca-dispatch-and-value-first-live-model-delivery.md) owns the development-test/business boundary and Go model target. The replaced checkpoint and its instructions remain in Git history, not a duplicate active archive.

## What the editor can use now

- Create/import Books and edit manuscripts with bounded views, revision history, recovery, marks, suggestions and explicit adoption. Delivery/export retain their own decision and receipt boundaries.
- Work with review, analysis, evaluation, report and writing surfaces, durable results, gaps, coverage and Run Reports. Many contracts run against deterministic fixtures; that proves application behavior, not current model quality or ordinary-production availability.
- Control Tasks through the shared drawer: edit plans, cancel, wait for connectivity, answer clarifications and explicitly continue interrupted work. Ambiguous model results remain unknown rather than being blindly resent inside that Run. Cross-Run development duplicate prevention still needs #808.
- Manage Production Document versions, 发稿, delivery records, delivery packages and maintenance cases. Complex edited-DOCX fidelity and cross-deliverable analysis need focused completion.
- Maintain knowledge items, exemplars, a versioned house Evaluation Profile and four local Material Index layers. Supported task plans pin selected material. Stored knowledge/eligibility does not establish working learning consumers.

The latest integrated changes after the prior checkpoint are:

| PR | Result | Commit |
| --- | --- | --- |
| [#799](https://github.com/zhouy1017/ai7-harness/pull/799) | A damaged writing exemplar no longer hides that Book's other exemplars | `6ef1beca` |
| [#797](https://github.com/zhouy1017/ai7-harness/pull/797) | Save a new house Evaluation Profile version for later evaluations | `49357db2` |
| [#802](https://github.com/zhouy1017/ai7-harness/pull/802) | Stop evaluation exemplar reads at the cap and disclose skipped/damaged items | `5c3230f8` |
| [#804](https://github.com/zhouy1017/ai7-harness/pull/804) | Isolate a damaged material-index item from the evaluation page; truthfully disclose that a developer-live reference plan would send nothing | `afaf7465` |

These are complete; #427/#429 track remaining consumers and real execution, not those surfaces again. Earlier landing detail is in the PRs and Git. [E2E journeys](docs/development/e2e-journeys.md) owns supported Journey coverage.

## Current execution and accepted target

| Area | Current implementation | Next result |
| --- | --- | --- |
| Product Provider | Source checkout selects development-ci/developer-live; selected Go model is `deepseek-v4-flash`, with analysis-only developer-live policy | #807 migrates to configurable V4.1 Flash; official route retained |
| Development evidence | Exact model/request-digest replay and protected capture; no endpoint namespace or durable pre-send claim; similar-case prevention not enforced | #808 extends existing owners and preserves unknown outcomes while isolating business execution |
| Non-web AI | Review/writing/evaluation/dialogue surfaces and fixture contracts; several live kinds unavailable | #52/#429/#809/#810 admit and execute real contracts |
| Ordinary production | Policy records exist, but no source-checkout ordinary-production launch | #811 local analysis with the user's own credential/data, isolated from developer caches |
| Web evidence | Tool plumbing exists; selected policy does not enable it | #473 / draft #742 reconciles with #807, then #744/#425 complete declarations/retention |
| Repository delivery | Existing Gate/nightly routes waves and dev; authenticated PR receipts bind cross-channel review, tests and Commander release to exact head/base; privileged control uses trusted dev code | #817 records final bootstrap verification and strict required aggregate protection activation; subsequent waves use those controls |
| Orca host | Installed Orca 1.4.224 performed actual isolated-workspace dispatch, independent review/fixes and slice merge for #816 | Recheck effective channel/model/effort for every assignment; actual identities and writer records remain in Orca and the Issue/PR |

The [policy index](docs/policies/README.md) owns exact selections. Accepting the new design does not activate policy or relabel V4 evidence as V4.1. Product model support and repository coding-agent selection are separate.

## In flight and next action

[#805](https://github.com/zhouy1017/ai7-harness/issues/805) and PR #815 established the current development guidance. [#816](https://github.com/zhouy1017/ai7-harness/pull/816) implements #806 and includes independent Reviewer corrections; its exact-candidate guest02 ladder and [paired hosted full Gate](https://github.com/zhouy1017/ai7-harness/actions/runs/38218649906) passed. The guest ran all 15 Journeys without a disclosed skip; both hosted platforms disclosed the expected local-only `.doc` absence. Final dev delivery and cumulative checks are recorded by #817, not inferred from that slice result.

[PR #742](https://github.com/zhouy1017/ai7-harness/pull/742) remains Draft, at `598329399dda5d1ad8f59280536eee5f8251264d` when read for this update. Its policy proposal needs reconciliation with #807 and the independent web slice #473. This task changed its description, not its code/head. Historical policy-version reservations and a combined attended web/#387 appointment no longer determine delivery order.

After #817's dev merge and protection activation, take #808 from the updated dev, then #807, followed by eligible real-use slices. No V4.1 product call is claimed by the Orca/CI wave. Necessary autonomous developer-live validation is authorized within current material, credential and executable-policy boundaries. Similar-test reuse applies only to development; new actual user Tasks execute real model work.

## Remaining macro risks

- Business availability and value: fixture-backed surfaces can overstate usefulness; P0 live delivery and P1 #812 must establish real execution and editorial effects separately.
- Cost/recovery: exact replay does not prevent equivalent tests or retransmission after a lost answer. #808 needs durable claims without suppressing legitimate repeated business requests.
- Document integrity: untouched-file preservation does not prove edited complex DOCX fidelity. #814 and #766 retain distinct export and material-read scope.
- Cross-artifact correctness: cross-deliverable review currently cannot deliver its intended result; #813 must preserve exact version/source authority.
- Execution authority: the new Gate projection needs its recorded strict branch protection; policy/configuration still needs #807's actual model migration. Green tests alone do not release a candidate, and repository-agent model use is not product validation.
- Scope growth: vectors, learning, cross-Book orchestration and release follow usable core workflows; records and inert profiles alone do not establish working consumers.

## Resume

Read this checkpoint, the development plan, Orca dispatch and the selected Issue. Record the actual baseline/current writer; resolve the installed Orca runtime before dispatch. Follow the single rulebook for pairing, branches, handoff and validation, with provider-free CI and truthful current/target status. Do not recover retired instructions from archives to override current owners. Update this checkpoint on final dev integration with user-visible outcomes and evidence, not attempt chronology.
