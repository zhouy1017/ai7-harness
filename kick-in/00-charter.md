# Charter

Status: **accepted; the design interview is complete**

## Problem

AI7 Reborn already contains a substantial concept-preserving redesign of AI7, including manuscript-domain invariants, a Windows/Word product shape, durable safety records, task-skill contracts, and extensive behavioral evidence. It also contains a bespoke runtime, two product execution routes, a provider-free production path, large monolithic surface modules, and a separate engineering-agent orchestration pilot.

DeepSeek Harness supplies a broad plugin-based Agent Behavior Framework—models, sessions, tools, policies, skills, plans, goals, subagents, workflows, jobs, persistence, and a pluginized web client—but it is a rapidly changing developer preview and its generic coding-agent semantics do not automatically preserve AI7's editorial guarantees.

The migration must combine them without running two competing agent systems or flattening different domain concepts into misleading one-to-one mappings.

## Working vision

AI7 is a Chinese-first Windows-and-macOS desktop editorial workbench for professionals in leading literary publishing houses in mainland China. The owner requires a consistent product outlook across both platforms; its exact contract remains a Phase 0 decision. AI7 supports multi-aspect judgment across a Book and its related editorial deliverables, including manuscript revisions, promotional articles, news reports, and reviews. DeepSeek Harness powers agent execution and behavior composition underneath the product: AI7 learns from the framework's context, planning, tool, policy, workflow, subagent, session, replay, and snapshot patterns to make agents behave better, while AI7 supplies the missing semantic quality evaluator. Harness does not replace AI7's product identity or editorial domain.

AI7 protects unpublished editorial material from release to public channels without permission. This is a controlled non-publication requirement, not an assumption that every Book needs classified-data or high-secrecy controls. V1 is now Standalone-only; its new professional text-editing experience remains to be designed independently, while Word is a conditional future alternative.

AI7 does not train an LLM. It uses replaceable provided Foundation Models through an AI7-owned Editorial Intelligence Layer built from professionally supervised, produced, approved, and revised knowledge. The product target is Editor-comparable Delivery Quality that materially reduces workload without displacing professional judgment or publication authority.

## Product identity

The product is called **AI7**, displayed exactly that way, with no separate Chinese product name. DeepSeek Harness is the execution foundation beneath it and never a user-facing brand; it is disclosed in third-party notices only. Repository names carry development-track suffixes for developers and are not product identity.

## Primary product story

As an editorial professional in a leading literary publishing house in mainland China, I use AI7 as one consistent Chinese-first desktop workbench on Windows or macOS to perform multi-aspect work across a Book, its sources, and its Editorial Deliverables; I can inspect evidence, reasoning, plans, and proposed changes, retain publication authority and recovery history, and prevent unpublished material from reaching public channels without permission.

## Design principles

1. **Preserve concepts and evidence, not old decomposition.** Keep user promises, domain invariants, and proven journeys; freely replace module, storage, UI, and process boundaries.
2. **One execution control plane.** Harness owns the generic agent loop, model invocation, tool pipeline, session log, and agent orchestration. AI7 must not retain a parallel scheduler for the same work.
3. **AI7 owns editorial truth.** Books, manuscripts, revisions, proposals, workflow state, Task Ledger records, external Effects, and commit receipts remain AI7 domain concepts; Harness owns the technical execution event stream.
4. **Model-visible means reconstructable.** Anything sent to a model must be derivable from durable records and exact source revisions.
5. **Textual fidelity is not factual truth.** Exact quotations come only from a Textual Source of Record; Manuscript Assertions remain subject to Factual Verification and Semantic Review through separate capabilities.
6. **Full engine does not imply unrestricted defaults.** Harness capabilities may be available to product composition while the normal editorial profile remains least-privilege.
7. **No hidden compatibility debt.** Allowlisted transferred assets, skill packages, UI behavior, and external Effects require explicit compatibility contracts; legacy production data is not imported.
8. **Upstream is a dependency, not an accidental code owner.** Prefer public extension seams and an exact pin; modify Harness core only after a documented seam-gap decision.
9. **Vertical behavioral proof.** Migration proceeds through complete user outcomes, not layer-by-layer rewrites.
10. **Private-source provenance is explicit.** Every reused AI7 asset must retain a path, source commit, disposition, and license/authorization decision.
11. **Stories survive only by merit.** Original-AI7 user stories are design evidence to revise; legacy UI structure and presentation are discarded.
12. **Protect publication authority, proportionately.** Unpublished material must not reach public channels without explicit permission; ordinary approved processing does not automatically require a classified-data security model.
13. **A Book produces a family of texts.** Manuscript editing is central but not exclusive; AI7 also supports related promotional, journalistic, critical, and publication texts.
14. **Editorial judgment is explicit and extensible.** AI7 supplies a professional baseline of Editorial Dimensions while allowing production users to introduce concerns required by their house, Book, or task.
15. **Book-scoped authority, corpus-wide learning.** Text access and mutation remain explicitly scoped, while derived patterns and feedback from the Working Corpus help future delivery quality approach the user's editorial standard.
16. **Series is a richer intermediate scope.** Explicitly related Books may share versioned Series Knowledge and a governed read scope, while manuscript mutations remain Book-targeted.
17. **Learning is inspectable and self-correcting.** Users can trace every learned item to its materials, decide learning eligibility, and teach a separate policy which kinds of future material should or should not contribute.
18. **Intelligence lives outside model weights.** Foundation Models are replaceable capabilities; AI7's durable advantage is governed Professional Editorial Knowledge, context, tools, skills, memory, feedback, provenance, and evaluation.
19. **Harness improves agent behavior.** Agent conduct is assembled through versioned profiles, bundles, presets, plugins, context, tools, policies, workflows, and session hooks, then improved from evaluation evidence. This is distinct from training a Foundation Model and from learning editorial knowledge.
20. **Authority is document-shaped and revisable.** Product-authority rules live in versioned Policy Documents that users and agents can review as evidence accumulates; changes preserve diffs, rationale, evaluation, activation, and rollback rather than silently mutating hidden behavior.
21. **Find errors; propose fixes.** AI7 uses evidence to identify factual and semantic problems and creates exact-revision Correction Proposals. The manuscript under review cannot certify itself, and model confidence cannot replace evidence or editorial judgment.

## In scope for design

- Target repository and upstream-consumption strategy.
- Harness profile/bundle/plugin composition.
- Evaluation-driven Agent Behavior Improvement through Harness extension seams, without a competing agent loop.
- Ownership boundaries between Harness execution records and AI7 business records.
- AI7 Task Skill compatibility and trust model.
- Local persistence, controlled non-publication, provider policy, and source-scope enforcement.
- Standalone desktop/editor, client/Host, local application-boundary, and document import/export architecture; Word remains contingency evidence only.
- The accepted protected-credential, mock-provider-evidence, and selected-test-Book transfer allowlist; no general legacy-data importer.
- Keep/adapt/drop decisions for code, documentation, tests, fixtures, release assets, and the internal orchestration pilot.
- A tiered, provider-free GitHub Actions verification design with generated mock-LLM-provider cases.
- A development-only local multi-agent dispatch workflow, explicitly separate from product runtime orchestration.
- A staged delivery and verification workflow.

## Out of scope in this phase

- Scaffolding runtime packages or installing dependencies.
- Copying either source tree into this workspace.
- Implementing a plugin, importer, UI, IPC server, or Word adapter.
- Merging Git histories or publishing a new repository.
- Reopening superseded AI7 UI issues.
- Carrying the legacy UI implementation, component hierarchy, or layout forward as the new shell.
- Claiming production parity from a prototype or cassette-only execution.

## Success criteria for the design phase

The design phase is complete when:

- Every question in the decision map is accepted, rejected, or explicitly deferred.
- The new repository's visibility, license, source authorization, and upstream strategy are recorded.
- Every important AI7 capability has a keep/adapt/drop disposition and target owner.
- Harness Session/Turn/Tool/Approval/Skill/Workspace semantics are distinguished from AI7 Task Ledger/Run Record/Execution Binding/Effect/Task Skill/Book semantics.
- One architecture is selected, with no duplicate agent execution authority.
- The first vertical tracer slice has measurable acceptance gates.
- Security, privacy, data migration, Windows/macOS Standalone/editor, platform consistency, and upgrade risks have owners or explicit deferrals; Word is explicitly deferred.
- The future implementation can be split into independently testable vertical issues without rediscovering core product decisions.
