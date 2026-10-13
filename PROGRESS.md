# Current checkpoint

Checkpoint for wave [#387](https://github.com/zhouy1017/ai7-harness/issues/387) on baseline `dev@c5fcf114be2bdc105f89c90a0d3fd2de47bae9a4` (tree `77898a225ef35c7f02e6bc97b6ff6e734bf18dfa`), after [#806](https://github.com/zhouy1017/ai7-harness/pull/817), [#808](https://github.com/zhouy1017/ai7-harness/pull/820) and the [#807 delivery](https://github.com/zhouy1017/ai7-harness/pull/824). The integrated tree selects Go `deepseek-v4.1-flash` through Provider Processing v9 / active-set v7 and produced a durable real baseline-analysis result, completed-with-gaps 7/8, with one disclosed contract gap. [PR #824](https://github.com/zhouy1017/ai7-harness/pull/824) merged #807 to `dev` at `c5fcf114` on 2026-10-12T15:05:38Z, tree-equal to the reviewed/cumulative head `18b7d7d3`; `main` was not promoted. This tree adds #387's recorded regression and the user-directed #826 schema-gap fix; [PR #828](https://github.com/zhouy1017/ai7-harness/pull/828) is the final wave-to-dev integration and owns their dev commit and test record.

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
| Product Provider | Source checkout selects development-ci/developer-live; Go `deepseek-v4.1-flash` serves directly authorized baseline-only developer-live under Provider Processing v9 / active-set v7; official route remains independent and optional | Existing P0 live-kind and local-production follow-ups retain their own admission boundaries |
| Development evidence | #808's purpose/namespace, durable claims and provenance-aware reuse; the original V4.1 7/8 result kept historical and replayed in J-04 (#387); baseline prompt and sampling contracts /2 with a real 8/8, all-stage V4.1 range result (#826); old V4 evidence kept historical | #812 evaluates editorial quality |
| Non-web AI | Review/writing/evaluation/dialogue surfaces and fixture contracts; several live kinds unavailable | #52/#429/#809/#810 admit and execute real contracts |
| Ordinary production | Policy records exist, but no source-checkout ordinary-production launch | #811 local analysis with the user's own credential/data, isolated from developer caches |
| Web evidence | Tool plumbing exists; selected policy does not enable it | #473 / draft #742 reconciles with #807, then #744/#425 complete declarations/retention |
| Repository delivery | #806 delivered in #817 at `c7b646bf`; #807 delivered in #824 at `c5fcf114`; trusted Gate/nightly control binds review, tests and release to exact candidates, with strict aggregate protection and native auto-merge disabled | Continue exact-candidate releases for slices and final dev integration; green tests alone grant no merge authority |
| Orca host | Installed Orca 1.4.224 performed real isolated-workspace dispatch and cross-channel review; #808 split core and fixture ownership for parallel work and serial integration | Recheck effective channel/model/effort for every assignment; actual identities and writer records remain in Orca and the Issue/PR |

The [policy index](docs/policies/README.md) owns exact selections. Accepting the new design does not activate policy or relabel V4 evidence as V4.1. Product model support and repository coding-agent selection are separate.

## In flight and next action

[#806](https://github.com/zhouy1017/ai7-harness/issues/806) is delivered to dev through [#817](https://github.com/zhouy1017/ai7-harness/pull/817): full guest01 ladder and [paired hosted Full Gate](https://github.com/zhouy1017/ai7-harness/actions/runs/38221237404) passed, with all 15 guest Journeys and only the hosted local-only `.doc` absence disclosed. Strict required aggregate protection was activated and read back before #808 began.

[#808](https://github.com/zhouy1017/ai7-harness/issues/808) extends the existing Ledger/Result Cache and fixture converter through [core #818](https://github.com/zhouy1017/ai7-harness/pull/818), [fixture #819](https://github.com/zhouy1017/ai7-harness/pull/819) and [checkpoint #821](https://github.com/zhouy1017/ai7-harness/pull/821), merged to dev through [#820](https://github.com/zhouy1017/ai7-harness/pull/820). Independent Reviewers repaired claim/recovery, purpose identity, capture integrity, generation/invalidation and fixture remapping defects. The accepted candidate `41ed82aca1dc2f5acd9808fd4ef1d2b9c7d790cb` (tree `e27e9e86`, identical to the dev merge) passed guest02's doctor/bootstrap/check/test/service/build/e2e layers and all 15 Journeys with no Journey skip, and the reused paired Windows/macOS Full Gate [run 38242567232](https://github.com/zhouy1017/ai7-harness/actions/runs/38242567232) passed on both platforms disclosing only the expected J01 local-only `.doc` absence. No product model call was made.

[PR #742](https://github.com/zhouy1017/ai7-harness/pull/742) remains Draft, at `598329399dda5d1ad8f59280536eee5f8251264d` when read for this update. Its policy proposal needs reconciliation with #807 and the independent web slice #473. Historical policy-version reservations and a combined attended web/#387 appointment no longer determine delivery order.

[#807](https://github.com/zhouy1017/ai7-harness/issues/807) is closed after delivery to `dev` at `c5fcf114` through [PR #824](https://github.com/zhouy1017/ai7-harness/pull/824); the [exact final acceptance](https://github.com/zhouy1017/ai7-harness/issues/807#issuecomment-6127011906) records guest01's full seven-layer, all-15-Journey run with no Journey skips and the paired hosted [Full Gate 38263018911](https://github.com/zhouy1017/ai7-harness/actions/runs/38263018911) passing Windows and macOS at tested commit `137a22432de9b0c3948f68e517b698b8e265fece` (tree-identical), disclosing only the expected hosted J-01 local-only `.doc` absence. [The actual product evidence](https://github.com/zhouy1017/ai7-harness/issues/807#issuecomment-6124340363) records code `39c5ac4113d5b5c09e96e23585ddca8f7b4959c0`, exact admitted `SampleBooks/sample1.docx`, and 12 fresh Go `deepseek-v4.1-flash` responses through the selected `zen/go` endpoint. The durable baseline result is `completed-with-gaps`: 7/8 units closed, with cross-unit reduction, assurance and reflection closed. Unit 1 correctly failed the unchanged schema because seven unresolved entries were strings instead of required objects; this proves representative real-path execution, not gap-free analysis or editorial quality. [#812](https://github.com/zhouy1017/ai7-harness/issues/812) owns that quality follow-up. Sanitized result and diagnosis metadata remain outside every checkout; raw captures stay protected.

The final acceptance includes independently reviewed [product #823](https://github.com/zhouy1017/ai7-harness/pull/823) and [J-16 repair #825](https://github.com/zhouy1017/ai7-harness/pull/825). The repair prevents a delayed reimport acknowledgement from overwriting a newer missing-selection error. It addressed a reproduced race consistent with the former macOS failure; the exact hosted frame/IPC ordering was not observed. The corrected cumulative guest and paired hosted Full results establish final acceptance, without waiving that failure.

Provider Processing v9 / active-set v7 preserves all 39 immutable predecessor policy assets. Baseline-only developer-live is the bounded selection; ordinary-production launch, web and other task-kind authority remain unavailable. A read-only inspection of the built final `dev` confirmed Provider Processing v9 / active-set v7, valid live evidence and an unchanged evidence ledger, with no extra model call. The newly documented `inference/go` endpoint is untested; the Issue records the tested route and exact policy/configuration digests. Next work follows the existing P0 slices #52/#809/#810/#429/#811 rather than restarting #807. Necessary autonomous developer-live validation remains within material, credential and executable-policy boundaries. Similar-test reuse applies only to development; new actual user Tasks execute real model work.

[#387](https://github.com/zhouy1017/ai7-harness/issues/387) replays the reviewed 12 original V4.1 captures in J-04 as recorded-model regression. Unit 1's malformed answer remains a schema-invalid gap, and the other stages remain recorded evidence. The replay incurs no new transmission and establishes neither an 8/8 live result nor editorial quality.

The user-directed [#826](https://github.com/zhouy1017/ai7-harness/issues/826) closes that unit schema gap with versioned instructions:

- baseline prompt contract /2 gives each unit note a literal object shape;
- the baseline's sampling contract /2 requires string finding refs;
- the analysis contract, result schemas and strict parsers are unchanged.

The baseline's prompt contract /1 and sampling /1 are retained exactly for J-04's historical replay. Every current baseline uses /2; factual review and every Review Category continue to use sampling /1. A current baseline plan pins the sampling contract it froze, and drift is refused before any Provider effect.

Product evidence:

- **Original:** the 7/8 result remains historical.
- **[First repair](https://github.com/zhouy1017/ai7-harness/issues/826#issuecomment-6138564926):** 重新分析所选范围 over unit 1 on the existing Book closed all eight units. Two newly computed unit responses plus six business-lineage reuses underpin it. It also exposed two schema-invalid sampling answers.
- **[Final prompt checkpoint](https://github.com/zhouy1017/ai7-harness/issues/826#issuecomment-6138730918):** coverage, reduction, sampling and reflection all closed. The sampling follow-up used three exact development-cache replays and four new transmissions.

Neither run sent eight new unit requests, and neither establishes editorial quality. J-04 now also replays the six identity-matching real captures of that recomputation: two units, the reduction and three sampling /2 turns. Its reflection explicitly ends in an `AI7_FIXTURE_MISMATCH` gap because no recorded reflection matches the replay's accounting; this is not a replay of all-stage success. Both earlier results and every raw capture remain outside the repository.

## Remaining macro risks

- Business availability and value: fixture-backed surfaces can overstate usefulness; P0 live delivery and P1 #812 must establish real execution and editorial effects separately.
- Cost/recovery: retained claims and evidence prevent silent repeat sends; corrupt or unprovable state fails closed and can require reconciliation. Loss of the entire external evidence root cannot reconstruct prior transmission history. A substantive new validation question still needs developer judgment.
- Document integrity: untouched-file preservation does not prove edited complex DOCX fidelity. #814 and #766 retain distinct export and material-read scope.
- Cross-artifact correctness: cross-deliverable review currently cannot deliver its intended result; #813 must preserve exact version/source authority.
- Execution authority: strict Gate protection binds tests and release to exact candidates; #807's exact final dev acceptance is delivered in PR #824. Green tests alone do not release a candidate, and repository-agent model use is not product validation.
- Scope growth: vectors, learning, cross-Book orchestration and release follow usable core workflows; records and inert profiles alone do not establish working consumers.

## Resume

Read this checkpoint, the development plan, Orca dispatch and the selected Issue. Record the actual baseline/current writer; resolve the installed Orca runtime before dispatch. Follow the single rulebook for pairing, branches, handoff and validation, with provider-free CI and truthful current/target status. Do not recover retired instructions from archives to override current owners. Update this checkpoint on final dev integration with user-visible outcomes and evidence, not attempt chronology.
