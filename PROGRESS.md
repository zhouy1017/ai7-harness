# Current checkpoint

Checkpoint for wave 1 of the 1.0.0 programme ([#52](https://github.com/zhouy1017/ai7-harness/issues/52), branch `codex/integration-52`) on baseline `dev@97149432da40a51a28b8d9380b77efab7393e012` (tree `72c19d9c`), after [#828](https://github.com/zhouy1017/ai7-harness/pull/828). The wave integrates four reviewed slices: Provider Processing v10 / active-policy-set v8 ([#834](https://github.com/zhouy1017/ai7-harness/pull/834), #831), the Initial v1.0.0 Development Milestone scope record ([#836](https://github.com/zhouy1017/ai7-harness/pull/836), #832), live editorial dialogue on the admitted Go route ([#837](https://github.com/zhouy1017/ai7-harness/pull/837), #52 S17c) and reference-free live review ([#838](https://github.com/zhouy1017/ai7-harness/pull/838), #809). Under `developer-live` the wave tree selects Provider Processing v10 through active-policy-set v8: baseline analysis, editorial dialogue on the Fast Interaction Role and the three reference-free non-web review categories (错别字与规范用语, 文风与格式, 文学表达) run on Go `deepseek-v4.1-flash`; every other kind, origin, scope and category stays refused. [PR #835](https://github.com/zhouy1017/ai7-harness/pull/835) is the final wave-to-dev integration and owns their dev commit and test record; `main` is not promoted.

The [development plan](docs/development/development-plan.md) owns delivery order. [Orca dispatch](docs/agents/orca-dispatch.md) owns repository roles and integration; [ADR 0089](docs/adr/0089-adopt-orca-dispatch-and-value-first-live-model-delivery.md) owns the development-test/business boundary and Go model target. The replaced checkpoint and its instructions remain in Git history, not a duplicate active archive.

## What the editor can use now

- Create/import Books and edit manuscripts with bounded views, revision history, recovery, marks, suggestions and explicit adoption. Delivery/export retain their own decision and receipt boundaries.
- Work with review, analysis, evaluation, report and writing surfaces, durable results, gaps, coverage and Run Reports. Many contracts run against deterministic fixtures; that proves application behavior, not current model quality or ordinary-production availability.
- Under `developer-live`, ask about a selected passage (就这段提问, 重新回答) and get a real answer from Go DeepSeek V4.1 Flash, and run the three reference-free review categories against the real model with grounded findings that flow into marks, Apply and reversal. Each new business ask or regenerate sends a new request; development validation reuses the recorded cache. Answers arrive complete rather than streamed; 继续回答 is proven provider-free from kept fragments, with streaming and a live 继续回答 pending [#833](https://github.com/zhouy1017/ai7-harness/issues/833). In-process review cancellation keeps completed units, but process interruption has no durable unit checkpoints ([#839](https://github.com/zhouy1017/ai7-harness/issues/839)); writing, evaluation, material references, cross-deliverable consistency and web categories remain fixture-only until their waves.
- Control Tasks through the shared drawer: edit plans, cancel, wait for connectivity, answer clarifications and explicitly continue interrupted work. Ambiguous model results remain unknown rather than being blindly resent. Development validation additionally retains durable send claims across Runs and restarts; new actual business Tasks keep their own real-provider execution semantics.
- Manage Production Document versions, 发稿, delivery records, delivery packages and maintenance cases. Complex edited-DOCX fidelity and cross-deliverable analysis need focused completion.
- Maintain knowledge items, exemplars, a versioned house Evaluation Profile and four local Material Index layers. Supported task plans pin selected material. Stored knowledge/eligibility does not establish working learning consumers.

The latest slice merges into the wave after the prior checkpoint are:

| PR | Result | Wave merge | Tested head |
| --- | --- | --- | --- |
| [#834](https://github.com/zhouy1017/ai7-harness/pull/834) | Provider Processing v10 / active-policy-set v8: dialogue and three reference-free review categories admitted under developer-live; version-literal sites read the selected set | `a3463ec5` | `70aeb5b0` |
| [#836](https://github.com/zhouy1017/ai7-harness/pull/836) | The Owner-confirmed Initial v1.0.0 Development Milestone scope recorded in `docs/development/milestone-1.0.0-scope.md` | `a9e1ee7f` | `3d7c7a08` |
| [#837](https://github.com/zhouy1017/ai7-harness/pull/837) | Live editorial dialogue on the admitted Go route with schema 71 live bindings, one recorded live item and the reviewed fixture `sample1-dialogue-recorded-v41.json` | `6ea136e6` | `17c844c9` |
| [#838](https://github.com/zhouy1017/ai7-harness/pull/838) | Reference-free live review (错别字与规范用语, 文风与格式, 文学表达) with grounded marks, 未联网核查 disclosure and in-process cancellation keeping completed units; reviewed fixtures `sample1-recorded-v41-review-typos-and-usage.json` and `sample1-recorded-v41-review-style-and-format.json`; no literary fixture | `7d19b6e4` | `30f71079` |

These are slice merges into the wave, not final dev integration; [PR #835](https://github.com/zhouy1017/ai7-harness/pull/835) will record their final dev commit. The earlier checkpoint's rows (#799, #797, #802, #804) are integrated and stay in Git history; #427/#429 still track remaining consumers and real execution, not those surfaces again. [E2E journeys](docs/development/e2e-journeys.md) owns supported Journey coverage.

## Current execution and accepted target

| Area | Current implementation | Next result |
| --- | --- | --- |
| Product Provider | Source checkout selects development-ci/developer-live; Go `deepseek-v4.1-flash` serves baseline analysis, editorial dialogue (Fast Interaction Role) and three reference-free review categories under Provider Processing v10 / active-policy-set v8; official route remains independent and optional | Writing and evaluation (wave 2), ordinary production (wave 3) retain their own admission boundaries |
| Development evidence | #808's purpose/namespace, durable claims and provenance-aware reuse; the original V4.1 7/8 result kept historical and replayed in J-04 (#387); baseline prompt and sampling contracts /2 with a real 8/8, all-stage V4.1 range result (#826); old V4 evidence kept historical | #812 evaluates editorial quality |
| Non-web AI | Dialogue and three review categories run on the real route under developer-live with recorded evidence and reviewed fixtures; writing, evaluation, reference-bearing review and cross-deliverable consistency remain fixture-only | #810/#429 (wave 2), reference-bearing #809 and #813 (wave 3), #833 streaming, #839 review checkpoints |
| Ordinary production | Policy records exist, but no source-checkout ordinary-production launch | #811 local analysis with the user's own credential/data, isolated from developer caches |
| Web evidence | Tool plumbing exists; selected policy does not enable it | #473 / draft #742 reconciles with #807, then #744/#425 complete declarations/retention |
| Repository delivery | #806 delivered in #817 at `c7b646bf`; #807 delivered in #824 at `c5fcf114`; trusted Gate/nightly control binds review, tests and release to exact candidates, with strict aggregate protection and native auto-merge disabled | Continue exact-candidate releases for slices and final dev integration; green tests alone grant no merge authority |
| Orca host | Installed Orca 1.4.224 performed real isolated-workspace dispatch and cross-channel review; #808 split core and fixture ownership for parallel work and serial integration | Recheck effective channel/model/effort for every assignment; actual identities and writer records remain in Orca and the Issue/PR |

The [policy index](docs/policies/README.md) owns exact selections. Accepting the new design does not activate policy or relabel V4 evidence as V4.1. Product model support and repository coding-agent selection are separate.

## In flight and next action

Wave 1 (`codex/integration-52`) holds four reviewed slice merges; [PR #835](https://github.com/zhouy1017/ai7-harness/pull/835) is the Draft final integration into `dev`. Its cumulative guest ladder, paired hosted Full Gate at the exact final head, completion and release receipts, Owner byte review of the v10/v8 policy assets and final dev commit remain pending there.

Live evidence of this wave, all on admitted `SampleBooks/sample1.docx` from the host, never on a guest or in CI: one dialogue item ([#52](https://github.com/zhouy1017/ai7-harness/issues/52#issuecomment-6145281133): one ask answered by Go `deepseek-v4.1-flash`, one 重新回答 as exact development replay, two earlier sends held outcome-unknown at zero tokens after host connect timeouts) and one review item ([#809](https://github.com/zhouy1017/ai7-harness/issues/809#issuecomment-6146492068): 错别字与规范用语 and 文风与格式 completed and recorded as fixtures; 文学表达 completed eight units and three sampling turns, then the harness timeout ended the process with one claim held outcome-unknown and no persisted revision). Neither establishes editorial quality; [#812](https://github.com/zhouy1017/ai7-harness/issues/812) owns that.

Follow-ups opened by this wave: [#833](https://github.com/zhouy1017/ai7-harness/issues/833) SSE streaming of the dialogue request and a live 继续回答 (wave 2); [#839](https://github.com/zhouy1017/ai7-harness/issues/839) Review Runs persist unit checkpoints (wave 4). The publication-risk category's `searchEngine` flag stays unchanged for [#744](https://github.com/zhouy1017/ai7-harness/issues/744). Next work follows the 1.0.0 scope record and the development plan: wave 2 (writing, evaluation, #759 item 1, policy v11/v9).

## Remaining macro risks

- Business availability and value: fixture-backed surfaces can overstate usefulness; P0 live delivery and P1 #812 must establish real execution and editorial effects separately.
- Cost/recovery: retained claims and evidence prevent silent repeat sends; corrupt or unprovable state fails closed and can require reconciliation. Loss of the entire external evidence root cannot reconstruct prior transmission history. A substantive new validation question still needs developer judgment.
- Document integrity: untouched-file preservation does not prove edited complex DOCX fidelity. #814 and #766 retain distinct export and material-read scope.
- Cross-artifact correctness: cross-deliverable review currently cannot deliver its intended result; #813 must preserve exact version/source authority.
- Execution authority: strict Gate protection binds tests and release to exact candidates; #807's exact final dev acceptance is delivered in PR #824. Green tests alone do not release a candidate, and repository-agent model use is not product validation.
- Scope growth: vectors, learning, cross-Book orchestration and release follow usable core workflows; records and inert profiles alone do not establish working consumers.

## Resume

Read this checkpoint, the development plan, Orca dispatch and the selected Issue. Record the actual baseline/current writer; resolve the installed Orca runtime before dispatch. Follow the single rulebook for pairing, branches, handoff and validation, with provider-free CI and truthful current/target status. Do not recover retired instructions from archives to override current owners. Update this checkpoint on final dev integration with user-visible outcomes and evidence, not attempt chronology.
