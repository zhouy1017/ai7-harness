# V2 migration direction

Status: **design-to-implementation direction; no implementation authorization**

Migration preserves AI7's product and domain model, replaces the production agent harness with Codex, and removes proof machinery and legacy runtime/UI assumptions. This is selective reuse, not a history merge or wholesale source copy.

## Retain

- The Chinese-first Windows Standalone product, exact AI7 name, professional publishing audience, Word exclusion, and two Windows channels.
- Book, Series, source, manuscript, revision, branch, journal, checkpoint, recovery, projection, retrieval, and Exact Fetch semantics.
- Deliverable-owned workflows, artifacts, gates, decisions, signoffs, delivery packages, and the seven shared phases.
- Task Intent, Execution Plan, Plan Envelope, Run Record, Task Ledger, Execution Binding, Harness Execution Span, and Resume/Retry/Redo/Replay meanings.
- Named authority, proposal-first mutation, atomic apply, Effects, receipts, ambiguity handling, privacy, credentials, provider resolution, capabilities, policies, learning lineage, and factual-verification behavior.
- The Electron main/renderer/Node-service topology, ProseMirror bounded editor, Agent Data Root outcomes, and provider-free Windows E2E journey concept.
- Surface-neutral user outcomes in the A1 product-consistency and evidence-crosswalk documents. The crosswalk is historical design reference, not a gate.
- Authorized predecessor code, documentation, tests, and fixtures only when an implementation task selects an asset and records its provenance, sanitization, and applicable third-party/provider obligations.

## Discard

- Every DeepSeek Harness production dependency, Cordis runtime composition, Session/tool process, fallback role, and `@deepseek-ai/dsh` assumption.
- The old Standalone and Word UI implementations, layouts, editors, monolithic renderer, and component model.
- The predecessor Python runtime, active Operation/Operation Event/`operationRuns` model, and non-allowlisted legacy production data.
- The A2 capability-closure matrix, evidence register, gap register, artifact/probe programme, exact-hash scorekeeping, and conditional proof ladder.
- Separate validation machinery: tiered/nightly workflows, exact-head review gates, unit/contract/property/coverage gates, request fingerprints, performance/security/provider/package/provenance/release-proof gates, and release receipts.
- Codex branding, Codex Desktop source/layout/assets, coding presets, generic terminal/chat surfaces, and any second agent loop.

## Rewrite

| Area | V2 disposition |
| --- | --- |
| Canonical execution context and glossary | Keep vendor-neutral business terms; define Codex as Primary Agent Harness and DeepSeek as Development Reference Framework. |
| ADR 0011 | Keep the two-ledger decision; map the technical ledger to Codex Thread/Turn/Item history behind the adapter. |
| ADR 0017 | Keep the full-loop/narrow-capability outcome; replace DeepSeek composition language with the Codex adapter and AI7 Capability Facade. |
| ADR 0020 | Supersede the DeepSeek npm-package decision. Select and record an exact Codex integration/source baseline only during authorized implementation. |
| ADR 0021 | Keep one-loop and AI7-scheduling invariants; bind the sole production loop to Codex and remove DeepSeek fallback/composition. |
| ADR 0024 | Keep the three AI7 process roles and no-TCP rule; place the Codex adapter in the Node service and hide any private child process behind it. |
| ADRs 0014 and 0027 | Treat ADR 0027 as current: one Windows E2E functional/regression surface only. |
| ADRs 0018, 0019, 0023, 0025 | Retain product behavior; remove their separate proof or validation gates as superseded by ADR 0027. |
| `AGENTS.md` and `kick-in/` runtime descriptions | Replace DeepSeek production/package language and proof-first clauses while preserving accepted product constraints and historical records. |
| Legacy Task Skills and behavior assets | Re-express useful editorial intent as AI7-owned declarative Task Skills and Codex instructions; do not translate Cordis plugins mechanically. |
| UI/UX candidate | Retain outcomes and journey semantics; design new AI7-owned screens around manuscript work and Codex Desktop-like interaction principles. |

## Staged direction after authorization

These are sequencing directions, not validation gates.

1. **Integrate the decision records.** After owner acceptance, update canonical context, glossary, ADRs, standing instructions, and design notes through the Commander path.
2. **Establish the offline product spine.** Build the Electron shell, renderer, Node service, local stores, bounded editor, journal/recovery, and typed IPC without requiring Codex or a provider at startup.
3. **Establish business execution.** Implement Task/Run records, Plan Envelopes, provider and credential brokers, capability grants, Effect handling, and the two-ledger binding against a provider-free test double used by the Windows journey.
4. **Integrate Codex.** Implement `PrimaryAgentHarness`, choose the simplest public seam or small maintained source build, expose only editorial capabilities, and connect technical spans without copying transcripts.
5. **Complete vertical user journeys.** Add import/edit/recovery, task-to-proposal, proposal apply, factual review with Exact Fetch, workflow delivery, concurrency/continuation, and learning/feedback as coherent end-to-end slices.
6. **Package both Windows channels.** Produce zip-portable and NSIS outcomes from one source while keeping data and secrets in their accepted locations.

The single standing CI suite grows with these complete user journeys and with regressions for observed bugs. Ordinary implementation diagnostics stop when the bug is understood; they do not become new permanent gates by default.

## Data migration

Start new business and technical stores. Do not import legacy Books, manuscripts, indexes, embeddings, memory, task/run/operation history, workflows, proposals, decisions, Effects, receipts, or UI state. The only allowed transfers remain user-initiated API credential transfer into the new Protected Secret Store, reviewed mock-provider material needed by the provider-free journey, and explicitly selected test-only sample Books. Manuscript restrictions remain absolute.

## Stop boundary

This document authorizes no source copy, dependency, fork, scaffolding, implementation issue, test infrastructure, merge, push, pull request, or release.
