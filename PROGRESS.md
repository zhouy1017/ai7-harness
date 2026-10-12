# Current checkpoint

Checkpoint for the [#808 integration tree](https://github.com/zhouy1017/ai7-harness/pull/820), merged to `dev` at `c194482eb09479299a9c95fea173ea0bcd17db53` (tree `e27e9e864d3fe1fd1e7d57d1a0eae29f07df3976`) from `c7b646bf` after #806's delivery. Development validation now records its purpose, reuses verified evidence and preserves possibly billed unknown sends. The Issue and PR own its exact dev acceptance; a slice merged only into a wave is not dev delivery. Product model selection and immutable policies remain unchanged.

The [development plan](docs/development/development-plan.md) owns delivery order. [Orca dispatch](docs/agents/orca-dispatch.md) owns repository roles and integration; [ADR 0089](docs/adr/0089-adopt-orca-dispatch-and-value-first-live-model-delivery.md) owns the development-test/business boundary and Go model target. The replaced checkpoint and its instructions remain in Git history, not a duplicate active archive.

## What the editor can use now

- Create/import Books and edit manuscripts with bounded views, revision history, recovery, marks, suggestions and explicit adoption. Delivery/export retain their own decision and receipt boundaries.
- Work with review, analysis, evaluation, report and writing surfaces, durable results, gaps, coverage and Run Reports. Many contracts run against deterministic fixtures; that proves application behavior, not current model quality or ordinary-production availability.
- Control Tasks through the shared drawer: edit plans, cancel, wait for connectivity, answer clarifications and explicitly continue interrupted work. Ambiguous model results remain unknown rather than being blindly resent. Development validation additionally retains durable send claims across Runs and restarts; new actual business Tasks keep their own real-provider execution semantics.
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
| Development evidence | Explicit validation family/case, full request namespace and prompt generation, durable pre-send claims, retained unknown outcomes, provenance-aware fixture conversion, separate recorded/incurred usage | #807 records fresh V4.1 evidence through these existing owners; old V4 evidence cannot establish a new model's capability |
| Non-web AI | Review/writing/evaluation/dialogue surfaces and fixture contracts; several live kinds unavailable | #52/#429/#809/#810 admit and execute real contracts |
| Ordinary production | Policy records exist, but no source-checkout ordinary-production launch | #811 local analysis with the user's own credential/data, isolated from developer caches |
| Web evidence | Tool plumbing exists; selected policy does not enable it | #473 / draft #742 reconciles with #807, then #744/#425 complete declarations/retention |
| Repository delivery | #806 delivered in #817 at `c7b646bf`; trusted Gate/nightly control binds review, tests and release to exact candidates, with strict aggregate protection and native auto-merge disabled | Continue exact-candidate releases for slices and final dev integration; green tests alone grant no merge authority |
| Orca host | Installed Orca 1.4.224 performed real isolated-workspace dispatch and cross-channel review; #808 split core and fixture ownership for parallel work and serial integration | Recheck effective channel/model/effort for every assignment; actual identities and writer records remain in Orca and the Issue/PR |

The [policy index](docs/policies/README.md) owns exact selections. Accepting the new design does not activate policy or relabel V4 evidence as V4.1. Product model support and repository coding-agent selection are separate.

## In flight and next action

[#806](https://github.com/zhouy1017/ai7-harness/issues/806) is delivered to dev through [#817](https://github.com/zhouy1017/ai7-harness/pull/817): full guest01 ladder and [paired hosted Full Gate](https://github.com/zhouy1017/ai7-harness/actions/runs/38221237404) passed, with all 15 guest Journeys and only the hosted local-only `.doc` absence disclosed. Strict required aggregate protection was activated and read back before #808 began.

[#808](https://github.com/zhouy1017/ai7-harness/issues/808) extends the existing Ledger/Result Cache and fixture converter through [core #818](https://github.com/zhouy1017/ai7-harness/pull/818), [fixture #819](https://github.com/zhouy1017/ai7-harness/pull/819) and [checkpoint #821](https://github.com/zhouy1017/ai7-harness/pull/821), merged to dev through [#820](https://github.com/zhouy1017/ai7-harness/pull/820). Independent Reviewers repaired claim/recovery, purpose identity, capture integrity, generation/invalidation and fixture remapping defects. The accepted candidate `41ed82aca1dc2f5acd9808fd4ef1d2b9c7d790cb` (tree `e27e9e86`, identical to the dev merge) passed guest02's doctor/bootstrap/check/test/service/build/e2e layers and all 15 Journeys with no Journey skip, and the reused paired Windows/macOS Full Gate [run 38242567232](https://github.com/zhouy1017/ai7-harness/actions/runs/38242567232) passed on both platforms disclosing only the expected J01 local-only `.doc` absence. No product model call was made.

[PR #742](https://github.com/zhouy1017/ai7-harness/pull/742) remains Draft, at `598329399dda5d1ad8f59280536eee5f8251264d` when read for this update. Its policy proposal needs reconciliation with #807 and the independent web slice #473. Historical policy-version reservations and a combined attended web/#387 appointment no longer determine delivery order.

[#807](https://github.com/zhouy1017/ai7-harness/issues/807) now starts from fresh `c194482e` with its coherent model/configuration/policy migration and representative real V4.1 product analysis; the Issue and its final integration PR own that exact acceptance and will link it when available. The current selected model remains V4 Flash and V4.1 product execution remains unverified until that specific evidence arrives. Necessary autonomous developer-live validation is authorized within current material, credential and executable-policy boundaries. Similar-test reuse applies only to development; new actual user Tasks execute real model work.

## Remaining macro risks

- Business availability and value: fixture-backed surfaces can overstate usefulness; P0 live delivery and P1 #812 must establish real execution and editorial effects separately.
- Cost/recovery: retained claims and evidence prevent silent repeat sends; corrupt or unprovable state fails closed and can require reconciliation. Loss of the entire external evidence root cannot reconstruct prior transmission history. A substantive new validation question still needs developer judgment.
- Document integrity: untouched-file preservation does not prove edited complex DOCX fidelity. #814 and #766 retain distinct export and material-read scope.
- Cross-artifact correctness: cross-deliverable review currently cannot deliver its intended result; #813 must preserve exact version/source authority.
- Execution authority: strict Gate protection is active, while policy/configuration still needs #807's actual model migration. Green tests alone do not release a candidate, and repository-agent model use is not product validation.
- Scope growth: vectors, learning, cross-Book orchestration and release follow usable core workflows; records and inert profiles alone do not establish working consumers.

## Resume

Read this checkpoint, the development plan, Orca dispatch and the selected Issue. Record the actual baseline/current writer; resolve the installed Orca runtime before dispatch. Follow the single rulebook for pairing, branches, handoff and validation, with provider-free CI and truthful current/target status. Do not recover retired instructions from archives to override current owners. Update this checkpoint on final dev integration with user-visible outcomes and evidence, not attempt chronology.
