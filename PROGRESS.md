# Progress

## What's done

- Read the project checkpoint instructions and confirmed the workspace is currently empty and is not yet a Git repository.
- Used the requested `ask-matt` router; selected the `setup-matt-pocock-skills` preflight followed by the stateful `grill-with-docs` design flow.
- Loaded the grilling and domain-modeling conventions, including glossary and ADR formats.
- Audited `zhouy1017/ai7-reborn-ai` at `dev@3e6e9ac772b7f07832154fa39d7de8a4deca51b1`; identified the product/domain contracts, current implementation boundaries, behavioral evidence, and legacy assets that should be kept, adapted, or retired.
- Audited `zhouy1017/deepseek-harness` at `master@47f943859bef60e4160492346772ded9b24f765a`; identified its Cordis plugin architecture, profile/bundle composition, agent/session/tool seams, UI extension plane, and developer-preview constraints.
- Confirmed the repositories have unrelated histories; the Harness fork is identical to upstream, Harness is MIT at the pinned revision, and the private AI7 repository has no declared license.
- Created the design-only `kick-in/` workspace: charter, pinned provenance, proposed target architecture, keep/adapt/drop matrix, migration workflow, 17-question decision map, risk register, and an empty decision-record area.
- Verified every local Markdown link in `kick-in/` resolves and confirmed the folder contains documentation only.
- Design interview Question 1/17 accepted GitHub Issues as the new project's issue tracker.
- Design interview Question 2/17 accepted that external pull requests are not an incoming request surface at this stage because there will be no external contributors.
- Design interview Question 3/17 accepted the default triage labels unchanged: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, and `wontfix`.
- Design interview Question 4 accepted a multi-context domain-document layout and a maintained glossary reference file.
- Added `kick-in/07-project-setup-draft.md` with the exact proposed `AGENTS.md`, GitHub tracker, triage-label, domain-doc, context-map, and non-duplicating glossary setup for confirmation.
- Question 5/18 approved the canonical setup draft. Created `AGENTS.md`, the one-line `CLAUDE.md` wrapper, `docs/agents/{issue-tracker,triage-labels,domain}.md`, `CONTEXT-MAP.md`, `GLOSSARY.md`, and the three initial context `CONTEXT.md` files.
- Audited the pinned legacy AI7 and DeepSeek Harness agent/context/Claude document hierarchies. Added `kick-in/08-source-document-inheritance.md` with file-level and topic-level preserve/modify/relocate/archive decisions, precedence rules, term routing, Harness rule classification, and five later authority collisions.
- Question 6 replaced whole-matrix approval with a row-by-row review of original-AI7 documentation. Harness document inheritance is delegated to the architecture maintainer and remains subordinate to accepted AI7 constraints.
- Recorded the accepted cross-cutting legacy dispositions in `AGENTS.md`, `CONTEXT-MAP.md`, `kick-in/00-charter.md`, `kick-in/03-keep-adapt-drop.md`, `kick-in/04-migration-workflow.md`, `kick-in/05-decision-map.md`, and `kick-in/08-source-document-inheritance.md`: preserve/rebaseline tiered GitHub Actions plus generated mock-LLM-provider cases; preserve local multi-agent dispatch for development only; keep a concise revised `AGENTS.md`; keep a Windows-focused desktop product; discard the old UI and revise user stories selectively.
- Expanded the decision-tree estimate from 19 to 28 questions so original-AI7 topic clusters can be resolved one at a time; Question 7 is now the primary user/problem story.
- Question 7 accepted a revised product spine: Chinese-first work for editorial professionals in leading mainland Chinese literary publishing houses; multi-aspect editorial judgment; controlled non-publication rather than classified-data secrecy; and Editorial Deliverables spanning manuscripts, promotional articles, news reports, and reviews.
- Promoted the first accepted Editorial terms into `docs/domain/editorial/CONTEXT.md` and indexed them from `GLOSSARY.md`: Primary Editorial Role, Chinese-first Editorial Work, Unpublished Editorial Material, Public Release Permission, Editorial Deliverable, and Multi-aspect Editorial Task.
- Updated `AGENTS.md`, `kick-in/00-charter.md`, `kick-in/02-target-architecture.md`, `kick-in/03-keep-adapt-drop.md`, `kick-in/04-migration-workflow.md`, `kick-in/05-decision-map.md`, `kick-in/06-risk-register.md`, and `kick-in/08-source-document-inheritance.md` with the accepted product story and proportional public-release boundary.
- Added `kick-in/09-retained-development-workflows.md`, an exact-pin inventory separating current, pilot, and historical evidence for tiered GitHub Actions, generated provider fixtures/cassettes, and development-only multi-agent dispatch.
- Increased the interview estimate from 28 to 29 because “multi-aspect editorial judgment” requires its own dimension decision before Book journeys can be assessed.
- Question 8 accepted the proposed eight Editorial Dimensions as a built-in baseline and required a flexible production entry for user-defined dimensions.
- Added `kick-in/10-editorial-dimensions.md`; updated `kick-in/{README,00-charter,03-keep-adapt-drop,05-decision-map,08-source-document-inheritance}.md`, `docs/domain/editorial/CONTEXT.md`, and `GLOSSARY.md` with the extensible catalog decision.
- Increased the interview estimate from 29 to 30 because user-defined dimensions need an ownership, override, propagation, and history-snapshot decision.
- Question 9 accepted the Editorial Profile → Book Editorial Dimension Set → immutable Task Editorial Dimension Snapshot model, with stable IDs, prospective changes, explicit profile reapplication, and archive-not-delete semantics.
- Updated `kick-in/{05-decision-map,08-source-document-inheritance,10-editorial-dimensions}.md`, `docs/domain/editorial/CONTEXT.md`, and `GLOSSARY.md`; added accepted `docs/adr/0001-versioned-editorial-dimension-configuration.md` and linked it from `kick-in/decisions/README.md`.
- Question 10 accepted Book-scoped source/mutation authority for manuscript tasks and explicit direct Cross-project work, while adding a separate requirement to learn patterns and feedback across the eligible Working Corpus.
- Added `kick-in/11-cross-corpus-editorial-learning.md`; updated `AGENTS.md`, `kick-in/{README,00-charter,02-target-architecture,03-keep-adapt-drop,05-decision-map,08-source-document-inheritance}.md`, `docs/domain/editorial/CONTEXT.md`, and `GLOSSARY.md` with the task-authority versus learning-scope distinction.
- Increased the interview estimate from 30 to 32 so House Editorial Memory representation and its learning-signal/update governance are decided separately.
- Question 11 accepted versioned, inspectable, provider-independent House Editorial Memory for unrelated Books, with provenance, exact task snapshots, user correction/forgetting, no raw cross-Book text by default, and no opaque fine-tuning initially; Series was added as an explicit richer-sharing exception.
- Audited original-AI7 learning evidence at the exact pin: current direct cross-project retrieval is explicit/run-local; Word feedback, style entries, and memory review are capture/governance shells; no current feedback-to-memory or memory-to-prompt path exists; older behavioral-RAG claims are reference-only and internally inconsistent.
- Added `kick-in/12-series-work.md`; expanded `kick-in/11-cross-corpus-editorial-learning.md` with pinned legacy evidence; updated `AGENTS.md`, `kick-in/{README,00-charter,02-target-architecture,03-keep-adapt-drop,05-decision-map,08-source-document-inheritance}.md`, `docs/domain/editorial/CONTEXT.md`, and `GLOSSARY.md` with Series, Series Knowledge, Series Corpus, and Series-scoped Task concepts.
- Increased the interview estimate from 32 to 33 so the Series shared-information/read boundary is resolved before learning-signal governance.
- Question 12 accepted explicit/versioned Series membership, automatically shared Series Knowledge, provenance-bearing read-only retrieval across current non-excluded member sources, relevant-passage context, and Book/revision-targeted mutations.
- Updated `kick-in/{README,02-target-architecture,03-keep-adapt-drop,05-decision-map,08-source-document-inheritance,11-cross-corpus-editorial-learning,12-series-work}.md`, `docs/domain/editorial/CONTEXT.md`, and `GLOSSARY.md`; added `docs/adr/0002-book-series-cross-project-and-house-learning-scopes.md` and linked it from `kick-in/decisions/README.md`.
- Question 13 accepted explicit-scope memory instructions, automatic feedback evidence capture, candidate-only inferred patterns, approval before cross-Book promotion, user review/rollback/forget controls, exact task memory snapshots, and no automatic model training.
- Added the Learning Audit Log and adaptive material-eligibility requirements: users must trace which materials influenced learning, include/exclude them, and teach a separate policy for similar future material rather than making isolated as-is edits.
- Added `kick-in/13-learning-audit-and-eligibility.md`; updated `AGENTS.md`, `kick-in/{README,00-charter,03-keep-adapt-drop,05-decision-map,08-source-document-inheritance,11-cross-corpus-editorial-learning}.md`, `docs/domain/editorial/CONTEXT.md`, and `GLOSSARY.md` with Learning Material, Eligibility Decision/Policy, Lineage, and Audit Log concepts.
- Increased the interview estimate from 33 to 35 so the audit/descendant-impact contract and the adaptive eligibility-policy authority are decided separately.
- Question 14 accepted append-only Learning Lineage, dependency-aware exclusion, running-task revalidation, historical-impact marking, retained original evidence, and rationale/scope feedback into the future Learning Eligibility Policy.
- Recorded a new cross-cutting invariant: AI7 does not train or fine-tune LLM weights; it uses replaceable provided Foundation Models combined with an AI7-owned Editorial Intelligence Layer of professionally governed knowledge, sources, skills, tools, memory, policies, provenance, feedback, and evaluations to achieve Editor-comparable Delivery Quality and reduce workload.
- Added `kick-in/14-foundation-model-editorial-intelligence.md` and `docs/adr/0003-use-foundation-models-with-governed-editorial-intelligence.md`; updated `AGENTS.md`, `CONTEXT-MAP.md`, `GLOSSARY.md`, `docs/domain/{editorial,execution}/CONTEXT.md`, `kick-in/{README,00-charter,02-target-architecture,03-keep-adapt-drop,05-decision-map,08-source-document-inheritance,13-learning-audit-and-eligibility}.md`, and `kick-in/decisions/README.md`.
- Incorporated the exact-pin original-AI7 audit: its current durable audit/forget mechanics are reusable, but independently validated lineage, adaptive eligibility, candidate generation, and approved-memory retrieval are gaps; legacy training/export material is reference-only.
- Recorded the accepted purpose of DeepSeek Harness as AI7's Agent Behavior Framework, not merely an agent-loop dependency: the Foundation Model supplies general capability, Harness composes observable agent conduct, and AI7 owns professional editorial intelligence and authority.
- Added `kick-in/15-harness-agent-behavior.md`; updated `AGENTS.md`, `GLOSSARY.md`, `docs/domain/{editorial,execution}/CONTEXT.md`, and `kick-in/{README,00-charter,02-target-architecture,03-keep-adapt-drop,05-decision-map,08-source-document-inheritance,14-foundation-model-editorial-intelligence}.md` with the three-layer model, separate Editorial Learning and Agent Behavior Improvement loops, versioned/evaluated Harness composition, and the still-open production authority boundary.
- Completed the focused exact-pin DSH behavior audit. Expanded `kick-in/15-harness-agent-behavior.md` with evidence paths and limitations for profiles/bundles, presets, plugins/events, prompt/context, tools/policy/approval, plans/goals/workflows/subagents, sessions/persistence, replay/snapshots, and dynamic mechanisms; corrected the architecture and matrix to assign semantic quality evaluation to AI7 because DSH has no general evaluator.
- Question 15 accepted recommendation-first bounded Learning Eligibility Policy automation: high-confidence actions may occur only inside user-approved material/scope boundaries; uncertain, conflicting, novel, or out-of-boundary cases require review; explicit overrides win; and eligibility never approves memory, source access, publication, or Model Training.
- Added the canonical design-phase `docs/policies/learning-eligibility-policy.md` and `kick-in/16-policy-documents-and-feedback-ux-handoff.md`. Updated `AGENTS.md`, `CONTEXT-MAP.md`, `GLOSSARY.md`, `docs/domain/{editorial,execution}/CONTEXT.md`, and `kick-in/{README,00-charter,02-target-architecture,03-keep-adapt-drop,05-decision-map,13-learning-audit-and-eligibility,15-harness-agent-behavior}.md` with versioned Policy Documents, Post-run Policy Review, agent-authored Proposed Policy Revisions, and a no-layout UX handoff for the owner's separate UI/UX agent session.
- Completed Question 15 by accepting hybrid Policy Revision Activation. Updated `AGENTS.md`, `GLOSSARY.md`, `docs/domain/execution/CONTEXT.md`, `docs/policies/learning-eligibility-policy.md`, and `kick-in/{03-keep-adapt-drop,05-decision-map,13-learning-audit-and-eligibility,15-harness-agent-behavior,16-policy-documents-and-feedback-ux-handoff}.md`; added and indexed `docs/adr/0004-govern-learning-eligibility-with-versioned-policy-documents.md`.
- Audited original-AI7 source truth, index/search/exact-fetch, generation, Q&A, citations, and grounding at the exact pin for Question 16. Added `kick-in/17-source-generation-grounding-boundary.md`; updated `kick-in/{README,03-keep-adapt-drop,05-decision-map,08-source-document-inheritance}.md` with current-versus-reference evidence, the current claim-grounding gap, proposed evidence classes, and keep/modify/drop recommendations.
- Question 16 accepted a critical correction: an exact manuscript revision is the Textual Source of Record for what the document says, but it is never automatically a truth oracle for its assertions. AI7 must identify factual and semantic errors and offer exact-revision Correction Proposals rather than silently treating manuscript claims as facts or mutating them.
- Added Textual Source of Record, Manuscript Assertion, Factual Verification, Semantic Review, Editorial Error Finding, and Correction Proposal to `docs/domain/editorial/CONTEXT.md` and indexed their collisions in `GLOSSARY.md`. Updated `AGENTS.md` and `kick-in/{00-charter,02-target-architecture,03-keep-adapt-drop,05-decision-map,08-source-document-inheritance,17-source-generation-grounding-boundary}.md` with the accepted distinction.
- Completed a focused exact-pin audit of current review, developmental-review, annotation/proposal, formal-review, proof-correction, evidence-integrity, and external-artifact behavior. Recorded that current AI7 strongly proves text/revision lineage and proposal approval but has no independent factual-verification contract; its generic `grounded` result only means exact sources were present.
- Expanded `kick-in/17-source-generation-grounding-boundary.md` to keep Reference Integrity, Claim Support, and Factual Verification independently reportable and to propose a versioned Factual Verification Policy Document, configurable evidence preference, Model-knowledge restriction, conflict rule, and staged external-research boundary.
- Completed Question 16/35. Accepted the configurable Factual Verification Policy Document, domain-sensitive default evidence preference, Foundation-Model-as-research-lead-only rule, and explicit `conflicting`/`unresolved` outcomes rather than silent factual resolution.
- Added the canonical design-phase `docs/policies/factual-verification-policy.md` and `docs/adr/0005-separate-textual-and-factual-authority.md`. Updated `AGENTS.md`, `CONTEXT-MAP.md`, `GLOSSARY.md`, `docs/domain/editorial/CONTEXT.md`, and `kick-in/{README,03-keep-adapt-drop,05-decision-map,08-source-document-inheritance,17-source-generation-grounding-boundary,decisions/README}.md` to close Question 16 and advance the interview to Question 17.
- Audited original-AI7 manuscript blocks, revision DAG, branch scope, journal/checkpoint split, proposal branches, conservative merge, no-partial apply, recovery gate, atomic publication, restart/drift, current contract tests, and superseded linear reference design at the exact pin for Question 17.
- Added `kick-in/18-manuscript-revision-and-recovery-boundary.md`; updated `kick-in/{README,03-keep-adapt-drop,05-decision-map,08-source-document-inheritance}.md` with the proposed semantic model, explicit concept separations, current evidence, keep/modify/drop boundary, and remaining reimport/recovery gaps.
- Completed Question 17/35. Accepted stable Manuscript Blocks, immutable Manuscript Revisions and text-only branches, durable Edit Journal versus meaningful Manuscript Checkpoint separation, isolated Proposal Branches, conservative same-block conflict handling, atomic no-partial apply, and independently verified recovery; legacy implementation machinery is not inherited.
- Added the accepted terms Source Version, Manuscript Block, Manuscript Revision, Manuscript Branch, Edit Journal, Manuscript Checkpoint, Proposal Branch, Manuscript Conflict, Recovery Snapshot, and Manuscript Pin to `docs/domain/editorial/CONTEXT.md` and `GLOSSARY.md`. Added `docs/adr/0006-preserve-manuscript-native-history-and-recovery.md`; updated `AGENTS.md` and `kick-in/{README,03-keep-adapt-drop,05-decision-map,08-source-document-inheritance,18-manuscript-revision-and-recovery-boundary,decisions/README}.md`.
- Audited original-AI7 generated proposal, coarse task-skill grant, exact lifecycle-command approval, Effect identity/idempotency, receipt, ambiguous-outcome, restart/drift, rejection/cancellation, and historical `/agent/approve` contracts at the exact pin for Question 18.
- Added `kick-in/19-proposal-approval-effect-replay-boundary.md`; updated `kick-in/{README,03-keep-adapt-drop,05-decision-map,08-source-document-inheritance}.md` with named authority records, one-interaction/two-record proposal application, per-Effect atomicity, receipts, ambiguous-outcome handling, provider-free proof requirements, and keep/modify/drop recommendations.
- Completed Question 18/35. Accepted named Run Authorization, Execution Grant, Proposal Decision, Review Decision, Effect Approval, and Public Release Permission; one interaction may create distinct proposal/application records; stable Effect identity, staged per-Effect atomicity, receipts, drift invalidation, classified manual evidence, and no automatic ambiguous-outcome retry/fallback are required.
- Added `docs/adr/0007-separate-decisions-authority-and-effect-proof.md`. Updated `AGENTS.md`, `docs/domain/{editorial,execution}/CONTEXT.md`, and `kick-in/{README,03-keep-adapt-drop,05-decision-map,08-source-document-inheritance,19-proposal-approval-effect-replay-boundary,decisions/README}.md` to close Question 18 and advance to Question 19.
- Added preferred Simplified Chinese labels for every accepted glossary term in `GLOSSARY.md`, with explicit translation discipline for authority, Effects, checkpoints, versions, Series, and textual authority. Added `UBIQUITOUS_LANGUAGE.md` as the bilingual relationship/dialogue/ambiguity guide while retaining the context `CONTEXT.md` files as canonical definition owners.
- Audited original-AI7's fixed eleven-stage Book lifecycle, lifecycle record metadata, artifact/gate/proof schemas, eight guarded commands, five provider-free proposal-only lifecycle skills, current contract tests, historical PRD, and retired pseudo-skill path at the exact pin for Question 19.
- Added `kick-in/20-deliverable-workflow-and-artifacts.md`; updated `kick-in/{README,03-keep-adapt-drop,05-decision-map,08-source-document-inheritance}.md` with the proposed Book-owned/deliverable-specific workflow model, seven shared phases, four V1 deliverable profiles, typed artifact family, skill/command authority split, and keep/adapt/drop boundary.
- Completed Question 19/35. Accepted Book-owned, deliverable-specific Workflow Profiles/Instances; seven reusable phases; V1 Manuscript, Promotion Article, News Report, and Review Article profiles; typed Editorial Artifacts; evidence-bearing gates/signoff; and the legacy lifecycle keep/adapt/drop boundary.
- Added `docs/adr/0008-use-deliverable-owned-workflow-profiles.md`; updated `AGENTS.md`, `docs/domain/editorial/CONTEXT.md`, `GLOSSARY.md`, `UBIQUITOUS_LANGUAGE.md`, and `kick-in/{README,03-keep-adapt-drop,05-decision-map,08-source-document-inheritance,20-deliverable-workflow-and-artifacts,decisions/README}.md` to close Question 19 and advance to Question 20.
- Added 13 English/Chinese workflow and deliverable terms, including an explicit `Editorial Review` / `Review Article` distinction and a workflow-language dialogue example.
- Audited original-AI7 visible-plan autonomy, exact launch/preflight authority, Task Intent/Task Composer implementation, provider-plan binding, generic run-plan maturity, durable clarification/continuation, outcomes, workbench decisions, and historical agent console at the exact pin for Question 20.
- Added `kick-in/21-bounded-plan-task-interaction.md`; updated `kick-in/{README,03-keep-adapt-drop,05-decision-map,08-source-document-inheritance}.md` with the proposed Task Intent, Execution Plan, Plan Preview, authority-bearing Plan Envelope, bounded adaptation, material-revision, durable clarification, and typed-outcome contracts.
- Completed Question 20/35. Accepted an exact Task Intent and versioned Execution Plan, human-readable Plan Preview, authority-bearing Plan Envelope, bounded logged Plan Adaptation, material Plan Revision plus renewed Run Authorization, durable Clarification Request, typed Task Outcome, and the full legacy Task Composer/workbench/agent-console UI drop boundary.
- Added `docs/adr/0009-use-authority-bearing-plan-envelopes.md`; updated `AGENTS.md`, `docs/domain/execution/CONTEXT.md`, `GLOSSARY.md`, `UBIQUITOUS_LANGUAGE.md`, and `kick-in/{README,03-keep-adapt-drop,05-decision-map,08-source-document-inheritance,21-bounded-plan-task-interaction,decisions/README}.md` to close Question 20 and advance to Question 21.
- Added eight English/Chinese task-planning terms and explicitly separated Execution Plan, Plan Preview, Plan Envelope, Plan Adaptation, and Plan Revision in the bilingual language guide.
- Audited original-AI7 Task Skill/manifest, 13-skill catalog, fragmented execution, local-skill admission/validation/enablement gap, capability enforcement, trust/provenance, source scope, Model Roles, provider resolution/fallback, credential storage, mock-only provider execution, and historical APIs at the exact pin for Question 21.
- Audited Harness Skill/provider, Cordis capability/plugin, tool/policy, bundle/profile/preset, LLM, credential, MCP, Session, and dynamic-extension seams at its exact pin; confirmed that Harness Skill metadata and tool visibility cannot carry AI7 product authority.
- Added `kick-in/22-task-skill-capability-trust-provider-boundary.md`; updated `kick-in/{README,03-keep-adapt-drop,05-decision-map,08-source-document-inheritance}.md` with the proposed declarative package, layered authority, AI7 Capability, Task Skill Activation, Harness projection, provider/credential, proportional outbound-data, and keep/adapt/drop boundaries.
- Completed Question 21/35. Accepted immutable declarative Task Skills; provenance-derived bundled/local-user trust; content-addressed admission and validation; enablement Authority Ceiling; exact per-Run Task Skill Activation and Capability Grants; separately installed Capability Implementations; Harness instructional projection; Model Role/provider resolution; brokered credentials; and separate provider-processing/export/public-release policy.
- Added `docs/adr/0010-separate-task-skill-instruction-implementation-and-authority.md`; updated `AGENTS.md`, `docs/domain/execution/CONTEXT.md`, `GLOSSARY.md`, `UBIQUITOUS_LANGUAGE.md`, and `kick-in/{README,03-keep-adapt-drop,05-decision-map,08-source-document-inheritance,22-task-skill-capability-trust-provider-boundary,decisions/README}.md` to close Question 21 and advance to Question 22.
- Added 31 English/Chinese Task Skill, capability, trust, model-service, credential, and outbound-data terms with explicit installation/enablement/activation, provider, and authority-collision rules.
- Audited original-AI7 Task Intent, scoped Run Records, Operation Records/Events/checkpoints, `operationRuns`, Q&A/provider-attempt duplication, lifecycle commands, Resume/Retry/Redo, and domain receipts at the exact pin for Question 22. Confirmed three overlapping execution records should not be reproduced.
- Audited Harness Session/model-message projection, request headers, turns/steps/tools, checkpoint policy, goals/workflows/jobs/subagents, persistence, repair, and lifecycle commands at the exact pin. Confirmed the Session ledger should be the sole model-execution history while AI7 retains business truth.
- Added `kick-in/23-linked-task-and-harness-ledgers.md`; updated `kick-in/{README,03-keep-adapt-drop,05-decision-map,08-source-document-inheritance}.md` with the proposed Task Ledger/Harness Session Ledger split, active Operation retirement, Execution Binding/Span, command outbox, continuation, Effect-attempt, retention, and bilingual terminology boundaries.
- Validated all local Markdown links and the exact one-line `CLAUDE.md` wrapper after the Question 22 proposal.
- Completed Question 22/35. Accepted one logical causal graph with an AI7 Task Ledger for business truth and a Harness Session Ledger for model/executor truth, exact Execution Bindings/Spans, active Operation/Operation Event/`operationRuns` retirement, stable Effect IDs across attempts, and distinct Resume/Retry/Redo/Replay semantics.
- Promoted the accepted linked-ledger language into `AGENTS.md`, `CONTEXT-MAP.md`, `docs/domain/{execution,editorial}/CONTEXT.md`, `GLOSSARY.md`, and `UBIQUITOUS_LANGUAGE.md`; added `docs/adr/0011-separate-task-business-and-harness-execution-ledgers.md`; updated the affected architecture, migration, risk, manuscript, Effect, planning, Task Skill, and inheritance documents.
- Accepted an allowlist-only legacy-data boundary: no production data migrates except user-selected API credentials transferred through protected stores, reviewed mock-provider evidence, and explicitly selected testing sample Books. Added `kick-in/24-legacy-data-migration-boundary.md` and `docs/adr/0012-exclude-legacy-production-data-migration.md`; updated standing rules, provenance, migration workflow, matrix, risk register, decision map, and source-inheritance references.
- Audited exact legacy credential/config locations, mock-provider candidate assets, sample-Book handling, and stale importer assumptions. Recorded plaintext-key re-enrollment/rotation, a distinct new credential namespace, closed fixture manifest, DOCX metadata review, local-only private samples, redistribution/provenance gates, and regeneration of the public-synthetic corpus whose byte length exposed a private sample fingerprint.
- Audited original AI7 and pinned Harness for Question 23. The initial bounded-Word proposal in `kick-in/25-standalone-word-surface-boundary.md` was superseded by the owner's Standalone-only revision; its Word binding/drift/synchronization analysis remains contingency evidence only.
- Validated all local Markdown links, the one-line `CLAUDE.md` wrapper, 137 unique/indexed canonical context terms, and removal of Operation Checkpoint from the active glossary after the Q22/data/Q23 documentation pass.
- Completed Question 23/35. Accepted a Chinese-first Windows Standalone-only V1; Microsoft Word integration, parity, COM/add-in, synchronization, packaging, and verification are excluded from V1, and neither legacy UI/editor is a migration baseline.
- Rewrote `kick-in/25-standalone-word-surface-boundary.md`; added `docs/adr/0013-ship-standalone-only-v1.md`; updated `AGENTS.md`, `CONTEXT-MAP.md`, `GLOSSARY.md`, the deferred Word context, and the affected charter, architecture, matrix, migration, risk, policy-UX, planning, learning, decision-map, inheritance, and decision-index documents.
- Audited the old Standalone at the exact AI7 pin. Recorded that it was explicitly rejected, its monolithic renderer and approximate layout have no professional-editor acceptance evidence, and only surface-neutral Unicode/IME, selection, journal, proposal, recovery, replay, and fidelity outcomes should be rebaselined.
- Audited the pinned Harness and original-AI7 verification systems for Question 24, including hosted tiers, exact-SHA admission, test catalogs, replay/mock-server helpers, fixture generation, request-matching gaps, quarantine, and Windows proof ownership.
- Added `kick-in/26-tiered-verification-and-mock-provider-evidence.md`; updated `kick-in/{README,05-decision-map,09-retained-development-workflows}.md` with the detailed four-tier provider-free proposal, non-gating local provider rehearsal, exact receipts, replay fingerprint guard, and regenerated Chinese public-synthetic corpus contract.
- Verified current `ubuntu-24.04` and `windows-2025` standard runner labels in GitHub's official hosted-runner reference, resolved all local Markdown links, confirmed the exact `@AGENTS.md` Claude wrapper, and revalidated 137 unique one-to-one canonical glossary/context terms.
- Asked Question 24/35 with the four-tier verification proposal. The owner answered with a correction rather than an acceptance: Ubuntu is only a GitHub Actions runner, the target platform is Windows-only, no Ubuntu production is needed at this stage, and the tiered verification/build/test must be concise and quick. The prior Codex session reached its usage limit before recording this, so it was reconstructed from the raw transcript.
- Reconstructed the full project state from `handoff20260817/raw-conversation.md` after the Codex session ended without a curated handoff. Recorded objective, confirmed requirements and constraints, non-goals, accepted decisions with citations, unaccepted proposals, superseded decisions, repository state, design-versus-repository gaps, open questions, contradictions, and confidence levels in `handoff20260817/STATE-RECONSTRUCTION.md`.
- Initialized this design room as a Git repository on branch `main` by owner instruction and published it as private `zhouy1017/ai7-harness`. The initial commit `579fbeb` contains 58 Markdown documents, no product source, and a fresh history unrelated to either input repository. A secret-pattern scan over all Markdown ran clean before the push.
- Swept the records that the Q24 correction and the repository creation had made stale or self-contradictory: `AGENTS.md` standing rules, `kick-in/05-decision-map.md` Question 24 and 27 status, the superseded Q24 proposal, `kick-in/README.md`, `kick-in/01-source-provenance.md`, `kick-in/04-migration-workflow.md`, `kick-in/06-risk-register.md`, and the mixed accepted/proposed status of `kick-in/02-target-architecture.md`. Added `.gitattributes` to normalize line endings.

- Completed Question 24/35. Accepted a reduced verification contract: two GitHub Actions workflows, `pr` and `release`, each a single job on `windows-2025`; `pr` is the sole required gate with no path filters, targeting 10 minutes; `release` builds one Windows package on a `v*` tag and fails closed without a green `pr` run for the same SHA. Focused verification is local with no workflow; Provider Rehearsal is local, opt-in, and never gating. The Ubuntu lane, nightly tier, machine-owned Test Catalog, quarantine registry, and wire-level fault server are deferred behind named trigger conditions rather than rejected.
- Retained four load-bearing requirements through the reduction: required CI stays provider-free; replay fails closed on a request-fingerprint mismatch so a changed prompt cannot silently reuse a stale cassette; the legacy public-synthetic corpus is regenerated because its byte length leaked a private sample document's size; and release emits a five-field receipt instead of a twelve-field proof-input fingerprint. Time budgets are recorded as calibration set before any code existed.
- Rewrote `kick-in/26-tiered-verification-and-mock-provider-evidence.md` as the accepted contract; added `docs/adr/0014-verify-on-one-windows-gate.md`; updated `AGENTS.md`, `kick-in/{README,03-keep-adapt-drop,04-migration-workflow,05-decision-map,09-retained-development-workflows,decisions/README}.md`.

- Completed Question 25/35. Accepted a three-role Repository Development Dispatch: a Commander that decides dispatch and is the sole integrator and external-action authority, Workers that write only their own worktree and branch, and an independent Reviewer that never authored what it reviews. Every dispatched branch is reviewed at a task class at least equal to the work reviewed, cross-provider by default, disclosing reduced independence when that is impossible.
- Accepted the owner's central requirement that operating rules stay identical across providers and models. Layer A operating rules may never be conditioned on which model is running; a single Layer B binding table is the only provider-specific artifact, so replacing a provider replaces one row rather than revising any rule.
- Recorded the verified model bindings. Codex normally holds the commander seat at top capability on `gpt-5.6-sol` at `ultra`; task classes bind to `gpt-5.6-luna`, `gpt-5.6-terra`, and `gpt-5.6-sol` against `claude-haiku-4-5-20251001`, `claude-sonnet-5`, and `claude-opus-5`. Effort ladders differ in length between providers, so bindings map task outcome to setting rather than matching label to label. Verified the Codex lineup, effort ladder, and pricing against OpenAI's model reference and the local Codex CLI 0.147.0 configuration.
- Made fallback bidirectional after observing that the Codex quota was exhausted on 2026-08-17 while Claude remained available, which is the inverse of the originally assumed scarcity. Fallback downgrades the provider, never the task class, and the commander seat itself may move.
- Rejected the legacy orchestration pilot as a baseline: its bespoke lifecycle state machine and the `agent-host-connector/` with DPAPI and Windows Hello enrollment had not completed required real-host observations at the audit pin and address a host-authority problem this repository does not have. Its safety guarantees survive as operating rules instead.
- Added `kick-in/27-repository-development-dispatch.md` and `docs/adr/0015-provider-neutral-development-dispatch.md`; recorded two collision guards in `GLOSSARY.md` so a Dispatch reviewer is never read as a Review Decision and the Dispatch binding table is never read as a Provider Resolution Plan; updated `AGENTS.md`, `kick-in/{README,05-decision-map,09-retained-development-workflows,decisions/README}.md`.

- Completed Question 27/35. AI7 is proprietary with all rights reserved to the sole rights-holder; added an explicit `LICENSE` rather than relying on default copyright, because an unstated license read as unresolved and was blocking source reuse. The owner is the sole rights-holder of the private predecessor and authorizes reuse of its code, documentation, tests, and fixtures for AI7.
- Recorded the sample-manuscript authorization as separate from and narrower than code rights. The existing sample Books are real manuscripts, authorized for AI7 use only while kept private and local: never committed in history or working tree, never in hosted CI, artifacts, distributable fixtures, corpora, or the shipped product, and carrying no redistribution right. Verified that all three legacy repositories git-ignore them today with zero tracked files.
- Corrected an over-conservative reading recorded earlier in the same session. Sending manuscript content to a configured model provider **is permitted**: it is controlled processing under the Provider Processing Policy and the basic feature of AI7, not an exception requiring separate authorization. The manuscript constraint governs persistence and publication, not processing.
- Sharpened the storage prohibition on owner instruction: manuscripts never enter **any** repository, public or private, and private visibility does not cure it.
- Recorded expanded copy authorization covering both local predecessor checkouts, `ai7-reborn-ai` and `ai7-redesign`. Verified that `ai7-redesign@fc2f4d85afd2a5372c89f3c755727df54b1b2cb0` is a strict ancestor of `ai7-reborn-ai@3e6e9ac` and that reborn's `package.json` still declares `"name": "ai7-redesign"`, so the redesign checkout holds nothing unique and was never audited; prefer the audited reborn pin.
- Cleared the last Critical authority blocker on source copying, and added two replacement risks: a private sample manuscript escaping its local-only authorization, and upstream third-party obligations being assumed to transfer to an AI7-branded distribution.
- Added `LICENSE` and `docs/adr/0016-proprietary-license-and-local-only-sample-manuscripts.md`; updated `AGENTS.md`, `kick-in/{01-source-provenance,05-decision-map,06-risk-register,24-legacy-data-migration-boundary,decisions/README}.md`.

- Completed Question 28/35. The product display name is exactly AI7, with no separate Chinese product name. Repository suffixes `-harness`, `-reborn`, and `-redesign` are developer-facing development-track markers carrying no product meaning, so `ai7-harness` is not renamed and future agents should not treat the name as a defect. Harness remains the execution foundation and never user-facing branding, appearing only in third-party notices. Recorded in the decision map rather than an ADR, as a routine planning answer rather than a hard-to-reverse trade-off. Branch C is now fully resolved.
- Confirmed explicitly, replacing an inference flagged at Question 27: all AI7 projects are solely owned by the repository owner, and agents are authorized to modify them. Recorded that this is a statement of rights, not of workflow — the Repository Development Dispatch role authority is unchanged, and a Worker still never merges, pushes, publishes, or takes external actions.

- Completed Question 29/36. Accepted a full Harness engine behind a narrow tool surface: an editorial Run never receives a generic shell, roaming filesystem, or arbitrary network tool, only domain-shaped capabilities including bounded import/export and provenance-bearing research. The governing reason is the user story — a literature professional cannot assess whether an action is safe, so the product must never ask them to authorize one.
- Separated user file access from agent file access. Users reach all their own material without filesystem literacy, and retrievability of every imported source and generated deliverable is a guarantee rather than a feature, so freedom from paths never becomes an opaque store the work cannot leave.
- Accepted the Agent Data Root on owner amendment: real filesystem permission inside, none outside, with a per-Run unscoped scratch area. Added the nested Run Source Scope boundary, because a data root holds every Book and raw access across it would satisfy the sandbox while silently regressing ADR 0002. Excluded the Protected Secret Store from the root and required the root to live outside any repository working tree, making a manuscript commit structurally impossible rather than merely forbidden.
- Accepted two capability profiles, Editorial shipped and Developer not, with no self-service escalation; a middle power-user profile is deferred behind a named-workflow trigger.
- Revised the self-modification boundary on owner instruction. An agent may propose a revision to anything, including plugins and tools, rather than composition being frozen. The line is that a prompt may shape quality but never grant authority, and activation is tiered so that capability expansion never self-activates: Behavior Assets may auto-activate only for non-expansive calibration inside an approved envelope, Policy Documents always require developer review, and composition changes ship in a release. Hidden from editorial users is permitted; silent is not.
- Added `kick-in/28-harness-capability-and-authority-boundary.md`, `docs/adr/0017-full-engine-narrow-tool-surface.md`, and `docs/adr/0018-tiered-activation-for-agent-authored-revisions.md`. Promoted Editorial Capability Profile, Developer Capability Profile, Agent Data Root, and Agent Behavior Asset into `docs/domain/execution/CONTEXT.md` and the bilingual `GLOSSARY.md` index and collision table. Closed the last two unaddressed Critical risk entries and added three replacements.
- Opened Question 36 and raised the estimate from 35 to 36. Question 29 established that agent-authored revisions cannot activate without an evaluation gate, and the pinned Harness has no general quality evaluator, so AI7 must own one. The proposal is in `kick-in/29-editorial-quality-metrics.md` and is explicitly unaccepted.

- Verified the Harness registry state before deciding Question 30. All 219 packages under `packages/*/*` publish as `@deepseek-ai/dsh-*` on an identical version ladder, but `latest` is stale on nearly every one at `0.0.1-rc.1` while `next` is `0.1.0-rc.6`; the audited `0.1.0-rc.5` was never published; and there are no git tags and no GitHub releases at all. Corrected a false intermediate reading along the way: `npm view <pkg> version` returns the `latest` dist-tag rather than the highest version, which had briefly suggested the published set was version-incoherent.
- Completed Question 30/36. Accepted exactly pinned public npm packages with no fork and no vendored source; exact versions with a committed lockfile and one coherent version across the selected subset; consumed baseline `0.1.0-rc.6` with `0.1.0-rc.5` retained as the audited but uninstallable reference; upstream tracked by commit and npm version because no release channel exists; SDK/ACP retained as a fallback isolation seam; and a dedicated one-at-a-time upgrade pull request with a six-point verification contract.
- Accepted the owner's refinement that AI7 takes only part of Harness. AI7 never depends on the `@deepseek-ai/dsh` CLI aggregate, which transitively installs the generic shell, pwsh, terminal, and web tool packages excluded at Question 29. Recorded the principle that not depending on a package is a stronger guarantee than not wiring it, since absence from the dependency graph cannot be reversed by a later composition edit.
- Recorded a new Windows exposure: the published native sandbox addons are Landlock, which is Linux-only, while the Windows-only target sandboxes through a different path. Because the Agent Data Root treats an OS sandbox as its outer boundary, that mechanism's enforcement strength must be verified on Windows before the boundary is described as enforced rather than intended.
- Added `kick-in/30-upstream-consumption-and-upgrade-contract.md` and `docs/adr/0020-consume-pinned-harness-package-subset.md`; updated `AGENTS.md`, source provenance, the risk register, the target-architecture status split, the decision map, and the kick-in index. Cleared the fifth original implementation blocker.

- Completed Question 31/36. Clarified that a "second agent loop" means a second **implementation** of the model-conversation cycle, not concurrency. Ten Books worked at once means ten Harness Sessions each running an instance of the same loop, which is not a second loop. Parallel Runs across multiple Books, plus background analysis and learning work, are recorded as required product behavior rather than a tolerated exception.
- Recorded the four accepted decisions a genuine second implementation would break — the authoritative Session Ledger, single ambiguous-outcome semantics, the capability guard, and replay-evidence completeness — so the prohibition rests on consequences rather than preference.
- Accepted the division: AI7 schedules and Harness converses. AI7 owns which Runs exist, workflow state, continuation, concurrency, budget, Effects, and model-free background jobs such as indexing and metric computation; Harness owns turn structure, tool dispatch, in-turn retry, subagents, compaction, and Session events. AI7 business scheduling does not use Harness `schedule`, `jobs`, or workflow packages.
- Named two consequences that parallelism makes load-bearing: an instance-level concurrency and budget governor is AI7's to own, and concurrent Runs on different Books must not share scratch or cache.
- Accepted the owner's framing that AI7 **learns** the Harness framework rather than cloning it. Harness is built primarily for agentic coding while AI7 serves specialized Chinese literary publishing, so AI7 adopts composition machinery and rejects the coding-agent purpose, default presets and prompts, default tool set, and web surface. Recorded the principle that adopting a framework is not adopting its defaults, and that "full engine" means full composition capability rather than the full package set.
- Added `kick-in/31-single-execution-authority.md` and `docs/adr/0021-single-execution-authority.md`; updated `AGENTS.md`, the risk register, decision map, kick-in index, and the glossary collision table. Branch D is fully resolved.

- Audited the legacy Python runtime before deciding Question 33 and found the working premise was wrong. Its 62 files carry **zero third-party dependencies** — no `requirements.txt`, no `python-docx`, no PDF library — and DOCX is handled with `zipfile` plus `xml.etree`, treating it as the zip of XML it is. Python was the backend implementation language rather than a document-processing capability, and the packaged interpreter existed only to ship that backend all-in-one.
- Completed Question 33/36. Accepted TypeScript and Node throughout with no embedded Python. Every legacy capability has a direct Node equivalent, mostly stdlib to stdlib, and the business logic is being re-expressed from contract regardless under ADR 0006 — so keeping Python would port nothing while carrying a second runtime, roughly 50 to 100 MB, a second security surface, and cross-language IPC. Reconsideration trigger is narrow: a named capability with no adequate Node implementation enters as a bounded native module or sidecar under its own ADR, never as a general-purpose interpreter.
- Accepted a portable all-in-one Windows folder as the only V1 release channel, which also settles the release-channel half of Question 26. No installer, no admin rights, no registry writes — the intended users are publishing professionals on managed corporate machines, so removing the installer removes an IT gate.
- Accepted, by owner decision overriding the recommendation, that the Agent Data Root lives **inside** the AI7 folder so an installation is genuinely self-contained. Program files and user data separate within it so updates replace `app/` and preserve `data/`, and the data root carries a version marker so an older build refuses newer data.
- Kept the Protected Secret Store outside the folder as the deliberate "when possible" exception: a portable folder is designed to be copied, and a copied folder carrying credentials to another machine would be a real leak.
- Recorded the residual sync exposure with detection rather than a different default. A portable folder on a synced cloud drive would carry manuscripts off the machine; this does not violate the Question 36 egress rule as written, since that rule governs paths AI7 automates and folder placement is a user decision, so AI7 warns clearly without blocking. ADR 0016's prohibition now extends to the whole AI7 folder, which must stay outside any repository working tree.
- Specified an unwritable-location fallback to `%LOCALAPPDATA%\AI7` with a plain notice, and retained executable signing despite having no installer, since SmartScreen is a hard stop for a non-expert user on a corporate machine.
- Amended Question 24's `release` proof from install/launch/journey/uninstall to extract, first-run data-root creation, launch, canonical journey, and removal leaving no residue.
- Added `kick-in/32-runtime-language-and-release-channel.md`, `docs/adr/0022-typescript-only-runtime.md`, and `docs/adr/0023-portable-release-with-self-contained-data-root.md`; updated `AGENTS.md`, the risk register, decision map, Question 24 contract, and both indexes.

- Completed Question 34/36. Recorded that long Chinese manuscripts are a **required feature** with three binding tiers counted in Chinese characters: no sensible performance degradation below 500K, no critical performance issue up to 1M, and no crash or unresponsiveness up to 10M. For orientation, 10M Chinese characters is roughly 30 MB of UTF-8 text and 50,000 to 100,000 Manuscript Blocks, while the existing sample Books at 290K to 396K sit inside the easiest tier.
- Derived the architecture the tiers force rather than merely stating a goal: the renderer never holds a whole manuscript and always edits a bounded window of blocks; the authoritative model lives in the AI7 service over a store that pages by block; whole-manuscript operations stream in the service, cancellable and with progress, never on the UI thread; no unbounded in-memory structure exists at any layer; and the memory ceiling is tested at the 10M tier rather than assumed. An early performance gate proves the tiers before the editor is built out.
- Accepted Electron as the shell. Verified that Electron 43.4.0 bundles Node 24.18.1, which satisfies the Harness engine requirement of `^22.19.0 || >=24` directly. Rejected Tauri, which would add a Rust toolchain and still need a Node sidecar, and direct WebView2 hosting, which means native glue for a solved problem.
- Accepted a three-process topology: a thin Electron main shell, a renderer with context isolation on and Node integration off, and a separate Node service process holding AI7 domain services plus the composed Harness runtime as the one local authority. The separation keeps the UI responsive under the parallel Runs Question 31 requires, isolates crashes from unsaved text, gives the concurrency governor a home, and makes the service drivable headlessly — which the ten-minute pull-request gate and the tracer slice both need. IPC uses stdio or a Windows named pipe and never a TCP listener, removing the exposed-web-server risk structurally.
- Accepted ProseMirror as the editor foundation at **medium confidence**, operating over bounded windows each mapped to global Manuscript Block identities. Rejected Slate for IME fragility, CodeMirror 6 as a code-oriented engine, and a custom editor as the predecessor's rejected 26,484-line renderer; recorded Lexical as the credible alternative. Flagged that this is the one Question 34 choice warranting a spike before it is treated as settled.
- Downgraded the Electron/native ABI risk from High to Medium after finding the selected core packages are pure JavaScript and the native modules live in the sandbox and shell packages Question 30 already excludes — the package-subset decision defused most of it as a side effect. Added a Critical risk for manuscript scale.
- Refined the scale requirement on owner clarification: windowed display is **accepted rather than merely tolerated**, since an editor reads only part of a manuscript at a time and rendering everything at once is not a requirement. The binding performance constraint is therefore whole-manuscript **index time** — find, replace, and jump — which moves the principal risk from the renderer to the store and its indexes, and correspondingly reduces how much the ProseMirror confidence gap matters. Specified three disk-backed incrementally maintained indexes: block, CJK-aware substring full-text, and outline. Noted that a word tokenizer built for space-delimited languages will not serve Chinese.
- Added `kick-in/33-standalone-shell-and-editor-topology.md`, `docs/adr/0024-electron-shell-with-isolated-ai7-service.md`, and `docs/adr/0025-windowed-editing-over-a-paging-manuscript-store.md`; updated `AGENTS.md`, the risk register, decision map, Standalone Editing Sufficiency Gate criteria, and both indexes. The last implementation blocker is cleared.

- Completed Question 35/36, the final interview question. Accepted a two-step approach that separates technical-feasibility risk from architectural-integration risk: a throwaway, time-boxed store-and-index spike runs first, followed by a permanent read-only tracer slice.
- Retargeted the spike after the index-time refinement. Its subject is the paging store and its indexes rather than the editor, since the editor only ever holds a bounded window. It measures cold open, find, jump, replace, keystroke latency, retrieval index build and re-index cost, and peak memory across generated 500K, 1M, and 10M-character Chinese corpora. Corpora must be generated rather than real sample Books, which ADR 0016 forbids in fixtures.
- Accepted the tracer slice: open one Book, import one DOCX, view it in the real windowed editor, ask one source-grounded question, and receive an answer whose citation resolves to an exact highlighted Manuscript Block range. Read-only throughout. The editor surface earns its place by proving the editor-to-service seam and by making provenance visible rather than merely recorded.
- Accepted a thirteen-point exit gate: the eight original migration criteria plus headless replay inside the ten-minute `pr` gate, exact block-range citation highlighting, in-folder data-root creation with sync detection and no credentials, request-fingerprint fail-closed, and portable extract/run/remove with no residue. The additions make the tracer a test of the accepted decisions rather than only of code.
- Accepted manuscript retrieval as a required capability, extending the Source Search to Exact Fetch to Synthesis pipeline from imported sources to manuscripts. Retrieval returns candidates and never truth; only Exact Fetch against the pinned revision yields authoritative text.
- Recorded the genuinely new problem that manuscript retrieval faces and source retrieval does not: manuscripts mutate, so a retrieval index over changing text feeds superseded content silently, since a stale hit is indistinguishable from a fresh one. Accepted block-level incremental re-indexing with revision stamps so staleness becomes detectable. The Manuscript Block is now the unit for three separate jobs — editor windowing, lexical indexing, and retrieval invalidation.
- Deferred retrieval strategy between lexical, vector, and hybrid to the spike, recording that a well-built lexical index performs better for Chinese than commonly assumed and costs no model call, while vector retrieval at the 10M tier means embedding fifty to a hundred thousand blocks with real build time and, if remote, real cost per block.
- Added `kick-in/34-first-tracer-slice.md` and `docs/adr/0026-manuscript-retrieval-returns-candidates.md`; promoted Manuscript Retrieval Chunk into the Editorial context with its Chinese label and collision entry; updated `AGENTS.md`, the migration workflow Phase 2, the source-grounding boundary, the risk register, decision map, and both indexes.

- Completed Question 26/36, the last open decision-map row. Packaging revised on owner instruction from portable-only to **two channels**: a zip portable folder and an NSIS installer, produced by one electron-builder configuration from one source. Recorded the trap that the electron-builder target named `portable` is a self-extracting executable rather than a plain folder, so the zip and `nsis` targets are the correct pair. Code signing is deferred until the owner explicitly requests it, with unsigned builds recorded as a known SmartScreen adoption cost rather than a cosmetic gap.
- Noted that the two-channel revision promotes the accepted unwritable-location fallback from edge case to the installer channel normal path, since an application installed under Program Files cannot host a writable data root. The rule is unchanged; only its frequency is. Question 24 release proof now covers both channels.
- Wrote `docs/agents/git-conventions.md` as a binding rule set for every agent: branch names, Conventional Commits with why-not-what bodies, one issue per branch per pull request, nothing pushed to `main` directly so the gate always runs, squash merge so history reads as finished outcomes, Commander-only merges and tags, and `vX.Y.Z` tags matching the release trigger. Confirmed the residual matrix rows as governed or deferred rather than reopened.
- **Corrected the manuscript-retrieval model.** An earlier version unified the editor window, the lexical index, and the retrieval chunk onto the Manuscript Block and treated that as evidence the block was the right primitive. The owner clarified that chunks, rankings, and embeddings exist for models and agents while the editor reads ordinary text, and that shared boundaries are a convenience to exploit rather than a constraint to design toward. That over-unification is replaced by **one authority and many projections**.
- Recorded the corrected contract: the Manuscript Revision is the sole authority; the display window, lexical index, outline, and retrieval chunks with their embeddings are disposable projections rebuildable from it alone. Consistency across forms is the requirement, expressed as four obligations. Every projection records its derivation revision, rebuilds from the authority alone, invalidates by text-range overlap rather than structural identity so unrelated boundaries still invalidate correctly, and never serves a stale entry as current, with deletions tombstoned so absence fails differently from staleness. Re-derivation is cadenced at Manuscript Checkpoints, reusing the journal-versus-checkpoint separation from ADR 0006 to give staleness a bounded, explainable window.
- Stated two consequences outright rather than leaving them implicit: a stale projection produces a **stale ranking** rather than merely stale text, so the remedy is re-derivation and re-ranking rather than substituting fresh text into a wrong ranking; and because a Run pins a revision while editing continues, candidates and authoritative text may come from different moments, which is acceptable only because retrieval yields candidates rather than truth.
- Rewrote `docs/adr/0023-portable-release-with-self-contained-data-root.md` and `docs/adr/0026-manuscript-retrieval-returns-candidates.md`; added `docs/agents/git-conventions.md`; updated `AGENTS.md`, the runtime and channel document, the tracer-slice document, the verification contract, the risk register, and the decision map.
- **The design interview is complete.** All thirty-six questions are resolved or explicitly deferred.

## What's next

- Run the Phase 0 exit review: confirm every decision-map row is resolved or explicitly deferred, then decompose the accepted design into independently grabbable vertical issues.
- Resolve two carried items that are not interview questions: whether the Question 16 answer of "mostly okay" endorsed the four content/evidence classes the owner did not correct, and verification of Windows sandbox enforcement before the Agent Data Root boundary is described as enforced rather than intended.
- Verify the Windows sandbox enforcement strength before describing the Agent Data Root boundary as enforced rather than intended.
- Question 26 is deferred until after Question 34 by owner instruction, because what remains of it is largely a packaging, installer, signing, and release-evidence question that depends on the Standalone shell and process topology Question 34 decides.
- Confirm whether the Question 16 answer of "mostly okay" endorsed the four content/evidence classes other than the one the owner corrected; that scope was never itemized.
- Keep Word vocabulary and implementation outside the active V1 domain; reconsider it only through a later proportional-remedy ADR after failure of the Standalone Editing Sufficiency Gate.
- After the interview, promote only accepted hard-to-reverse choices into concise decision records and finalize the migration handoff.

## Key decisions made

- This phase produces design and migration documents only; it will not implement the new AI7 runtime.
- Remote source repositories will be inspected read-only and will not be copied into the new project as implementation code.
- Use a fresh AI7 product repository as the planning default, with both source revisions recorded explicitly; do not merge the private AI7 history or vendor the Harness monorepo before visibility, licensing, and dependency strategy are decided.
- Treat DeepSeek Harness as the candidate single agent execution/control plane; preserve AI7's manuscript, publication, Task Ledger, safety, Effect, and surface-neutral editorial semantics above it rather than keeping a competing agent scheduler.
- The current architecture, legacy dispositions, and phase order are explicitly proposals; none become accepted until the user resolves the relevant numbered question.
- Delay the canonical glossary/context layout and engineering-skill configuration until the setup questions choose the issue tracker, labels, and domain-doc structure.
- GitHub Issues will be the canonical work-item tracker once the new repository is initialized.
- Pull requests will remain implementation/review artifacts and will not be pulled into the incoming-request triage queue during this stage.
- Use the five standard triage-role label strings without repository-specific aliases.
- Use active AI7 Editorial and AI7 Execution contexts plus an intentionally empty Deferred Word Integration placeholder. Maintain root `GLOSSARY.md` as a reference index and collision guide while keeping actual definitions canonical in per-context `CONTEXT.md` files.
- The interview estimate increased from 17 to 18 to include the setup draft confirmation required before canonical configuration files are written.
- The approved multi-context setup is now canonical. Context files intentionally contain no inherited legacy terms until the new source-document inheritance step classifies them.
- The user added a source-document inheritance checkpoint. The interview estimate increased from 18 to 19, with Question 6 reserved for confirming the preserve/modify/relocate/archive matrix.
- The audit recommendation is selective semantic inheritance: preserve AI7 product/safety guarantees, adapt execution terminology after Harness mapping, retain Harness extension contracts, and archive source-specific implementation/status/governance detail.
- The user will decide only original-AI7 documentation inheritance rows; DeepSeek Harness document details are delegated to the architecture maintainer.
- Preserve a tiered GitHub Actions verification workflow combined with deterministic generated mock-LLM-provider cases. Rebaseline exact workflows, tiers, and commands; required CI remains provider-free.
- Preserve local multi-agent dispatch as repository-development infrastructure only. It must not ship as product runtime behavior or be conflated with Harness product subagents.
- Preserve the rewritten concise `AGENTS.md` approach and the literal one-line `CLAUDE.md` wrapper; do not copy the legacy instruction file wholesale.
- AI7 remains a Windows-focused desktop app. The old UI implementation, component hierarchy, and layout are dropped; its user stories and outcomes are revised only when accepted individually.
- AI7 is Chinese-first, and its primary modeled operator works in a leading literary publishing house in mainland China.
- Replace “confidential manuscript” as the blanket product label with Unpublished Editorial Material. Prevent unauthorized public release, while avoiding an unnecessarily classified/high-secrecy security model.
- Editorial Deliverables include manuscript content and related promotional articles, news reports, and reviews; manuscript editing is central but not the complete output boundary.
- Multi-aspect editorial judgment uses the accepted eight-dimension baseline, but it is not a closed taxonomy; production users can add Editorial Dimensions.
- Editorial Profiles hold reusable defaults; Books own explicit selections and overrides; tasks snapshot the effective configuration at start. Later changes are prospective, and referenced dimensions are archived rather than deleted.
- Book remains the direct text/source/mutation authority for ordinary manuscript tasks; explicit Cross-project tasks select their Books.
- AI7 must also adapt delivery quality from patterns and feedback across the Working Corpus. This learning scope is distinct from direct task source scope; the exact memory representation and update controls remain open.
- For unrelated Books, corpus adaptation uses derived, inspectable House Editorial Memory rather than ambient raw-text sharing or hidden model-weight training.
- Series is a first-class exception for strongly related works. Membership is explicit/versioned; Series Knowledge is shared automatically; Series-scoped tasks may retrieve exact passages across current non-excluded member sources; mutations remain Book/revision-targeted.
- Original AI7 did not currently implement the adaptive loop it described: feedback capture and memory governance existed, but candidate generation and approved-memory prompt consumption did not.
- Explicit user memory instructions activate at their selected scope. Other feedback is evidence; inferred patterns remain candidates, and cross-Book activation requires approval.
- Every learned result needs end-to-end Learning Lineage. Users can mark Learning Material included/excluded, and those decisions train a separate, explainable Learning Eligibility Policy for future materials.
- Learning Eligibility Policy begins recommendation-only and may later act automatically only for high-confidence matches within user-approved material-type and scope boundaries. The user can override, roll back, return to recommendation-only, or disable automation.
- Product authority rules are versioned, human-reviewable, machine-validatable Policy Documents. After production runs, AI agents may review evidence and edit new Proposed Policy Revisions; historical versions are immutable.
- A post-run agent-authored policy revision may auto-activate only when it calibrates an existing rule non-expansively inside a user-approved parameter envelope, passes replay/semantic evaluation gates, logs and notifies, and offers immediate rollback. Semantic, safeguard, or authority changes require explicit user activation.
- Detailed feedback interaction design is deferred to an independent UI/UX agent session. The current architecture records required state distinctions and outcomes without prescribing legacy or new layout.
- Excluding material disables unsupported future memory use, recalculates partially supported memory, pauses affected running tasks, and marks completed history without rewriting it.
- AI7's learning never means LLM training. Durable professional adaptation remains outside model weights and portable across replaceable Foundation Models.
- DeepSeek Harness is adopted primarily to improve LLM-agent behavior through versioned, reconstructable, evaluation-driven composition of context, prompts, tools, policies, plans, workflows, subagents, sessions, and extension hooks. This behavior-improvement loop is separate from editorial-memory learning and from LLM weight training.
- The accepted purpose does not yet settle “full Harness capability,” dynamic/self-modification authority, profile exposure, or upstream consumption; exact Task/Session record authority and mapping were settled early by Question 22.
- A manuscript/source revision is authoritative for its exact wording and location, not for the factual or semantic truth of the assertions it contains. Reference Integrity, Claim Support, and Factual Verification are separate statuses; passing one does not imply the others.
- Factual or semantic concerns remain evidence-linked findings, and fixes remain exact-revision proposals or editor/author queries until the applicable mutation decision is made.
- Factual authority follows a versioned, task-snapshotted Factual Verification Policy Document. Its default evidence preference is configurable by claim domain; Foundation Model knowledge is a research lead rather than evidence, and unresolved or conflicting admissible evidence must remain visible.
- Manuscript history is AI7-owned and manuscript-native: stable blocks, immutable revisions, text-only branches, durable journals, meaningful checkpoints, proposal branches, conservative explicit conflict resolution, and verified independent recovery. Harness receives narrow capabilities and never owns or aliases these records.
- Never use generic Approval as a domain authority. Proposal and review judgments, task/run authority, one-shot agent execution, exact governed Effects, and public release remain distinct even when one interaction creates multiple records.
- Only an exact Effect Receipt or visibly classified reconciliation/manual evidence establishes Effect outcome; attempted calls, tool results, Session events, and proposal-persistence receipts cannot prove manuscript publication.
- English terms remain stable architecture identifiers, while every accepted glossary term has one preferred Simplified Chinese product label in the bilingual root glossary.
- Book remains the source/privacy/mutation authority, but each related Editorial Deliverable owns independent workflow state pinned to a versioned Workflow Profile. Workflow completion or signoff never grants factual truth, legal authority, Public Release Permission, or Learning Eligibility.
- Run Authorization binds an exact Task Intent and Plan Envelope digest. Logged Plan Adaptations may proceed only inside the unchanged envelope; material drift requires a Plan Revision and renewed authorization, while Effects and editorial decisions retain separate named authority.
- Task Skill packages, Capability Implementations, Harness instructional/tool projections, and per-Run Task Skill Activation remain separate. Enablement sets only an Authority Ceiling; exact Capability Grants are intersected and enforced at both tool and AI7 service boundaries.
- Task Skills declare Model Roles rather than providers or credentials. Provider processing, external export, and public release are separate policies, and source readability never implies outbound-data authority.
- The Task Ledger owns AI7 task-business facts while the Harness Session Ledger owns model/executor events. Exact Execution Bindings correlate them; no active Operation ledger or copied transcript is permitted.
- Legacy production data is not migrated. Only protected user-selected API credential transfer, reviewed mock-provider evidence, and explicitly selected test-only sample Books may cross the allowlist; all new business, Harness, manuscript, workflow, and learning records start fresh.
- V1 is a Chinese-first Windows Standalone desktop product. Word integration is excluded from V1, both old UI/editor implementations are dropped, and professional long-form editing must pass an evidence-backed Standalone Editing Sufficiency Gate; Word is only a future contingency requiring a separate ADR.
- Windows is the only target platform. Ubuntu has no production or product role; it may appear only as a GitHub Actions runner if a Ubuntu CI lane is separately justified. Tiered verification, build, and test must be concise and quick.
- Verification is two Windows-only GitHub Actions workflows, `pr` and `release`. Everything cut from the original four-tier proposal is deferred behind a named trigger, not rejected, so the reduction can be revisited on evidence rather than reopened from scratch.
- Editor decisions are the oracle for taste, style, and editorial judgment, and never for factual correctness. Quality measurement and Factual Verification are separate systems, because collapsing them would let an approving editor silently certify a false claim.
- Privacy for this product is an egress boundary, not an identity boundary. Local access by authorized personnel is unrestricted; what is controlled is every automated path that could carry a manuscript off the machine, with a configured model call the one permitted exception.
- AI7 must operate at zero data. Cold start is a required tolerance rather than a degraded mode, so evidence thresholds may gate auto-activation but never operation.
- Long Chinese manuscripts are a required feature, not a stretch goal. The scale tiers force the architecture: the renderer never holds a whole manuscript, and the largest tier is met by the paging store and windowing rather than by the editor library.
- One authority, many projections. Chunks and embeddings serve models; the editor reads ordinary text. Projections may use boundaries suited to their consumer, and the requirement is consistency across forms rather than a shared primitive.
- Retrieval over manuscripts returns candidates, never truth, and must be revision-aware because manuscripts mutate while sources do not. A stale retrieval hit is indistinguishable from a fresh one unless entries carry the revision they were built from.
- Windowed display is accepted, so the scale requirement lands on index time rather than render time. Find, replace, and jump must stay reasonable at every tier; typing latency depends on window size and never on manuscript size.
- AI7 is TypeScript and Node throughout; no interpreter ships. A named capability gap enters as a bounded native module or sidecar under its own ADR, never as a general-purpose embedded runtime.
- AI7 ships portable and self-contained: data inside the folder, secrets outside it. A portable folder is designed to be copied, so anything that must not travel with it stays out.
- AI7 learns the Harness framework rather than cloning it. Harness is built for agentic coding; AI7 serves Chinese literary publishing. Adopting a framework is not adopting its defaults — every preset, prompt, persona, and tool reaching an editorial Run must be justified for publishing work rather than inherited because it shipped.
- "No second agent loop" constrains implementations, not instances. Parallel Runs across Books and background work are required behavior; many instances of one loop are not a second loop.
- AI7 takes part of Harness, not all of it, and pins exact versions rather than ranges. Not depending on a package is a stronger guarantee than not wiring it: absence from the dependency graph cannot be undone by a later composition edit, while absence from the wiring can.
- The audited Harness revision and the installable Harness artifact are different things. `0.1.0-rc.5` was audited but never published; `0.1.0-rc.6` is consumed. Design documents must never imply a single artifact.
- AI7 composes the full Harness engine behind a narrow tool surface. The engine and the tool surface are separable, so "full capability" and least privilege are not in conflict. Capability decisions belong to AI7's composition, never to a runtime prompt that asks a non-expert user to authorize something they cannot evaluate.
- Everything is agent-proposable, including plugins and tools; what is fixed is that capability expansion never self-activates. A prompt may shape quality but may never grant authority — if changing text could widen what the system may do, it is a Policy Document.
- Repository development dispatch separates provider-neutral operating rules from a single provider-specific binding table. Roles, authority, dispatch limits, the reviewer tier floor, and the exclusion list never depend on which model is running; only the binding row changes. Development-agent routing is repository tooling and must never share vocabulary, configuration, or code paths with product Model Roles and Provider Resolution Plans.
- Verification machinery is added when a concrete problem appears, not in advance. The original AI7 justified a machine-owned test catalog at roughly 360 tests; this repository starts at zero, and premature machinery is itself a cost.
- The design room is a Git repository published as private `zhouy1017/ai7-harness` on branch `main`. Question 27 is now fully closed: AI7 is proprietary with all rights reserved to the sole rights-holder, and predecessor asset reuse is authorized, so source copying is no longer blocked on authority.
- Rights in sample manuscripts are separate from rights in code, and a permission granted for one asset class must not be read across to another. For manuscripts the boundary runs between processing and persistence: model processing is permitted as ordinary product function, while repository storage is prohibited outright and publication is gated on Public Release Permission.
- Repository initialization deliberately ran one Phase 1 step during Phase 0. Phase 0 remains active and its exit gate is unmet.
- A decision is recorded as accepted only when the owner explicitly accepted it. Absence of objection to a reported audit finding does not make that finding project truth; `kick-in/02-target-architecture.md` now separates its accepted parts from its proposals on that basis.

## Resume Prompt

Resume with the Phase 0 exit review: confirm every decision-map row is resolved or explicitly deferred, then decompose the accepted design into independently grabbable vertical issues.

## UI/UX V2 design session checkpoint — 2026-08-24

### What's done

- Read the required `grill-with-docs`, `grilling`, and `domain-modeling` skills plus `CONTEXT-FORMAT.md` and `ADR-FORMAT.md`.
- Read the worktree authorities and routers: `AGENTS.md`, `HANDOFF.md`, `kick-in/README.md`, `PROGRESS.md`, and `CONTEXT-MAP.md`.
- Read the requested V2 architecture inputs from exact Git object `247b7dacb267ba2f4076ca8461c95e5f0508b343`, including the architecture, Harness integration, migration, assumptions, decision queue, candidate execution context/glossary, both candidate ADRs, and A1 product-consistency record.
- Read the V1 freeze handoff, package map, requirements, and information architecture from exact Git object `587d6455f6a578d3df8a39f534ec7a057c07a18c`; retained only semantic requirements, state distinctions, journey hypotheses, and constraints, not its screen geometry or implementation artifacts.

### What's next

- Publish the V2 UI/UX decision tree and estimated interview count, then ask only Question 1 about the product workspace's primary organizing object.
- After the first owner decision, create the candidate `docs/ui-ux-v2/` context/glossary and decision documents lazily, then update this checkpoint again.

### Key decisions made

- No new UI/UX decision has yet been accepted; no `docs/ui-ux-v2/` files or ADRs have been created.
- V2 architecture inputs are candidate architecture authority for this session; the V1 freeze is reference-only and cannot establish V2 layout, component, Figma, prototype, or Windows-mechanism choices.
- The interview will begin with the workspace's organizing relationship because it constrains navigation and the relative prominence of Book, Deliverable, Manuscript, Workflow, Task, Evidence, and Proposal.

### Resume Prompt

Resume the UI/UX V2 `grill-with-docs` session by presenting the complete decision tree and asking only Question 1 about the primary workspace organizing model, with a recommendation.

## UI/UX V2 decision checkpoint — Codex-referential direction

### What's done

- Recorded the owner's first accepted UI/UX direction in `docs/ui-ux-v2/README.md`: AI7's overall visual presentation and interaction manner should feel similar to the supplied Codex Desktop screenshot.
- Created `docs/ui-ux-v2/CONTEXT.md` and `docs/ui-ux-v2/GLOSSARY.md` with the candidate terms `AI7 Desktop Interaction Language` and `Interaction Reference Evidence`.
- Created `docs/ui-ux-v2/visual-direction.md` to separate retained experience qualities, mandatory AI7 reinterpretations, and prohibited copying.

### What's next

- Resolve Question 1: which AI7 object relationship replaces Codex's task/thread hierarchy as the shell's organizing model.
- Continue the one-question-at-a-time interview; create information-architecture material only after that organizing decision is accepted.

### Key decisions made

- Codex Desktop is the intended overall visual-and-interaction reference, but not a source, asset, brand, exact layout, component tree, or product-object baseline.
- AI7 will retain calm light surfaces, restrained chrome, progressive disclosure, focused central work, contextual side surfaces, compact task entry, and visible interruptible activity while replacing every coding/chat object with AI7 editorial objects and named authorities.
- No ADR was created because visual direction is materially changeable and therefore does not satisfy all three ADR criteria.
- The estimated interview total remains 58: this owner direction resolves the already planned general visual-direction question early rather than adding a new branch.

### Resume Prompt

Resume at Question 1/58 by asking which AI7 object relationship should occupy the Codex-like shell, recommending Book-anchored navigation with Deliverable-specific work surfaces and a secondary global attention view.

## UI/UX V2 decision checkpoint — Question 1/58

### What's done

- Accepted Question 1 and recorded D-002 in `docs/ui-ux-v2/README.md`: Book is the stable anchor, the manuscript or Editorial Deliverable is the Active Work Object, and Task is a contextual activity layer.
- Added `Book-anchored Workbench`, `Active Work Object`, `Task Context Layer`, and `Global Attention View` to `docs/ui-ux-v2/CONTEXT.md` and `docs/ui-ux-v2/GLOSSARY.md`.
- Added the first accepted V2 requirements in `docs/ui-ux-v2/requirements.md` and created `docs/ui-ux-v2/information-architecture.md` with the accepted relationship map and authority constraints.
- Updated `docs/ui-ux-v2/visual-direction.md` so the Codex-referential shell now maps its task/thread presentation to Book navigation and a non-authoritative Global Attention View.

### What's next

- Ask Question 2/58 about startup and return behavior: recoverable state, last active Book/work object, Global Attention View, or Book creation/import.
- Continue to defer exact navigation taxonomy, proportions, tokens, and component specifications until their numbered decisions.

### Key decisions made

- Tasks are not peer conversations beside Books and never replace Book or deliverable authority.
- Cross-Book attention is supported through a projection that always returns to the authoritative Book and record.
- No ADR was created because Book anchoring follows the already accepted domain authority and would not surprise a future reader without additional rationale.

### Resume Prompt

Resume the UI/UX V2 interview at Question 2/58 by deciding the default landing and recovery priority, with a recommendation that recovery and exact continuation outrank a generic dashboard.

## UI/UX V2 decision checkpoint — Question 2/58

### What's done

- Accepted Question 2 and recorded D-003 in `docs/ui-ux-v2/README.md`: recovery requiring confirmation has first launch priority; otherwise AI7 precisely resumes the last Book, Active Work Object, and manuscript position; Global Attention does not steal focus.
- Added `Continuity-first Return` and `Recovery Attention State` to `docs/ui-ux-v2/CONTEXT.md` and `docs/ui-ux-v2/GLOSSARY.md`.
- Added startup/return requirements to `docs/ui-ux-v2/requirements.md`, updated `docs/ui-ux-v2/information-architecture.md`, and created the first state table in `docs/ui-ux-v2/interaction-spec.md`.

### What's next

- Ask Question 3/58 about the persistent global-navigation shape and Book-switching model.
- Leave Book-internal object prominence and the detailed Global Attention taxonomy to Questions 4 and 5.

### Key decisions made

- AI7 is continuity-first rather than dashboard-first.
- Recovery attention is not automatic restoration and does not collapse recovered working state, Manuscript Checkpoint, and Recovery Snapshot.
- Background work remains durable and visible without taking focus or becoming the default launch destination.
- No ADR was created because this interaction directly projects already accepted recovery, persistence, and offline requirements.

### Resume Prompt

Resume at Question 3/58 by deciding the persistent navigation shape, recommending a two-level Codex-like sidebar with stable global destinations above a current-Book section and compact pinned/recent Book switching.

## UI/UX V2 decision checkpoint — Question 3/58

### What's done

- Accepted Question 3 and recorded D-004 in `docs/ui-ux-v2/README.md`: one collapsible sidebar combines stable global destinations with pinned/recent Books and current-Book navigation.
- Added `Two-level Contextual Sidebar` and `Book Convenience View` to `docs/ui-ux-v2/CONTEXT.md` and `docs/ui-ux-v2/GLOSSARY.md`.
- Updated `docs/ui-ux-v2/requirements.md`, `docs/ui-ux-v2/information-architecture.md`, and `docs/ui-ux-v2/interaction-spec.md` with the accepted global destinations, Book switching, collapsed state, and non-authority rules.

### What's next

- Ask Question 4/58 about the Book overview and the visible priority among Manuscript, Editorial Deliverables, Workflow, Tasks, Evidence, and Proposals.
- Keep the Global Attention categories and ordering for Question 5.

### Key decisions made

- The stable global destinations are `待我处理`, `书库`, `书系`, and `质量与学习`; Settings belongs in the bottom application/account area.
- The full Book collection is searchable through the library; only pinned/recent Books remain directly in the sidebar.
- A Book Convenience View changes no source, learning, Series, privacy, or mutation authority.
- No ADR was created because the navigation shape is reversible and carries no hidden architectural trade-off.

### Resume Prompt

Resume at Question 4/58 by deciding the Book overview's object hierarchy, recommending the Manuscript as the visual anchor, independent Deliverables as sibling work cards, and Workflow/Tasks/Evidence/Proposals as contextual lenses rather than peer products.

## UI/UX V2 decision checkpoint — Question 4/58

### What's done

- Accepted Question 4 and recorded D-005 in `docs/ui-ux-v2/README.md`: the Manuscript is the Book's visual anchor; related Editorial Deliverables remain independent secondary work cards; Workflow, Tasks, Evidence, Proposals, sources, Series, and recovery are contextual entry points.
- Added `Book Work Overview`, `Manuscript Visual Anchor`, and `Contextual Work Lens` to `docs/ui-ux-v2/CONTEXT.md` and `docs/ui-ux-v2/GLOSSARY.md`.
- Updated `docs/ui-ux-v2/requirements.md`, `docs/ui-ux-v2/information-architecture.md`, and `docs/ui-ux-v2/interaction-spec.md` with Book-level hierarchy and navigation guardrails.

### What's next

- Ask Question 5/58 about which states enter Global Attention, how they are grouped, and what contributes to its badge.
- Begin the long-manuscript editing branch at Question 6 after the workspace branch closes.

### Key decisions made

- The Manuscript and other Editorial Deliverables remain independent in authority even though the Manuscript receives stronger visual emphasis.
- Every Editorial Deliverable shows its own Workflow Instance state and next action; there is no Book-wide progress percentage.
- Contextual summaries navigate to authoritative records and never count as decisions, Effects, or receipts.
- No ADR was created because the visual hierarchy follows the accepted product center and is reversible.

### Resume Prompt

Resume at Question 5/58 by deciding Global Attention grouping and badge semantics, recommending action-first groups with exact named decision types, exceptions before routine progress, and a badge that counts only items requiring editor action.

## UI/UX V2 decision checkpoint — Question 5/58

### What's done

- Accepted Question 5 and recorded D-006 in `docs/ui-ux-v2/README.md`: Global Attention is action-first, exceptions lead, named decisions remain distinct, and the badge counts only unresolved items requiring editor action.
- Added `Actionable Attention Count` and `Attention Projection Item` to `docs/ui-ux-v2/CONTEXT.md` and `docs/ui-ux-v2/GLOSSARY.md`.
- Updated `docs/ui-ux-v2/requirements.md`, `docs/ui-ux-v2/information-architecture.md`, and `docs/ui-ux-v2/interaction-spec.md` with the four groups, included states, badge rules, ordering, and non-authority behavior.

### What's next

- Begin the long-manuscript editing branch with Question 6/58: decide how the manuscript, contextual AI work, comparison workspaces, and focus mode share the shell.
- Keep windowing disclosure, outline/global position, search/replace/jump, selection anchoring, editing marks, persistence feedback, and import fidelity for Questions 7–13.

### Key decisions made

- Global Attention orders `异常与结果待确认`, `等待你的决定`, `运行中与已暂停`, then `最近完成`.
- The Actionable Attention Count excludes running, paused, and completed work.
- Named authority records never collapse into generic approval, and projection interactions mutate no underlying record.
- No ADR was created because this is a reversible information-presentation choice that preserves already accepted authority boundaries.

### Resume Prompt

Resume at Question 6/58 by deciding the manuscript work-surface modes, recommending a manuscript-dominant default, contextual right-side collaboration, temporary full comparison workspaces, and a true focus mode.

## UI/UX V2 decision checkpoint — Question 6/58

### What's done

- Accepted Question 6 and recorded D-007 in `docs/ui-ux-v2/README.md`: Manuscript Editing, Contextual Collaboration, Dedicated Work Workspace, and Editorial Focus are four explicit presentation modes.
- Added the four mode terms to `docs/ui-ux-v2/CONTEXT.md` and `docs/ui-ux-v2/GLOSSARY.md`.
- Updated `docs/ui-ux-v2/requirements.md`, `docs/ui-ux-v2/information-architecture.md`, `docs/ui-ux-v2/interaction-spec.md`, and `docs/ui-ux-v2/visual-direction.md` with mode layout, transitions, focus preservation, and non-authority invariants.

### What's next

- Ask Question 7/58 about the user-facing mental model for bounded manuscript windows and whole-manuscript position.
- Defer exact outline behavior, search/replace/jump, and selection anchoring to Questions 8–11.

### Key decisions made

- The Manuscript is the normal central surface; contextual AI work appears alongside it rather than replacing it.
- Full-center replacement is reserved for comparison, factual/multi-evidence review, and conflict resolution and always retains exact context and a direct return path.
- Focus mode reduces presentation only; it does not pause Runs or hide persistence/recovery failures.
- Run events never switch presentation modes automatically.
- No ADR was created because these presentation modes are reversible UI organization built directly on accepted product boundaries.

### Resume Prompt

Resume at Question 7/58 by deciding how bounded manuscript windows appear to editors, recommending seamless local continuity plus a separate whole-manuscript position system rather than a misleading single scrollbar.

## UI/UX V2 decision checkpoint — Question 7/58

### What's done

- Accepted Question 7 and recorded D-008 in `docs/ui-ux-v2/README.md`: editors perceive one continuous Manuscript, while local reading scroll and Whole-manuscript Position are separate navigation scales.
- Added `Continuous Manuscript Experience`, `Dual-scale Manuscript Navigation`, and `Whole-manuscript Position` to `docs/ui-ux-v2/CONTEXT.md` and `docs/ui-ux-v2/GLOSSARY.md`.
- Updated `docs/ui-ux-v2/requirements.md`, `docs/ui-ux-v2/information-architecture.md`, and `docs/ui-ux-v2/interaction-spec.md` with boundary-crossing, distant-jump, position-disclosure, index-updating, cursor/selection, and Chinese IME invariants.

### What's next

- Ask Question 8/58 about the outline and whole-manuscript position surface, including whether structural changes are available directly from the outline.
- Defer full-text search/replace/jump details to Questions 9 and 10 and exact selection anchoring to Question 11.

### Key decisions made

- Windowing is hidden as an implementation mechanism but not misrepresented as whole-manuscript residency.
- Local reading scroll and indexed whole-manuscript navigation use distinct affordances and accessible meanings.
- Crossing window boundaries preserves cursor, selection, visual anchor, and Chinese IME composition.
- Local editing remains available while a whole-manuscript index is updating.
- No ADR was created because this interaction directly expresses the accepted bounded-renderer architecture and remains adjustable at the presentation level.

### Resume Prompt

Resume at Question 8/58 by deciding the outline's role, recommending a virtualized hierarchical navigator with a global position rail and an explicit structure-editing mode rather than accidental drag-to-reorder in normal navigation.

## UI/UX V2 decision checkpoint — Question 8/58

### What's done

- Accepted Question 8 and recorded D-009 in `docs/ui-ux-v2/README.md`: the outline is navigation-first, structural mutation requires explicit Structure Adjustment Mode, and a Whole-manuscript Position Rail provides sparse global markers.
- Incorporated the owner's addition that the right contextual navigation must contain a persistent `搜索与跳转` entry alongside `大纲`.
- Added `Manuscript Outline Navigator`, `Whole-manuscript Position Rail`, `Structure Adjustment Mode`, and `Search and Jump Entry` to `docs/ui-ux-v2/CONTEXT.md` and `docs/ui-ux-v2/GLOSSARY.md`.
- Updated `docs/ui-ux-v2/requirements.md`, `docs/ui-ux-v2/information-architecture.md`, `docs/ui-ux-v2/interaction-spec.md`, and `docs/ui-ux-v2/visual-direction.md` with outline navigation, structural-edit safeguards, marker behavior, projection freshness, and the right-side search entry.

### What's next

- Ask Question 9/58 about the `搜索与跳转` panel's modes, manuscript-only scope, result grouping, and live-update behavior.
- Keep replacement execution and safety for Question 10 and exact selection anchoring for Question 11.

### Key decisions made

- The normal outline cannot mutate manuscript structure through incidental drag gestures.
- Editor-authored structural work is explicit and undoable; model-authored structural work remains Proposal-first.
- Right-side navigation always offers both `大纲` and `搜索与跳转`, with one supporting panel expanded at a time.
- The total estimate remains 58 because the owner's added placement decision resolves part of the already planned search branch rather than adding a new branch.
- No ADR was created because these editor controls are reversible UI choices within the accepted manuscript authority model.

### Resume Prompt

Resume at Question 9/58 by deciding the right-side `搜索与跳转` experience, recommending one manuscript-scoped panel with text, heading, and exact-position modes, revision-aware live results, and no source/global-search scope leakage.

## UI/UX V2 decision checkpoint — Question 9/58

### What's done

- Accepted Question 9 and recorded D-010 in `docs/ui-ux-v2/README.md`: the local right-side Search and Jump Panel has `文字`, `标题`, and `位置` modes and is strictly scoped to the current Manuscript and active revision context.
- Added `Manuscript Search and Jump Panel`, `Search Return Position`, and `Stale Search Result` to `docs/ui-ux-v2/CONTEXT.md` and `docs/ui-ux-v2/GLOSSARY.md`.
- Updated `docs/ui-ux-v2/requirements.md`, `docs/ui-ux-v2/information-architecture.md`, and `docs/ui-ux-v2/interaction-spec.md` with modes, scope narrowing, CJK/Latin behavior, result grouping, keyboard navigation, exact page-number limits, local/offline operation, and stale-result handling.

### What's next

- Ask Question 10/58 about replacement preview, match selection, atomic whole-manuscript commit, cancellation, durable undo, and revision drift.
- Keep exact user and Task selection anchoring for Question 11.

### Key decisions made

- Manuscript search never silently widens into source, Series, cross-Book, or local-instance search.
- Search and jump are provider-free local functions.
- Page-number location exists only for an identified paginated layout version; normal manuscript position is structural/proportional/revision-bound.
- Stale results never silently retarget similar current text.
- No ADR was created because the panel behavior is a reversible interaction design inside accepted indexing and revision constraints.

### Resume Prompt

Resume at Question 10/58 by deciding replace behavior, recommending immediate single replacement plus previewed selection/all replacement as one atomic service-side manuscript edit with cancellation before commit, exact revision binding, and one durable undo transaction.

## UI/UX V2 decision checkpoint — Question 10/58

### What's done

- Accepted Question 10 and recorded D-011 in `docs/ui-ux-v2/README.md`: single-hit replacement is an exact ordinary edit; selected/all replacement uses a reviewed Frozen Match Set and one atomic service-side commit.
- Added `Replacement Preview`, `Frozen Match Set`, and `Atomic Manuscript Replacement` to `docs/ui-ux-v2/CONTEXT.md` and `docs/ui-ux-v2/GLOSSARY.md`.
- Updated `docs/ui-ux-v2/requirements.md`, `docs/ui-ux-v2/information-architecture.md`, and `docs/ui-ux-v2/interaction-spec.md` with preview content, exclusion, exact revalidation, cancellation boundary, progress wording, drift handling, all-or-none commitment, journal acknowledgement, and durable undo.

### What's next

- Ask Question 11/58 about live selection versus explicit durable range anchoring for Tasks, comments, findings, Evidence Links, and Proposals.
- Leave editing annotations/proposal decoration, persistence status, and import fidelity for Questions 12 and 13, revising the original branch allocation if needed after the selection decision.

### Key decisions made

- Batch replacement targets a displayed Frozen Match Set and never reinterprets a live query at commit.
- Any affected-range drift or changed match-set meaning prevents all replacement; stale items are not silently skipped.
- Successful batch replacement is one durable undoable Edit Journal transaction, not a Manuscript Checkpoint.
- Cancellation is available before atomic commit; after commit, undo/history is the truthful reversal mechanism.
- No ADR was created because the design directly expresses the accepted atomicity, long-operation, revision, and journal requirements without introducing a surprising new authority boundary.

### Resume Prompt

Resume at Question 11/58 by deciding exact text selection anchoring, recommending an ephemeral live selection plus an explicit multi-range pinned context set bound to exact manuscript revision/ranges, with visible drift and no silent retargeting.

## UI/UX V2 decision checkpoint — Question 11/58

### What's done

- Accepted Question 11 and recorded D-012 in `docs/ui-ux-v2/README.md`: live selection is ephemeral; explicit anchoring creates exact Pinned Manuscript Ranges; multiple ranges form a visible context set; drift requires review rather than fuzzy retargeting.
- Added `Live Manuscript Selection`, `Pinned Manuscript Range`, `Manuscript Range Set`, and `Drifted Manuscript Range` to `docs/ui-ux-v2/CONTEXT.md` and `docs/ui-ux-v2/GLOSSARY.md`.
- Updated `docs/ui-ux-v2/requirements.md`, `docs/ui-ux-v2/information-architecture.md`, and `docs/ui-ux-v2/interaction-spec.md` with multi-window range collection, per-record context limits, exact re-resolution, drift actions, Exact Fetch, Unicode graphemes, and Chinese IME invariants.

### What's next

- Ask Question 12/58 about visible persistence states, Ctrl+S semantics, durable undo/redo, and explicit Manuscript Checkpoints.
- Ask Question 13/58 about import-fidelity review, completing the long-manuscript editor branch.

### Key decisions made

- A Task or record receives only explicitly attached ranges; one Manuscript Range Set does not silently become another record's scope.
- Unrelated edits may preserve an exactly re-resolvable range, while affected or structurally ambiguous ranges become visibly drifted.
- Preview excerpts are navigation aids; Exact Fetch against the bound revision remains textual authority.
- Selection uses Unicode grapheme boundaries and cannot interfere with active Chinese IME composition.
- No ADR was created because exact range identity and stale/ambiguous refusal are already required by the V2 architecture; this decision defines their user-facing expression.

### Resume Prompt

Resume at Question 12/58 by deciding save/checkpoint semantics, recommending continuous journal persistence, Ctrl+S as an immediate durability flush rather than checkpoint, explicit meaningful checkpoints, durable undo/redo, and exact non-generic status wording.

## UI/UX V2 decision checkpoint — Question 12/58

### What's done

- Accepted Question 12 and recorded D-013 in `docs/ui-ux-v2/README.md`: continuous Edit Journal persistence, `Ctrl+S` as immediate journal flush, separately named Manuscript Checkpoints, and durable restart-safe undo/redo.
- Added `Editing Persistence Status`, `Journal Save Action`, and `Checkpoint Suggestion` to `docs/ui-ux-v2/CONTEXT.md` and `docs/ui-ux-v2/GLOSSARY.md`.
- Updated `docs/ui-ux-v2/requirements.md`, `docs/ui-ux-v2/information-architecture.md`, and `docs/ui-ux-v2/interaction-spec.md` with exact status combinations, acknowledgement timing, checkpoint creation/suggestion, undo semantics, journal failure, high-risk blocking, and Recovery Snapshot separation.

### What's next

- Ask Question 13/58 about staged manuscript import and fidelity/degradation review, closing the long-manuscript editor branch.
- Begin Task Intent and authorization design at Question 14 after import is resolved.

### Key decisions made

- Journal durability and Manuscript Checkpoint creation are separate facts and commands.
- `Ctrl+S` never creates a checkpoint; a checkpoint may be suggested but remains an explicit meaningful action.
- Durable undo/redo survives restart and checkpoint creation and never rewrites immutable revisions.
- Persistence failure removes every saved implication and must be resolved before close or high-risk batch/apply work.
- No ADR was created because these UI semantics are direct projections of the already accepted journal/checkpoint/recovery separation.

### Resume Prompt

Resume at Question 13/58 by deciding import-fidelity review, recommending a local staged preflight, preserve/degrade/reject classification by content class, explicit degradation acceptance, atomic commit, and comparison-based reimport with no silent structural remapping.

## UI/UX V2 decision checkpoint — Question 13/58

### What's done

- Accepted Question 13 and recorded D-014 in `docs/ui-ux-v2/README.md`: local staged preflight, per-content-class fidelity review, explicit degradation acceptance, critical rejection blocking, atomic import, and comparison-based reimport.
- Added `Import Fidelity Review`, `Import Degradation Decision`, and `Reimport Comparison` to `docs/ui-ux-v2/CONTEXT.md` and `docs/ui-ux-v2/GLOSSARY.md`.
- Updated `docs/ui-ux-v2/requirements.md`, `docs/ui-ux-v2/information-architecture.md`, and `docs/ui-ux-v2/interaction-spec.md` with the eight content classes, classification semantics, disclosure/acceptance, source-only alternative, progress/cancellation, persisted records, and reimport ambiguity rules.

### What's next

- Begin Task capture and authorization with Question 14/58: decide how the bottom composer creates a durable Task Intent draft without sending a model call.
- Continue with Task Skill/free-language balance, source scope, Plan Preview, Run Authorization, and provider/budget disclosure through Question 19.

### Key decisions made

- Import fidelity review is local and occurs before any editable Manuscript state commits.
- Material degradation requires one exact, unselected, import-specific decision; a critical unsupported class blocks editable import.
- Source-only import, when eligible, is a separately named route and never masquerades as a complete editable Manuscript.
- Reimport compares and creates a descendant revision; it never overwrites or silently synchronizes the current Manuscript.
- No ADR was created because the decision is the UI expression of already accepted no-silent-loss, exact-identity, and atomic-import requirements.

### Resume Prompt

Resume at Question 14/58 by deciding Task Intent entry, recommending a context-bound bottom draft composer whose primary action prepares a durable Task Intent for preflight rather than sending a model call, with Book/revision/range chips that never silently rebind.

## UI/UX V2 decision checkpoint — Question 14/58

### What's done

- Accepted Question 14 and recorded D-015 in `docs/ui-ux-v2/README.md`: the compact bottom composer prepares a durable Task Intent Draft instead of sending a model message or creating a Run.
- Added `Context-bound Task Composer`, `Task Intent Draft`, and `Prepare Task Action` to `docs/ui-ux-v2/CONTEXT.md` and `docs/ui-ux-v2/GLOSSARY.md`.
- Updated `docs/ui-ux-v2/requirements.md`, `docs/ui-ux-v2/information-architecture.md`, `docs/ui-ux-v2/interaction-spec.md`, and `docs/ui-ux-v2/visual-direction.md` with entry sources, visible context chips, no implicit scope, draft persistence, Book-switch behavior, no-model semantics, round-arrow constraints, and Chinese IME safety.

### What's next

- Ask Question 15/58 about natural-language-first Task capture and how Task Skill suggestions/templates become explicit without turning the flow into a wizard or silent capability choice.
- Continue with Run Source Scope, Plan Preview, Run Authorization, and provider/budget disclosure in Questions 16–19.

### Key decisions made

- `准备任务` is not send, dispatch, Run Authorization, or Effect Approval.
- A Task Intent Draft is durable and restart-safe but creates no Run or model/provider activity.
- Draft context is explicit and remains bound to its original Book across navigation.
- Codex-like composer geometry may be echoed, but every semantic and state cue must communicate preparation rather than transmission.
- No ADR was created because the interaction is reversible and directly preserves the accepted Task Intent/Plan/Run authority separation.

### Resume Prompt

Resume at Question 15/58 by deciding natural language versus Task Skill templates, recommending natural-language-first drafting with visible contextual Task Skill recommendations, progressive required fields, explicit correction, and no silent generic-chat fallback.

## UI/UX V2 decision checkpoint — Question 15/58 plus Quick Start addition

### What's done

- Accepted Question 15 and recorded D-016 in `docs/ui-ux-v2/README.md`: natural-language-first drafting, transparent contextual Task Skill recommendations, progressive required fields, explicit correction, and no generic-chat fallback.
- Added the owner's new D-017 requirement: a distinct Quick Start path skips separate human Task Intent review and begins execution from the compact composer while preserving mandatory Task/Plan/authorization records.
- Added `Task Skill Recommendation`, `Progressive Task Fields`, and `Quick Start` to `docs/ui-ux-v2/CONTEXT.md` and `docs/ui-ux-v2/GLOSSARY.md`.
- Updated `docs/ui-ux-v2/requirements.md`, `docs/ui-ux-v2/information-architecture.md`, and `docs/ui-ux-v2/interaction-spec.md`; created `docs/ui-ux-v2/DECISION-QUEUE.md` for the newly exposed Quick Start eligibility decision.

### What's next

- Ask Question 16/59 about the Quick Start eligibility envelope, concise pre-click disclosure, authority limits, and automatic fallback to standard preparation.
- Shift the previously planned source-scope and remaining interview questions by one; the estimated total is now 59.

### Key decisions made

- Natural language is primary; Task Skill recommendation is transparent draft assistance and never activation or authority.
- Quick Start bypasses a separate Task Intent review screen, not the Task Intent, Execution Plan, Plan Envelope, or Run Authorization records themselves.
- The estimate increased from 58 to 59 because the owner added a genuine speed-versus-authority eligibility branch not covered by the original question tree.
- No ADR has been created yet: Quick Start is likely ADR-worthy, but its actual trade-off and accepted boundary are not complete until Question 16.

### Resume Prompt

Resume at Question 16/59 by deciding Quick Start eligibility, recommending availability only for complete exact context, one unambiguous skill, bounded current-Book scope, configured provider/egress, a user-set quick budget, and proposal/analysis-only outcomes, with one-line authorization disclosure and standard-path fallback.

## UI/UX V2 clarification checkpoint — Question 16/59 refinement

### What's done

- Recorded the owner's clarification that the goal is not merely a one-click summary but user-approved default execution for trusted recurring task patterns once runtime conditions pass.
- Added `Default Execution Rule` and `Task Pattern Confidence` to `docs/ui-ux-v2/CONTEXT.md` and `docs/ui-ux-v2/GLOSSARY.md`.
- Updated D-017, Task requirements, information architecture, interaction specification, and `docs/ui-ux-v2/DECISION-QUEUE.md` to distinguish one-time Quick Start from standing user-approved default execution while preserving exact per-Run records.

### What's next

- Continue the same Question 16/59 to resolve the Default Execution Rule's matching dimensions, applicability scope, provider/egress/budget envelope, allowed outcome/Effect classes, visible run notice, versioning, and revocation.
- Create an ADR only after that full trade-off is accepted.

### Key decisions made

- Task Pattern Confidence may reduce repeated Task Intent/Run-review interaction but never becomes factual confidence or downstream decision/Effect authority.
- A Default Execution Rule is not a standing Run Authorization; each matching Task still receives an exact per-Run Run Authorization linked to the rule version.
- The question estimate remains 59 because this refines the already added Question 16 branch rather than adding another branch.

### Resume Prompt

Continue Question 16/59 by proposing a versioned user-approved Default Execution Rule over an exact Task Skill/intent pattern and explicit applicability/source/provider/budget/outcome envelope, with deterministic preflight, automatic per-Run authorization, visible notice, revocation, and no auto-apply.

## UI/UX V2 decision checkpoint — Question 16/59

### What's done

- Accepted Question 16 and finalized D-017 in `docs/ui-ux-v2/README.md`: user-approved versioned Default Execution Rules allow matching user-initiated Tasks to start without repeated Task Intent review after deterministic preflight.
- Added `Default-executed Run` to `docs/ui-ux-v2/CONTEXT.md` and `docs/ui-ux-v2/GLOSSARY.md` and finalized the rule requirements, information architecture, and interaction state table.
- Resolved the open row in `docs/ui-ux-v2/DECISION-QUEUE.md`.
- Created `docs/ui-ux-v2/adr/0001-user-approved-default-execution-rules.md` because the speed-versus-authority boundary is hard to reverse, surprising without context, and the result of a real trade-off.

### What's next

- Ask Question 17/59 about the editor-facing separation and selection of mutation target, Run Source Scope, and later provider-bound outbound data.
- Continue with Plan Preview, Run Authorization, and provider/budget disclosure through the renumbered Questions 18–20.

### Key decisions made

- A Default Execution Rule is a versioned user approval for a bounded task pattern, not a standing Run Authorization.
- Each matching Task receives exact per-Run Task/Plan/Envelope/authorization records linked to the rule version.
- Applicability scope and per-Run source scope are separate; wider rule applicability never widens a Run's readable sources.
- Default execution is triggered only by user submission, falls back to standard preparation on any mismatch or drift, and never auto-accepts or auto-applies results.

### Resume Prompt

Resume at Question 17/59 by deciding source-scope interaction, recommending three visibly separate layers—mutation target, readable source scope, and provider-bound outbound subset—with current-Book defaults, explicit Series/Cross-project expansion, versioned source chips, and no filesystem concepts.

## UI/UX V2 decision checkpoint — Question 17/59

### What's done

- Accepted Question 17 and recorded D-018 in `docs/ui-ux-v2/README.md`: Task target, readable source scope, and potentially provider-bound data are three separate UI layers.
- Added `Task Target Card`, `Source Scope Builder`, and `Potential Provider Data Summary` to `docs/ui-ux-v2/CONTEXT.md` and `docs/ui-ux-v2/GLOSSARY.md`.
- Updated `docs/ui-ux-v2/requirements.md`, `docs/ui-ux-v2/information-architecture.md`, and `docs/ui-ux-v2/interaction-spec.md` with minimum Task Skill recommendations, product-record selection, Series/Cross-project expansion, exact version freezing, provider-bound maximum disclosure, and Default Execution Rule constraints.

### What's next

- Ask Question 18/59 about Plan Preview hierarchy and how it distinguishes permitted Plan Adaptations from changes requiring a Plan Revision and renewed Run Authorization.
- Ask Question 19/59 about the Run Authorization interaction and Question 20/59 about Provider/Model Role/budget disclosure.

### Key decisions made

- Task target, readable scope, and provider-bound data are not synonyms and cannot grant one another.
- Task Skills propose a visible minimum source set; Series and Cross-project expansion is explicit and versioned.
- Provider disclosure states maximum permitted categories and boundaries, not a byte-exact prediction of dynamic context assembly.
- Default execution falls back to standard preparation when source or outbound scope would expand.
- No ADR was created because this is the direct UI projection of already accepted source, mutation, provider-processing, and egress boundaries.

### Resume Prompt

Resume at Question 18/59 by deciding Plan Preview presentation, recommending one concise editorial summary with goal/outcome, target/sources, business steps, user-participation points, provider/budget, possible Effects, and a clear split between in-envelope adaptation and material changes requiring renewed authorization.

## UI/UX V2 decision checkpoint — Question 18/59

### What's done

- Accepted Question 18 and recorded D-019 in `docs/ui-ux-v2/README.md`: one six-part Editorial Plan Summary plus an explicit Plan Boundary Split.
- Added `Editorial Plan Summary`, `Plan Boundary Split`, and `Editor Participation Point` to `docs/ui-ux-v2/CONTEXT.md` and `docs/ui-ux-v2/GLOSSARY.md`.
- Updated `docs/ui-ux-v2/requirements.md`, `docs/ui-ux-v2/information-architecture.md`, and `docs/ui-ux-v2/interaction-spec.md` with default/expanded detail, editorial step wording, participation points, negative guarantees, adaptation/revision boundaries, immutable diffs, and Quick/default-run retention.

### What's next

- Ask Question 19/59 about the standard Run Authorization interaction: inline versus modal presentation, exact one-click semantics, stale-plan blocking, and queued/running feedback.
- Ask Question 20/59 about provider, Model Role, outbound-data, credential-readiness, fallback, and budget disclosure.

### Key decisions made

- Plan Preview is a concise human projection, not Run Authorization or a replacement for the machine-authoritative Plan Envelope.
- Default content uses editorial business steps and named user participation rather than Harness/tool mechanics.
- In-envelope adaptations and material changes requiring renewed authorization are visibly separate.
- Quick/default execution retains the same frozen preview even when it was not opened before dispatch.
- No ADR was created because the decision is a reversible presentation of the already accepted Plan Envelope and adaptation/revision authority model.

### Resume Prompt

Resume at Question 19/59 by deciding standard Run Authorization, recommending an inline sticky authorization bar with one exact `授权并开始任务` action, current-plan/preflight validity checks, explicit non-authorities, immediate queued/running state, and no generic approval modal.

## UI/UX V2 decision checkpoint — Question 19/59

### What's done

- Accepted Question 19 and recorded D-020 in `docs/ui-ux-v2/README.md`: standard Run Authorization is an inline sticky one-click action without duplicate modal confirmation.
- Added `Inline Run Authorization Bar` and `Run Authorization Readiness` to `docs/ui-ux-v2/CONTEXT.md` and `docs/ui-ux-v2/GLOSSARY.md`.
- Updated `docs/ui-ux-v2/requirements.md`, `docs/ui-ux-v2/information-architecture.md`, and `docs/ui-ux-v2/interaction-spec.md` with summary content, exact action wording, negative authority, readiness, drift, one-click record creation, queued/running transition, and Default Execution Rule separation.

### What's next

- Ask Question 20/59 about normal and expanded disclosure for Model Role, provider/model binding, credential readiness, outbound categories, fallback, estimated cost/range, budget ceiling, and actual cost.
- Begin running-work interaction at Question 21/59 after provider/budget disclosure closes the task authorization branch.

### Key decisions made

- Standard Run Authorization is one inline activation, not a generic approval or repeated modal.
- Authorization hands the exact Run to scheduling; `正在排队` and `运行中` remain distinct technical/business presentation states.
- Stale plans lose the authorization action and must surface a Plan Revision diff.
- Run Authorization never carries Default Execution Rule creation or downstream proposal/Effect/release decisions.
- No ADR was created because the interaction directly projects the accepted exact Run Authorization boundary and remains reversible at the presentation level.

### Resume Prompt

Resume at Question 20/59 by deciding provider/model/budget disclosure, recommending a plain-language default card with Model Role purpose, exact binding, connection state, outbound summary, approved fallback, estimated cost range and hard ceiling, plus expandable technical/billing detail and no factual-authority implication.

## UI/UX V2 decision checkpoint — Question 20/59

### What's done

- Accepted Question 20 with the owner's compactness correction and recorded D-021 in `docs/ui-ux-v2/README.md`: primary controls expose only Model Role and model capability requirements, while provider/credential/outbound/fallback/budget detail is secondary or tertiary.
- Added `Model Selection Strip`, `Model Capability Requirement`, and `Provider and Budget Disclosure` to `docs/ui-ux-v2/CONTEXT.md` and `docs/ui-ux-v2/GLOSSARY.md`.
- Updated `docs/ui-ux-v2/requirements.md`, `docs/ui-ux-v2/information-architecture.md`, `docs/ui-ux-v2/interaction-spec.md`, and `docs/ui-ux-v2/visual-direction.md` with compact primary controls, mandatory non-silent summary, secondary Task detail, Settings/Usage ownership, inline blockers, fallback, actual usage, and no-factual-authority language.

### What's next

- Begin running-work design with Question 21/59: decide default Run activity density, milestone timeline, streamed candidate presentation, indeterminate versus measurable progress, and raw-reasoning exclusion.
- Continue with parallel Runs, clarification, pause/cancel, continuation meanings, and notifications through Question 26.

### Key decisions made

- Editors directly choose Model Role and understandable model capability needs, not raw provider/model catalogs.
- Exact provider, outbound and budget facts remain compactly reachable before authorization because hidden may not become silent.
- Persistent connection/binding/billing configuration belongs to Settings; historical/aggregate actual spend belongs to Usage.
- Blocking provider/budget conditions surface inline even though normal details remain secondary.
- No ADR was created because this is a reversible information-density choice within fixed provider/preflight/egress authority.

### Resume Prompt

Resume at Question 21/59 by deciding Run activity presentation, recommending a compact current-business-state header plus an expandable editorial milestone timeline, measurable progress only when real totals exist, streamed usable candidates rather than chain-of-thought, and precise wait/stall disclosure.

## UI/UX V2 decision checkpoint — Question 21/59

### What's done

- Accepted Question 21 and recorded D-022 in `docs/ui-ux-v2/README.md`: running work uses a compact business-state header plus an expandable editorial milestone timeline and never automatically displaces the Manuscript.
- Added `Run Activity Header`, `Editorial Milestone Timeline`, `Usable Candidate Stream`, and `Measured Run Progress` to `docs/ui-ux-v2/CONTEXT.md` and `docs/ui-ux-v2/GLOSSARY.md`.
- Updated `docs/ui-ux-v2/requirements.md`, `docs/ui-ux-v2/information-architecture.md`, `docs/ui-ux-v2/interaction-spec.md`, and `docs/ui-ux-v2/visual-direction.md` with business-readable milestones, precise waiting/stall states, provisional candidate streaming, real-denominator progress, technical-reasoning exclusion, and explicit workspace expansion.

### What's next

- Ask Question 22/59 about how multiple concurrent Runs appear across Books and within one Book without turning the product into a thread list or allowing background work to steal focus.
- Continue with pause/cancel, clarification, Resume/Retry/Redo/Replay, and notification behavior through Question 26.

### Key decisions made

- Normal Run activity is a compact contextual projection, not a technical console or replacement for the Manuscript.
- Numeric progress exists only when exact, comparable work units and a trustworthy denominator exist; stage and milestone language replaces fake percentages.
- Progressive output must be usable and explicitly provisional; model reasoning, tool traces, Harness events, and subagent mechanics are not user-facing progress.
- Waiting or stalled work names the last meaningful milestone, exact condition, and safe action rather than relying on an indefinite spinner.
- No ADR was created because this is a reversible presentation decision within accepted Task/Run ledger and authority boundaries.

### Resume Prompt

Resume at Question 22/59 by deciding concurrent-Run presentation, recommending per-Book grouping in Global Attention plus one compact current-Book Run switcher, stable foreground focus, explicit capacity/queue states, and no automatic surface switching.

## UI/UX V2 decision checkpoint — Question 22/59

### What's done

- Accepted Question 22 and recorded D-023 in `docs/ui-ux-v2/README.md`: concurrent Runs remain grouped by Book, with a compact current-Book switcher and one foreground activity projection.
- Added `Book-grouped Run Overview`, `Current Book Run Switcher`, `Foreground Run Projection`, and `Run Capacity Wait` to `docs/ui-ux-v2/CONTEXT.md` and `docs/ui-ux-v2/GLOSSARY.md`.
- Updated `docs/ui-ux-v2/requirements.md`, `docs/ui-ux-v2/information-architecture.md`, `docs/ui-ux-v2/interaction-spec.md`, and `docs/ui-ux-v2/visual-direction.md` with cross-Book grouping, preserved per-Run view state, non-stealing background behavior, actionable escalation, exact capacity waiting, and foreground/execution-priority separation.

### What's next

- Ask Question 23/59 about pause and cancel semantics, including requested versus reached state, safe boundaries, preserved work, already committed Effects, and continuation after pause versus cancellation.
- Continue with clarification and Resume/Retry/Redo/Replay distinctions through Question 26.

### Key decisions made

- Concurrent Runs are subordinate to Book and target identity, not reorganized as conversations or a global task authority.
- Only one Run activity surface is foregrounded, but foreground status carries no execution or provider priority.
- Switching projections preserves per-Run view state and never pauses or mutates background execution.
- Routine background updates remain quiet; only clarification, failure, or named decision-ready outcomes become actionable attention.
- Capacity waits are explicit without invented queue order or time estimates.
- No ADR was created because the UI grouping is reversible and directly projects already accepted Book authority, concurrency, and Run isolation.

### Resume Prompt

Resume at Question 23/59 by deciding pause/cancel behavior, recommending cooperative durable pause at a safe boundary with resumable context, terminal cancellation that preserves evidence and committed Effect receipts, exact transitional states, and no promise that cancellation undoes committed work.

## UI/UX V2 decision checkpoint — Question 23/59

### What's done

- Accepted Question 23 and recorded D-024 in `docs/ui-ux-v2/README.md`: pause is a cooperative safe-boundary transition, while cancellation is a separately confirmed terminal action that preserves history.
- Added `Cooperative Run Pause`, `Cancellation Impact Summary`, and `Terminal Run Cancellation` to `docs/ui-ux-v2/CONTEXT.md` and `docs/ui-ux-v2/GLOSSARY.md`.
- Updated `docs/ui-ux-v2/requirements.md`, `docs/ui-ux-v2/information-architecture.md`, `docs/ui-ux-v2/interaction-spec.md`, and `docs/ui-ux-v2/visual-direction.md` with per-Run controls, durable transitional states, continuation validity, retained candidates/evidence, committed/ambiguous Effect treatment, and no implicit or bulk cancellation.

### What's next

- Ask Question 24/59 about Clarification Request presentation, whether independent in-envelope work may continue, how answers bind to context, and when an answer forces Plan Revision instead of automatic continuation.
- Ask Question 25/59 to distinguish Resume, Retry, Redo, and Replay in user-facing navigation and language.

### Key decisions made

- Pause is requested immediately but settles only at a safe boundary with durable continuation state.
- Cancellation is terminal for the Run, requires exact inline impact confirmation, and preserves all prior evidence and history.
- Neither pause nor cancellation reverses committed Effects; ambiguous external outcomes become actionable uncertainty and stop automatic retry/fallback.
- Paused Runs resume only while their exact authorized boundary remains valid; cancelled Runs never resume.
- Normal controls target one Run and presentation changes never imply pause or cancellation.
- No ADR was created because the interaction projects already accepted continuation, cancellation, and Effect semantics without changing their authority model.

### Resume Prompt

Resume at Question 24/59 by deciding Clarification Request interaction, recommending a durable context-bound question card with exact reason and blocked scope, one recommended answer when choices exist, independent safe work continuing only inside the unchanged envelope, and Plan Revision whenever the answer materially changes an authorized boundary.

## UI/UX V2 decision checkpoint — Question 24/59

### What's done

- Accepted Question 24 with the owner's extension and recorded D-025 in `docs/ui-ux-v2/README.md`: clarification is context-bound, durable, minimally blocking, and uses choice-first input with an always-available free-input path.
- Added `Context-bound Clarification Card`, `Choice-first Input Card`, and `Clarification Blocking Scope` to `docs/ui-ux-v2/CONTEXT.md` and `docs/ui-ux-v2/GLOSSARY.md`.
- Updated `docs/ui-ux-v2/requirements.md`, `docs/ui-ux-v2/information-architecture.md`, `docs/ui-ux-v2/interaction-spec.md`, and `docs/ui-ux-v2/visual-direction.md` with unselected recommended choices, autonomous text input, IME-safe submission, exact context binding, independent-work continuation, quiet reminders, and Plan Revision on material answers.
- Added the owner's requested Rewind capability to `docs/ui-ux-v2/DECISION-QUEUE.md` for Question 25. It expands the already planned continuation-semantics question, so the total remains 59.

### What's next

- Ask Question 25/59 to define Rewind and distinguish it from Resume, Retry, Redo, and Replay, including safe rewind points, superseded history, current-authority drift, and committed Effects.
- Continue to Question 26/59 for interruption/completion notification behavior after continuation semantics close.

### Key decisions made

- Clarification is a durable exact-context record, not generic chat or an authority decision.
- Only dependent work pauses; independent safe work may continue solely inside the unchanged Plan Envelope with explicit disclosure.
- Most bounded user-input surfaces should offer directly selectable choice cards plus free input, with a recommendation allowed but never preselected.
- The reusable choice pattern never merges distinct authority records or treats selection as submission.
- Material clarification answers create Plan Revision and renewed authorization rather than silently expanding execution.
- Rewind is required but remains undefined until Question 25; no ADR was created for clarification because its interaction pattern is reversible and follows accepted authority boundaries.

### Resume Prompt

Resume at Question 25/59 by defining Resume, Retry, Rewind, Redo, and Replay, recommending that Rewind choose a prior safe business milestone, preserve later history as superseded, start a new attempt branch within the same Run only when the envelope remains valid, and never claim to reverse committed Effects.

## UI/UX V2 decision checkpoint — Question 25/59

### What's done

- Accepted Question 25 and recorded D-026 in `docs/ui-ux-v2/README.md`: Resume, Retry, Run Rewind, Redo, and Replay retain distinct causal and authority meanings.
- Added `Run Rewind`, `Rewind Point`, `Rewind Impact Preview`, and `Superseded Attempt Branch` to `docs/ui-ux-v2/CONTEXT.md` and `docs/ui-ux-v2/GLOSSARY.md`.
- Updated `docs/ui-ux-v2/requirements.md`, `docs/ui-ux-v2/information-architecture.md`, `docs/ui-ux-v2/interaction-spec.md`, and `docs/ui-ux-v2/visual-direction.md` with eligible business milestones, impact preview, choice-first direction input, current-authority revalidation, append-only branches, material-change Redo, and committed/ambiguous Effect handling.
- Created `docs/ui-ux-v2/adr/0002-append-only-run-rewind.md` and closed the corresponding item in `docs/ui-ux-v2/DECISION-QUEUE.md`.

### What's next

- Ask Question 26/59 about in-app and Windows notification levels for progress, completion, clarification, failure, and decision-ready outcomes, including privacy on lock-screen notification surfaces.
- Begin proposal review and Apply design at Question 27 after the running-work branch closes.

### Key decisions made

- Rewind is an append-only direction branch from an eligible editor-readable safe milestone, not destructive history rollback.
- In-envelope Rewind maps to a linked Retry attempt in the same unchanged Run; material change maps to Plan Revision and a newly authorized Redo Run.
- Superseded candidates and activity remain replayable and current execution revalidates authoritative state rather than restoring a historical world.
- No continuation operation reverses a committed Effect; ambiguous external outcomes block potentially repeating work.
- Replay remains read-only/provider-free, while Redo creates all new authority-bearing identities.
- ADR 0002 was required because the choice is persistence- and causal-model-shaping, surprising without context, and trades intuitive rewind against append-only audit and Effect integrity.

### Resume Prompt

Resume at Question 26/59 by deciding notification policy, recommending quiet inline updates for routine progress, restrained in-app completion notices, actionable attention for clarification/failure/decision-ready outcomes, opt-in privacy-safe Windows notifications only while AI7 is backgrounded, and no manuscript excerpts or sounds by default.

## UI/UX V2 decision checkpoint — Question 26/59

### What's done

- Accepted Question 26 and recorded D-027 in `docs/ui-ux-v2/README.md`: notifications escalate by user consequence from inline activity to quiet completion, persistent actionable attention, and privacy-safe Windows notice.
- Added `Run Notification Tier`, `Quiet Completion Notice`, `Privacy-safe Windows Notification`, and `Book-coalesced Notification` to `docs/ui-ux-v2/CONTEXT.md` and `docs/ui-ux-v2/GLOSSARY.md`.
- Updated `docs/ui-ux-v2/requirements.md`, `docs/ui-ux-v2/information-architecture.md`, `docs/ui-ux-v2/interaction-spec.md`, and `docs/ui-ux-v2/visual-direction.md` with foreground/background behavior, opt-in ordinary completion, content-free defaults, no sound, per-Book coalescing, focus-mode suppression, deep linking, restart catch-up, and outcome-accurate language.

### What's next

- Begin proposal-review design at Question 27/59: decide the default manuscript change-comparison surface, navigation, rationale/evidence disclosure, windowing, and stale-base treatment.
- Continue with conflict handling, Proposal Decision, Apply, Effect Approval, and Effect Receipt separation in subsequent questions.

### Key decisions made

- Routine progress never generates a popup, and ordinary completion does not inflate actionable attention.
- Persistent in-app attention is reserved for exact clarification, failure, ambiguity, or named decision-ready records.
- Background Windows notifications default to generic action-required/abnormal event classes with no unpublished editorial details or sound.
- Ordinary completion, richer identity, and sound are separately configurable; notification settings grant no content-egress or release authority.
- Coalescing reduces interruption without merging exact records, while clicks only navigate and never answer or decide.
- No ADR was created because notification density and privacy presentation are reversible UI policy within fixed unpublished-material and authority boundaries.

### Resume Prompt

Resume at Question 27/59 by deciding Proposal review presentation, recommending exact-revision inline comparison for small changes, an explicit Dedicated Work Workspace for large or multi-range proposals, a virtualized change navigator, rationale/evidence on demand, and immediate stale-base disclosure without silent retargeting.

## UI/UX V2 decision checkpoint — Question 27/59

### What's done

- Accepted Question 27 and recorded D-028 in `docs/ui-ux-v2/README.md`: Proposal review is manuscript-contextual for small changes and explicitly expands to a bounded Dedicated Work Workspace for large or complex change sets.
- Added `Contextual Proposal Review`, `Proposal Change Navigator`, `Bounded Proposal Comparison`, `Stale Proposal Base`, and `Proposal Review Return Position` to `docs/ui-ux-v2/CONTEXT.md` and `docs/ui-ux-v2/GLOSSARY.md`.
- Updated `docs/ui-ux-v2/requirements.md`, `docs/ui-ux-v2/information-architecture.md`, `docs/ui-ux-v2/interaction-spec.md`, and `docs/ui-ux-v2/visual-direction.md` with inline/side-by-side modes, virtualized change navigation, bounded loading, exact revision labels, rationale/evidence disclosure, three separate factual dimensions, stale-base classification, and persistent return state.

### What's next

- Ask Question 28/59 about stale-base and conflict resolution: exact three-way comparison, safe non-interacting merge classification, editor-authored resolution, regenerated Proposal versions, and no fuzzy rebase.
- Continue with Proposal Decision aggregation and Apply/Effect approval/receipt separation after conflict semantics close.

### Key decisions made

- Small Proposal changes remain next to their manuscript context; complex sets use an explicit dedicated review workspace.
- The renderer presents one bounded comparison at a time and virtualizes navigation for long manuscripts.
- Chinese prose defaults to inline readable differences; complex structures may use side-by-side comparison.
- Rationale and evidence are progressive, and Reference Integrity, Claim Support, and Factual Verification remain separate.
- A changed base is disclosed before exact safe-merge/conflict classification and never permits silent or fuzzy retargeting.
- Review navigation and selection create no Proposal Decision or Apply authority.
- No ADR was created because workspace layout and disclosure density are reversible projections of fixed Proposal and revision semantics.

### Resume Prompt

Resume at Question 28/59 by deciding Proposal conflict resolution, recommending exact base/current/proposed comparison, explicit safe non-interaction versus real conflict, choice-first resolution paths, regenerated/model resolutions as new Proposal versions, editor-authored resolution drafts, and no implication that resolution selection applies manuscript changes.

## UI/UX V2 decision checkpoint — Question 28/59

### What's done

- Accepted Question 28 with the owner's Diff-Merge extension and recorded D-029 in `docs/ui-ux-v2/README.md`: stale Proposal bases receive exact three-way classification and real conflicts use a fast, reversible Resolution Draft workflow.
- Added `Three-way Proposal Conflict`, `Safe Non-interacting Merge`, `Resolution Draft`, and `Diff-Merge Quick Action` to `docs/ui-ux-v2/CONTEXT.md` and `docs/ui-ux-v2/GLOSSARY.md`.
- Updated `docs/ui-ux-v2/requirements.md`, `docs/ui-ux-v2/information-architecture.md`, `docs/ui-ux-v2/interaction-spec.md`, and `docs/ui-ux-v2/visual-direction.md` with labeled base/current/proposed states, take-current/take-proposed/ordered-keep-both actions, manual editing, keyboard flow, bulk non-conflicting inclusion, regenerated versions, durable drafts, and strict no-Apply semantics.

### What's next

- Ask Question 29/59 about Proposal Decision: per-change draft dispositions, explicit commit, batch decisions, optional reason capture, and the handoff to a separate Apply preparation step.
- Continue with Apply binding, Effect Approval, atomic commit feedback, and Effect Receipt presentation.

### Key decisions made

- A stale base is not automatically a conflict; exact analysis separates unchanged target, safe non-interaction, and real interaction.
- Real conflicts use exact base/current/proposed comparison and a fourth editable Resolution Draft.
- Diff-Merge quick actions accelerate exact composition but modify only the draft and remain reversible; no quick action applies manuscript changes.
- Structural ambiguity and invalid keep-both combinations cannot use automatic or bulk resolution.
- Manual and regenerated resolutions create new Proposal versions with immutable lineage and no preselected Proposal Decision.
- No ADR was created because the Diff-Merge interaction is a reversible UI/workflow projection of accepted exact-pin, Proposal-version, and conflict semantics.

### Resume Prompt

Resume at Question 29/59 by deciding Proposal Decision interaction, recommending unselected per-change dispositions, fast keyboard/batch selection for exact homogeneous sets, one explicit `记录提案决定` commit with an exact summary, optional non-blocking reason capture, and a separate `准备应用` next step rather than manuscript mutation.

## UI/UX V2 decision checkpoint — Question 29/59

### What's done

- Accepted Question 29 and recorded D-030 in `docs/ui-ux-v2/README.md`: per-change dispositions first accumulate reversibly, then one explicit exact-scope action records the authoritative Proposal Decision.
- Added `Proposal Decision Draft`, `Proposal Change Disposition`, `Proposal Decision Scope Summary`, and `Non-blocking Decision Reason` to `docs/ui-ux-v2/CONTEXT.md` and `docs/ui-ux-v2/GLOSSARY.md`.
- Updated `docs/ui-ux-v2/requirements.md`, `docs/ui-ux-v2/information-architecture.md`, `docs/ui-ux-v2/interaction-spec.md`, and `docs/ui-ux-v2/visual-direction.md` with unselected dispositions, auto-advance, keyboard/undo, exact batch scope, partial decisions, immutable superseding decisions, optional reason capture, and separate `准备应用` navigation.

### What's next

- Ask Question 30/59 about Apply preparation: exact accepted-change selection, current-revision revalidation, resulting-text preview, atomic payload binding, exclusions, and handoff to separate Effect Approval.
- Continue with Effect Approval interaction and committed/failed/ambiguous Effect Receipt presentation.

### Key decisions made

- Review choices are reversible draft state until `记录提案决定` commits one immutable exact per-change decision.
- Batch decisions are allowed only over an explicitly summarized frozen eligible set; conflict and stale items remain visible and excluded.
- Partial Proposal Decision is valid and never flattened into whole-Proposal acceptance.
- Optional reasons are unselected, choice-first, free-text-capable, and non-blocking, with suggestion acceptance versus correction tracked.
- Accepted Proposal content remains `尚未应用` and proceeds only to a separate Apply preparation flow.
- No ADR was created because the interaction operationalizes the already accepted Proposal Decision boundary without changing its domain authority.

### Resume Prompt

Resume at Question 30/59 by deciding Apply preparation, recommending an exact accepted-change set, current-authority revalidation, bounded resulting-text preview, immutable Effect target/payload summary, all-or-none atomic scope, explicit exclusions, and no manuscript mutation before separately named Effect Approval.

## UI/UX V2 decision checkpoint — Question 30/59

### What's done

- Accepted Question 30 and recorded D-031 in `docs/ui-ux-v2/README.md`: `准备应用` creates a local exact atomic Effect preparation and never mutates the Manuscript or grants Effect Approval.
- Added `Apply Preparation`, `Apply Change Set`, `Apply Result Preview`, and `Apply Readiness` to `docs/ui-ux-v2/CONTEXT.md` and `docs/ui-ux-v2/GLOSSARY.md`.
- Updated `docs/ui-ux-v2/requirements.md`, `docs/ui-ux-v2/information-architecture.md`, `docs/ui-ux-v2/interaction-spec.md`, and `docs/ui-ux-v2/visual-direction.md` with accepted-change derivation, explicit exclusions, current-authority/structure revalidation, bounded result preview, immutable Effect binding, atomicity, local/provider-free operation, drift invalidation, and no-approval language.

### What's next

- Ask Question 31/59 about the Effect Approval action for prepared manuscript Apply: inline versus modal, exact one-click record/dispatch semantics, payload drift, transitional state, and no duplicate approval friction.
- Ask Question 32/59 about Effect Receipt and failed/ambiguous/committed result presentation.

### Key decisions made

- Apply Preparation starts from exact accepted conflict-free changes but permits explicit exclusions without changing Proposal Decision.
- The renderer shows a bounded predicted result while authoritative service state supplies exact preflight and bindings.
- One prepared Apply Change Set is one immutable exact all-or-none Effect payload; any drift or scope change invalidates prior readiness/approval.
- Preparation is fully local and says clearly that the Manuscript remains unchanged until separately approved and committed.
- No ADR was created because the surface is the direct UI projection of accepted exact Effect identity, payload binding, atomicity, and authority separation.

### Resume Prompt

Resume at Question 31/59 by deciding Effect Approval interaction, recommending one inline sticky `批准并应用到稿件` action on a current frozen Apply summary, no duplicate modal, immediate `正在应用` transition, exact payload drift invalidation, and no `已应用` claim before an Effect Receipt exists.

## UI/UX V2 decision checkpoint — Question 31/59

### What's done

- Accepted Question 31 and recorded D-032 in `docs/ui-ux-v2/README.md`: one inline exact action records Apply Effect Approval and dispatches the same bound Effect without duplicate confirmation.
- Added `Inline Apply Approval Bar`, `Apply Approval Readiness`, and `Applying Manuscript State` to `docs/ui-ux-v2/CONTEXT.md` and `docs/ui-ux-v2/GLOSSARY.md`.
- Updated `docs/ui-ux-v2/requirements.md`, `docs/ui-ux-v2/information-architecture.md`, `docs/ui-ux-v2/interaction-spec.md`, and `docs/ui-ux-v2/visual-direction.md` with exact summary/action language, distinct approval/dispatch records, idempotence, drift invalidation, focused IME-safe shortcut, durable post-dispatch state, and no success claim before receipt.

### What's next

- Ask Question 32/59 about Effect Receipt presentation for committed, not-committed, interrupted/settling, and ambiguous outcomes, plus safe navigation and reversal/correction paths.
- Close the Proposal/Apply branch before beginning factual-verification and evidence-comparison design.

### Key decisions made

- The persistent Apply Preparation is sufficient deliberation; normal size/complexity does not add a duplicate modal.
- One exact interaction may record Effect Approval and dispatch the bound Effect, while the records and meanings remain distinct.
- Effect Approval is single-payload authority and cannot be inherited from upstream decisions or standing execution rules.
- Post-dispatch state is idempotent, restart-safe, and never claims application success without verified Effect Receipt.
- No ADR was created because the one-step interaction preserves the existing exact Effect Approval/dispatch/receipt architecture and is presentation-reversible.

### Resume Prompt

Resume at Question 32/59 by deciding Apply Effect Receipt presentation, recommending a compact durable outcome card with committed/not-committed/settling/ambiguous states, exact old/new revision and Effect identity, deep links to applied ranges, no auto-retry under ambiguity, and reversal only through a separately prepared new Effect.

## UI/UX V2 decision checkpoint — Question 32/59

### What's done

- Accepted Question 32 and recorded D-033 in `docs/ui-ux-v2/README.md`: Apply outcome uses a durable exact receipt card, and committed reversal proceeds only through a new governed Effect.
- Added `Apply Effect Receipt Card`, `Apply Outcome Recovery`, `Unresolved Apply Outcome`, and `Reverse Apply Effect` to `docs/ui-ux-v2/CONTEXT.md` and `docs/ui-ux-v2/GLOSSARY.md`.
- Updated `docs/ui-ux-v2/requirements.md`, `docs/ui-ux-v2/information-architecture.md`, `docs/ui-ux-v2/interaction-spec.md`, and `docs/ui-ux-v2/visual-direction.md` with committed/non-committed/recovery/unresolved states, exact receipt detail, deep links, idempotent recovery, retry blocking, restart behavior, and current-authority reverse preparation.
- Created `docs/ui-ux-v2/adr/0003-reverse-committed-apply-with-a-new-effect.md` and recorded its resolution in `docs/ui-ux-v2/DECISION-QUEUE.md`.

### What's next

- Begin factual-verification design at Question 33/59: decide manuscript claim markers, right-side fact-check lens, status vocabulary, long-manuscript density, and Correction Proposal routing.
- Continue with evidence comparison, source/reference integrity, verification decisions, and correction workflow.

### Key decisions made

- `已应用` requires verified commit receipt; confirmed non-commit, recovery, and unresolved outcomes remain distinct.
- Recovery queries stable local authority and never repeats an Effect because acknowledgement was lost.
- Unresolved Apply outcome is durable high-priority attention and blocks every potentially duplicating action.
- Receipt proves Effect outcome only, never correctness, workflow completion, signoff, or release.
- Reversing a committed Apply creates a new exact approved atomic Effect against current authority; the original receipt remains immutable.
- ADR 0003 was required because reversal persistence is difficult to change, surprises users expecting ordinary undo, and trades immediate erasure for auditability and conflict safety.

### Resume Prompt

Resume at Question 33/59 by deciding factual-verification overview, recommending exact-revision manuscript claim markers plus a right-side fact-check lens, restrained marker density, separate Reference Integrity/Claim Support/Factual Verification statuses, evidence-first wording, and Correction Proposal rather than direct rewrite.

## UI/UX V2 decision checkpoint — Question 33/59

### What's done

- Accepted Question 33 and recorded D-034 in `docs/ui-ux-v2/README.md`: factual verification enters from selection/chapter/whole-manuscript Tasks and returns through low-noise exact assertion markers plus a virtualized right lens.
- Added `Fact-check Lens`, `Manuscript Assertion Marker`, `Factual Review Result Item`, and `Stale Verification Anchor` to `docs/ui-ux-v2/CONTEXT.md` and `docs/ui-ux-v2/GLOSSARY.md`.
- Updated `docs/ui-ux-v2/requirements.md`, `docs/ui-ux-v2/information-architecture.md`, `docs/ui-ux-v2/interaction-spec.md`, and `docs/ui-ux-v2/visual-direction.md` with three entry scopes, exact revision/policy binding, controlled marker density, separate integrity/support/verification states, explicit status vocabulary, virtualized navigation, model-knowledge exclusion, stale-anchor handling, and Correction Proposal routing.

### What's next

- Ask Question 34/59 about evidence comparison: source cards/matrix, exact excerpts, authority/freshness/provenance, support/contradiction relation, pinning multiple sources, and no summary-as-evidence shortcut.
- Continue with verification determination/Review Decision and Correction Proposal creation.

### Key decisions made

- Factual review is manuscript-contextual and revision-bound, not a global truth dashboard.
- Long-manuscript marker density is restrained by default without hiding the complete result set in the right lens.
- Reference Integrity, Claim Support, and Factual Verification remain separately readable and policy-governed.
- Foundation Model knowledge can raise a question but never appear as evidence.
- Drift invalidates the exact assertion anchor and historical status remains bound to its old revision.
- Suspected errors route to Correction Proposal and create no direct manuscript mutation or downstream authority.
- No ADR was created because the overview is a reversible presentation of existing assertion, finding, policy, and correction boundaries.

### Resume Prompt

Resume at Question 34/59 by deciding evidence comparison, recommending one assertion-focused Dedicated Work Workspace with exact source-version cards, a pinnable side-by-side evidence matrix, exact fetched excerpts, authority/freshness/provenance fields, support/contradict/context relations, and no model summary treated as evidence.

## UI/UX V2 decision checkpoint — Question 34/59; total expanded to 60

### What's done

- Basically accepted Question 34 and recorded D-035 in `docs/ui-ux-v2/README.md`: evidence comparison is assertion-centered, source/version-aware, pinnable, lineage-preserving, conflict-preserving, and distinguishes candidates from exact checked evidence.
- Added `Assertion-centered Evidence Workspace`, `Evidence Source Card`, `Evidence Comparison Matrix`, `Exact Evidence Excerpt`, `Evidence Source Lineage`, and `AI7 Evidence Comparison Summary` to `docs/ui-ux-v2/CONTEXT.md` and `docs/ui-ux-v2/GLOSSARY.md`.
- Updated `docs/ui-ux-v2/requirements.md`, `docs/ui-ux-v2/information-architecture.md`, `docs/ui-ux-v2/interaction-spec.md`, and `docs/ui-ux-v2/visual-direction.md` with progressive source cards, 2–4 pinned comparisons, exact quotation, support relations, dependency grouping, retained conflicts, source drift, and non-evidentiary summaries.
- Added evidence-assurance efficiency to `docs/ui-ux-v2/DECISION-QUEUE.md`. Because the owner requested relaxing checks and this affects factual-evidence meaning rather than layout alone, the estimated total increased from 59 to 60.

### What's next

- Ask Question 35/60 to decide quick/standard/strict evidence assurance, which checks may be lazy/background, and which remain mandatory before recording a Factual Verification outcome.
- Then continue with factual determination/Review Decision and Correction Proposal creation using the renumbered remaining branch.

### Key decisions made

- Source candidates may appear before full assurance, but they remain visibly non-evidentiary until required checks complete.
- Exact Fetch remains required to certify a quotation; model summary/knowledge remains non-evidence; conflicts and source derivation cannot be hidden for speed.
- Progressive rendering avoids blocking the entire evidence list while each card exposes its incomplete state.
- Which assurance checks block a final determination remains intentionally unresolved for the new Question 35/60.
- No ADR was created yet because the efficiency-versus-assurance policy tradeoff remains open.

### Resume Prompt

Resume at Question 35/60 by deciding tiered evidence assurance, recommending `快速整理`, `标准核查`, and `严格核查` modes with Standard default, lazy/background metadata work during discovery, exact quotation/provenance/policy-minimum checks before determination, and no mode capable of converting model knowledge or retrieval snippets into evidence.

## UI/UX V2 decision checkpoint — Question 35/60

### What's done

- Accepted Question 35 and recorded D-036 in `docs/ui-ux-v2/README.md`: Quick, default Standard, and Strict Evidence Assurance Levels trade blocking work for speed without changing evidence semantics.
- Added `Evidence Assurance Level`, `Quick Evidence Triage`, `Standard Evidence Assurance`, `Strict Evidence Assurance`, and `Minimum Evidence Gate` to `docs/ui-ux-v2/CONTEXT.md` and `docs/ui-ux-v2/GLOSSARY.md`.
- Updated `docs/ui-ux-v2/requirements.md`, `docs/ui-ux-v2/information-architecture.md`, `docs/ui-ux-v2/interaction-spec.md`, and `docs/ui-ux-v2/visual-direction.md` with progressive/background checks, formal-outcome ceilings, policy-enforced minimums, reusable assurance work, incomplete-correction labels, exact blocking actions, and no source-scope/model-role conflation.
- Created `docs/ui-ux-v2/adr/0004-use-tiered-progressive-evidence-assurance.md` and closed the exposed item in `docs/ui-ux-v2/DECISION-QUEUE.md`.

### What's next

- Ask Question 36/60 about the compact separation between a versioned Factual Verification result and the editor's Review Decision, including choice-first outcomes, policy gate, recommendation without preselection, and next actions.
- Continue with Correction Proposal creation after the factual decision boundary is fixed.

### Key decisions made

- Quick mode is discovery/triage, not weak formal verification; it can save pending findings and incomplete correction drafts only.
- Standard mode is default and delays blocking until the exact formal-determination action.
- Strict mode completes policy-required selected-evidence assurance but never implies absolute truth or legal authority.
- Policy minimums are non-bypassable; higher levels reuse all current assurance work rather than restarting.
- Exact quotation, non-model evidence, independent-source honesty, and conflict preservation hold at every level.
- ADR 0004 was required because the choice is policy/status-shaping, surprising without visible modes, and trades interaction speed against formal evidence completeness.

### Resume Prompt

Resume at Question 36/60 by deciding factual determination and Review Decision, recommending an evidence-backed versioned verification result followed by a compact unselected choice-first editor review card, separate exact records, no generic approval, optional reason, and Correction Proposal only after the appropriate reviewed outcome.

## UI/UX V2 decision checkpoint — Question 36/60

### What's done

- Accepted Question 36 and recorded D-037 in `docs/ui-ux-v2/README.md`: a versioned evidence assessment and the editor's Review Decision are distinct records presented in one compact continuous workspace.
- Added `Versioned Verification Result`, `Factual Review Decision Card`, and `Verification Review Disposition` to `docs/ui-ux-v2/CONTEXT.md` and `docs/ui-ux-v2/GLOSSARY.md`.
- Updated `docs/ui-ux-v2/requirements.md`, `docs/ui-ux-v2/information-architecture.md`, `docs/ui-ux-v2/interaction-spec.md`, and `docs/ui-ux-v2/visual-direction.md` with result binding, formal-gate behavior, unselected review choices, exact decision record, version drift, optional reasons, supplementary Tasks, attention closure, and Correction Proposal routing.

### What's next

- Ask Question 37/60 about Correction Proposal creation: exact finding/target/evidence binding, option-first correction variants plus free editing, minimal scope, multi-range disclosure, incomplete-evidence labeling, and return to the accepted Proposal review pipeline.
- Continue with Workflow/Signoff/Delivery after the correction flow closes.

### Key decisions made

- Factual Verification is a versioned evidence assessment and Review Decision is the editor's separately recorded disposition of that exact version.
- The two steps remain in one workspace for speed without combining their records or authority.
- Quick-mode pending results cannot be accepted as formal supported/contradicted conclusions.
- Review choices are unselected and optional reasons are non-blocking; evidence/policy/anchor drift prevents stale submission.
- Accepted suspected error opens Correction Proposal preparation, never direct manuscript repair.
- No ADR was created because the interaction directly projects the already accepted distinction among verification, review, proposal, and downstream authority.

### Resume Prompt

Resume at Question 37/60 by deciding Correction Proposal creation, recommending exact finding/current-revision/evidence lineage, two or three unselected correction variants when useful plus free editing, minimal affected scope, explicit linked multi-range changes, evidence-incomplete labels, and no Proposal Decision or Apply during draft creation.

## UI/UX V2 decision checkpoint — Question 37/60

### What's done

- Accepted Question 37 and recorded D-038 in `docs/ui-ux-v2/README.md`: Correction Proposal drafting is exact-context-bound, option-first when meaningful, freely editable, and minimal-scope by default.
- Added `Correction Proposal Draft`, `Correction Variant`, `Minimal Correction Scope`, and `Linked Correction Range Set` to `docs/ui-ux-v2/CONTEXT.md` and `docs/ui-ux-v2/GLOSSARY.md`.
- Updated `docs/ui-ux-v2/requirements.md`, `docs/ui-ux-v2/information-architecture.md`, `docs/ui-ux-v2/interaction-spec.md`, and `docs/ui-ux-v2/visual-direction.md` with finding/review/evidence binding, variant rules, IME-safe free editing, exact repeated ranges, typed corrections, unrelated-change branching, incomplete-evidence propagation, drift handling, and standard Proposal pipeline return.

### What's next

- Begin Workflow design at Question 38/60: decide the Deliverable-owned Workflow lens, overlapping/reopened/skipped phases, actionable-next-work emphasis, versioned profile visibility, and rejection of a single progress percentage.
- Continue with Workflow Gate, Signoff, Delivery/Export, and Public Release Permission interactions.

### Key decisions made

- Correction Proposal scope is the minimum exact change required by the reviewed finding; unrelated improvements require a separate Proposal.
- AI7 offers multiple variants only for real editorial tradeoffs, never to fabricate choice; no option is preselected and free editing stays available.
- Repeated facts use explicit exact ranges and typed corrections rather than fuzzy replace-all.
- Evidence assurance limitations remain visible through the standard Proposal/Apply workflow and generated wording cannot upgrade them.
- Saving creates only a new Correction Proposal version, with no inherited Proposal Decision or Apply authority.
- No ADR was created because the drafting interaction projects existing finding, correction, Proposal, and evidence-lineage boundaries without changing them.

### Resume Prompt

Resume at Question 38/60 by deciding Workflow presentation, recommending a Deliverable-owned right-side lens with versioned profile, multiple simultaneously active phases, exact phase/gate states, `下一项需要处理` emphasis, recorded reopen/skip reasons, and no scalar Book/Deliverable progress percentage.

## UI/UX V2 decision checkpoint — Question 38/60

### What's done

- Accepted Question 38 and recorded D-039 in `docs/ui-ux-v2/README.md`: Workflow is Deliverable-owned, nonlinear, action-first, profile-version-pinned, and free of scalar progress percentages.
- Added `Deliverable Workflow Lens`, `Action-first Workflow Summary`, `Parallel Phase View`, and `Workflow Profile Pin Display` to `docs/ui-ux-v2/CONTEXT.md` and `docs/ui-ux-v2/GLOSSARY.md`.
- Updated `docs/ui-ux-v2/requirements.md`, `docs/ui-ux-v2/information-architecture.md`, `docs/ui-ux-v2/interaction-spec.md`, and `docs/ui-ux-v2/visual-direction.md` with seven Chinese phase labels, parallel states, exact next actions, phase-linked records, deterministic transitions, reopen/skip reasons, profile migration diff, persistence, and no-authority implications.

### What's next

- Ask Question 39/60 about Workflow Gate readiness and decision interaction: criteria/evidence, blocking versus advisory conditions, choice-first outcomes, conditional passage, deterministic transition, and no Signoff implication.
- Continue with Signoff, Delivery Package/Export, and Public Release Permission flows.

### Key decisions made

- Workflow belongs to one Editorial Deliverable and remains a contextual lens rather than a product root or Harness construct.
- Phases overlap/reopen/skip and use exact independent states; the UI emphasizes actionable work instead of sequence or percentage.
- Related Tasks, evidence, proposals, decisions, effects, signoff, and delivery remain separate authoritative records.
- Only deterministic AI7 commands transition workflow; runtime outcomes can supply evidence but never auto-complete phases.
- Profile versions remain pinned and migrate only through explicit diff/command.
- No ADR was created because the interaction presents already accepted Deliverable Workflow semantics without changing them.

### Resume Prompt

Resume at Question 39/60 by deciding Workflow Gate interaction, recommending one exact criteria/evidence card with computed readiness separate from human gate disposition, unselected pass/return/conditional/defer choices, policy/profile-controlled conditional passage, deterministic command, and no Signoff or factual-authority implication.

## UI/UX V2 decision checkpoint — Question 39/60

### What's done

- Accepted Question 39 and recorded D-040 in `docs/ui-ux-v2/README.md`: Workflow Gate readiness is computed separately from an explicit deterministic editor disposition.
- Added `Workflow Gate Card`, `Gate Readiness`, `Workflow Gate Disposition`, and `Conditional Gate Passage` to `docs/ui-ux-v2/CONTEXT.md` and `docs/ui-ux-v2/GLOSSARY.md`.
- Updated `docs/ui-ux-v2/requirements.md`, `docs/ui-ux-v2/information-architecture.md`, `docs/ui-ux-v2/interaction-spec.md`, and `docs/ui-ux-v2/visual-direction.md` with mandatory/advisory criteria, unselected choices, profile-limited conditional passage, separate Review Decision records, deterministic transitions, drift, history, no bulk pass, and no downstream-authority implication.

### What's next

- Ask Question 40/60 about Signoff readiness and exact-version Signoff Record interaction, including unresolved exceptions, post-Signoff revision drift, and separation from Gate, Delivery, and Public Release Permission.
- Continue with Delivery Package/Export and Public Release Permission.

### Key decisions made

- Gate readiness is evidence/profile-derived information, not a decision or automatic transition.
- Mandatory criteria cannot be overridden; conditional passage exists only within exact pinned-profile rules and preserves restrictions.
- One action may create both a required Review Decision and Gate transition, but records and labels remain separate.
- Gate history is append-only and no bulk approval exists.
- Gate passage unlocks only profile-defined work and never carries Signoff, delivery, release, or factual authority.
- No ADR was created because the interaction is a reversible projection of accepted Workflow Gate and deterministic-command boundaries.

### Resume Prompt

Resume at Question 40/60 by deciding Signoff, recommending an exact Deliverable-version readiness card, a specifically named `签发此版本` action, optional profile-permitted exceptions, immutable Signoff Record, automatic current-readiness invalidation after content change, and no delivery or Public Release Permission implication.

## UI/UX V2 decision checkpoint — Question 40/60

### What's done

- Rejected a user-facing Signoff workflow for the target People's Literature Publishing House practice and recorded D-041 in `docs/ui-ux-v2/README.md`: editors save labeled Milestone Versions instead.
- Added `Milestone Version`, `Save as Milestone Version`, `Milestone Version Label`, and `Milestone Purpose` to `docs/ui-ux-v2/CONTEXT.md` and `docs/ui-ux-v2/GLOSSARY.md`; reshaped `Checkpoint Suggestion` into `Milestone Version Suggestion`.
- Updated Q12 persistence wording and `docs/ui-ux-v2/requirements.md`, `docs/ui-ux-v2/information-architecture.md`, `docs/ui-ux-v2/interaction-spec.md`, and `docs/ui-ux-v2/visual-direction.md` so one familiar action creates/designates the immutable version, label/purpose, and separate internal stated-use record while staying distinct from Save, Delivery, and Public Release.
- Created `docs/ui-ux-v2/adr/0005-project-signoff-as-a-user-facing-milestone-version.md` and recorded the resolution in `docs/ui-ux-v2/DECISION-QUEUE.md`.

### What's next

- Ask Question 41/60 about Delivery Package preparation around one exact selected Milestone Version, included files/artifacts, destination, fidelity/limitations, and no-export-before-Effect boundary.
- Continue with export destination/format and Public Release Permission interactions.

### Key decisions made

- The target-house profile has no user-facing Signoff terminology, readiness card, exceptions, or signing step.
- `保存为里程碑版本` is distinct from journal Save and creates a Manuscript Checkpoint/Revision when needed.
- One user interaction may append separate milestone metadata and internal Signoff Record for the stated next use; ordinary users see only the milestone.
- Multiple milestones coexist, later edits never inherit old designation, and Delivery must select one exact milestone.
- Milestone purpose communicates intended next use but grants no Delivery, export, factual, or Public Release authority.
- ADR 0005 was required because this mapping is persistence/domain-shaping, surprising without institutional context, and trades architectural Signoff terminology for target-user workflow fit.

### Resume Prompt

Resume at Question 41/60 by deciding Delivery Package preparation, recommending one exact Milestone Version selection, explicit included files/artifacts and exclusions, destination/purpose, fidelity/limitation report, frozen package identity, local preview, and no external export or Public Release Permission during preparation.

## UI/UX V2 decision checkpoint — Question 41/60

### What's done

- Accepted Question 41 and recorded D-042 in `docs/ui-ux-v2/README.md`: Delivery Package Preparation is local, immutable-versioned, single-purpose, and centered on one explicitly selected Milestone Version.
- Added `Delivery Package Preparation`, `Milestone Change Exclusion Notice`, `Delivery Package Manifest Preview`, and `Prepared Delivery Package` to `docs/ui-ux-v2/CONTEXT.md` and `docs/ui-ux-v2/GLOSSARY.md`.
- Updated `docs/ui-ux-v2/requirements.md`, `docs/ui-ux-v2/information-architecture.md`, `docs/ui-ux-v2/interaction-spec.md`, and `docs/ui-ux-v2/visual-direction.md` with milestone selection/recommendation, later-edit exclusions, typed manifest, profile gaps, fidelity/limitations, local atomic staging, immutable package versions, no filesystem literacy, and no-export/no-release semantics.

### What's next

- Inspect exact V1 frozen semantics and V2 architecture objects for required export formats/fidelity before Question 42/60.
- Ask Question 42/60 only for the remaining product tradeoff around format priorities, degradation handling, preview, and destination selection; then separate external Effect/Public Release Permission.

### Key decisions made

- Delivery preparation chooses one exact milestone explicitly and never silently includes later edits.
- The package manifest includes files/artifacts, purpose/destination, sources/factual limitations, exclusions, and fidelity state without exposing storage paths.
- Local freeze is all-or-none and every material change creates a new immutable package version.
- Prepared means neither exported nor delivered, and package creation grants no external or public authority.
- No ADR was created because this is a direct UI projection of accepted Delivery Package identity, versioning, and Effect boundaries.

### Resume Prompt

Resume by inspecting the pinned V1/V2 export requirements, then ask Question 42/60 with a recommendation for the minimal user-facing format/fidelity and destination workflow justified by those exact inputs.

## UI/UX V2 decision checkpoint — Question 42/60

### What's done

- Accepted the owner's revised format stack and recorded D-043 in `docs/ui-ux-v2/README.md`: DOCX is the ordinary user-facing primary editable format, revision-pinned Markdown is the internal Agent Exchange Projection and explicit fallback export, and PDF is an optional fixed-layout export.
- Added `Primary Editable Export`, `Agent Exchange Projection`, `Markdown Fallback Export`, `Fixed-layout PDF Export`, `Export Fidelity Review`, `Export Fidelity Disposition`, `Local Export Preparation`, `Local Export Destination`, and the package-purpose distinction to `docs/ui-ux-v2/CONTEXT.md` and `docs/ui-ux-v2/GLOSSARY.md`; Question 43 subsequently narrowed that distinction to `Delivery Package Purpose` with no recipient tracking.
- Updated `docs/ui-ux-v2/requirements.md`, `docs/ui-ux-v2/information-architecture.md`, `docs/ui-ux-v2/interaction-spec.md`, and `docs/ui-ux-v2/visual-direction.md` with format hierarchy, per-content-class fidelity handling, explicit degradation disposition, exact local target selection, background/cancellable generation, atomic publication, and receipted outcome.
- Created `docs/ui-ux-v2/adr/0006-use-purpose-specific-document-representations.md` and recorded the resolution in `docs/ui-ux-v2/DECISION-QUEUE.md`.

### What's next

- Ask Question 43/60 about whether V1 delivery is local-export-first with a separately recorded handoff, or includes direct external-channel transmission.
- Continue by designing exact external Effect/receipt semantics if direct transmission is admitted, then keep Public Release Permission as a later separate interaction.

### Key decisions made

- DOCX is the default professional editable export and carries the explicit editable/round-trip fidelity contract.
- Markdown serves two separately named roles: an internal bounded/streamed Agent Exchange Projection and a user-selected fallback export. It is never Manuscript Revision authority, and an agent's Markdown output creates only a Proposal/change set.
- PDF is a user-visible fixed-layout option with no editable round-trip promise.
- Export Fidelity Review exposes preserved, degraded, and unavailable rich-document classes per format; material degradation is never pre-accepted or silently substituted.
- Delivery Package Purpose and Local Export Destination are distinct. A frozen Prepared Delivery Package cannot gain another format without a new package version; Question 43 subsequently excluded external-channel identity from V1.
- ADR 0006 was required because this format split fixes a difficult-to-reverse conversion/agent boundary, is surprising without the Manuscript Revision authority context, and trades richer multi-representation management for professional DOCX fidelity, Agent-friendly exchange, and optional fixed-layout output.

### Resume Prompt

Resume at Question 43/60 by deciding whether V1 should be local-export-first with a separate editor-recorded handoff, recommending that direct external-channel integrations remain deferred while exact local receipts and non-public handoff records stay distinct from Public Release Permission.

## UI/UX V2 decision checkpoint — Question 43/60

### What's done

- Accepted the owner's correction that the proposed handoff/external-delivery step is unnecessary and recorded D-044 in `docs/ui-ux-v2/README.md`: V1 ends at local export.
- Reshaped `Handoff Purpose and Target` into the narrower `Delivery Package Purpose` and added `Local-only Export Boundary` in `docs/ui-ux-v2/CONTEXT.md` and `docs/ui-ux-v2/GLOSSARY.md`.
- Updated `docs/ui-ux-v2/requirements.md`, `docs/ui-ux-v2/information-architecture.md`, `docs/ui-ux-v2/interaction-spec.md`, and `docs/ui-ux-v2/visual-direction.md` to remove direct email/cloud-drive/OA transmission, recipient tracking, handoff records, delivery confirmation, and any post-receipt send action.
- Recorded the Q43 resolution in `docs/ui-ux-v2/DECISION-QUEUE.md`; no ADR was created.

### What's next

- Ask Question 44/60 about the minimal user-facing Public Release Permission interaction when V1 itself never transmits or publishes a file.
- Continue with recovery, offline/crash/unsaved-state, learning/audit, settings/data location, professional accessibility, visual-density, and V1 migration branches.

### Key decisions made

- `已导出到所选位置` is the terminal V1 export success state and requires the exact Local Export Effect Receipt.
- V1 has no direct external-channel integration, recipient/channel field, `记录已交接`, `确认送达`, or manually asserted delivery state.
- A local receipt proves only atomic publication to the selected Windows target; it never becomes `已发送`, `已交付`, `已确认送达`, or Public Release evidence.
- Delivery Package Purpose remains useful package metadata but contains no recipient or external destination; Local Export Destination is the only V1 destination.
- No ADR was required because a later external-channel Effect flow can be added independently without changing historical local export identities or receipts.

### Resume Prompt

Resume at Question 44/60 by deciding how Public Release Permission should appear in a local-export-only V1, recommending an exact-version permission/readiness record that never blocks ordinary internal local export and never claims AI7 performed publication.

## UI/UX V2 decision checkpoint — Question 44/60

### What's done

- Accepted the owner's target-house terminology correction and recorded D-045 in `docs/ui-ux-v2/README.md`: ordinary export remains unaware of publication authority, while the relevant user-facing exact-version action is `设为发稿版本` and its result is `发稿版本`.
- Added `Publication Version`, `Set as Publication Version`, and `Publication Version Change Notice` to `docs/ui-ux-v2/CONTEXT.md` and `docs/ui-ux-v2/GLOSSARY.md`.
- Updated `docs/ui-ux-v2/requirements.md`, `docs/ui-ux-v2/information-architecture.md`, `docs/ui-ux-v2/interaction-spec.md`, and `docs/ui-ux-v2/visual-direction.md` with exact-version selection, publication scope, compact consequence wording, separate internal permission identity, non-inheritance after material edits, version-history treatment, and no-export/no-publication implications.
- Created `docs/ui-ux-v2/adr/0007-use-publication-version-as-public-release-permission-projection.md` and recorded the resolution in `docs/ui-ux-v2/DECISION-QUEUE.md`.
- Inspected recovery facts from exact architecture object `247b7dacb267ba2f4076ca8461c95e5f0508b343` and exact UI freeze object `587d6455f6a578d3df8a39f534ec7a057c07a18c`: durable journal acknowledgment is separate from checkpoints; recovered working state/checkpoints/verified Recovery Snapshots stay distinct; restoration creates a descendant; renderer/main/service crashes recover from service-owned stores; local editing/recovery remains provider/Harness independent; and startup must not silently discard or overwrite newer journal state.

### What's next

- Ask Question 45/60 only for the remaining recovery-presentation tradeoff, then continue through learning/audit, settings/data location, professional accessibility, visual-density, microcopy/notification, and V1 migration branches.

### Key decisions made

- The target-house UI never shows `公开发布候选`, `公开发布许可`, or a generic Public Release Permission workflow; it uses `发稿版本` language.
- Publication Version is a specialized designation over one exact immutable Milestone Version, not a free label or alias for latest working content.
- `设为发稿版本` creates the user-facing designation and a separately identified internal Public Release Permission in one deterministic interaction; the two identities never merge.
- Ordinary local export neither requires nor creates this designation. Publication Version means `此精确版本可用于发稿`, never `已发布`, `已发送`, or an Effect outcome.
- Material later edits do not inherit the designation; replacement/withdrawal appends history and future external publication still requires its own Effect Approval/Receipt.
- ADR 0007 was required because this institution-specific authority projection is difficult to rename/remodel later, surprising without context, and trades familiar low-friction language against the need for a distinct auditable permission record.

### Resume Prompt

Resume at Question 45/60 by recommending an affected-Book Recovery Workspace rather than a global modal: compare recovered journal state, last milestone/checkpoint, and verified snapshot; restore only as a new descendant; preserve unresolved alternatives; and keep process/Harness mechanics hidden.

## UI/UX V2 decision checkpoint — Question 45/60

### What's done

- Accepted Question 45 and recorded D-046 in `docs/ui-ux-v2/README.md`: recovery opens a Book-bound comparison workspace, recommends restoring as a new descendant version, and never silently overwrites history.
- Added `Book Recovery Workspace`, `Recovered Working State`, `Recovery State Comparison`, `Restore as New Version`, and `Recovered-state Review Status` to `docs/ui-ux-v2/CONTEXT.md` and `docs/ui-ux-v2/GLOSSARY.md`.
- Updated `docs/ui-ux-v2/requirements.md`, `docs/ui-ux-v2/information-architecture.md`, `docs/ui-ux-v2/interaction-spec.md`, and `docs/ui-ux-v2/visual-direction.md` with single/multiple-Book routing, optional verified snapshots, last acknowledged persistence boundaries, descendant restoration, deferral/salvage, affected-Book read-only protection, post-restore review status, and hidden process diagnostics.
- Recorded the Q45 resolution in `docs/ui-ux-v2/DECISION-QUEUE.md`; no ADR was created because this is a direct UI projection of the accepted manuscript-history/recovery architecture and root ADR 0006.
- Audited whether the recovery UI has real data foundations. The accepted architecture defines per-branch durable Edit Journals, immutable reconstructable Manuscript Revisions/Checkpoints, independently stored verified Recovery Snapshots for high-risk operations, service-owned persistence, and renderer/main/service crash recovery boundaries. The current repository nevertheless contains design only and has no implemented or proven recovery mechanism.

### What's next

- Ask Question 46/60 about live behavior when Edit Journal persistence or the AI7 service becomes temporarily unavailable: immediate read-only mode versus a strictly bounded process-local safety buffer.
- Continue through broader offline/provider behavior, learning/audit, settings/data location, professional accessibility, visual-density, microcopy/notification, and V1 migration branches.

### Key decisions made

- The Recovery Workspace appears only for durable, verifiable candidates; no UI is shown from renderer memory or an unacknowledged save claim alone.
- Recovery compares the latest acknowledged journal reconstruction, relevant checkpoint/milestone, and an applicable verified snapshot when one exists; Recovery Snapshot is not promised for every crash.
- `恢复为新版本` creates an all-or-none descendant Manuscript Revision and does not automatically create a Milestone Version.
- Deferral preserves attention and leaves the affected manuscript read-only for ordinary editing while other Books remain usable, preventing an implicit competing working state.
- Salvage copy/export does not activate recovery; local export still follows its exact Effect/Receipt path.
- Current design gaps remain for the persistence engine, acknowledgement/fsync contract, snapshot representation and retention, recovery-candidate detection/verification, and bounded in-process buffer limits. The UI must never promise recovery beyond the last acknowledged durable boundary.

### Resume Prompt

Resume at Question 46/60 by deciding the live journal/service-failure experience, recommending a short bounded protection buffer with exact at-risk disclosure and safe fallback to read-only rather than either open-ended unsafe editing or immediate keystroke interruption.

## UI/UX V2 decision checkpoint — Question 46/60

### What's done

- Accepted Question 46 and recorded D-047 in `docs/ui-ux-v2/README.md`: temporary Edit Journal/local-service durability interruption enters a strictly bounded Editing Protection Mode, preserving brief IME/typing continuity and switching to Protective Read-only State before safety capacity is exhausted.
- Added `Editing Protection Mode`, `Last Durable Edit Boundary`, `At-risk Edit Extent`, `Bounded Edit Safety Buffer`, and `Protective Read-only State` to `docs/ui-ux-v2/CONTEXT.md` and `docs/ui-ux-v2/GLOSSARY.md`.
- Updated `docs/ui-ux-v2/requirements.md`, `docs/ui-ux-v2/information-architecture.md`, `docs/ui-ux-v2/interaction-spec.md`, and `docs/ui-ux-v2/visual-direction.md` with exact trigger separation, persistent at-risk disclosure, blocked unsafe actions, deterministic automatic retry, exact-rebinding failure handling, capacity transition, safe salvage, and forced-process-loss limitations.
- Recorded the Q46 resolution in `docs/ui-ux-v2/DECISION-QUEUE.md`; no ADR was created because bounded buffering and safe stop already follow the accepted recovery architecture and frozen persistence-failure semantics.
- Inspected exact V1/V2 offline/provider conclusions. Local manuscript access/editing is explicitly provider-, credential-, Harness-, and network-independent; Provider Preflight must resolve exact provider/fallback/outbound/credential/budget bindings before Run Authorization. Neither pinned input decides whether an already authorized offline Task should wait and auto-start when connectivity returns.

### What's next

- Ask Question 47/60 only for the remaining offline Task tradeoff: save as draft and require a later start, or permit an explicitly authorized `联网后自动开始` queued Run under unchanged exact preflight.
- Continue through learning/audit, settings/data location, portable/installer state, professional accessibility, visual-density, component states, microcopy/notification, and V1 migration branches.

### Key decisions made

- Editing Protection Mode concerns local durability only; it is never triggered by Provider, credential, internet, or Harness unavailability.
- Active IME/typing may continue only within a fixed safety envelope independent of manuscript length. The buffer has no authority and cannot expand the recovery guarantee.
- The UI continuously shows the last acknowledged durable boundary and editor-readable at-risk extent and removes every saved implication.
- Unsafe departure and graph-changing commands remain blocked until exact acknowledgement or a safe salvage/resolution path; buffer replay is ordered, deterministic, and never fuzzy.
- At the safety threshold, input stops before loss. Copy/export is salvage only, and a forced process loss may still lose unacknowledged process-local content.
- Provider/network offline is a separate Task/Run availability state and does not weaken local editing, search, history, export, or recovery.

### Resume Prompt

Resume at Question 47/60 by deciding offline Task start behavior, recommending an explicit `授权并在联网后开始` option that creates an exact queued Run and auto-starts only if provider preflight, plan, sources, outbound category, budget, and credentials remain unchanged.

## UI/UX V2 decision checkpoint — Question 47/60

### What's done

- Accepted Question 47 and recorded D-048 in `docs/ui-ux-v2/README.md`: offline users may prepare Tasks and explicitly choose `授权并在联网后开始`, creating one exact authorized Run in Connectivity Wait State.
- Added `Offline Task Preparation`, `Start When Online Action`, `Connectivity Wait State`, and `Reconnect Preflight` to `docs/ui-ux-v2/CONTEXT.md` and `docs/ui-ux-v2/GLOSSARY.md`.
- Updated `docs/ui-ux-v2/requirements.md`, `docs/ui-ux-v2/information-architecture.md`, `docs/ui-ux-v2/interaction-spec.md`, and `docs/ui-ux-v2/visual-direction.md` with offline draft/preview limits, exact boundary eligibility, explicit dual actions, reconnect revalidation, drift/credential handling, cancellation, mid-Run disconnect classification, and no auto-launch while the app/service is closed.
- Recorded the Q47 resolution in `docs/ui-ux-v2/DECISION-QUEUE.md` and added `docs/ui-ux-v2/adr/0008-authorize-exact-runs-for-deferred-connectivity-start.md`. Deferred authorization is difficult to reverse, surprising because execution may begin later without a second click, and trades flow against delayed-consent risk.
- Tightened Q46 wording so Bounded Edit Safety Buffer is never confused with durable recovery evidence, active Chinese IME composition receives reserved completion space before protective read-only, and salvage export appears only when authoritative local service state can create its exact Effect/Receipt.
- Inspected exact V1/V2 and current canonical learning conclusions before Q48: feedback is optional/non-blocking; business decisions already yield Quality Signals; reasons are unselected and choice-first; feedback, Learning Material eligibility, Memory Candidate review, and audit remediation remain separate; Learning Lineage is bidirectional; Editorial Learning is not Model Training; factual correctness never derives from editor preference; and hidden Policy/Composition assets remain developer-controlled.

### What's next

- Ask Question 48/60 only for the remaining feedback-placement tradeoff, recommending one optional contextual reason prompt beside the originating decision/outcome with history in `质量与学习`, rather than modal or centralized mandatory feedback collection.
- Continue with Learning Material eligibility, learning/audit inspection and remediation, settings/data location, portable/installer state, professional accessibility, visual-density, component states, microcopy/notification, and V1 migration branches.

### Key decisions made

- Offline Task preparation is provider-free local work; live-dependent plan facts remain `待联网确认` and are never guessed ready.
- `授权并在联网后开始` exists only when exact provider/outbound/Credential Reference/budget boundaries are locally identifiable; otherwise the only action is saving a Task draft.
- The explicit action creates Run Authorization immediately but performs no provider work until Reconnect Preflight passes under unchanged material boundaries.
- Connectivity wait is distinct from capacity queue, pause, active execution, and local Editing Protection Mode. Waiting remains cancellable.
- Material provider/policy/plan boundary drift replaces auto-start with Plan Revision and renewed authorization. A credential/provider-service readiness blocker under the unchanged boundary preserves authorization and routes to connection remediation; no secret comparison, silent fallback, or draft auto-start is allowed.
- Network return cannot launch a closed desktop app/service, and a mid-Run disconnect uses durable milestone plus safe Resume/Retry semantics rather than fabricated continuity.

### Resume Prompt

Resume at Question 48/60 by deciding where optional result-reason feedback appears, recommending one quiet choice-first prompt at the originating Proposal/Review/Task Outcome, no repeat scoring or attention badge, and global `质量与学习` only for history and governed learning decisions.

## UI/UX V2 decision checkpoint — Question 48/60

### What's done

- Accepted Question 48 and recorded D-049 in `docs/ui-ux-v2/README.md`: AI7 may actively offer one quiet, optional, once-only Contextual Feedback Prompt at its originating Proposal Decision, Review Decision, or clear Task Outcome.
- Generalized `Non-blocking Decision Reason` and added `Contextual Feedback Prompt`, `AI7 Reason Guess`, and `Feedback History View` to `docs/ui-ux-v2/CONTEXT.md` and `docs/ui-ux-v2/GLOSSARY.md`.
- Updated `docs/ui-ux-v2/requirements.md`, `docs/ui-ux-v2/information-architecture.md`, `docs/ui-ux-v2/interaction-spec.md`, and `docs/ui-ux-v2/visual-direction.md` with once-only placement, no duplicate scoring, unselected contextual choices plus free input, explicit guess provenance, dismissal semantics, passive global history, and separation from governed learning/factual/authority decisions.
- Recorded the Q48 resolution in `docs/ui-ux-v2/DECISION-QUEUE.md`; no ADR was created because contextual placement and interruption behavior are reversible UI choices that directly project accepted Quality Signal semantics.
- Reclassified Question 47 under `docs/ui-ux-v2/adr/0008-authorize-exact-runs-for-deferred-connectivity-start.md` and aligned its wording across the candidate docs: material boundary drift requires Plan Revision, while connection/credential readiness blockers preserve the unchanged exact authorization and route to remediation.

### What's next

- Ask Question 49/60 about the default Learning Material eligibility interaction and reuse scope, recommending quiet candidate creation plus an explicit, unselected current-Book-first decision before any Series/House reuse.
- Continue through learning/audit inspection and remediation, settings/data location, portable/installer state, professional accessibility, visual-density, component states, microcopy/notification, and V1 migration branches.

### Key decisions made

- The originating Proposal/Review decision or exact version difference is already a Quality Signal; optional reason capture never asks the editor to score the same judgment twice.
- A Task Outcome by itself is not satisfaction. Only an explicit response to its single optional contextual prompt creates result feedback.
- Every prompt offers two or three unselected contextual alternatives and adjacent free input. Generated wording is labeled `AI7 的猜测`, with acceptance versus correction retained distinctly.
- Dismissal means no reason only. It creates no positive/negative inference, reminder, attention item, Learning Eligibility, memory activation, factual conclusion, or other authority.
- `质量与学习` keeps attributable Feedback History and real governed learning decisions; it is not an ordinary feedback inbox and aggregation grants no cross-Book retrieval.

### Resume Prompt

Resume at Question 49/60 by deciding how a feedback/edit difference becomes eligible Learning Material, recommending a quiet candidate followed only when needed by an explicit unselected Book-first include/exclude/defer decision with broader Series/House scope separately disclosed.

## UI/UX V2 decision checkpoint — Question 49/60

### What's done

- Accepted Question 49 and recorded D-050 in `docs/ui-ux-v2/README.md`: candidate Learning Material is identified quietly, while only a genuine unresolved eligibility decision enters Book-grouped attention and an exact review card.
- Added `Learning Material Review Card`, `Learning Reuse Scope Choice`, and `Learning Eligibility Attention Item` to `docs/ui-ux-v2/CONTEXT.md` and `docs/ui-ux-v2/GLOSSARY.md`.
- Updated `docs/ui-ux-v2/requirements.md`, `docs/ui-ux-v2/information-architecture.md`, `docs/ui-ux-v2/interaction-spec.md`, and `docs/ui-ux-v2/visual-direction.md` with bounded provenance/context, unselected Book-first recommendation, explicit Series/House consequences, exclude/defer/free-input paths, hidden-policy separation, and negative-authority guarantees.
- Recorded the decision in `docs/ui-ux-v2/DECISION-QUEUE.md` and added `docs/ui-ux-v2/adr/0009-use-explicit-book-first-learning-eligibility.md` because reuse-scope defaults are difficult to reverse, surprising across Books, and trade learning value against interruption and accidental scope expansion.
- Changed the remaining interview cadence at the owner's request: beginning with Question 50, questions and recommendations are presented in batches of five while retaining individual decision identities.

### What's next

- Investigate exact fixed facts and publish Questions 50–54/60 as one batch covering learning audit/remediation, settings/data location/distribution presentation, and Chinese professional-work visual/accessibility tradeoffs without re-asking architectural decisions.
- After the owner's batch response, record each accepted/revised decision separately and explain any resulting change to the 60-question total.

### Key decisions made

- Candidate identification creates no immediate follow-up burden. Only a real explicit eligibility decision becomes `学习准入待处理`.
- The UI recommends current-Book eligibility but preselects nothing. Named Series and House scope are separate consequence-led choices.
- Inclusion creates eligibility only. Memory approval/activation, Run source access, provider egress, factual truth, model training, workflow/Effect authority, and publication remain separate.
- Explicit inclusion/exclusion outranks inferred eligibility for the exact material; editors see a plain-language governing basis but do not edit hidden Policy/Composition assets.
- Exclusion preserves origin evidence and lineage; deferral remains unresolved and produces no inferred decision.

### Resume Prompt

Resume by publishing Questions 50–54/60 as one recommended-answer batch after exact-source investigation, with each question remaining separately answerable and no re-questioning of fixed architecture.

## UI/UX V2 interview batch — Questions 50–54/60 prepared

### What's done

- Performed read-only investigation against exact V2 object `247b7dacb267ba2f4076ca8461c95e5f0508b343`, exact V1 freeze object `587d6455f6a578d3df8a39f534ec7a057c07a18c`, and the current canonical learning/domain conclusions; no old session transcript or moving candidate branch was consumed.
- Separated fixed facts from the next five UI/UX choices: Learning Lineage/remediation consequences, local-first provider setup, portable/installer data-location rules, IME/accessibility guarantees, and Windows channel semantics are not re-asked.
- Prepared one five-question batch: Q50 object-centered learning audit presentation; Q51 on-demand model-service setup; Q52 exception-led distribution/data-location disclosure; Q53 limited keyboard remapping under mandatory IME guards; and Q54 separation of workbench density from manuscript reading typography.
- Kept the interview total at 60 because batching changes presentation cadence only and exposes no additional branch.

### What's next

- Await one owner response covering Questions 50–54, allowing per-question acceptance or revision.
- Record each accepted/revised answer as its own decision and update candidate CONTEXT/GLOSSARY immediately; create ADRs only where all three decision criteria remain satisfied.

### Key decisions made

- Beginning with Question 50, questions are shown five at a time but preserve separate numbering, recommendations, and decision records.
- Q50 cannot ask whether lineage is bidirectional or history append-only; only its default information organization and remediation presentation remain open.
- Q51 cannot require Provider setup for local work as a technical necessity; the open choice is onboarding timing and recovery of Task context after setup.
- Q52 cannot change the fixed portable/installer roots or Protected Secret Store boundary; the open choice is normal versus exception prominence.
- Q53 cannot make IME safety, keyboard access, focus, high contrast, or zoom/reflow optional; only shortcut customization scope remains open.
- Q54 may change visual density and reading preferences only as view state; it cannot rewrite manuscript text, DOCX semantics, or export formatting.

### Resume Prompt

Resume by collecting the owner's per-question answers to Questions 50–54/60, then document each decision separately before preparing the final Questions 55–59 batch.

## UI/UX V2 decision checkpoint — Question 50/60

### What's done

- Accepted Question 50 and recorded D-051 in `docs/ui-ux-v2/README.md`: Learning Audit uses a searchable Book-grouped list and object-centered bidirectional influence chain rather than a technical log or default full graph.
- Added `Learning Lineage Explorer`, `Learning Remediation Impact Preview`, and `Historically Affected Result Marker` to `docs/ui-ux-v2/CONTEXT.md` and `docs/ui-ux-v2/GLOSSARY.md`.
- Updated `docs/ui-ux-v2/requirements.md`, `docs/ui-ux-v2/information-architecture.md`, `docs/ui-ux-v2/interaction-spec.md`, and `docs/ui-ux-v2/visual-direction.md` with backward/forward tracing, progressive audit detail, future/running/history impact separation, append-only re-inclusion, and same-scope batch remediation.
- Recorded Q50 in `docs/ui-ux-v2/DECISION-QUEUE.md`; no ADR was created because the choice is reversible information organization directly projecting fixed Learning Audit semantics.

### What's next

- Record accepted Question 51 on on-demand Model Service setup and preserved Task return context.

### Key decisions made

- `学习回溯` is object-centered and Book-grouped; exact lineage remains reachable without becoming an unbounded graph.
- Every result can trace why it was influenced, and every material/memory item can trace later influence.
- Remediation never rewrites completed output or deletes original evidence; running work pauses for revalidation and completed history receives a later-impact marker.
- Batch remediation never hides scope expansion or coerces incompatible/drifted items.

### Resume Prompt

Resume by recording Question 51/60 as local-first on-demand Model Service configuration with one contextual blocker and exact Task draft return.

## UI/UX V2 decision checkpoint — Question 51/60

### What's done

- Accepted Question 51 and recorded D-052 in `docs/ui-ux-v2/README.md`: first launch is local-first and Model Service setup begins only when explicitly opened or required by a model-dependent Task.
- Added `On-demand Model Service Setup`, `Model Connection Blocker Card`, and `Model Setup Return Point` to `docs/ui-ux-v2/CONTEXT.md` and `docs/ui-ux-v2/GLOSSARY.md`; also corrected the Q50 Chinese UI term to `学习来源链视图` so it does not collide with canonical `Learning Lineage / 学习来源链`.
- Updated `docs/ui-ux-v2/requirements.md`, `docs/ui-ux-v2/information-architecture.md`, `docs/ui-ux-v2/interaction-spec.md`, and `docs/ui-ux-v2/visual-direction.md` with contextual blocking, exact Task return, role-first Settings, protected credential replacement/removal, budget placement and separate Usage history.
- Recorded Q51 in `docs/ui-ux-v2/DECISION-QUEUE.md`; no ADR was created because on-demand timing is reversible and follows the fixed independence of local work from Provider/credential/network state.

### What's next

- Record accepted Question 52 on exception-led distribution-channel and Product Data Location presentation.

### Key decisions made

- Provider setup never blocks Book creation/import or healthy local work.
- A model-dependent Task retains its exact draft and returns from Settings without acquiring authorization or silently starting.
- Settings is Model Role-first; Provider/model/fallback/credential and budget detail are progressively disclosed.
- Saved secret values cannot be redisplayed or exported; `已连接` is readiness, not outbound or Run authority.

### Resume Prompt

Resume by recording Question 52/60 as Settings-centered channel/data-location disclosure with exception-driven notices and no arbitrary V1 data-root selector.

## UI/UX V2 decision checkpoint — Question 52/60

### What's done

- Accepted Question 52 and recorded D-053 in `docs/ui-ux-v2/README.md`: normal channel/data-location state is secondary Settings content, while unwritable fallback, sync/backup exposure and prohibited placement produce exact exception-led notices.
- Added `Distribution Channel Status`, `Data and Storage Summary`, `Data Location Exception State`, and `Data Location Remediation Guidance` to `docs/ui-ux-v2/CONTEXT.md` and `docs/ui-ux-v2/GLOSSARY.md`.
- Updated `docs/ui-ux-v2/requirements.md`, `docs/ui-ux-v2/information-architecture.md`, `docs/ui-ux-v2/interaction-spec.md`, and `docs/ui-ux-v2/visual-direction.md` with channel-specific location truth, credential separation, fallback/sync/prohibited states, secondary location viewing and no arbitrary V1 root picker.
- Recorded Q52 in `docs/ui-ux-v2/DECISION-QUEUE.md`; no ADR was created because the storage/channel boundary is already fixed and only its reversible presentation was chosen.

### What's next

- Record accepted Question 53 with limited shortcut remapping and the owner's refinement that every action needs a discoverable reachable entry, not permanent always-on chrome.

### Key decisions made

- Normal data/channel status lives under `设置 > 数据与存储`; only exceptions surface contextually.
- Portable fallback reports the real location and loss of complete self-containment. Sync exposure warns without blocking.
- A prohibited location routes to plain guided remediation rather than technical risk judgment.
- Credentials remain Windows-protected and separate in every channel/state.
- V1 has no arbitrary Agent Data Root picker; `查看数据位置` changes no path, scope or authority.

### Resume Prompt

Resume by recording Question 53/60 as Windows-first limited shortcut remapping plus discoverable action entries that may live in labeled disclosures or secondary menus.

## UI/UX V2 decision checkpoint — Question 53/60

### What's done

- Accepted Question 53 with the owner's refinement and recorded D-054 in `docs/ui-ux-v2/README.md`: shortcut remapping is limited, IME commands are guarded, and action discoverability does not require permanent always-on controls.
- Added `Limited Shortcut Remapping`, `IME-safe Command Guard`, and `Discoverable Action Entry` to `docs/ui-ux-v2/CONTEXT.md` and `docs/ui-ux-v2/GLOSSARY.md`.
- Updated `docs/ui-ux-v2/requirements.md`, `docs/ui-ux-v2/information-architecture.md`, `docs/ui-ux-v2/interaction-spec.md`, and `docs/ui-ux-v2/visual-direction.md` with command categories, conflict/reset behavior, authority-shortcut limits, menu/disclosure placement, focus restoration and unconditional keyboard/accessibility guarantees.
- Recorded Q53 in `docs/ui-ux-v2/DECISION-QUEUE.md`; no ADR was created because the remapping/placement boundary is reversible and constrained by fixed IME/accessibility semantics.

### What's next

- Record accepted Question 54 with separate workbench density and manuscript reading preferences, resizable subpages, importance-based visibility, and a required detached reading window whose edit/synchronization authority becomes Question 55.

### Key decisions made

- Only navigation, search and view commands may be remapped; Windows/editor/IME behavior remains stable.
- Consequential authority and destructive actions have no global shortcut and cannot bypass their exact focused surfaces.
- Every action has a labeled pointer/keyboard path, but secondary/infrequent actions may be folded into a predictable menu hierarchy.
- Current primary, safety and named authority actions remain directly visible when actionable.

### Resume Prompt

Resume by recording Question 54 and increasing the interview total to 61 because the requested detached Manuscript reading window exposes a new read-only-versus-concurrent-edit authority decision.

## UI/UX V2 decision checkpoint — Question 54/61

### What's done

- Accepted Question 54 with owner additions and recorded D-055 in `docs/ui-ux-v2/README.md`: workbench density and manuscript reading typography are separate, typography is user-adjustable, subpages/regions are resizable, lower-importance surfaces may hide/close, and manuscript reading can open in an independent window.
- Added `Workspace Density Mode`, `Manuscript Reading Preset`, `View-only Typography Preference`, `Resizable Workspace Region`, `Optional Surface Visibility`, and `Detached Manuscript Reader` to `docs/ui-ux-v2/CONTEXT.md` and `docs/ui-ux-v2/GLOSSARY.md`.
- Updated `docs/ui-ux-v2/requirements.md`, `docs/ui-ux-v2/information-architecture.md`, `docs/ui-ux-v2/interaction-spec.md`, and `docs/ui-ux-v2/visual-direction.md` with standard/compact scope, adjustable reading defaults, local-only typography, accessible resizing/reset, importance-based visibility and a bounded separate Reader window.
- Recorded Q54 in `docs/ui-ux-v2/DECISION-QUEUE.md`; density/layout choices require no ADR, while the newly exposed detached-window authority choice becomes Q55.
- Increased the interview total from 60 to 61 because the independent reading window requires an explicit read-only-versus-concurrent-edit and cross-window synchronization decision.

### What's next

- Publish Questions 55–59/61 as one batch. Question 55 resolves Detached Manuscript Reader authority; Questions 56–59 cover remaining visual theme/tokens, component-state hierarchy, microcopy/error language, and V1 semantic migration/coverage closure without treating frozen geometry as baseline.

### Key decisions made

- Standard/compact density changes workbench metadata spacing only; manuscript readability, decisions, errors, focus and target usability remain protected.
- Font family, size, line height, text width and related reading display are adjustable local preferences and never alter content or export.
- Work regions support pointer/keyboard resizing, safe minimums, responsive stacking and reset.
- Lower-importance projections may hide/close; required identity, durability/recovery, blocker, consequence and authority states retain a named persistent entry.
- Detached reading is required and remains a bounded service projection; its edit/synchronization contract is not assumed.

### Resume Prompt

Resume by publishing Questions 55–59/61 as one batch, recommending a service-backed read-only detached Reader with independent navigation before the remaining visual/microcopy/migration choices.

## UI/UX V2 interview batch — Questions 55–59/61 prepared

### What's done

- Investigated the newly exposed multi-window branch against exact V2 process/renderer authority and current recovery semantics; prepared Q55 around read-only versus concurrent-edit authority, acknowledged-state synchronization, navigation and window lifecycle.
- Re-read exact V1 freeze object `587d6455f6a578d3df8a39f534ec7a057c07a18c` for visual-state, accessibility, microcopy, fourteen-journey and migration semantics while excluding its color values, geometry, HTML prototype, Figma frames and component implementation.
- Prepared Q56 on system-following light/dark themes under mandatory Windows forced colors; Q57 on one presentation grammar without collapsing domain states; Q58 on consequence-first two-layer Chinese microcopy; and Q59 on V1 retain/reshape/drop with all fourteen journey IDs retained.
- Identified two existing journey documentation seams for later closure rather than questioning facts: J-01 lacks an explicitly named successful-import evidence/receipt mapping, and J-13 lacks complete Series membership/knowledge-exclusion interaction in the V2 candidate.

### What's next

- Await one owner response covering Questions 55–59/61.
- Record each answer separately. If Q55 accepts the read-only service-backed Reader recommendation, create an ADR for its multi-window authority/synchronization contract.
- Then prepare the remaining Questions 60–61 as the final shorter batch; do not inflate the question tree merely to fill five positions.

### Key decisions made

- Windows high contrast/forced colors, IME, focus, keyboard reachability, zoom/reflow and non-color meaning are fixed guarantees and do not appear as selectable alternatives.
- Theme may change visual tokens only; it cannot change state meaning, authority or export.
- A unified component grammar must preserve precise domain state labels rather than normalize them to generic success/warning/error.
- Microcopy must expose consequence and safe next action while keeping diagnostics secondary and sanitized.
- V1 migration retains semantic journeys, reshapes them into accepted V2 authority/language, and drops old geometry/prototype/Figma/gate assumptions.

### Resume Prompt

Resume by collecting the owner's per-question response to Questions 55–59/61, creating ADR 0010 only if the detached Reader authority recommendation is accepted, then documenting the final two-question batch.

## UI/UX V2 decision checkpoint — Question 55/61

### What's done

- Accepted the owner's Q55 revision and recorded D-056 in `docs/ui-ux-v2/README.md`: the independent manuscript window hosts the same editable manuscript subpage rather than a read-only or parallel copy.
- Replaced `Detached Manuscript Reader` with `Detached Manuscript Window` and added `Manuscript Surface Transfer`, `Active Manuscript Surface Binding` and `Detached Manuscript Placeholder` across `docs/ui-ux-v2/CONTEXT.md` and `docs/ui-ux-v2/GLOSSARY.md`.
- Updated `docs/ui-ux-v2/requirements.md`, `docs/ui-ux-v2/information-architecture.md`, `docs/ui-ux-v2/interaction-spec.md` and `docs/ui-ux-v2/visual-direction.md` with the single-active-surface invariant, workbench placeholder, full eligible page operations, IME/journal transfer guard, protected-buffer boundary and safe reattachment/close behavior.
- Added `docs/ui-ux-v2/adr/0010-transfer-one-editable-manuscript-surface-between-windows.md` and recorded the resolved branch in `docs/ui-ux-v2/DECISION-QUEUE.md`.

### What's next

- Record accepted Question 56 with a system-following light/dark theme preference under unconditional Windows high-contrast/forced-colors control.

### Key decisions made

- Detachment is re-hosting, not copying or synchronizing; one exact Book/manuscript/branch has one interactive Renderer surface.
- The detached window retains all operations already eligible on the manuscript subpage but gains no new scope or authority.
- The source remains active until the target is ready and the service atomically switches the input binding; failure cannot create two writable surfaces or no writable surface.
- IME composition, pending journal acknowledgement and at-risk process-local buffers cannot be forced or moved merely to satisfy a window transition.
- Ordinary detached-window close safely reattaches to the workbench; page/window location changes no Run, decision, Effect, receipt or manuscript authority.

### Resume Prompt

Resume by recording Question 56/61 as a system-following light/dark application theme with manual override and Windows high-contrast/forced-colors priority.

## UI/UX V2 decision checkpoint — Question 56/61

### What's done

- Accepted Question 56 and recorded D-057 in `docs/ui-ux-v2/README.md`: `跟随系统` is the default Application Theme Preference, with manual `浅色`/`深色` alternatives and coherent behavior across every AI7 window.
- Added `Application Theme Preference`, `System-following Theme` and `Forced-colors Override` to `docs/ui-ux-v2/CONTEXT.md` and `docs/ui-ux-v2/GLOSSARY.md`.
- Updated `docs/ui-ux-v2/requirements.md`, `docs/ui-ux-v2/information-architecture.md`, `docs/ui-ux-v2/interaction-spec.md` and `docs/ui-ux-v2/visual-direction.md` with appearance navigation, light/dark surface direction, semantic color roles, state-preserving switching and unconditional Windows forced-colors control.
- Recorded Q56 in `docs/ui-ux-v2/DECISION-QUEUE.md`; no ADR was created because the decision is reversible display configuration and does not change authority or stored document semantics.

### What's next

- Record accepted Question 57 with one cross-surface presentation grammar that preserves exact domain-state names and reserves authoritative completion treatment for verified records/receipts.

### Key decisions made

- The default follows Windows light/dark application preference; manual overrides remain local and apply to all AI7 windows.
- Windows high contrast/forced-colors wins over decorative theme and is not an optional appearance preset.
- Components use semantic roles; color alone never communicates focus, status, fact, authority or completion.
- Light mode retains cool-neutral chrome plus a slightly warm manuscript surface; dark mode is low-glare charcoal/neutral without pure black/white glare.
- V1 has no custom palette, and theme changes no content, export, record, Task or authority.

### Resume Prompt

Resume by recording Question 57/61 as a unified semantic-state presentation grammar without collapsing exact AI7 domain states into generic traffic-light status.

## UI/UX V2 decision checkpoint — Question 57/61

### What's done

- Accepted Question 57 and recorded D-058 in `docs/ui-ux-v2/README.md`: all components use one restrained Semantic State Presentation Grammar while preserving exact AI7 domain-state names and consequences.
- Added `Semantic State Presentation Grammar` and `Authoritative Completion Styling` to `docs/ui-ux-v2/CONTEXT.md` and `docs/ui-ux-v2/GLOSSARY.md`.
- Updated `docs/ui-ux-v2/requirements.md`, `docs/ui-ux-v2/information-architecture.md`, `docs/ui-ux-v2/interaction-spec.md` and `docs/ui-ux-v2/visual-direction.md` with cross-surface focus/selection/disabled/loading/error rules, non-color semantics, exact-state examples and receipt-backed completion styling.
- Recorded Q57 in `docs/ui-ux-v2/DECISION-QUEUE.md`; no ADR was created because the grammar is an evolvable presentation layer over fixed authority distinctions.

### What's next

- Record accepted Question 58 with consequence-first, two-layer Chinese microcopy and sanitized technical detail.

### Key decisions made

- Shared component grammar is `精确中文状态词 + 图标或形状 + 必要边界/结构 + 可选详情与安全下一步`.
- Selection, disabled, projection loading, domain work/wait, error/recovery and authoritative completion remain distinguishable across all themes without color alone.
- Exact business states never collapse into a traffic-light success/warning/error taxonomy.
- Only supporting AI7 records, classified outcome evidence or verified Effect Receipts qualify for authoritative completion styling.
- Model/Harness completion, tool results and optimistic animation remain provisional and cannot imply business completion.

### Resume Prompt

Resume by recording Question 58/61 as consequence-first two-layer Chinese microcopy with retained input, exact safe-next-action language and sanitized secondary diagnostics.

## UI/UX V2 decision checkpoint — Question 58/61

### What's done

- Accepted Question 58 and recorded D-059 in `docs/ui-ux-v2/README.md`: AI7 uses consequence-first Chinese microcopy with one concise editor layer and sanitized secondary technical detail.
- Added `Consequence-first Message`, `Safe-next-action Copy` and `Sanitized Technical Detail` to `docs/ui-ux-v2/CONTEXT.md` and `docs/ui-ux-v2/GLOSSARY.md`.
- Updated `docs/ui-ux-v2/requirements.md`, `docs/ui-ux-v2/information-architecture.md`, `docs/ui-ux-v2/interaction-spec.md` and `docs/ui-ux-v2/visual-direction.md` with object/state headings, verb/object actions, retained-input behavior, modal threshold, exact time display, ambiguous-outcome wording and sanitized support disclosure.
- Recorded Q58 in `docs/ui-ux-v2/DECISION-QUEUE.md`; no ADR was created because microcopy is an evolvable presentation rule constrained by existing privacy and authority boundaries.

### What's next

- Record accepted Question 59 by creating the V1 retain/reshape/drop mapping and V2 fourteen-journey continuity document from exact frozen object `587d6455f6a578d3df8a39f534ec7a057c07a18c`.

### Key decisions made

- Primary messages answer what object changed, what consequence follows, what remains safe/unchanged and what the next safe action is.
- Headings are `对象 + 状态` and actions are `动词 + 对象`; generic approval, continue, save, completion and retry copy is prohibited where it obscures semantics.
- Field errors retain input; record errors remain with exact records; durability/authority blockers keep a named persistent anchor.
- Technical diagnostics are secondary and sanitized of manuscript excerpts, credentials, request bodies, raw transcripts and hidden behavior/policy content.
- Ambiguous external outcomes route to investigation/reconciliation rather than ordinary Retry.

### Resume Prompt

Resume by recording Question 59/61 with `migration-from-v1.md` and `journeys.md`, retaining all fourteen semantic journey IDs while reshaping them into accepted V2 authority/language and dropping frozen geometry/prototype artifacts.

## UI/UX V2 decision checkpoint — Question 59/61

### What's done

- Accepted Question 59 and recorded D-060 in `docs/ui-ux-v2/README.md`: portable V1 semantics and all fourteen journey IDs are retained, their interactions are reshaped through accepted V2 authority/language, and frozen visual/implementation/gate artifacts are dropped.
- Created `docs/ui-ux-v2/migration-from-v1.md` with the exact-source authority boundary and a detailed retain/reshape/drop map.
- Created `docs/ui-ux-v2/journeys.md` with V2 candidate continuity for `J-01`–`J-14`, cross-journey invariants and explicit notes for target-house milestone/export, Rewind and Series scope.
- Added `V1 Semantic Retention`, `V1 Interaction Reshaping` and `V1 Artifact Drop` to `docs/ui-ux-v2/CONTEXT.md` and `docs/ui-ux-v2/GLOSSARY.md`.
- Updated `docs/ui-ux-v2/requirements.md`, `docs/ui-ux-v2/information-architecture.md`, `docs/ui-ux-v2/interaction-spec.md` and `docs/ui-ux-v2/visual-direction.md` with migration authority, journey-continuity and no-inherited-gate rules.
- Recorded Q59 in `docs/ui-ux-v2/DECISION-QUEUE.md`; no ADR was created because the mapping documents already accepted decisions and reference provenance rather than selecting a new irreversible product boundary.

### What's next

- Publish final Questions 60–61/61 as a short batch. Q60 closes `J-01` import-completion evidence and `J-13` Series membership/knowledge-exclusion interaction; Q61 decides whether to close this design session as a normative candidate documentation package without prototype/Figma/implementation.

### Key decisions made

- Every `J-01`–`J-14` business outcome survives even when its frozen screen, component or validation method is dropped.
- Book-first context, named authority/factual distinctions, Proposal/Effect boundaries, recovery/continuation semantics, DOCX fidelity and Windows professional behavior are retained.
- The accepted V2 workbench, task execution, model-role, milestone/publication, local-export, learning, theme, state and detached-window designs reshape those outcomes.
- Frozen A/B/C geometry, prototype/Figma/component assets, exact tokens, developer metaphors, formal Signoff/external-delivery UI and independent validation gates are not V2 baselines.
- Only `J-01` completion-evidence naming and `J-13` membership management remain as journey-design seams.

### Resume Prompt

Resume by asking Questions 60–61/61 as the final short batch: recommend one named successful-import completion record and a dedicated Series membership preview/command interaction, then recommend closing the design as a documentation-only candidate package with no prototype, Figma or implementation.

## UI/UX V2 final interview batch — Questions 60–61/61 prepared

### What's done

- Investigated the two remaining journey seams against exact architecture object `247b7dacb267ba2f4076ca8461c95e5f0508b343` and the current V2 candidate rather than asking the owner for discoverable facts.
- Confirmed that successful import already requires atomic persistence of the original file record, Import Fidelity Review, provenance and resulting Manuscript Revision; the architecture does not require the user-facing completion proof to masquerade as an export/apply receipt.
- Confirmed that Series is an accepted explicit sharing exception, Series scope/exclusions freeze into each authorized Run, membership changes do not retroactively alter that frozen scope, and every manuscript mutation remains targeted to one Book.
- Prepared Q60 as one journey-closure package: a durable user-facing Manuscript Import Record plus an exact previewed Series membership command with future/running/history consequences and no implicit source/learning/provider/mutation expansion.
- Prepared Q61 to close the 61-question interview as a documentation-only candidate UI/UX package, leaving implementation, prototype, Figma, tests, verification and formal review to separately authorized work.

### What's next

- Ask Questions 60–61/61 as the final short batch and await the owner's per-question response.

### Key decisions made

- The interview total remains 61: Q60 closes two already identified journey-documentation seams as one continuity package and opens no new product branch; Q61 decides candidate-design closure.
- `稿件导入记录` is recommended as editor-facing completion evidence, with `稿件已导入` only after all required records persist; it is not automatically labeled an Effect Receipt, Manuscript Checkpoint or export receipt.
- Series membership needs `成员与共享范围`, an impact preview, exact `加入书系 / 移出书系` commands and a durable change record. Membership alone grants no Run source scope, learning eligibility, provider transmission or mutation authority.
- Removal affects future membership-derived selection/recommendation; already frozen Runs and immutable history remain exact, while related governed knowledge/eligibility records follow their own review/remediation paths.

### Resume Prompt

Resume by asking the owner Q60/61 to accept or modify the import/Series journey-closure package and Q61/61 to accept documentation-only candidate design closure without implementation, prototype or Figma work.

## UI/UX V2 decision checkpoint — Question 60/61

### What's done

- Accepted Question 60 and recorded D-061 in `docs/ui-ux-v2/README.md`, closing `J-01` and `J-13`.
- Added `Manuscript Import Record`, `Series Membership and Sharing Scope`, `Series Membership Impact Preview` and `Series Membership Change Record` to `docs/ui-ux-v2/CONTEXT.md` and `docs/ui-ux-v2/GLOSSARY.md`.
- Updated `docs/ui-ux-v2/requirements.md`, `docs/ui-ux-v2/information-architecture.md`, `docs/ui-ux-v2/interaction-spec.md` and `docs/ui-ux-v2/visual-direction.md` with durable import completion and exact Series membership/shared-scope interactions.
- Updated `docs/ui-ux-v2/journeys.md` so every `J-01`–`J-14` entry is mapped, and updated `docs/ui-ux-v2/migration-from-v1.md` to close its former journey seams.
- Recorded Q60 in `docs/ui-ux-v2/DECISION-QUEUE.md`; no ADR was created because the accepted interaction projects fixed import/Series/per-Run-scope semantics and does not select a new hard-to-reverse architecture boundary.

### What's next

- Record accepted Question 61 by marking the documentation-only candidate design complete, closing the decision queue and preparing the Commander handoff without implementation, prototype, Figma, tests, verification, review, merge or push.

### Key decisions made

- `稿件已导入` requires durable original-file, fidelity, degradation/provenance and resulting-revision records; `稿件导入记录` remains Book-owned and reachable after transient UI disappears.
- Import completion is not a Manuscript Checkpoint, Milestone Version, export/Apply receipt or round-trip guarantee.
- `成员与共享范围` separates member Books, governed Series Knowledge, exclusions and history; it never becomes an ambient merged manuscript browser.
- Membership affects explicit future Series-scope availability only. Frozen Runs and immutable history stay exact, while related learning/knowledge records keep separate governance.
- Exact `加入书系 / 移出书系` commands append a durable change record; no generic approval or implicit authority expansion occurs.

### Resume Prompt

Resume by recording Question 61/61 as documentation-only candidate completion, then send the source Commander a concise handoff with worktree/branch, artifact map, authority boundary, 61-question completion and the owner's request to add new feature requirements.

## UI/UX V2 decision checkpoint — Question 61/61 and interview completion

### What's done

- Accepted Question 61 and recorded D-062 in `docs/ui-ux-v2/README.md`: the 61-question interview is complete as a documentation-only candidate design with no implementation authority.
- Marked `docs/ui-ux-v2/{CONTEXT,GLOSSARY,requirements,information-architecture,interaction-spec,visual-direction,migration-from-v1,journeys}.md` complete for this session and closed `docs/ui-ux-v2/DECISION-QUEUE.md`.
- Created `docs/ui-ux-v2/HANDOFF.md` with the authority boundary, full artifact inventory, high-level result, explicit non-actions, integration boundary and the owner's request for a new feature-requirement intake.
- Recorded that exact pixel tokens, component-library assets, Figma frames and runnable prototypes are later separately authorized artifacts, not unresolved product semantics.

### What's next

- Send the completed handoff to source Commander thread `01a02273-a4f7-7fa1-8d66-7130f7566cd4`, including the worktree/branch and the owner's explicit need to add new feature requirements.

### Key decisions made

- The candidate package is normative UI/UX input for this session but remains subordinate to exact V2 architecture and future explicitly accepted product decisions.
- No open interview question remains; future features reopen only affected branches as explicit deltas.
- Completion authorizes no code, prototype, Figma, test, verification, review, merge, push, publish or release action.
- Commander should start new feature-requirement intake before any implementation dispatch.

### Resume Prompt

Resume by sending the source Commander the completed UI/UX V2 handoff and owner request for new feature requirements; do not merge, push, publish or implement.

## UI/UX V2 Commander handoff prepared

### What's done

- Recorded the exact task worktree `C:\Users\Chooo\.codex\worktrees\aafe\ai7-harness` and detached base `c8cbe26c4cccc4a912b3bbc05bd5b23fbf5468b9` in `docs/ui-ux-v2/HANDOFF.md`.
- Prepared a source-thread message that points Commander to the complete candidate package, closed 61-question history, ten ADRs, exact authority inputs and uncommitted worktree state.
- Included the owner's explicit instruction that Commander should start a new feature-requirement intake/delta before implementation.

### What's next

- Deliver the prepared handoff message to source Commander thread `01a02273-a4f7-7fa1-8d66-7130f7566cd4`.

### Key decisions made

- No branch, commit, merge or push is created as part of handoff; Commander receives the exact worktree/base and retains integration authority.
- New feature requirements are a next design-intake task, not permission to implement or silently edit the completed candidate.

### Resume Prompt

Resume by sending the prepared handoff to Commander thread `01a02273-a4f7-7fa1-8d66-7130f7566cd4` and recording delivery status in `PROGRESS.md`.

## UI/UX V2 Commander handoff delivery

### What's done

- Submitted the complete handoff message to source Commander thread `01a02273-a4f7-7fa1-8d66-7130f7566cd4` with artifact paths, exact worktree/base, authority inputs, high-level design outcome, explicit non-actions and the owner's request for a new feature-requirement intake.
- The Codex desktop thread service did not return a completion result; subsequent source-thread read and list calls also did not return and were terminated after bounded waits. No duplicate message was sent.
- Recorded the unconfirmed side-channel delivery status in `docs/ui-ux-v2/HANDOFF.md`. The delegated final response will repeat the same handoff so the source Commander receives it through the task return path.

### What's next

- Commander should ingest `docs/ui-ux-v2/HANDOFF.md` and begin the owner-requested new feature-requirement intake before implementation.

### Key decisions made

- Direct side-channel delivery is reported as submitted but unconfirmed; it is not falsely represented as acknowledged.
- The durable worktree handoff and delegated final response are the authoritative return path.
- No retry was issued because the first send may already be queued and a duplicate user-visible Commander message would be undesirable.

### Resume Prompt

Commander: inspect `C:\Users\Chooo\.codex\worktrees\aafe\ai7-harness\docs\ui-ux-v2\HANDOFF.md`, integrate the completed 61-question candidate under dispatch rules, and start a new feature-requirement intake before implementation.

## UI/UX V2 feature-delta intake — Issue #5

### What's done

- The owner authorized design of the two audited feature gaps and requested that the completed V2 UI/UX package and the resulting delta enter Git together.
- Opened GitHub Issue #5, `Design anchored proposal review and reusable procedure capture`, under the canonical tracker rules.
- Attached the former detached candidate worktree to `docs/5-ui-ux-v2-delta` at base `c8cbe26c4cccc4a912b3bbc05bd5b23fbf5468b9`; existing `docs/ui-ux-v2/` content and `PROGRESS.md` remain uncommitted so the prior candidate and new delta can be committed coherently after the interview.
- Loaded `grill-with-docs`, `grilling`, and `domain-modeling`; the delta will be resolved one question at a time, with accepted terms and requirements written immediately.

### What's next

- Run the estimated nine-question feature-delta interview across anchored Proposal cards, independently decidable change units, content/rationale hierarchy, reusable-procedure classification and capture, candidate admission/enablement, scope/versioning, Plugin boundary, and future reuse entry points.
- After the interview, update the candidate package, perform only lightweight documentation consistency checks, and create local commits on Issue #5's branch without push, pull request, merge, implementation, prototype or Figma work.

### Key decisions made

- No feature decision has yet been accepted in Issue #5; the first question decides the mandatory visual/behavioral contract for manuscript-anchored Proposal changes.
- `Task Skill`, `Workflow Profile`, `Default Execution Rule`, and code-bearing `Plugin` remain distinct existing architecture terms and cannot be collapsed merely to simplify the UI.

### Resume Prompt

Resume Issue #5 by asking Question 1/9: recommend exact-range inline Proposal markup with stable margin-card identity for every independently reviewable change, while expanding only the active/nearby card and routing large or structural work through the existing virtualized navigator/dedicated workspace.

## UI/UX V2 feature-delta checkpoint — Question 1/9

### What's done

- The owner accepted exact-range inline Proposal markup plus a compact Proposal Margin Anchor and persistent Manuscript-anchored Proposal Card identity for every independently reviewable change.
- Recorded D-063 and updated `docs/ui-ux-v2/{README,CONTEXT,GLOSSARY,requirements,information-architecture,interaction-spec,visual-direction,journeys,migration-from-v1,DECISION-QUEUE,HANDOFF}.md`.
- Large, cross-chapter, structural, table and long-rewrite work keeps the same change/card identity when it moves into the existing Dedicated Work Workspace; inactive cards collapse and virtualize instead of forming a permanent margin wall.
- No ADR was created because this is a reversible presentation/scaling choice constrained by existing exact-anchor, long-manuscript and Proposal-authority decisions.

### What's next

- Ask Question 2/9 to define the independently decidable Proposal change unit and how adjacent edits may be grouped without losing per-change acceptance/rejection.

### Key decisions made

- AI7 adopts Word-like revision semantics, not Word geometry or implementation.
- Inline proposal marks, margin anchors, card expansion and navigation remain review projections; none is Manuscript text, Proposal Decision or Apply.

### Resume Prompt

Resume by asking Question 2/9: recommend one stable Proposal Change Item per semantically independent editorial claim, allow adjacent items to share one visual card group, and preserve separate accept/reject/defer/edit state for every item.

## UI/UX V2 feature-delta checkpoint — Question 2/9

### What's done

- The owner accepted Proposal Change Item as the independently decidable semantic unit, regardless of card grouping, paragraph proximity, Task/Run origin or one model response.
- Added Atomic Proposal Change Group as the narrow exception when partial acceptance would create an explicitly named internal inconsistency; every member and dependency remains visible and splitting requires a new consistent Proposal version.
- Recorded D-064 and updated `docs/ui-ux-v2/{README,CONTEXT,GLOSSARY,requirements,information-architecture,interaction-spec,visual-direction,journeys,DECISION-QUEUE,HANDOFF}.md`.
- Added candidate ADR `docs/ui-ux-v2/adr/0011-use-proposal-change-items-and-explicit-atomic-groups.md` because the accepted decision fixes hard-to-reverse Proposal-decision granularity and a non-obvious indivisibility exception.

### What's next

- Ask Question 3/9 to fix the anchored card information hierarchy and distinguish AI7's Proposal Change Rationale from proposed wording, sources/evidence, verification status and the editor's optional decision reason.

### Key decisions made

- Visual grouping never merges decision identity.
- Atomic grouping is semantic and exceptional, not a shortcut for batch processing or model-output packaging.

### Resume Prompt

Resume by asking Question 3/9: recommend four fixed card regions—`修改内容`, `修改理由`, `依据与核查`, and `你的处理`—with proposed wording primary, AI7 rationale concise and separate, evidence independently expandable, and editor decision reasons captured only after or alongside disposition.

## UI/UX V2 feature-delta checkpoint — Question 3/9

### What's done

- The owner accepted a stable four-region Manuscript-anchored Proposal Card: `修改内容`, `修改理由`, `依据与核查`, and `你的处理`.
- Added Proposal Change Content, Proposal Change Rationale and Proposal Support Detail to `docs/ui-ux-v2/CONTEXT.md` and `GLOSSARY.md` and kept the existing Non-blocking Decision Reason as the editor-attributed explanation.
- Recorded D-065 and updated `docs/ui-ux-v2/{README,requirements,information-architecture,interaction-spec,visual-direction,DECISION-QUEUE,HANDOFF}.md`.
- No ADR was created because this is a reversible information hierarchy over already separate Proposal content, evidence/verification and editor-decision records.

### What's next

- Ask Question 4/9 to choose the single low-burden user-facing entry and its classification into Default Execution Rule, Task Skill Candidate, Workflow Profile Draft or developer Capability/Plugin Proposal.

### Key decisions made

- Proposed wording is the primary review subject; AI7 rationale is secondary explanation, not evidence or chain of thought.
- Sources and verification states remain independently expandable, while the editor's optional reason stays with `你的处理` and cannot overwrite AI7 rationale.

### Resume Prompt

Resume by asking Question 4/9: recommend one user-facing `保存为可复用工序` action that opens a compact classification preview and produces exactly one of Default Execution Rule, Task Skill Candidate, Workflow Profile Draft or developer Capability/Plugin Proposal without treating those objects as interchangeable.

## UI/UX V2 feature-delta checkpoint — Question 4/9

### What's done

- The owner accepted one low-burden `将以上工序保存为可复用工序` entry followed by a Reusable Procedure Classification Preview.
- The preview recommends exactly one Default Execution Rule, Task Skill Candidate, Workflow Profile Draft or Developer Capability Proposal and explains the professional consequence; it never creates an interchangeable persisted asset type.
- Added Reusable Procedure Capture, Reusable Procedure Classification Preview, Workflow Profile Draft and Developer Capability Proposal to `docs/ui-ux-v2/CONTEXT.md` and `GLOSSARY.md`.
- Recorded D-066 and updated `docs/ui-ux-v2/{README,requirements,information-architecture,interaction-spec,visual-direction,DECISION-QUEUE,HANDOFF}.md`.
- No ADR was created because existing architecture already fixes the four object/authority boundaries; the unified entry and classification preview are reversible presentation choices.

### What's next

- Ask Question 5/9 to define which completed operations may be captured and what reusable information is extracted versus excluded.

### Key decisions made

- Ordinary editors need not choose Skill, Workflow or Plugin terminology before invoking capture.
- Plugin remains a developer implementation possibility, never a directly generated, installed or enabled editor asset.

### Resume Prompt

Resume by asking Question 5/9: recommend capture from one completed Run or an explicitly selected sequence of completed user-visible steps, extracting reusable intent/steps/inputs/outputs while excluding Book content, credentials, factual outcomes, decisions, receipts, failures and hidden Harness activity.

## UI/UX V2 feature-delta checkpoint — Question 5/9

### What's done

- The owner accepted one completed Run or an explicit ordered selection of completed user-visible editorial steps as the only Procedure Capture Source Set.
- Added an editable Reusable Procedure Extraction Preview with `将提取什么` and `不会保存什么`, including add/remove/reorder and explicit corrected-step handling.
- Recorded D-067, V2-UX-REUSE-011–020, new context/glossary terms, interaction/IA/visual consequences and ADR 0012 in `docs/ui-ux-v2/`.

### What's next

- Ask Question 6/9 to separate low-burden save from independent admission, enablement or Workflow Profile activation.

### Key decisions made

- Reusable assets retain parameterized business structure and abstract requirements, not manuscript/Book/source instance content, secrets, concrete provider/model bindings, conclusions, prior decisions, authority, receipts or hidden Harness activity.
- Local capture provenance is separate from reusable asset content, and AI7 never captures ambient recent activity silently.

### Resume Prompt

Resume by asking Question 6/9: recommend `仅保存草稿` versus `保存并检查`, followed by separately named explicit enablement or profile publication; the authoring Run must not validate, install or activate its own output.

## UI/UX V2 feature-delta checkpoint — Question 6/9

### What's done

- The owner accepted separate `仅保存候选版本`, `保存并送交检查`, independent admission/checking and `查看权限上限并启用` interactions for Task Skill results.
- Recorded D-068 and V2-UX-REUSE-021–028 plus the lifecycle IA, interaction table and visual state grammar in `docs/ui-ux-v2/`.
- Recorded the owner's new requirement for a centralized automation-management entry, version grouping, per-version Deliverable navigation, manual deletion and latest-version default resolution as the Question 7 branch.

### What's next

- Resolve manual deletion semantics and the exact safe meaning of `latest version`, then design the centralized management surface.

### Key decisions made

- The authoring Run cannot validate, install, enable, approve, promote or activate its own Task Skill Candidate.
- Task Skill Enablement is separate from every future Run's Task Skill Activation, Run Authorization and Effect authority; repairs and updates create new immutable versions.

### Resume Prompt

Resume with Question 7/9: recommend that deletion removes a version from future selection and may discard unreferenced package bytes, but preserves a tombstone identity plus historical Runs/Deliverables; resolve `latest` as the newest enabled compatible version, never merely the highest candidate version.

## UI/UX V2 feature-delta checkpoint — Question 7/9

### What's done

- The owner accepted one centralized Automation Center, typed entries grouped by exact version, per-version related work/delivery navigation, manual version/entry deletion and newest-enabled-compatible default selection for new unpinned Task Skill use.
- Added D-069, V2-UX-REUSE-029–043, six candidate UI/UX terms, Automation Center IA/interaction/visual rules, J-15, the V1 migration delta and ADR 0013 under `docs/ui-ux-v2/`.
- Manual deletion now distinguishes permanent removal of never-admitted wholly unreferenced candidates/drafts from history-preserving retirement/removal of referenced or authority-bearing versions.

### What's next

- Ask Question 8/9 to decide default catalog availability and how reusable Task Skills surface in future Book work without widening Run Source Scope.

### Key decisions made

- New unpinned use resolves the latest enabled compatible Task Skill version before authorization; every Run, exact Default Execution Rule and current Workflow Instance retains its original exact pin.
- Active dependencies block deletion, and historical delivery lineage never cascades away with an automation version.

### Resume Prompt

Resume with Question 8/9: recommend instance-wide discoverability and intent-based suggestion for enabled Task Skills, with current-Book source scope still the per-Run default and any Series/Cross-project access separately selected and authorized.

## UI/UX V2 feature-delta checkpoint — Question 8/9

### What's done

- The owner accepted instance-wide default discoverability for enabled local-user Task Skills through Automation Center, intent-based recommendation and manual selection.
- Added D-070, V2-UX-REUSE-044–053, Task Skill Catalog Availability and Task Skill Recommendation Applicability terms, and the corresponding IA/interaction/visual/J-15 additions under `docs/ui-ux-v2/`.
- Reuse across Books now explicitly transfers only parameterized procedure structure and starts every new Run with current-Book source scope.

### What's next

- Ask Question 9/9 to close the distinct save/activation paths for Workflow Profile Draft, Default Execution Rule and Developer Capability Proposal, then close the feature-delta package and commit it locally.

### Key decisions made

- Catalog availability, proactive recommendation and Run Source Scope are independent; none grants another.
- Recommendation filters affect suggestion only, and wider Series/Cross-project/House-memory access remains an exact per-Run choice.

### Resume Prompt

Resume with Question 9/9: recommend explicit draft/publish/default actions for Workflow Profiles, draft/approve-enable actions for Default Execution Rules and save-only developer handoff for Developer Capability Proposals, with no silent migration, Run start or Plugin installation.

## UI/UX V2 feature-delta checkpoint — Question 9/9 and local Git integration

### What's done

- The owner accepted the final distinct save/publication/activation paths for Workflow Profile Drafts, Default Execution Rules and Developer Capability Proposals.
- Added D-071 and V2-UX-REUSE-054–066 and completed the corresponding IA, interaction, visual, J-15, decision-queue and handoff updates in `docs/ui-ux-v2/`.
- Corrected the pre-existing duplicate reimport requirement identifiers from the second `V2-UX-IMP-009/010` pair to `V2-UX-IMP-016/017` without changing their meaning.
- Closed the full 9-question Issue #5 delta and created one local documentation commit containing the complete prior UI/UX package plus the new feature design on `docs/5-ui-ux-v2-delta`.

### What's next

- No design question remains in this feature delta. Push/PR, canonical Commander integration and implementation each require their own explicit next action; only Windows user-journey E2E and observed-bug regressions belong to later implementation CI.

### Key decisions made

- Workflow Profile publication, new-deliverable default designation and existing-instance migration are separate.
- Default Execution Rules require exact-envelope enablement and react only to future user-submitted matches.
- Developer Capability Proposals remain non-executing handoffs; possible Plugins enter the separate governed developer process and are locally pinned if adopted.

### Resume Prompt

Resume by inspecting the local commit on `docs/5-ui-ux-v2-delta`; if the owner explicitly requests canonical integration, push/open a PR under Issue #5 without treating the candidate as implementation authority.
